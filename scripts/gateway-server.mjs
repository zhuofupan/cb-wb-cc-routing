// One gateway, two upstreams.
//
// WorkBuddy and CodeBuddy serve the same model catalog from the same host, and
// differ only in how a request is authenticated:
//
//   mode = "workbuddy"  credential comes from the desktop app's login state
//                       (decrypted and refreshed by workbuddy-client.mjs)
//   mode = "codebuddy"  the client sends `Authorization: Bearer ck_...` and the
//                       key is forwarded upstream verbatim (nothing is stored)
//
// Everything else — model routing, protocol conversion, channel-marker
// sanitising, reasoning-effort defaulting, streaming — is shared, so a fix for
// one route is a fix for both. Pick the profile with `--settings <path>`
// (or GATEWAY_SETTINGS); without it, ./local-settings.json beside this file.
//
//   POST /v1/messages            Claude Code / Claude Desktop (Anthropic)
//   POST /v1/messages/count_tokens
//   POST /v1/responses           Codex (Responses)
//   GET  /v1/models              the configured catalog
//   GET  /health
import { createServer } from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { readFileSync, writeFileSync, renameSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { timingSafeEqual, randomUUID } from 'node:crypto';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { usageRecord, appendUsage } from './usage-ledger.mjs';
import { retryUpstream, idleLimitedStream } from './upstream-retry.mjs';
import { cachedModels, mergeSelected, syncCodexCatalog } from './catalog-sync.mjs';
import { CLIENT_LEVELS, DEFAULT_EFFORT, mapEffort, levelIndex } from './effort-map.mjs';
import { prepareImages, checkPayload } from './request-images.mjs';
import { loadCompactionCodec, SUMMARY_PROMPT } from './compaction-codec.mjs';

const argv = process.argv.slice(2);
const flag = name => { const i = argv.indexOf(name); return i >= 0 ? argv[i + 1] : undefined; };
const SETTINGS = resolve(flag('--settings') ?? process.env.GATEWAY_SETTINGS
  ?? fileURLToPath(new URL('./local-settings.json', import.meta.url)));
const BASE_DIR = dirname(SETTINGS);

const config = JSON.parse(await readFile(SETTINGS, 'utf8'));
const MODE = config.mode === 'codebuddy' ? 'codebuddy' : 'workbuddy';
const compaction = await loadCompactionCodec(config.compactionKeyPath
  ?? fileURLToPath(new URL('./compaction.key', import.meta.url)));
const byteLimit = (name, fallback) => {
  const value = config[name] ?? fallback;
  if (!Number.isFinite(value) || value <= 0) throw new Error(`${name} must be a positive MiB value`);
  return Math.floor(value * 1024 * 1024);
};
const REQUEST_LIMIT = byteLimit('requestLimitMiB', 256);
const UPSTREAM_LIMIT = byteLimit('upstreamRequestLimitMiB', 128);

async function preparePayload(request, clientId) {
  const images = await prepareImages(request, config.imagePolicy);
  if (images.compressed || images.omitted) console.log(JSON.stringify({ event: 'image_budget', mode: MODE, ...images }));
  return checkPayload(JSON.stringify(prepareUpstreamBody(JSON.stringify(request), clientId)), UPSTREAM_LIMIT);
}


// Codecs always come from this file's directory: they are code, not profile
// data, and both profiles must run the identical conversion.
const { toChat: toChatResponses, convertStream: convertResponsesStream } = await import('./responses-codec.mjs');
const { toChat: toChatAnthropic, convertStream: convertAnthropicStream } = await import('./anthropic-codec.mjs');

let client, store, secret;
if (MODE === 'workbuddy') {
  if (!config.electron) throw new Error('local-settings.json: `electron` is required for mode=workbuddy');
  process.env.WORKBUDDY_ELECTRON_BIN = config.electron;
  ({ client, store } = await import('./workbuddy-client.mjs'));
  secret = Buffer.from(`Bearer ${config.secret}`);
}

const UPSTREAM = config.upstream ?? 'https://copilot.tencent.com';
const PORT = config.port ?? (MODE === 'codebuddy' ? 18792 : 18791);

// Claude Code names its models by vendor (claude-sonnet-*, claude-haiku-*), so
// those ids never reach the upstream verbatim: they resolve to configured
// defaults. Anything else passes through untouched, which keeps the upstream
// ids (and future ones) working without a mapping table.
const DEFAULT_MODEL = config.model ?? 'deepseek-v4.1-flash';
const FAST_MODEL = config.fastModel ?? DEFAULT_MODEL;
// Claude Desktop's picker entries map one-to-one onto upstream models, so exact
// ids are checked before any pattern: a regex like `opus` would otherwise
// swallow `claude-opus-5-5` as well.
const EXACT_ROUTES = config.exactRoutes ?? {};
const MODEL_ROUTES = (config.modelRoutes ?? []).map(route => ({
  pattern: new RegExp(route.match, 'i'),
  model: route.model,
}));
function resolveModel(requested) {
  if (!requested) return DEFAULT_MODEL;
  // Context suffixes are client metadata, including on exact Desktop aliases.
  // Strip them before matching, or MiniMax/GLM silently fall back to DeepSeek.
  requested = requested.replace(/\[1m\]$/i, '');
  if (EXACT_ROUTES[requested]) return EXACT_ROUTES[requested];
  if (/^claude/i.test(requested)) {
    for (const route of MODEL_ROUTES) if (route.pattern.test(requested)) return route.model;
    return /haiku/i.test(requested) ? FAST_MODEL : DEFAULT_MODEL;
  }
  // `[1m]` is Claude Code's context-window declaration; it strips the suffix
  // before sending, but a proxy in between may not — drop it defensively.
  return requested;
}

// Output ceilings come from the live catalog. A static fallback keeps requests
// working before the first refresh and for models the account cache omits.
function modelLimits(model) {
  const row = config.models?.find(m => (m.id ?? m.slug) === model);
  return { maxOutput: row?.maxOutput, context: row?.context };
}

// Neither client states the reasoning effort for us. Codex sends one global
// level for every model it can select; Claude Code sends `output_config.effort`
// (mapped to `reasoning_effort` by the codec) and nothing at all in older
// builds. `effortDefault` fills the empty slot only — an explicit level from
// the client still wins, so a cheaper pick keeps working.
const EFFORT_DEFAULT = config.effortDefault;

// Remember the last effort each client picked, per model. Both clients resend
// their picker value on every request, but Claude's alias resolution and old
// threads can drop it; the remembered value then keeps the user's last choice
// instead of falling back to a global default. Persist only client/model/level;
// the current model mapping and speed cap still apply after a restart.
const rememberedEffort = new Map();
const effortStatePath = `${SETTINGS}.effort.json`;
try {
  for (const [key, value] of Object.entries(JSON.parse(readFileSync(effortStatePath, 'utf8')))) {
    if (CLIENT_LEVELS.includes(value)) rememberedEffort.set(key, value);
  }
} catch (e) {
  if (e.code !== 'ENOENT') console.log(JSON.stringify({ event: 'effort_state_read_failed', code: e.code ?? 'invalid_json' }));
}
function effortFor(clientId, model, requested) {
  const key = `${clientId}:${model}`;
  const normalised = requested ? mapEffort(model, requested) : undefined;
  if (normalised) {
    if (rememberedEffort.get(key) !== normalised) {
      rememberedEffort.set(key, normalised);
      try {
        const temp = `${effortStatePath}.${process.pid}.tmp`;
        writeFileSync(temp, JSON.stringify(Object.fromEntries(rememberedEffort)) + '\n');
        renameSync(temp, effortStatePath);
      } catch (e) { console.log(JSON.stringify({ event: 'effort_state_write_failed', code: e.code })); }
    }
    return normalised;
  }
  return rememberedEffort.get(key) ?? config.models?.find(m => (m.id ?? m.slug) === model)?.defaultEffort ?? DEFAULT_EFFORT[model] ?? EFFORT_DEFAULT;
}

// Idle self-exit: the adapter is only needed while a client is actually using
// it. IDLE_EXIT_MINUTES unset -> 20; 0 disables the timer (stay resident).
const IDLE_EXIT_MINUTES = Number.isFinite(Number(process.env.IDLE_EXIT_MINUTES))
  ? Number(process.env.IDLE_EXIT_MINUTES)
  : 20;
const IDLE_MS = IDLE_EXIT_MINUTES * 60_000;
let lastActivity = Date.now();
let active = 0;
let count = 0;
const stats = { started_at: new Date().toISOString(), models: {} };
let catalogState = { source: 'configured', available_models: 0, new_model_ids: [] };
let refreshing;
function refreshCatalog() {
  if (refreshing) return refreshing;
  refreshing = (async () => {
    const upstream = MODE === 'codebuddy'
      ? await cachedModels(config.catalogCacheDir ?? join(homedir(), '.codebuddy', 'local_storage'))
      : await client.fetchModels(await store.resolve());
    config.models = mergeSelected(config.models ?? [], upstream, MODE, config.effortMaxByModel);
    if (config.codexCatalog) await syncCodexCatalog(resolve(BASE_DIR, config.codexCatalog), config.models);
    catalogState = { source: upstream.length ? (MODE === 'codebuddy' ? 'account-cache' : 'upstream') : 'configured',
      refreshed_at: new Date().toISOString(), available_models: upstream.length,
      new_model_ids: upstream.map(m => m.id ?? m.slug).filter(id => id && !config.models.some(m => (m.id ?? m.slug) === id)) };
  })().finally(() => { refreshing = undefined; });
  return refreshing;
}
if (IDLE_MS > 0) {
  setInterval(() => {
    if (active === 0 && Date.now() - lastActivity >= IDLE_MS) {
      console.log(JSON.stringify({ event: 'idle_exit', idle_minutes: IDLE_EXIT_MINUTES, mode: MODE }));
      process.exit(0);
    }
  }, 30_000).unref();
}

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

// Upstream headers, measured against the CN gateway on 2026-10-20. Only the
// codebuddy profile needs them: the workbuddy client builds its own.
function upstreamHeaders(key) {
  return {
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
    Accept: 'text/event-stream',
    Origin: UPSTREAM,
    Referer: `${UPSTREAM}/`,
    'User-Agent': config.userAgent ?? 'CodeBuddy/1.0.0',
    'X-IDE-Type': 'CodeBuddy',
    'X-IDE-Name': 'CodeBuddy',
    'X-IDE-Version': config.ideVersion ?? '1.0.0',
    'X-Product': 'SaaS',
    'X-No-User-Id': '1',
    'X-No-Enterprise-Id': '1',
    'X-No-Department-Info': '1',
    'X-Conversation-ID': crypto.randomUUID(),
    'X-Conversation-Request-ID': crypto.randomUUID(),
    'X-Conversation-Message-ID': crypto.randomUUID(),
  };
}

// 11128 is not always the client's fault: the upstream rejects well-formed
// payloads for short windows and documents it as "retry in a few minutes".
// One retry after a pause turns such a window into a slow turn instead of a red
// bubble; a genuine payload problem still surfaces on the second attempt.
async function callUpstream(credential, payload, signal) {
  if (MODE === 'codebuddy') {
    try {
      const response = await fetch(`${UPSTREAM}/v2/chat/completions`, {
        method: 'POST', headers: upstreamHeaders(credential), body: payload, signal,
      });
      if (response.ok) return { ok: true, response, status: response.status };
      const text = await response.text().catch(() => '');
      return { ok: false, status: response.status, kind: 'upstream_error', message: text.slice(0, 400) };
    } catch (error) {
      // Exponential backoff is pointless against a closed port; surface it.
      return { ok: false, status: 502, kind: 'upstream_unreachable', message: String(error.message ?? error) };
    }
  }
  return client.chatStream(credential, payload, signal);
}
async function chatStreamWithChannelRetry(credential, payload, signal) {
  return retryUpstream(attemptSignal => callUpstream(credential, payload, attemptSignal), {
    signal, headerTimeoutMs: config.upstreamHeaderTimeoutMs ?? 180000,
    retryDelayMs: config.upstreamRetryDelayMs ?? 2500,
    onRetry: result => console.log(JSON.stringify({ event: 'channel_retry', status: result.status, mode: MODE })),
  });
}

// Only failed payloads are kept: the 11128 class is payload-specific, so the
// body that failed is the artifact worth having. DUMP=1 (env) or `"dump": true`
// in the profile keeps every request, which is what a routing question needs.
const DUMP = process.env.DUMP === '1' || config.dump === true;
async function dump(name, data) {
  try { await writeFile(join(BASE_DIR, name), data); } catch { /* never mask the real error */ }
}

/**
 * Channel markers: the upstream refuses payloads that advertise another
 * vendor's CLI. Three sources are known, all measured on 2026-10-20:
 *   1. `x-anthropic-billing-header:` in the first system block -> stripped by
 *      anthropic-codec (both profiles).
 *   2. `Anthropic's official CLI for Claude` -> rewritten by anthropic-codec.
 *   3. `github.com/anthropics/claude-code/issues` (fresh-session feedback line)
 *      -> rewritten here as well, and by the codec for the Messages path.
 * The Codex CLI identity paragraph is a fourth, CodeBuddy-specific check: it
 * matches the *paragraph*, not a phrase, because the wording moves with every
 * Codex release while the structure does not.
 */
const CHANNEL_URL = /https?:\/\/(?:www\.)?github\.com\/anthropics\/claude-code[^\s)]*/gi;
const CHANNEL_SLUG = /anthropics\/claude-code/gi;
const NEUTRAL_IDENTITY = 'You are a coding agent working in a terminal-based coding assistant. You are expected to be precise, safe, and helpful.';
const FOREIGN_CLI_IDENTITY = /codex/i;

function neutraliseForeignIdentity(request) {
  const messages = Array.isArray(request?.messages) ? request.messages : [];
  const system = messages.find(message => message?.role === 'system');
  if (!system) return request;
  const parts = Array.isArray(system.content) ? system.content : null;
  const target = parts?.find(part => part?.type === 'text');
  const text = target ? target.text : typeof system.content === 'string' ? system.content : null;
  if (typeof text !== 'string') return request;
  const split = text.split(/\r?\n\r?\n/);
  if (!FOREIGN_CLI_IDENTITY.test(split[0] ?? '')) return request;
  const rewritten = [NEUTRAL_IDENTITY, ...split.slice(1)].join('\n\n');
  if (target) target.text = rewritten; else system.content = rewritten;
  return request;
}

function sanitizeChannelMarkers(request) {
  const scrub = text => text.replace(CHANNEL_URL, 'the project issue tracker').replace(CHANNEL_SLUG, 'the project repo');
  if (typeof request?.system === 'string') request.system = scrub(request.system);
  if (Array.isArray(request?.instructions)) request.instructions = request.instructions.map(scrub);
  if (typeof request?.instructions === 'string') request.instructions = scrub(request.instructions);
  if (Array.isArray(request?.messages)) {
    for (const message of request.messages) {
      if (typeof message?.content === 'string') message.content = scrub(message.content);
      else if (Array.isArray(message?.content)) {
        for (const part of message.content) if (part?.type === 'text' && typeof part.text === 'string') part.text = scrub(part.text);
      }
    }
  }
  return request;
}

const SANITIZE = config.sanitizeChannelUrls ?? MODE === 'codebuddy';
const NEUTRALISE_IDENTITY = config.neutraliseCodexIdentity ?? MODE === 'codebuddy';

function prepareUpstreamBody(raw, clientId = 'unknown') {
  const body = JSON.parse(raw);
  if (SANITIZE) sanitizeChannelMarkers(body);
  if (NEUTRALISE_IDENTITY) neutraliseForeignIdentity(body);
  // Tencent accepts string tool_choice values, but not OpenAI's named-function
  // object. Expose only the requested function and require a tool call.
  if (body.tool_choice?.type === 'function') {
    const selected = body.tools?.filter(tool => tool.function?.name === body.tool_choice.function?.name);
    if (selected?.length) {
      body.tools = selected;
      body.tool_choice = 'required';
    }
  }
  // The client's picker value always wins. When it is absent, reuse the level
  // the same client last picked for this model; only a client that has never
  // chosen one falls back to the upstream catalog default.
  const requested = body.reasoning_effort;
  const chosen = effortFor(clientId, body.model, requested);
  // A per-model ceiling is an operator speed cap, not a default: it caps an
  // explicit higher pick but never raises a lower one.
  const ceiling = config.effortMaxByModel?.[body.model];
  let effort = mapEffort(body.model, config.effortPolicy === 'highest' ? 'max' : chosen);
  if (ceiling && mapEffort(body.model, ceiling) && levelIndex(effort) > levelIndex(mapEffort(body.model, ceiling))) {
    effort = mapEffort(body.model, ceiling);
  }
  body.reasoning_effort = effort;
  console.log(JSON.stringify({ event: 'upstream_effort', model: body.model, requested: requested ?? null,
    effort: body.reasoning_effort, remembered: !requested, mode: MODE }));
  return body;
}

// Follow both clients' provider choice (workbuddy profile only). CC Switch has
// no switch hook, so the written config is the only signal: when neither Codex
// nor Claude Code points at this port, the adapter is dead weight.
const FOLLOW = config.followClients ?? MODE === 'workbuddy';
const CODEX_CONFIG = join(process.env.CODEX_HOME ?? join(homedir(), '.codex'), 'config.toml');
const CLAUDE_CONFIG = join(process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude'), 'settings.json');
const POLL_MS = 120_000;
const CONFIG_GRACE_MS = 240_000;
let notTargetedSince = 0;

// Only the *active* provider counts: other [model_providers.*] blocks may also
// point at this adapter, so a whole-file search would never turn false.
function activeBaseUrl(text) {
  const id = text.match(/^\s*model_provider\s*=\s*"([^"]+)"/m)?.[1] ?? 'custom';
  const section = text.match(new RegExp(`\\[model_providers\\.${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]\\s*([\\s\\S]*?)(?=\\n\\[|$)`));
  return section?.[1].match(/^\s*base_url\s*=\s*"([^"]+)"/m)?.[1] ?? '';
}
function claudeBaseUrl(text) {
  try { return String(JSON.parse(text)?.env?.ANTHROPIC_BASE_URL ?? ''); } catch { return ''; }
}
if (FOLLOW && process.env.FOLLOW_CODEX !== '0') {
  setInterval(async () => {
    const [codexText, claudeText] = await Promise.all([
      readFile(CODEX_CONFIG, 'utf8').catch(() => ''),
      readFile(CLAUDE_CONFIG, 'utf8').catch(() => ''),
    ]);
    const targeted = activeBaseUrl(codexText).includes(`127.0.0.1:${PORT}`)
      || claudeBaseUrl(claudeText).includes(`127.0.0.1:${PORT}`);
    notTargetedSince = targeted ? 0 : (notTargetedSince || Date.now());
    if (active > 0) return;
    if (!targeted && notTargetedSince && Date.now() - notTargetedSince >= CONFIG_GRACE_MS) {
      console.log(JSON.stringify({ event: 'clients_switched_away', mode: MODE }));
      process.exit(0);
    }
  }, POLL_MS).unref();
}

const server = createServer(async (req, res) => {
  const started = Date.now();
  let trackedModel, trackedEffort, trackedUsage, failed = false;
  lastActivity = Date.now();
  active++;
  res.on('close', () => {
    active--; lastActivity = Date.now();
    if (!trackedModel) return;
    const model = config.models?.some(m => (m.id ?? m.slug) === trackedModel) ? trackedModel : 'other';
    const item = stats.models[model] ??= { requests: 0, errors: 0, total_ms: 0, input_tokens: 0, output_tokens: 0, cached_input_tokens: 0 };
    item.requests++; item.total_ms += Date.now() - started;
    if (failed || res.statusCode >= 400 || !res.writableEnded) item.errors++;
    item.last_effort = trackedEffort;
    item.input_tokens += (trackedUsage?.input_tokens ?? 0) + (trackedUsage?.cache_read_input_tokens ?? 0);
    item.output_tokens += trackedUsage?.output_tokens ?? 0;
    item.cached_input_tokens += trackedUsage?.input_tokens_details?.cached_tokens ?? trackedUsage?.cache_read_input_tokens ?? 0;
  });
  const path = req.url?.split('?')[0];
  const ledgerId = randomUUID();
  const ledgerStarted = Date.now();
  let rawUsage = null;
  const captureUsage = usage => {
    const next = usageRecord(usage);
    if (next) rawUsage = { ...next, credit: next.credit ?? rawUsage?.credit ?? null };
  };
  res.once('close', () => {
    if (!trackedModel || config.usageLedger === false) return;
    const ledgerPath = config.usageLedger ?? join(homedir(), '.cc-switch', 'buddy-usage.jsonl');
    appendUsage(ledgerPath, {
      id: ledgerId, ts: ledgerStarted, account: MODE, model: trackedModel,
      protocol: path?.includes('messages') ? 'anthropic' : 'responses',
      status: res.statusCode, complete: res.writableEnded && !failed,
      usage: rawUsage,
    }).catch(error => console.error(JSON.stringify({ event: 'usage_ledger_failed', code: error.code ?? error.name })));
  });

  if (path === '/health' && req.method === 'GET') {
    return json(res, 200, { ready: true, mode: MODE, port: PORT, requests: count, active_requests: active - 1, pid: process.pid,
      request_limit_bytes: REQUEST_LIMIT, upstream_request_limit_bytes: UPSTREAM_LIMIT, compaction: 'gateway_summary_v1' });
  }
  // The gateway only serves local CLIs: a browser Origin means cross-origin.
  if (req.headers.origin && MODE === 'codebuddy') {
    return json(res, 401, { error: { message: 'Cross-origin requests are not allowed' } });
  }
  const presented = String(req.headers.authorization ?? '');
  let key;
  if (MODE === 'codebuddy') {
    key = presented.replace(/^Bearer\s+/i, '').trim();
    if (!key.startsWith('ck_')) {
      return json(res, 401, { error: { message: 'Authorization: Bearer <ck_...> required (CodeBuddy API key)', type: 'authentication_error' } });
    }
  } else {
    const buf = Buffer.from(presented);
    if (req.headers.origin || buf.length !== secret.length || !timingSafeEqual(buf, secret)) {
      return json(res, 401, { error: { message: 'Local provider authentication required' } });
    }
  }

  const controller = new AbortController();
  res.on('close', () => { if (!res.writableEnded) controller.abort(); });

  try {
    if (req.method === 'GET' && path === '/v1/stats') return json(res, 200, { ...stats, catalog: catalogState });
    if (req.method === 'GET' && path === '/v1/models') {
      if (new URL(req.url, 'http://localhost').searchParams.get('refresh') === '1') await refreshCatalog();
      const models = config.models ?? (MODE === 'workbuddy' ? await client.fetchModels(await store.resolve()) : []);
      return json(res, 200, {
        object: 'list',
        data: models.map(m => ({
          id: m.id ?? m.slug,
          object: 'model',
          owned_by: MODE,
          display_name: m.name ?? m.display_name,
          ...(m.context ? { context_window: m.context } : {}),
          ...(m.defaultEffort ? { default_reasoning_level: m.defaultEffort } : {}),
        })),
      });
    }

    const anthropicPath = req.method === 'POST' && (path === '/v1/messages' || path === '/v1/messages/count_tokens');
    const compactPath = req.method === 'POST' && ['/v1/responses/compact', '/responses/compact'].includes(path);
    const responsesPath = req.method === 'POST' && (compactPath || ['/v1/responses', '/responses'].includes(path));
    if (!anthropicPath && !responsesPath) return json(res, 404, { error: { message: 'Endpoint unsupported' } });

    let size = 0;
    const chunks = [];
    for await (const chunk of req) {
      size += chunk.length;
      if (size > REQUEST_LIMIT) throw Object.assign(new Error(`Request exceeds gateway ingress limit (${REQUEST_LIMIT} bytes)`), { status: 413 });
      chunks.push(chunk);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const credential = MODE === 'codebuddy' ? key : await store.resolve();

    if (anthropicPath) {
      const resolvedModel = resolveModel(body.model);
      const converted = toChatAnthropic(body, () => resolvedModel, modelLimits(resolvedModel));
      if (!path.endsWith('/count_tokens')) console.log(JSON.stringify({ event: 'tool_budget', protocol: 'anthropic',
        model: resolvedModel, ...converted.toolStats, estimated_input: converted.estimatedInput, mode: MODE }));
      if (DUMP) {
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        await dump(`dump-${stamp}-anthropic.json`, JSON.stringify(body, null, 2));
        await dump('last-anthropic-request.json', JSON.stringify(body, null, 2));
        await dump('last-anthropic-upstream.json', JSON.stringify(converted.request, null, 2));
      }
      // Claude Code asks for a token count before large turns; a local estimate
      // is honest here, the upstream exposes no counting endpoint.
      if (path.endsWith('/count_tokens')) return json(res, 200, { input_tokens: converted.estimatedInput });
      const payload = await preparePayload(converted.request, 'claude');
      ({ model: trackedModel, reasoning_effort: trackedEffort } = JSON.parse(payload));
      const upstream = await chatStreamWithChannelRetry(credential, payload, controller.signal);
      if (!upstream.ok) {
        await dump('last-failed-upstream.json', payload);
        return json(res, upstream.status >= 400 ? upstream.status : 502,
          { error: { message: `${MODE} upstream (${upstream.status}): ${String(upstream.message ?? '').slice(0, 300)}`, type: upstream.kind ?? 'upstream_error' } });
      }
      count++;
      const options = { model: converted.model, estimatedInput: converted.estimatedInput, onUsage: captureUsage };
      if (body.stream) {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
        const heartbeat = setInterval(() => res.write(': keepalive\n\n'), 10000);
        try {
          const result = await convertAnthropicStream(idleLimitedStream(upstream.response.body, controller, config.upstreamIdleTimeoutMs ?? 120000), options,
            (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
          trackedUsage = result.usage;
        } finally { clearInterval(heartbeat); }
        res.end();
      } else {
        const result = await convertAnthropicStream(idleLimitedStream(upstream.response.body, controller, config.upstreamIdleTimeoutMs ?? 120000), options, () => {});
        trackedUsage = result.usage;
        json(res, 200, result);
      }
      return;
    }

    const isCompact = compactPath || (Array.isArray(body.input) && body.input.some(item => item.type === 'compaction_trigger'));
    const { request, registry, estimatedInput } = toChatResponses(body, { ...modelLimits(body.model), decodeCompaction: compaction.decode });
    if (isCompact) {
      request.messages.push({ role: 'system', content: SUMMARY_PROMPT });
      request.messages.push({ role: 'user', content: 'Summarize the preceding conversation for another assistant to continue. Do not continue the task itself.' });
      delete request.tools;
      delete request.tool_choice;
      request.max_tokens = Math.min(request.max_tokens, 8192);
    }
    console.log(JSON.stringify({ event: 'output_budget', model: request.model, max_tokens: request.max_tokens, estimated_input: estimatedInput, mode: MODE }));
    if (DUMP) {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      await dump(`dump-${stamp}-responses.json`, JSON.stringify(body, null, 2));
      await dump('last-responses-upstream.json', JSON.stringify(request, null, 2));
    }
    const payload = await preparePayload(request, 'codex');
    ({ model: trackedModel, reasoning_effort: trackedEffort } = JSON.parse(payload));
    const upstream = await chatStreamWithChannelRetry(credential, payload, controller.signal);
    if (!upstream.ok) {
      await dump('last-failed-upstream.json', payload);
      return json(res, upstream.status >= 400 ? upstream.status : 502,
        { error: { message: `${MODE} upstream (${upstream.status}): ${String(upstream.message ?? '').slice(0, 300)}`, type: upstream.kind ?? 'upstream_error' } });
    }
    count++;
    const streaming = body.stream && !compactPath;
    if (streaming) res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    const heartbeat = streaming ? setInterval(() => res.write(': keepalive\n\n'), 10000) : undefined;
    try {
      const result = await convertResponsesStream(idleLimitedStream(upstream.response.body, controller, config.upstreamIdleTimeoutMs ?? 120000), body.model, registry,
        (event, data) => { if (streaming && !isCompact) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`); }, captureUsage, body.parallel_tool_calls ?? true);
      trackedUsage = result.usage;
      if (isCompact) {
        const summary = result.output.filter(item => item.type === 'message')
          .flatMap(item => item.content ?? []).filter(part => part.type === 'output_text').map(part => part.text).join('\n');
        if (result.status !== 'completed' || !summary.trim()) throw Object.assign(new Error('Summary incomplete; original conversation was not compacted'), { status: 502 });
        const item = { type: 'compaction', id: `cmp_${randomUUID()}`, encrypted_content: compaction.encode(summary) };
        if (compactPath) return json(res, 200, { id: result.id, object: 'response.compaction', created_at: Math.floor(Date.now() / 1000), output: [item], usage: result.usage });
        const response = { ...result, output: [item] };
        if (!streaming) return json(res, 200, response);
        const emit = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify({ type: event, ...data })}\n\n`);
        emit('response.created', { response: { ...response, status: 'in_progress', output: [] } });
        emit('response.output_item.added', { output_index: 0, item });
        emit('response.output_item.done', { output_index: 0, item });
        emit('response.completed', { response });
        res.end();
      } else if (streaming) res.end(); else json(res, 200, result);
    } finally { clearInterval(heartbeat); }
  } catch (error) {
    failed = true;
    const message = String(error.message ?? error).slice(0, 300);
    if (res.destroyed) return;
    if (!res.headersSent) json(res, error.status ?? (controller.signal.aborted ? 504 : 400), { error: { message, type: 'gateway_error' } });
    else {
      res.write(`event: error\ndata: ${JSON.stringify({ type: 'error', message, code: 'gateway_error' })}\n\n`);
      res.end();
    }
    console.error(JSON.stringify({ event: 'request_failed', mode: MODE, message }));
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(JSON.stringify({ ready: true, mode: MODE, port: PORT, settings: SETTINGS, models: (config.models ?? []).length, effort: EFFORT_DEFAULT ?? null }));
  if (config.refreshCatalog !== false) {
    const refresh = () => refreshCatalog().catch(error => console.error(JSON.stringify({ event: 'catalog_refresh_failed', code: error.code ?? error.name, mode: MODE })));
    refresh();
    setInterval(refresh, 3600000).unref();
  }
});
