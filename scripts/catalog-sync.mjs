// Refresh only selected models; missing metadata never erases known settings.
import { readFile, readdir, stat, writeFile, rename } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';
import { mapEffort, DEFAULT_EFFORT, levelIndex } from './effort-map.mjs';
const levels = ['low', 'medium', 'high', 'xhigh', 'max'];
const positive = n => Number.isSafeInteger(n) && n > 0;
const size = n => [1000000, 1048576].includes(n) ? '1M' : `${Math.floor(n / 1000)}k`;

export async function cachedModels(directory) {
  let files;
  try { files = (await readdir(directory)).filter(n => /^entry_.*\.info$/.test(n)); }
  catch (e) { if (e.code === 'ENOENT') return []; throw e; }
  const ranked = await Promise.all(files.map(async n => ({ path: join(directory, n), time: (await stat(join(directory, n))).mtimeMs })));
  for (const { path } of ranked.sort((a, b) => b.time - a.time)) {
    try {
      let data = JSON.parse(await readFile(path, 'utf8'));
      if (typeof data === 'string') data = JSON.parse(gunzipSync(Buffer.from(data, 'base64')).toString('utf8'));
      const rows = data.models ?? data.data?.models ?? (Array.isArray(data) ? data[0]?.data?.models ?? data : []);
      if (Array.isArray(rows) && rows.some(m => typeof m?.id === 'string')) return rows;
    } catch { /* The same cache also contains unrelated entries. */ }
  }
  return [];
}

export function mergeSelected(selected, upstream, mode, ceilings = {}) {
  const prefix = mode === 'codebuddy' ? 'cb' : 'wb';
  return selected.map(m => {
    const live = upstream.find(row => (row.id ?? row.slug) === (m.id ?? m.slug));
    const context = [live?.contextWindow, live?.maxInputTokens, live?.context].find(positive) ?? m.context;
    const maxOutput = [live?.maxOutputTokens, live?.maxOutput, m.maxOutput].find(positive);
    const supported = live?.reasoning?.supportedEfforts ?? live?.supportedEfforts;
    const declared = Array.isArray(supported) ? levels.filter(e => supported.includes(e)).at(-1) : undefined;
    // A per-model ceiling is a speed cap, so it outranks the live catalog and
    // a refresh cannot silently restore `max` after the operator lowered it.
    // Effort is stored in upstream spelling; the gateway maps client levels.
    const ceiling = ceilings[m.id ?? m.slug];
    const effort = ceiling ?? declared ?? 'max';
    const defaultEffort = live?.reasoning?.defaultEffort ?? live?.defaultEffort ?? DEFAULT_EFFORT[m.id ?? m.slug] ?? m.defaultEffort ?? 'high';
    const oldLabel = (m.name ?? m.display_name ?? m.id ?? m.slug).replace(/^(cb|wb)(?:\/\s*|[\u00b7\u8def])/i, '').replace(/\s*[\u00b7\u8def]\s*\d+[kKmM]$/, '');
    const multiplier = live?.billing?.credits?.match(/x(\d+(?:\.\d+)?)/i)?.[1]
      ?? m.multiplier ?? oldLabel.match(/\s+\(?(\d+(?:\.\d+)?)x\)?$/i)?.[1];
    const label = oldLabel.replace(/\s+\(?\d+(?:\.\d+)?x\)?$/i, '');
    return { ...m, name: `${prefix}/ ${label}${multiplier ? ` (${multiplier}x)` : ''}${context ? ` \u00b7 ${size(context)}` : ''}`, ...(multiplier ? { multiplier } : {}), ...(context ? { context } : {}), ...(maxOutput ? { maxOutput } : {}), effort, defaultEffort };
  });
}

export async function syncCodexCatalog(path, selected) {
  const data = JSON.parse(await readFile(path, 'utf8'));
  for (const m of data.models) {
    const live = selected.find(row => (row.id ?? row.slug) === m.slug);
    if (!live) continue;
    m.display_name = live.name;
    if (live.context) m.context_window = m.max_context_window = live.context;
    // Let the installed Codex version choose its model default, rather than
    // carrying the adapter's fixed 308750 or 840k threshold across upgrades.
    m.auto_compact_token_limit = null;
    // Every client level stays selectable; the description names the real
    // upstream level so a `medium` that maps to `low` is not mistaken for a
    // distinct amount of thinking.
    m.default_reasoning_level = levelIndex(live.defaultEffort) > levelIndex(live.effort) ? live.effort : live.defaultEffort;
    m.supported_reasoning_levels = levels.map(level => ({ effort: level, description: `Upstream: ${mapEffort(live.id ?? live.slug, level)}` }));
  }
  const temp = `${path}.${process.pid}.tmp`;
  await writeFile(temp, JSON.stringify(data, null, 2) + '\n');
  await rename(temp, path);
}
