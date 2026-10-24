import { test } from 'node:test';
import assert from 'node:assert/strict';
import { api } from './helper.mjs';

const call = api();
// All in the past, so a note created now is the newest
const dates = ['2025-03-01T10:00:00.000Z', '2024-12-31T23:59:59.000Z', '2025-10-24T08:00:00.000Z', '2025-01-15T12:00:00.000Z', '2025-10-24T07:59:00.000Z', '2023-06-01T00:00:00.000Z'];

test('bug-sort: the list is newest first', async () => {
  for (const [i, createdAt] of dates.entries()) await call('POST', '/notes', 'ayse', { title: `n${i}`, createdAt });
  const list = (await call('GET', '/notes', 'ayse')).json;
  assert.deepEqual(list.map((n) => n.createdAt), [...dates].sort().reverse());
});

test('bug-sort: notes without createdAt get one and still list', async () => {
  const r = await call('POST', '/notes', 'ayse', { title: 'şimdi' });
  assert.equal(r.status, 201);
  assert.ok(!Number.isNaN(Date.parse(r.json.createdAt)));
  const list = (await call('GET', '/notes', 'ayse')).json;
  assert.equal(list[0].title, 'şimdi', 'the newest note is first');
});
