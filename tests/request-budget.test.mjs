import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdtemp, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import { prepareImages } from '../scripts/request-images.mjs';
import { loadCompactionCodec } from '../scripts/compaction-codec.mjs';

const listen = server => new Promise(r => server.listen(0, '127.0.0.1', () => r(server.address().port)));
const image = url => ({ type: 'image_url', image_url: { url } });

test('image history keeps text/order and recent images without editing the source', async () => {
  const request = { messages: [{ role: 'user', content: [
    { type: 'text', text: 'visual findings' }, ...Array.from({ length: 18 }, (_, i) => image(`https://example.invalid/${i}.png`)),
  ] }] };
  const result = await prepareImages(request);
  assert.equal(result.omitted, 2);
  assert.equal(request.messages[0].content[0].text, 'visual findings');
  assert.match(request.messages[0].content[1].text, /Older image omitted/);
  assert.equal(request.messages[0].content.at(-1).image_url.url, 'https://example.invalid/17.png');
});

test('large requests are compressed before forwarding and summaries replay across restart', async t => {
  const scratch = await mkdtemp(join(tmpdir(), 'routing-budget-'));
  const keyPath = join(scratch, 'compaction.key');
  const received = [];
  const upstream = createServer(async (req, res) => {
    let raw = ''; for await (const chunk of req) raw += chunk;
    received.push(JSON.parse(raw));
    const fail = raw.includes('INCOMPLETE_SUMMARY');
    res.writeHead(200, { 'Content-Type': 'text/event-stream' });
    res.end(`data: ${JSON.stringify({ choices: [{ delta: { content: 'User needs tree rendering fixed; file tree.js; tests passed; inspect latest screenshot next.' }, finish_reason: fail ? 'length' : 'stop' }], usage: { prompt_tokens: 5, completion_tokens: 20 } })}\n\ndata: [DONE]\n\n`);
  });
  const upstreamPort = await listen(upstream);
  const reservation = createServer(); const port = await listen(reservation); await new Promise(r => reservation.close(r));
  const profile = join(scratch, 'profile.json');
  await writeFile(profile, JSON.stringify({ mode: 'codebuddy', port, upstream: `http://127.0.0.1:${upstreamPort}`, followClients: false,
    compactionKeyPath: keyPath, usageLedger: join(scratch, 'usage.jsonl'), requestLimitMiB: 64, upstreamRequestLimitMiB: 12,
    models: [{ id: 'test-model', context: 1000000, maxOutput: 128000 }] }));
  const child = spawn(process.execPath, [fileURLToPath(new URL('../scripts/gateway-server.mjs', import.meta.url)), '--settings', profile],
    { stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, IDLE_EXIT_MINUTES: '0' } });
  let log = ''; child.stdout.on('data', b => { log += b; }); child.stderr.on('data', b => { log += b; });
  t.after(async () => {
    child.kill(); await new Promise(r => { if (child.exitCode !== null) r(); else child.once('exit', r); });
    upstream.closeAllConnections(); await new Promise(r => upstream.close(r));
    assert.equal(dirname(resolve(scratch)), resolve(tmpdir())); assert.ok(basename(scratch).startsWith('routing-budget-'));
    await rm(scratch, { recursive: true, force: true });
  });
  const root = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try { if ((await fetch(root + '/health')).ok) { ready = true; break; } } catch {}
    if (child.exitCode !== null) break; await new Promise(r => setTimeout(r, 100));
  }
  assert.ok(ready, log);
  const call = (body, path = '/v1/responses') => fetch(root + path, { method: 'POST',
    headers: { Authorization: 'Bearer ck_offline', 'Content-Type': 'application/json' }, body: JSON.stringify({ model: 'test-model', ...body }) });
  await t.test('over 32 MiB of screenshots crosses ingress and becomes a small upstream request', async () => {
    const pixels = await sharp(randomBytes(1800 * 1800 * 3), { raw: { width: 1800, height: 1800, channels: 3 } }).png().toBuffer();
    const url = `data:image/png;base64,${pixels.toString('base64')}`;
    const content = Array.from({ length: 4 }, () => ({ type: 'input_image', image_url: url }));
    assert.ok(Buffer.byteLength(JSON.stringify(content)) > 32 * 1024 * 1024);
    const response = await call({ input: [{ role: 'user', content }] });
    assert.equal(response.status, 200); await response.json();
    const prepared = received.at(-1);
    assert.ok(Buffer.byteLength(JSON.stringify(prepared)) < 12 * 1024 * 1024);
    const forwarded = prepared.messages[0].content;
    assert.equal(forwarded.length, 4);
    const metadata = await sharp(Buffer.from(forwarded[0].image_url.url.split(',')[1], 'base64')).metadata();
    assert.ok(metadata.width <= 1280 && metadata.height <= 1280);
    assert.match(log, /image_budget/);
  });
  let compacted;
  await t.test('standalone compact returns an encrypted summary and is readable after restart', async () => {
    const response = await call({ input: 'Fix trees in tree.js; do not publish anything.' }, '/v1/responses/compact');
    assert.equal(response.status, 200); compacted = await response.json();
    assert.equal(compacted.object, 'response.compaction');
    assert.equal(compacted.output[0].type, 'compaction');
    const codec = await loadCompactionCodec(keyPath);
    assert.match(codec.decode(compacted.output[0].encrypted_content), /tree.js/);
    assert.ok(!compacted.output[0].encrypted_content.includes('tree.js'));
    assert.equal(received.at(-1).tools, undefined);
    assert.ok(received.at(-1).max_tokens <= 8192);
  });
  await t.test('next normal request consumes the summary token', async () => {
    const response = await call({ input: [...compacted.output, { role: 'user', content: 'Continue.' }] });
    assert.equal(response.status, 200); await response.json();
    assert.ok(received.at(-1).messages.some(m => String(m.content).includes('[Summary of earlier conversation]')));
  });
  await t.test('Codex V2 compaction trigger emits a compaction output item over SSE', async () => {
    const response = await call({ stream: true, input: [{ role: 'user', content: 'Fix tree.js' }, { type: 'compaction_trigger' }] });
    assert.equal(response.status, 200);
    const output = await response.text();
    assert.match(output, /event: response.output_item.done/); assert.match(output, /"type":"compaction"/);
    assert.match(output, /event: response.completed/); assert.doesNotMatch(output, /output_text.delta/);
  });
  await t.test('incomplete summaries and foreign tokens are rejected without installing compacted state', async () => {
    const failed = await call({ input: 'INCOMPLETE_SUMMARY' }, '/responses/compact');
    assert.equal(failed.status, 502); assert.match((await failed.json()).error.message, /not compacted/);
    const count = received.length;
    const foreign = await call({ input: [{ type: 'compaction', encrypted_content: 'foreign' }] });
    assert.equal(foreign.status, 400); assert.equal(received.length, count);
  });
  await t.test('oversized text is rejected rather than silently truncated', async () => {
    const count = received.length;
    const response = await call({ input: 'a'.repeat(13 * 1024 * 1024) });
    assert.equal(response.status, 413); assert.equal(received.length, count);
    assert.match((await response.json()).error.message, /upstream budget/);
    const ingress = await call({ input: 'a'.repeat(65 * 1024 * 1024) });
    assert.equal(ingress.status, 413); assert.equal(received.length, count);
  });
});
