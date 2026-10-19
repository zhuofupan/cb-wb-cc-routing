import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { timingSafeEqual } from 'node:crypto';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { client, store } from './workbuddy-client.mjs';
import { toChat, convertStream } from './responses-codec.mjs';
import { toChat as toChatAnthropic, convertStream as convertAnthropicStream } from './anthropic-codec.mjs';

const config = JSON.parse(await readFile(new URL('./local-settings.json', import.meta.url), 'utf8'));
process.env.WORKBUDDY_ELECTRON_BIN = config.electron;
const secret = Buffer.from(`Bearer ${config.secret}`);
let count = 0;

// Claude Code names its models by vendor (claude-sonnet-*, claude-haiku-*), so
// those ids never reach the WorkBuddy upstream verbatim: they resolve to the
// configured defaults instead. Anything else is passed through untouched, which
// keeps WorkBuddy's own ids (and future ones) working without a mapping table.
const DEFAULT_MODEL = config.model ?? 'deepseek-v4.1-flash';
const FAST_MODEL = config.fastModel ?? DEFAULT_MODEL;
// Claude Desktop's model menu comes from a signed remote catalog, so its labels
// (Opus / Sonnet / Fable / Haiku) cannot be renamed locally. Routing each family
// to a different upstream model is what makes those entries mean something —
// without this every choice collapses onto the same model and the menu is a lie.
// Claude Desktop's picker entries map one-to-one onto upstream models, so exact
// ids are checked before any pattern: a regex like `opus` would otherwise
// swallow `claude-opus-5-5` as well.
const EXACT_ROUTES = config.exactRoutes ?? {};
const MODEL_ROUTES = (config.modelRoutes ?? [
  { match: 'opus|fable', model: 'deepseek-v4-pro' },
  { match: 'sonnet', model: 'glm-5.3' },
]).map(route => ({ pattern: new RegExp(route.match, 'i'), model: route.model }));
const resolveModel = requested => {
  if (!requested) return DEFAULT_MODEL;
  if (EXACT_ROUTES[requested]) return EXACT_ROUTES[requested];
  if (/^claude/i.test(requested)) {
    for (const route of MODEL_ROUTES) if (route.pattern.test(requested)) return route.model;
    return /haiku/i.test(requested) ? FAST_MODEL : DEFAULT_MODEL;
  }
  return requested;
};

// Idle self-exit: the adapter is only needed while Codex is actually using it.
// IDLE_EXIT_MINUTES unset -> 20; 0 disables the timer (stay resident).
const IDLE_EXIT_MINUTES = Number.isFinite(Number(process.env.IDLE_EXIT_MINUTES))
  ? Number(process.env.IDLE_EXIT_MINUTES)
  : 20;
const IDLE_MS = IDLE_EXIT_MINUTES * 60_000;
let lastActivity = Date.now();
let active = 0;
if (IDLE_MS > 0) {
  setInterval(() => {
    if (active === 0 && Date.now() - lastActivity >= IDLE_MS) {
      console.log(JSON.stringify({ event: 'idle_exit', idle_minutes: IDLE_EXIT_MINUTES }));
      process.exit(0);
    }
  }, 30_000).unref();
}

function json(res, status, data) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(data));
}

// Follow both clients' provider choice. CC Switch has no switch hook, so the
// written config is the only signal: when neither Codex nor Claude Code points
// at this adapter, it is dead weight.
const CODEX_CONFIG = join(process.env.CODEX_HOME ?? join(homedir(), '.codex'), 'config.toml');
const CLAUDE_CONFIG = join(process.env.CLAUDE_CONFIG_DIR ?? join(homedir(), '.claude'), 'settings.json');
// Exit checks are cheap (one small file read in-process), so they can be lazy:
// every 2 minutes, and only after two consecutive misses.
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

// Claude Code states the same choice once, in settings.json's env block.
function claudeBaseUrl(text) {
  try { return String(JSON.parse(text)?.env?.ANTHROPIC_BASE_URL ?? ''); } catch { return ''; }
}

if (process.env.FOLLOW_CODEX !== '0') {
  setInterval(async () => {
    const [codexText, claudeText] = await Promise.all([
      readFile(CODEX_CONFIG, 'utf8').catch(() => ''),
      readFile(CLAUDE_CONFIG, 'utf8').catch(() => ''),
    ]);
    const targeted = activeBaseUrl(codexText).includes('127.0.0.1:18791')
      || claudeBaseUrl(claudeText).includes('127.0.0.1:18791');
    notTargetedSince = targeted ? 0 : (notTargetedSince || Date.now());
    if (active > 0) return;
    if (!targeted && notTargetedSince && Date.now() - notTargetedSince >= CONFIG_GRACE_MS) {
      console.log(JSON.stringify({ event: 'clients_switched_away' }));
      process.exit(0);
    }
  }, POLL_MS).unref();
}
const server = createServer(async (req, res) => {
  lastActivity = Date.now();
  active++;
  res.on('close', () => { active--; lastActivity = Date.now(); });
  const path = req.url?.split('?')[0];
  if (path === '/health' && req.method === 'GET') return json(res, 200, { ready: true, requests: count });
  const presented = Buffer.from(req.headers.authorization ?? '');
  if (req.headers.origin || presented.length !== secret.length || !timingSafeEqual(presented, secret))
    return json(res, 401, { error: { message: 'Local provider authentication required' } });
  const controller = new AbortController();
  res.on('close', () => { if (!res.writableEnded) controller.abort(); });
  try {
    if (req.method === 'GET' && path === '/v1/models') {
      const models = await client.fetchModels(await store.resolve());
      return json(res, 200, { object: 'list', data: models.map(m => ({ id: m.id, object: 'model', owned_by: 'workbuddy' })) });
    }
    const anthropicPath = req.method === 'POST' && (path === '/v1/messages' || path === '/v1/messages/count_tokens');
    const responsesPath = req.method === 'POST' && ['/v1/responses', '/responses'].includes(path);
    if (!anthropicPath && !responsesPath)
      return json(res, 404, { error: { message: 'Endpoint unsupported' } });
    let size = 0;
    const chunks = [];
    for await (const chunk of req) {
      size += chunk.length;
      if (size > 32 * 1024 * 1024) throw new Error('Request exceeds 32 MiB');
      chunks.push(chunk);
    }
    const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const credential = await store.resolve();

    if (anthropicPath) {
      const converted = toChatAnthropic(body, resolveModel);
      if (process.env.WB_DUMP) {
        const { writeFile } = await import('node:fs/promises');
        // Timestamped copy first: the `last-*` pair is a single slot, so any
        // follow-up request (title generation, a manual curl) silently replaces
        // the payload that actually failed.
        const stamp = new Date().toISOString().replace(/[:.]/g, '-');
        await writeFile(new URL(`./dump-${stamp}-anthropic.json`, import.meta.url), JSON.stringify(body, null, 2)).catch(() => {});
        await writeFile(new URL('./last-anthropic-request.json', import.meta.url), JSON.stringify(body, null, 2)).catch(() => {});
        await writeFile(new URL('./last-upstream-request.json', import.meta.url), JSON.stringify(converted.request, null, 2)).catch(() => {});
      }
      // Claude Code asks for a token count before large turns; a local estimate
      // is honest here, the upstream exposes no counting endpoint.
      if (path.endsWith('/count_tokens')) return json(res, 200, { input_tokens: converted.estimatedInput });
      const upstream = await client.chatStream(credential, JSON.stringify(converted.request), controller.signal);
      if (!upstream.ok) return json(res, upstream.status >= 400 ? upstream.status : 502,
        { error: { message: `WorkBuddy upstream (${upstream.status} ${upstream.kind}): ${String(upstream.message ?? '').slice(0, 300)}`, type: upstream.kind } });
      count++;
      const options = { model: converted.model, estimatedInput: converted.estimatedInput };
      if (body.stream) {
        res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
        const heartbeat = setInterval(() => res.write(': keepalive\n\n'), 10000);
        try {
          await convertAnthropicStream(upstream.response.body, options,
            (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
        } finally { clearInterval(heartbeat); }
        res.end();
      } else {
        const message = await convertAnthropicStream(upstream.response.body, options, () => {});
        json(res, 200, message);
      }
      return;
    }

    const { request, registry } = toChat(body);
    const upstream = await client.chatStream(await store.resolve(), JSON.stringify(request), controller.signal);
    if (!upstream.ok) return json(res, upstream.status >= 400 ? upstream.status : 502,
      { error: { message: `WorkBuddy upstream: ${upstream.kind}`, type: upstream.kind } });
    count++;
    if (body.stream) res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'Connection': 'keep-alive' });
    const heartbeat = body.stream ? setInterval(() => res.write(': keepalive\n\n'), 10000) : undefined;
    try {
      const result = await convertStream(upstream.response.body, body.model, registry, (event, data) => {
        if (body.stream) res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
      });
      if (body.stream) res.end(); else json(res, 200, result);
    } finally { clearInterval(heartbeat); }
  } catch (error) {
    const message = String(error.message).slice(0, 200);
    if (!res.headersSent) json(res, 400, { error: { message, type: 'adapter_error' } });
    else {
      res.write(`event: error\ndata: ${JSON.stringify({ type: 'error', message, code: 'adapter_error' })}\n\n`);
      res.end();
    }
    console.error(JSON.stringify({ event: 'request_failed', message }));
  }
});
server.listen(config.port, '127.0.0.1', () => console.log(JSON.stringify({ ready: true, port: config.port })));
