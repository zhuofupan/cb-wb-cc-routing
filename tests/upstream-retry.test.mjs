import { test } from 'node:test';
import assert from 'node:assert/strict';
import { retryUpstream, idleLimitedStream } from '../scripts/upstream-retry.mjs';

test('temporary refusals get at most one retry, without retrying auth, rate limits or transport failures', async () => {
  for (const status of [400, 401, 403, 429, 502, 503, 504]) {
    let count = 0;
    const result = await retryUpstream(async () => { count++; return { ok: false, status }; }, { retryDelayMs: 1 });
    assert.equal(result.status, status);
    assert.equal(count, [502, 503, 504].includes(status) ? 2 : 1);
  }
  let count = 0;
  await retryUpstream(async () => { count++; return { ok: false, status: 502, kind: 'upstream_unreachable' }; });
  assert.equal(count, 1);
});

test('channel retry succeeds once and cancellation interrupts the backoff', async () => {
  let count = 0;
  const controller = new AbortController();
  const result = await retryUpstream(async () => ++count === 1
    ? { ok: false, status: 400, message: '{"code":11128}' } : { ok: true }, { retryDelayMs: 1 });
  assert.equal(count, 2); assert.equal(result.ok, true);
  count = 0;
  await assert.rejects(retryUpstream(async () => { count++; return { ok: false, status: 503 }; }, {
    signal: controller.signal, onRetry: () => controller.abort(), retryDelayMs: 10000,
  }), { name: 'AbortError' });
  assert.equal(count, 1);
});

test('header deadline becomes 504 without replaying a possibly accepted request', async () => {
  let count = 0;
  await assert.rejects(retryUpstream(signal => {
    count++;
    return new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true }));
  }, { headerTimeoutMs: 10 }), { status: 504 });
  assert.equal(count, 1);
});

test('a stalled response is cancelled while normal streamed chunks survive', async () => {
  const controller = new AbortController();
  let cancelled = false;
  const stalled = new ReadableStream({ cancel() { cancelled = true; } });
  await assert.rejects(async () => {
    for await (const chunk of idleLimitedStream(stalled, controller, 10)) assert.fail('No chunks expected');
  }, /stream stalled/);
  assert.equal(cancelled, true); assert.equal(controller.signal.aborted, true);
  const ready = new ReadableStream({ start(c) { c.enqueue('one'); c.enqueue('two'); c.close(); } });
  const chunks = [];
  for await (const chunk of idleLimitedStream(ready, new AbortController(), 1000)) chunks.push(chunk);
  assert.deepEqual(chunks, ['one', 'two']);
});
