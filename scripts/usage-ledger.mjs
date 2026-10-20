// Persist only upstream usage numbers; never credentials or conversation content.
import { appendFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';

export function usageRecord(usage) {
  if (!usage || typeof usage !== 'object') return null;
  const number = value => value !== null && value !== undefined && value !== ''
    && Number.isFinite(Number(value)) && Number(value) >= 0 ? Number(value) : null;
  return {
    credit: number(usage.credit),
    input: number(usage.prompt_tokens),
    output: number(usage.completion_tokens),
    cached: number(usage.prompt_cache_hit_tokens ?? usage.prompt_tokens_details?.cached_tokens),
  };
}
let pending = Promise.resolve();
export function appendUsage(path, record) {
  // Serialize writes in this process; each line is small and contains no text payload.
  pending = pending.catch(() => {}).then(async () => {
    await mkdir(dirname(path), { recursive: true });
    await appendFile(path, JSON.stringify(record) + '\n', { encoding: 'utf8', mode: 0o600 });
  });
  return pending;
}
