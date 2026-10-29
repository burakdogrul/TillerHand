// A multi-step contract: the order has to be right first (the fixture sorts wrongly), stable on equal dates, and a note
// added between two page requests must not repeat or skip an item. The body stays an array for existing clients.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fresh } from './helper.mjs';

const iso = (i) => new Date(Date.UTC(2025, 0, 1) + i * 3600000).toISOString();
// Pages until there is no x-next-cursor; returns the pages
async function pages(call, query = '') {
  const out = [];
  let cursor = null;
  for (let i = 0; i < 20; i++) {
    const r = await call('GET', `/notes?${query}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, 'ayse');
    assert.equal(r.status, 200);
    assert.ok(Array.isArray(r.json), 'the body is still an array');
    out.push(r.json);
    cursor = r.headers.get('x-next-cursor');
    if (!cursor) return out;
  }
  throw new Error('no last page');
}

test('paging: default page of 20, newest first, the rest on the next page', async () => {
  const { call, close } = await fresh();
  try {
    const order = [7, 2, 19, 0, 24, 11, 5, 16, 3, 22, 9, 14, 1, 20, 6, 12, 23, 4, 17, 8, 13, 21, 10, 18, 15];
    for (const i of order) await call('POST', '/notes', 'ayse', { title: `n${i}`, createdAt: iso(i) });
    const p = await pages(call);
    assert.deepEqual(p.map((x) => x.length), [20, 5]);
    assert.deepEqual(p.flat().map((n) => n.createdAt), order.map(iso).sort().reverse());
  } finally { await close(); }
});

test('paging: equal createdAt values are neither repeated nor skipped', async () => {
  const { call, close } = await fresh();
  try {
    const made = [];
    for (let i = 0; i < 7; i++) made.push((await call('POST', '/notes', 'ayse', { title: `t${i}`, createdAt: iso(1) })).json.id);
    const p = await pages(call, 'limit=3');
    assert.deepEqual(p.map((x) => x.length), [3, 3, 1]);
    assert.deepEqual(p.flat().map((n) => n.id).sort(), [...made].sort());
  } finally { await close(); }
});

test('paging: a note added between two requests does not shift the next page', async () => {
  const { call, close } = await fresh();
  try {
    for (let i = 0; i < 10; i++) await call('POST', '/notes', 'ayse', { title: `m${i}`, createdAt: iso(i) });
    const first = await call('GET', '/notes?limit=5', 'ayse');
    await call('POST', '/notes', 'ayse', { title: 'new', createdAt: iso(50) });
    const second = await call('GET', `/notes?limit=5&cursor=${encodeURIComponent(first.headers.get('x-next-cursor'))}`, 'ayse');
    const seen = [...first.json, ...second.json].map((n) => n.title);
    assert.equal(new Set(seen).size, 10, 'no repeats');
    assert.ok(!seen.includes('new'));
    assert.deepEqual(second.json.map((n) => n.title), ['m4', 'm3', 'm2', 'm1', 'm0']);
  } finally { await close(); }
});

test('paging: limit outside 1-100 and a broken cursor are rejected', async () => {
  const { call, close } = await fresh();
  try {
    await call('POST', '/notes', 'ayse', { title: 'x' });
    for (const q of ['limit=0', 'limit=101', 'limit=abc', 'limit=-5', 'cursor=broken']) assert.equal((await call('GET', `/notes?${q}`, 'ayse')).status, 400, q);
    assert.equal((await call('GET', '/notes?limit=100', 'ayse')).status, 200);
  } finally { await close(); }
});
