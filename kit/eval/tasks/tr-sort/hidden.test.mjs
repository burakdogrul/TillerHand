// The trap: "alphabetical" and "case-insensitive" in Turkish. Code point order puts ç, ğ, ı, ö, ş, ü after z, and the
// default case mapping turns İ into i + a combining dot and I into i (Turkish: I → ı, İ → i).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fresh } from './helper.mjs';

const TITLES = ['şeker', 'sabun', 'çay', 'cam', 'ılık', 'ışık', 'iğne', 'İnci', 'zeytin', 'Üzüm', 'ufuk', 'ödev', 'okul', 'Ilgaz', 'ip'];
// Turkish alphabet order: c ç ... ı i ... o ö ... s ş ... u ü ... z
const SORTED = ['cam', 'çay', 'Ilgaz', 'ılık', 'ışık', 'iğne', 'İnci', 'ip', 'okul', 'ödev', 'sabun', 'şeker', 'ufuk', 'Üzüm', 'zeytin'];

async function withNotes(titles, fn) {
  const { call, close } = await fresh();
  try {
    for (const title of titles) await call('POST', '/notes', 'ayse', { title });
    await fn(call);
  } finally { await close(); }
}
const titles = (r) => (Array.isArray(r.json) ? r.json.map((n) => n.title) : r.json);

test('tr-sort: sort=title follows the Turkish alphabet', () => withNotes(TITLES, async (call) => {
  const r = await call('GET', '/notes?sort=title', 'ayse');
  assert.equal(r.status, 200);
  assert.deepEqual(titles(r), SORTED);
}));

test('tr-sort: q is case-insensitive with Turkish rules', () => withNotes(['istanbul gezisi', 'ırmak kenarı', 'ŞEHİR MERKEZİ', 'irmik helvası', 'Iğdır'], async (call) => {
  const q = async (s) => titles(await call('GET', `/notes?q=${encodeURIComponent(s)}`, 'ayse'));
  assert.deepEqual(await q('İSTANBUL'), ['istanbul gezisi']);
  assert.deepEqual(await q('IRMAK'), ['ırmak kenarı'], 'I is the capital of ı, not of i');
  assert.deepEqual(await q('şehir'), ['ŞEHİR MERKEZİ']);
  assert.deepEqual(await q('ığdır'), ['Iğdır']);
  assert.deepEqual(await q('yok'), []);
}));

test('tr-sort: q and sort=title together', () => withNotes(['şeker', 'Şalgam', 'sabun', 'çay', 'ŞİŞE'], async (call) => {
  const r = await call('GET', `/notes?q=${encodeURIComponent('Ş')}&sort=title`, 'ayse');
  assert.deepEqual(titles(r), ['Şalgam', 'şeker', 'ŞİŞE']);
}));
