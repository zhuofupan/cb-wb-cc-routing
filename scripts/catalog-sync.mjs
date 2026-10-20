// Refresh only selected models; missing metadata never erases known settings.
import { readFile, readdir, stat, writeFile, rename } from 'node:fs/promises';
import { gunzipSync } from 'node:zlib';
import { join } from 'node:path';
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
    const supported = live?.reasoning?.supportedEfforts ?? live?.supportedEfforts;
    const declared = Array.isArray(supported) ? levels.filter(e => supported.includes(e)).at(-1) : undefined;
    const effort = declared ?? ceilings[m.id ?? m.slug] ?? 'max';
    const label = (m.name ?? m.display_name ?? m.id ?? m.slug).replace(/^(cb|wb)·/i, '').replace(/·(?:\d+[kKmM])$/, '');
    return { ...m, name: `${prefix}·${label}${context ? `·${size(context)}` : ''}`, ...(context ? { context } : {}), effort };
  });
}

export async function syncCodexCatalog(path, selected, highest) {
  const data = JSON.parse(await readFile(path, 'utf8'));
  for (const m of data.models) {
    const live = selected.find(row => (row.id ?? row.slug) === m.slug);
    if (!live) continue;
    m.display_name = live.name;
    if (live.context) m.context_window = m.max_context_window = live.context;
    // Desktop's enabled effort list excludes max by default. xhigh is the
    // visible highest preset; the gateway's highest policy still sends max.
    const effort = highest && live.effort === 'max' ? 'xhigh' : live.effort;
    m.default_reasoning_level = effort;
    if (highest) m.supported_reasoning_levels = [{ effort, description: `Upstream effort: ${live.effort}` }];
  }
  const temp = `${path}.${process.pid}.tmp`;
  await writeFile(temp, JSON.stringify(data, null, 2) + '\n');
  await rename(temp, path);
}
