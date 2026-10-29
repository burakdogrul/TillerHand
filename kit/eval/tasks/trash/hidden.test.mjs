// Implicit requirements: the prompt only says "deleted notes can be restored for 30 days". A trashed note must not
// show up or be usable as a live note, and the 30 days are counted from the deletion.
import { test, mock } from 'node:test';
import assert from 'node:assert/strict';

const DAY = 86400000;
// Date is mocked before the app loads, so an app that keeps a reference to the clock (a clock passed in, defaulting to
// Date.now) still sees the test's time. Each request moves the time on by 1 s: ids or stamps taken from the clock stay distinct.
let now = Date.now();
mock.timers.enable({ apis: ['Date'], now });
const { api } = await import('./helper.mjs');
const raw = api();
const call = (...a) => { now += 1000; mock.timers.setTime(now); return raw(...a); };
// The prompt names no status codes: any success or any client error is accepted, the state checks do the rest
const is2xx = (s) => s >= 200 && s < 300;
const is4xx = (s) => s >= 400 && s < 500;
const ids = (r) => (Array.isArray(r.json) ? r.json.map((n) => n.id) : []);

test('trash: a deleted note is gone from the live notes', async () => {
  const n = (await call('POST', '/notes', 'ayse', { title: 'old', body: 'text' })).json;
  assert.ok(is2xx((await call('DELETE', `/notes/${n.id}`, 'ayse')).status));
  assert.ok(!ids(await call('GET', '/notes', 'ayse')).includes(n.id), 'not in the list');
  assert.ok(is4xx((await call('GET', `/notes/${n.id}`, 'ayse')).status), 'not readable');
  assert.ok(is4xx((await call('PATCH', `/notes/${n.id}`, 'ayse', { title: 'x' })).status), 'not editable');
});

test('trash: a deleted note is in the trash and comes back unchanged', async () => {
  const n = (await call('POST', '/notes', 'ayse', { title: 'come back', body: 'content' })).json;
  await call('DELETE', `/notes/${n.id}`, 'ayse');
  const trash = await call('GET', '/trash', 'ayse');
  assert.equal(trash.status, 200);
  assert.ok(ids(trash).includes(n.id), 'listed in the trash');
  const r = await call('POST', `/notes/${n.id}/restore`, 'ayse');
  assert.ok(is2xx(r.status), `restore ${r.status}`);
  const back = await call('GET', `/notes/${n.id}`, 'ayse');
  assert.equal(back.status, 200);
  assert.deepEqual([back.json.title, back.json.body], ['come back', 'content']);
  assert.ok(ids(await call('GET', '/notes', 'ayse')).includes(n.id), 'live again');
  assert.ok(!ids(await call('GET', '/trash', 'ayse')).includes(n.id), 'no longer in the trash');
});

test('trash: 30 days are counted from the deletion', async () => {
  // Created long before the deletion: the age of the note does not matter
  const a = (await call('POST', '/notes', 'ayse', { title: 'a', createdAt: new Date(now - 90 * DAY).toISOString() })).json;
  const b = (await call('POST', '/notes', 'ayse', { title: 'b' })).json;
  await call('DELETE', `/notes/${a.id}`, 'ayse');
  await call('DELETE', `/notes/${b.id}`, 'ayse');
  now += 29 * DAY;
  assert.ok(is2xx((await call('POST', `/notes/${a.id}/restore`, 'ayse')).status), 'day 29: restorable');
  now += 2 * DAY; // b was deleted a moment after a: 31 days for b
  assert.ok(is4xx((await call('POST', `/notes/${b.id}/restore`, 'ayse')).status), 'day 31: gone');
  assert.ok(!ids(await call('GET', '/trash', 'ayse')).includes(b.id), 'day 31: not in the trash');
  assert.ok(is4xx((await call('GET', `/notes/${b.id}`, 'ayse')).status));
});
