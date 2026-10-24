import { test } from 'node:test';
import assert from 'node:assert/strict';
import { api } from './helper.mjs';

const call = api();

test('feature-tags: tags are lowercased with Turkish rules, deduplicated, order kept', async () => {
  const r = await call('POST', '/notes', 'ayse', { title: 'a', tags: [' İŞ ', 'Acil', 'iş', 'IRMAK'] });
  assert.equal(r.status, 201);
  assert.deepEqual(r.json.tags, ['iş', 'acil', 'ırmak']);
});

test('feature-tags: a note without tags returns an empty list', async () => {
  const r = await call('POST', '/notes', 'ayse', { title: 'b' });
  assert.deepEqual(r.json.tags, []);
  assert.deepEqual((await call('GET', `/notes/${r.json.id}`, 'ayse')).json.tags, []);
});

test('feature-tags: invalid tags are rejected with 400', async () => {
  for (const tags of [['1', '2', '3', '4', '5', '6'], ['  '], ['x'.repeat(21)], 'iş', [3], [null]])
    assert.equal((await call('POST', '/notes', 'ayse', { title: 'c', tags })).status, 400, JSON.stringify(tags));
  const ok = await call('POST', '/notes', 'ayse', { title: 'c', tags: ['x'.repeat(20), 'a', 'b', 'c', 'd'] });
  assert.equal(ok.status, 201, 'five tags of 20 characters are allowed');
});

test('feature-tags: PATCH replaces the tags and validates them', async () => {
  const n = (await call('POST', '/notes', 'ayse', { title: 'd', tags: ['eski'] })).json;
  assert.deepEqual((await call('PATCH', `/notes/${n.id}`, 'ayse', { tags: ['Yeni'] })).json.tags, ['yeni']);
  assert.equal((await call('PATCH', `/notes/${n.id}`, 'ayse', { tags: [''] })).status, 400);
  assert.deepEqual((await call('GET', `/notes/${n.id}`, 'ayse')).json.tags, ['yeni'], 'a rejected PATCH changes nothing');
});

test('feature-tags: ?tag filters case-insensitively', async () => {
  const x = (await call('POST', '/notes', 'ayse', { title: 'filtre', tags: ['proje'] })).json;
  const list = (await call('GET', '/notes?tag=PROJE', 'ayse')).json;
  assert.ok(Array.isArray(list));
  assert.deepEqual(list.map((n) => n.id), [x.id]);
});

test('feature-tags: /tags counts only the caller\'s notes, sorted by count then name', async () => {
  // zz is seen before mm and both are used once: insertion order would put zz first
  for (const tags of [['ev', 'zz'], ['ev', 'aa'], ['ev', 'mm'], ['aa']]) await call('POST', '/notes', 'mert', { title: 't', tags });
  await call('POST', '/notes', 'zeynep', { title: 't', tags: ['ev', 'gizli'] });
  const r = await call('GET', '/tags', 'mert');
  assert.equal(r.status, 200);
  assert.deepEqual(r.json, [{ tag: 'ev', count: 3 }, { tag: 'aa', count: 2 }, { tag: 'mm', count: 1 }, { tag: 'zz', count: 1 }]);
});
