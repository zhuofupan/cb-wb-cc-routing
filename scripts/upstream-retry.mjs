import { setTimeout as pause } from 'node:timers/promises';

// Retry only an explicit upstream refusal before any response stream is
// accepted. Transport failures and partial streams may already be billable.
export async function retryUpstream(call, { signal, headerTimeoutMs = 180000, retryDelayMs = 2500, onRetry = () => {} } = {}) {
  for (let attempt = 0; attempt < 2; attempt++) {
    signal?.throwIfAborted();
    const deadline = new AbortController();
    const combined = signal ? AbortSignal.any([signal, deadline.signal]) : deadline.signal;
    const timer = setTimeout(() => deadline.abort(new Error('Upstream response headers timed out')), headerTimeoutMs);
    let result;
    try {
      result = await call(combined);
      signal?.throwIfAborted();
      if (deadline.signal.aborted) throw Object.assign(new Error('Upstream response headers timed out'), { status: 504 });
    } catch (error) {
      signal?.throwIfAborted();
      if (deadline.signal.aborted) throw Object.assign(new Error('Upstream response headers timed out'), { status: 504 });
      throw error;
    } finally { clearTimeout(timer); }
    const temporary = [502, 503, 504].includes(result.status) && result.kind !== 'upstream_unreachable'
      || /"code"\s*:\s*"?11128/.test(String(result.message ?? ''));
    if (result.ok || attempt || !temporary) return result;
    onRetry(result);
    await pause(retryDelayMs, undefined, { signal });
  }
}

// A long answer can keep streaming indefinitely. Only a silent upstream is
// timed out; client-facing heartbeats do not reset this timer.
export async function* idleLimitedStream(stream, controller, idleMs = 120000) {
  const reader = stream.getReader();
  try {
    while (true) {
      const timer = setTimeout(() => {
        const reason = Object.assign(new Error('Upstream stream stalled'), { status: 504 });
        controller.abort(reason);
        void reader.cancel(reason).catch(() => {});
      }, idleMs);
      let chunk;
      try { chunk = await reader.read(); } finally { clearTimeout(timer); }
      controller.signal.throwIfAborted();
      if (chunk.done) break;
      yield chunk.value;
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}
