import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app/server.js';

let server, base;
before(async () => {
  server = createApp().listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => server.close());

const call = (method, path, user, body) => fetch(base + path, {
  method, headers: { 'content-type': 'application/json', ...(user ? { 'x-user': user } : {}) }, body: body && JSON.stringify(body),
});

test('a created note can be read back', async () => {
  const r = await call('POST', '/notes', 'ayse', { title: 'Alışveriş', body: 'süt' });
  assert.equal(r.status, 201);
  const note = await r.json();
  const got = await (await call('GET', `/notes/${note.id}`, 'ayse')).json();
  assert.equal(got.title, 'Alışveriş');
});

test('a note without a title is rejected', async () => {
  assert.equal((await call('POST', '/notes', 'ayse', { body: 'x' })).status, 400);
});

test('a note can be updated and deleted', async () => {
  const note = await (await call('POST', '/notes', 'ayse', { title: 'Taslak' })).json();
  assert.equal((await (await call('PATCH', `/notes/${note.id}`, 'ayse', { title: 'Son' })).json()).title, 'Son');
  assert.equal((await call('DELETE', `/notes/${note.id}`, 'ayse')).status, 204);
  assert.equal((await call('GET', `/notes/${note.id}`, 'ayse')).status, 404);
});
