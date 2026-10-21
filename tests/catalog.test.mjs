import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve, basename } from 'node:path';
import { gzipSync } from 'node:zlib';
import { cachedModels, mergeSelected, syncCodexCatalog } from '../scripts/catalog-sync.mjs';

test('model metadata retains its real input and output capacity', () => {
  const merged = mergeSelected([{ id: 'deepseek-v4.1-flash', context: 1000000 }], [{ id: 'deepseek-v4.1-flash', maxInputTokens: 1000000, maxOutputTokens: 128000 }], 'workbuddy');
  assert.equal(merged[0].maxOutput, 128000);
});

test('Codex chooses native compaction defaults while retaining the real window', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'catalog-ceiling-'));
  t.after(async () => {
    assert.equal(dirname(resolve(dir)), resolve(tmpdir())); assert.ok(basename(dir).startsWith('catalog-ceiling-'));
    await rm(dir, { recursive: true, force: true });
  });
  const merged = mergeSelected(
    [{ id: 'glm-5.3-flashx', context: 1000000, maxOutput: 131072 }],
    [{ id: 'glm-5.3-flashx', maxInputTokens: 1000000, maxOutputTokens: 131072 }],
    'workbuddy',
  );
  const path = join(dir, 'codex.json');
  await writeFile(path, JSON.stringify({ models: [{ slug: 'glm-5.3-flashx', context_window: 1000000, max_context_window: 1000000, auto_compact_token_limit: 840000 }] }));
  await syncCodexCatalog(path, merged, true);
  const model = JSON.parse(await readFile(path, 'utf8')).models[0];
  assert.equal(model.auto_compact_token_limit, null);
  assert.equal(model.max_context_window, 1000000);
  assert.equal(model.context_window, 1000000);
});

test('account cache updates selected metadata without adding unselected models', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'catalog-regression-'));
  t.after(async () => {
    assert.equal(dirname(resolve(dir)), resolve(tmpdir())); assert.ok(basename(dir).startsWith('catalog-regression-'));
    await rm(dir, { recursive: true, force: true });
  });
  const rows = [{ id: 'hy4-preview', contextWindow: 960000, reasoning: { supportedEfforts: ['low', 'high'] } }, { id: 'new-unselected' }];
  await writeFile(join(dir, 'entry_models.info'), JSON.stringify(gzipSync(JSON.stringify({ data: { models: rows } })).toString('base64')));
  const selected = [{ id: 'hy4-preview', name: 'CB·Hy4 preview·1M', context: 1000000 }, { id: 'missing', name: 'CB·Missing·1M', context: 1000000 }];
  const merged = mergeSelected(selected, await cachedModels(dir), 'codebuddy');
  assert.equal(merged.length, 2); assert.equal(merged[0].name, 'cb/ Hy4 preview · 960k'); assert.equal(merged[0].effort, 'high');
  assert.equal(merged[1].context, 1000000); assert.equal(merged[1].effort, 'max');
  const path = join(dir, 'codex.json');
  await writeFile(path, JSON.stringify({ models: [{ slug: 'hy4-preview', supported_reasoning_levels: [{ effort: 'medium' }], tool_mode: 'keep' }] }));
  await syncCodexCatalog(path, merged, true);
  const model = JSON.parse(await readFile(path, 'utf8')).models[0];
  assert.equal(model.default_reasoning_level, 'high'); assert.deepEqual(model.supported_reasoning_levels.map(m => m.effort), ['low','medium','high','xhigh','max']);
  assert.equal(model.tool_mode, 'keep'); assert.equal(model.context_window, 960000);
  assert.equal(model.auto_compact_token_limit, null);
  assert.equal(model.max_context_window, 960000);
  await writeFile(path, JSON.stringify({models:[{slug:'missing',supported_reasoning_levels:[{effort:'max'}]}]}));
  await syncCodexCatalog(path, merged, true);
  const maxModel=JSON.parse(await readFile(path,'utf8')).models[0];
  assert.equal(maxModel.default_reasoning_level,'high');
  assert.deepEqual(maxModel.supported_reasoning_levels.map(m=>m.effort),['low','medium','high','xhigh','max']);
  assert.equal(merged[1].effort,'max');
});

test('billing labels refresh without duplication and retain selected order and fallback rates', () => {
  const selected = [
    {id:'glm-5.3-flashx',name:'wb·GLM-5.3-FlashX (0.19x) · 1M',context:1000000,multiplier:'0.19'},
    {id:'kimi-k3-2',name:'wb·Kimi-K3 (1.62x) · 1M',context:1000000}
  ];
  const upstream = [{id:'glm-5.3-flashx',contextWindow:512000,billing:{credits:'x0.20 credits'}}];
  const merged = mergeSelected(selected,upstream,'workbuddy');
  assert.deepEqual(merged.map(m=>m.id),selected.map(m=>m.id));
  assert.equal(merged[0].name,'wb/ GLM-5.3-FlashX (0.20x) · 512k');
  assert.equal(merged[1].name,'wb/ Kimi-K3 (1.62x) · 1M');
  assert.deepEqual(mergeSelected(merged,upstream,'workbuddy'),merged);
});

test('an explicit effort ceiling outranks the live catalog on every refresh', () => {
  // Speed cap: `high` is an operator choice, not a stale value. A catalog
  // refresh must not silently restore the model's highest declared effort.
  const upstream = [{ id: 'deepseek-v4.1-flash', reasoning: { supportedEfforts: ['low', 'high', 'max'] } }];
  const capped = mergeSelected([{ id: 'deepseek-v4.1-flash', context: 1000000 }], upstream, 'workbuddy', { 'deepseek-v4.1-flash': 'high' });
  assert.equal(capped[0].effort, 'high');
  assert.deepEqual(mergeSelected(capped, upstream, 'workbuddy', { 'deepseek-v4.1-flash': 'high' }), capped);
  const uncapped = mergeSelected([{ id: 'deepseek-v4.1-flash', context: 1000000 }], upstream, 'workbuddy');
  assert.equal(uncapped[0].effort, 'max');
  assert.equal(uncapped[0].defaultEffort, 'high');
});

test('catalog refresh preserves upstream defaults separately from the maximum', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'catalog-default-'));
  t.after(async () => {
    assert.equal(dirname(resolve(dir)), resolve(tmpdir())); assert.ok(basename(dir).startsWith('catalog-default-'));
    await rm(dir, { recursive: true, force: true });
  });
  const selected = [{ id: 'deepseek-v4.1-flash' }, { id: 'minimax-m3.1-flash' }];
  const upstream = selected.map(m => ({ ...m, reasoning: { supportedEfforts: ['low', 'high', 'max'], defaultEffort: 'low' } }));
  const merged = mergeSelected(selected, upstream, 'workbuddy');
  const path = join(dir, 'codex.json');
  await writeFile(path, JSON.stringify({ models: selected.map(m => ({ slug: m.id })) }));
  await syncCodexCatalog(path, merged);
  assert.deepEqual(JSON.parse(await readFile(path, 'utf8')).models.map(m => m.default_reasoning_level), ['low', 'low']);
  assert.deepEqual(mergeSelected(merged, upstream, 'workbuddy'), merged);
});

test('repair the installed mojibake labels and keep slash labels stable on refresh', () => {
  for (const mode of ['workbuddy', 'codebuddy']) {
    const prefix = mode === 'workbuddy' ? 'wb' : 'cb';
    const selected = [{ id: 'deepseek-v4.1-flash', name: `${prefix}\u8defDeepseek-V4.1-Flash (0.11x) \u8def 1M`, context: 1000000 }];
    const result = mergeSelected(selected, [], mode);
    assert.equal(result[0].name, `${prefix}/ Deepseek-V4.1-Flash (0.11x) · 1M`);
    assert.deepEqual(mergeSelected(result, [], mode), result);
  }
});
