// Attacker tests: another user and a missing user must not reach a note.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { api } from './helper.mjs';

const call = api();
const denied = (status) => status === 403 || status === 404;

test('security-owner: a request without x-user is rejected with 401', async () => {
  const n = (await call('POST', '/notes', 'ayse', { title: 'private' })).json;
  for (const [m, p, body] of [['GET', '/notes'], ['POST', '/notes', { title: 'x' }], ['GET', `/notes/${n.id}`], ['PATCH', `/notes/${n.id}`, { title: 'x' }], ['DELETE', `/notes/${n.id}`]]) {
    assert.equal((await call(m, p, undefined, body)).status, 401, `${m} ${p} without a header`);
    assert.equal((await call(m, p, '', body)).status, 401, `${m} ${p} with an empty header`);
  }
});

test('security-owner: another user cannot read, change or delete a note', async () => {
  const n = (await call('POST', '/notes', 'ayse', { title: 'salary', body: 'secret' })).json;
  const read = await call('GET', `/notes/${n.id}`, 'mert');
  assert.ok(denied(read.status), `read ${read.status}`);
  assert.ok(!JSON.stringify(read.json ?? '').includes('secret'), 'the body does not leak');
  assert.ok(denied((await call('PATCH', `/notes/${n.id}`, 'mert', { title: 'taken over' })).status));
  assert.ok(denied((await call('DELETE', `/notes/${n.id}`, 'mert')).status));
  const own = await call('GET', `/notes/${n.id}`, 'ayse');
  assert.equal(own.status, 200, 'the note still exists');
  assert.equal(own.json.title, 'salary', 'and is unchanged');
});

test('security-owner: the list holds only the caller\'s notes', async () => {
  const a = (await call('POST', '/notes', 'zeynep', { title: 'z1' })).json;
  const c = (await call('POST', '/notes', 'can', { title: 'c1' })).json;
  const list = (await call('GET', '/notes', 'zeynep')).json;
  assert.ok(list.some((x) => x.id === a.id));
  assert.ok(!list.some((x) => x.id === c.id), 'no other user\'s note');
});

// Checked through access, not an owner field: the response does not have to expose one
test('security-owner: the owner cannot be set or changed through the body', async () => {
  const n = (await call('POST', '/notes', 'ayse', { title: 'x', owner: 'mert' })).json;
  assert.ok(denied((await call('GET', `/notes/${n.id}`, 'mert')).status), 'owner in the body is ignored');
  await call('PATCH', `/notes/${n.id}`, 'ayse', { owner: 'mert' });
  assert.ok(denied((await call('GET', `/notes/${n.id}`, 'mert')).status), 'owner in a PATCH is ignored');
  assert.equal((await call('GET', `/notes/${n.id}`, 'ayse')).status, 200);
});
