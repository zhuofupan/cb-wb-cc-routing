import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve, basename } from 'node:path';
import { gzipSync } from 'node:zlib';
import { cachedModels, mergeSelected, syncCodexCatalog } from '../scripts/catalog-sync.mjs';

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
  assert.equal(merged.length, 2); assert.equal(merged[0].name, 'cb·Hy4 preview·960k'); assert.equal(merged[0].effort, 'high');
  assert.equal(merged[1].context, 1000000); assert.equal(merged[1].effort, 'max');
  const path = join(dir, 'codex.json');
  await writeFile(path, JSON.stringify({ models: [{ slug: 'hy4-preview', supported_reasoning_levels: [{ effort: 'medium' }], tool_mode: 'keep' }] }));
  await syncCodexCatalog(path, merged, true);
  const model = JSON.parse(await readFile(path, 'utf8')).models[0];
  assert.equal(model.default_reasoning_level, 'high'); assert.deepEqual(model.supported_reasoning_levels.map(m => m.effort), ['high']);
  assert.equal(model.tool_mode, 'keep'); assert.equal(model.context_window, 960000);
  await writeFile(path, JSON.stringify({models:[{slug:'missing',supported_reasoning_levels:[{effort:'max'}]}]}));
  await syncCodexCatalog(path, merged, true);
  const maxModel=JSON.parse(await readFile(path,'utf8')).models[0];
  assert.equal(maxModel.default_reasoning_level,'xhigh');
  assert.deepEqual(maxModel.supported_reasoning_levels.map(m=>m.effort),['xhigh']);
  assert.equal(merged[1].effort,'max');
});
