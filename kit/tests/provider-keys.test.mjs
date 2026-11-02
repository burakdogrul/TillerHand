// Run: node --test kit/tests/provider-keys.test.mjs
// 3.64.0: any provider the user names, the address sealed in the vault with the key (providers.mjs, keystore.mjs, shared.mjs findProgram,
// models.mjs --set-key, run-session.mjs, external-session-guard.mjs). Criteria AC-64.1 .. AC-64.29; the panel page (panel.js) and real
// terminal input are checked by hand. The refusals of --set-key and run-session are tested; a person typing a key is not.
// Hard limits of this file: no real vault (fake-vault.mjs, a folder per test), no real home folder, no real claude, no real network.
// Modules load inside the tests, so a missing module or export turns that test red on its own, not the whole file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { fileBackend, vaultFiles, vaultCalls, makeFakeClaude, FAKE_VAULT_URL } from './fake-vault.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const HOOKS = path.join(ROOT, '.claude', 'hooks');
const load = (name) => import(pathToFileURL(path.join(HOOKS, name)).href);
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const T = { timeout: 90000 };

// Nothing in this file may touch the real home folder or a real vault
const TMP_HOME = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'pk-top-home-')));
process.env.HOME = TMP_HOME;
process.env.USERPROFILE = TMP_HOME;
process.on('exit', () => { try { fs.rmSync(TMP_HOME, { recursive: true, force: true }); } catch { /* temp */ } });
const keystore = await load('keystore.mjs');
const DEFAULT_VAULT = path.join(TMP_HOME, 'default-vault');
keystore.setVaultBackend(fileBackend(DEFAULT_VAULT)); // never null: null would fall back to the real vault of this machine

// Split up so this file does not trip the secret scan. The last four characters, Zq9X, are in no other text of this file.
const KEY = 'zk_' + 'A1b2C3d4'.repeat(4) + 'Zq9X';
const KEY_2 = 'zk_' + 'f0E1d2C3'.repeat(4) + 'Mn7P';
const LAST4 = 'Zq9X';
const URL = 'https://api.acme.test/anthropic';
const HOST = 'api.acme.test';
const EVIL = 'https://evil.example/anthropic';
const MODEL = 'vendor/model-1';

const tmpDir = (t, prefix) => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  t.after(() => { try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 }); } catch { /* temp */ } });
  return dir;
};
const write = (file, text) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); };
const walk = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)])) : []);
// Files under the given folders that hold the secret in a plain encoding
const holders = (dirs, secret) => {
  const needles = [Buffer.from(secret), Buffer.from(secret, 'utf16le'), Buffer.from(Buffer.from(secret).toString('base64'))];
  return dirs.flatMap(walk).filter((f) => { const b = fs.readFileSync(f); return needles.some((n) => b.includes(n)); });
};
const storeOf = (home) => path.join(home, '.vibe-kit', 'providers.json');
const b64url = (obj) => Buffer.from(typeof obj === 'string' ? obj : JSON.stringify(obj)).toString('base64url');

// A vault in a folder of its own for this test, in this process; the default one comes back afterwards
function useVault(t, mode = 'ok', dir = tmpDir(t, 'pk-vault-')) {
  const backend = fileBackend(dir, mode);
  keystore.setVaultBackend(backend);
  t.after(() => keystore.setVaultBackend(fileBackend(DEFAULT_VAULT)));
  return { dir, backend, calls: backend.calls, files: () => vaultFiles(dir) };
}
const freshStore = (t) => path.join(tmpDir(t, 'pk-store-'), '.vibe-kit', 'providers.json');

// ============================================================================================
// Names and addresses (AC-64.9, AC-64.8, AC-64.8b)
// ============================================================================================

test('AC-64.9 isProvider takes a lower-case name of 1 to 32 characters: a letter first, then letters, digits and hyphens', T, async () => {
  const { isProvider } = await load('providers.mjs');
  for (const name of ['acme', 'a', 'a1', 'my-provider-2', 'z'.repeat(32), 'a-', 'openrouter', 'deepseek', 'kimi', 'local-llm']) assert.equal(isProvider(name), true, name);
  const bad = ['', 'A', 'Acme', 'ACME', '1a', '-a', 'a_b', 'a.b', 'a/b', 'a\\b', 'a b', 'a\n', ' a', 'a '.trim() + '\0', 'z'.repeat(33), 'z'.repeat(1000), 'ı', 'İ', 'ığdır', 'a\u0131', 'é', 'ünlü', '__proto__', '../x', 'https://a.example', undefined, null, 5, {}, ['acme'], true];
  for (const name of bad) assert.equal(isProvider(name), false, JSON.stringify(name));
});

test('AC-64.9 ATTACK: isProvider refuses the names of Object properties and the reserved Windows device names', T, async () => {
  const { isProvider } = await load('providers.mjs');
  const reserved = ['constructor', 'prototype', 'tostring', 'valueof', 'con', 'nul', 'aux', 'prn', ...Array.from({ length: 9 }, (_, i) => `com${i + 1}`), ...Array.from({ length: 9 }, (_, i) => `lpt${i + 1}`)];
  for (const name of reserved) assert.equal(isProvider(name), false, name);
  // Near misses are ordinary names
  for (const name of ['console', 'com10', 'lpt10', 'null', 'auxiliary', 'prnt', 'conx', 'com', 'lpt']) assert.equal(isProvider(name), true, name);
});

test('AC-64.9 ATTACK: a reserved or malformed name reaches neither the vault nor providers.json through setProvider', T, async (t) => {
  const { setProvider } = await load('providers.mjs');
  const v = useVault(t);
  const file = freshStore(t);
  for (const name of ['constructor', 'prototype', 'tostring', 'valueof', 'con', 'nul', 'aux', 'prn', 'com1', 'lpt9', '__proto__', 'Acme', '', '../x', 'a b', undefined, null]) {
    const err = setProvider(name, URL, KEY, file);
    assert.equal(typeof err, 'string', `${String(name)}: an error text`);
    assert.match(err, /\S/);
    assert.equal(err.includes(KEY), false, 'the error does not echo the key');
  }
  assert.equal(v.calls.save, 0, 'nothing reached the vault');
  assert.deepEqual(v.files(), {});
  assert.equal(fs.existsSync(file), false, 'nothing written');
});

test('AC-64.8 parseProviderUrl takes an https address and returns the address and its host', T, async () => {
  const { parseProviderUrl } = await load('providers.mjs');
  const r = parseProviderUrl('https://api.acme.test/anthropic');
  assert.equal(r.url, 'https://api.acme.test/anthropic');
  assert.equal(r.host, 'api.acme.test');
  assert.deepEqual(parseProviderUrl('https://openrouter.ai/api'), { url: 'https://openrouter.ai/api', host: 'openrouter.ai' });
  assert.equal(parseProviderUrl('https://api.acme.test/a/b/c').url, 'https://api.acme.test/a/b/c', 'a base path is kept');
  assert.notEqual(parseProviderUrl('https://api.acme.test'), null, 'no path is fine');
  assert.notEqual(parseProviderUrl('https://api.acme.test/anthropic/'), null, 'a trailing slash is fine');
});

test('AC-64.8 ATTACK: parseProviderUrl refuses http, other schemes, user info, a query, a fragment and anything that is not an address', T, async () => {
  const { parseProviderUrl } = await load('providers.mjs');
  const bad = [
    'http://api.acme.test/anthropic', 'HTTP://api.acme.test', 'ftp://api.acme.test', 'ws://api.acme.test', 'wss://api.acme.test', 'file:///etc/passwd', 'javascript:alert(1)', 'data:text/plain,x', 'api.acme.test/anthropic', '//api.acme.test/anthropic',
    'https://user@api.acme.test/x', 'https://user:pw@api.acme.test/x', 'https://:pw@api.acme.test/x', 'https://api.acme.test@evil.example/x',
    'https://api.acme.test/x?a=1', 'https://api.acme.test?a=1', 'https://api.acme.test/?', 'https://api.acme.test/x?', 'https://api.acme.test/x#frag', 'https://api.acme.test#frag', 'https://api.acme.test/x#',
    '', ' ', 'https://', 'https://exa mple.test/x',
    undefined, null, 5, {}, ['https://api.acme.test'], true,
  ];
  for (const text of bad) assert.equal(parseProviderUrl(text), null, JSON.stringify(text));
});

test('AC-64.8 ATTACK: the host is shown in punycode, so a look-alike letter cannot pass for a plain one; a backslash cannot hide the real host', T, async () => {
  const { parseProviderUrl } = await load('providers.mjs');
  const idn = parseProviderUrl('https://b\u00fccher.example/anthropic');
  assert.notEqual(idn, null);
  assert.equal(idn.host, 'xn--bcher-kva.example');
  assert.equal(idn.url.includes('\u00fc'), false, 'the stored address is the ASCII form too');
  // The address parser reads "\" as "/": the host is evil.example, whatever sits after the at sign
  const sneaky = parseProviderUrl('https://evil.example\\@api.acme.test/anthropic');
  assert.equal(sneaky === null || sneaky.host === 'evil.example', true, JSON.stringify(sneaky));
  // The Turkish dotted capital I and dotless i are not the ASCII letters
  const tr = parseProviderUrl('https://\u0130stanbul.example/x');
  assert.equal(tr === null || /^xn--/.test(tr.host), true, JSON.stringify(tr));
});

test('AC-64.8b keyOk takes printable ASCII of 16 to 512 characters, nothing else', T, async () => {
  const { keyOk } = await load('providers.mjs');
  for (const key of [KEY, KEY_2, 'a'.repeat(16), 'a'.repeat(512), '!'.repeat(16), '~'.repeat(20), 'sk-or-v1-' + 'a1b2c3d4'.repeat(6), 'Bearer-looking_token.value/with+symbols=ok']) assert.equal(keyOk(key), true, key.slice(0, 12));
  const bad = [
    'a'.repeat(15), 'a'.repeat(513), 'a'.repeat(100000), '', ' ', '                ',
    `${KEY} extra`, ` ${KEY}`, `${KEY} `, `${KEY}\n`, `\n${KEY}`, `${KEY}\r\nx-evil: 1`, `${KEY}\tx`, `${KEY}\0`, `${KEY}\x7f`, `${KEY}\x1b[0m`,
    `${KEY.slice(0, 10)}\u011f${KEY.slice(10)}`, `${KEY.slice(0, 10)}\u0130${KEY.slice(10)}`, `${KEY.slice(0, 10)}\u200b${KEY.slice(10)}`, `${KEY}\u2028`, '\u00e9'.repeat(20),
    undefined, null, 123, {}, [KEY], true,
  ];
  for (const key of bad) assert.equal(keyOk(key), false, String(JSON.stringify(key)).slice(0, 40));
});

// ============================================================================================
// Sealing: the address and the key are one package in the vault (AC-64.10, 64.14, 64.15, 64.2)
// ============================================================================================

test('AC-64.2 setProvider seals the address with the key: readProvider gives both back, and providers.json holds only the date and the host', T, async (t) => {
  const { setProvider, readProvider } = await load('providers.mjs');
  const v = useVault(t);
  const file = freshStore(t);
  assert.equal(setProvider('acme', URL, KEY, file), null);
  assert.deepEqual(readProvider('acme'), { url: URL, key: KEY });
  assert.equal(Object.keys(v.files()).join(), 'acme', 'one vault entry, named by the provider');
  assert.notEqual(v.files().acme, KEY, 'the vault entry is the sealed package, not the bare key');
  const meta = JSON.parse(fs.readFileSync(file, 'utf8')).keyMeta.acme;
  assert.deepEqual(Object.keys(meta).sort(), ['addedAt', 'host']);
  assert.equal(meta.host, HOST);
  assert.equal(Number.isNaN(Date.parse(meta.addedAt)), false, 'addedAt is a date');
  assert.ok(Math.abs(Date.now() - Date.parse(meta.addedAt)) < 60000, 'addedAt is now');
});

test('AC-64.10 ATTACK: providers.json never holds the key or its last four characters, and no file under the home or the project does', T, async (t) => {
  const { setProvider } = await load('providers.mjs');
  const v = useVault(t);
  const home = tmpDir(t, 'pk-home-');
  const file = storeOf(home);
  assert.equal(setProvider('acme', URL, KEY, file), null);
  assert.equal(setProvider('beta', 'https://beta.example/api', KEY_2, file), null);
  const text = fs.readFileSync(file, 'utf8');
  for (const secret of [KEY, KEY_2, LAST4, 'Mn7P']) assert.equal(text.includes(secret), false, `providers.json holds ${secret.length === 4 ? 'the last four characters' : 'a key'}`);
  assert.equal(text.includes('last4'), false, 'no last-four field');
  assert.deepEqual(holders([home], KEY), []);
  assert.deepEqual(holders([home], KEY_2), []);
  assert.deepEqual(holders([home, path.dirname(file)], KEY), []);
  assert.equal(Object.keys(v.files()).length, 2);
});

test('AC-64.10 no vault means nothing is saved anywhere; a vault that cannot open is an error, not a reason to fall back to a plain file', T, async (t) => {
  const { setProvider, readProvider, hasKey } = await load('providers.mjs');
  for (const mode of ['none', 'locked']) {
    const v = useVault(t, mode);
    const home = tmpDir(t, 'pk-home-');
    const file = storeOf(home);
    const err = setProvider('acme', URL, KEY, file);
    assert.equal(typeof err, 'string', `${mode}: an error text, not a throw`);
    assert.match(err, /\S/);
    assert.equal(err.includes(KEY), false, `${mode}: the error does not echo the key`);
    assert.equal(fs.existsSync(file), false, `${mode}: no providers.json, so no metadata for a key that was not saved`);
    assert.deepEqual(v.files(), {}, `${mode}: nothing in the vault`);
    assert.deepEqual(holders([home, v.dir], KEY), [], `${mode}: no file holds the key`);
    assert.equal(hasKey('acme', { file }), false, mode);
    let got = 'unset';
    try { got = readProvider('acme'); } catch { got = null; }
    assert.equal(got, null, `${mode}: nothing to read`);
  }
});

test('AC-64.10 setProvider refuses a bad address or key with an error text, saves nothing and never echoes the key', T, async (t) => {
  const { setProvider } = await load('providers.mjs');
  const v = useVault(t);
  const file = freshStore(t);
  for (const [url, key] of [['http://api.acme.test/x', KEY], ['https://user:pw@api.acme.test/x', KEY], ['https://api.acme.test/x?a=1', KEY], ['', KEY], [URL, 'short'], [URL, `${KEY} x`], [URL, `${KEY}\r\nx-evil: 1`], [URL, ''], [URL, undefined], [undefined, KEY]]) {
    const err = setProvider('acme', url, key, file);
    assert.equal(typeof err, 'string', `${url} ${String(key).slice(0, 8)}`);
    assert.match(err, /\S/);
    assert.equal(err.includes(KEY), false);
  }
  assert.equal(v.calls.save, 0, 'nothing reached the vault');
  assert.equal(fs.existsSync(file), false);
});

test('AC-64.6 a second setProvider for the same name replaces the address and the key together', T, async (t) => {
  const { setProvider, readProvider } = await load('providers.mjs');
  const v = useVault(t);
  const file = freshStore(t);
  assert.equal(setProvider('acme', URL, KEY, file), null);
  assert.equal(setProvider('acme', 'https://other.example/api', KEY_2, file), null);
  assert.deepEqual(readProvider('acme'), { url: 'https://other.example/api', key: KEY_2 });
  assert.equal(Object.keys(v.files()).length, 1);
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).keyMeta.acme.host, 'other.example');
  assert.equal(fs.readFileSync(file, 'utf8').includes(HOST), false, 'the old host is gone');
});

test('AC-64.14 ATTACK: editing the host or any other field of providers.json does not move the key: readProvider still gives the sealed address', T, async (t) => {
  const { setProvider, readProvider } = await load('providers.mjs');
  useVault(t);
  const file = freshStore(t);
  assert.equal(setProvider('acme', URL, KEY, file), null);
  const pristine = fs.readFileSync(file, 'utf8');
  const edits = {
    'the host of the metadata': (s) => { s.keyMeta.acme.host = 'evil.example'; },
    'an address inside the metadata': (s) => { s.keyMeta.acme.url = EVIL; s.keyMeta.acme.baseUrl = EVIL; },
    'the metadata replaced whole': (s) => { s.keyMeta.acme = { addedAt: 'x', host: 'evil.example', url: EVIL, source: 'plain' }; },
    'address fields at the top': (s) => { s.url = EVIL; s.baseUrl = EVIL; s.urls = { acme: EVIL }; s.providers = { acme: { url: EVIL, baseUrl: EVIL } }; },
    'a plain key entry': (s) => { s.keys = { acme: 'zk_evilevilevilevilevilevil' }; },
    'the catalog and limits': (s) => { s.catalog = { acme: { 'vendor/x': { input: 1, output: 1, context: 1 } } }; s.limits = { acme: 1 }; },
    'the metadata removed': (s) => { delete s.keyMeta; },
  };
  for (const [label, edit] of Object.entries(edits)) {
    const s = JSON.parse(pristine);
    edit(s);
    fs.writeFileSync(file, JSON.stringify(s));
    assert.deepEqual(readProvider('acme'), { url: URL, key: KEY }, label);
  }
  // A file that is no longer JSON may stop the read, but never points it elsewhere
  fs.writeFileSync(file, '{"keyMeta":');
  const broken = readProvider('acme');
  assert.equal(broken === null || (broken.url === URL && broken.key === KEY), true, 'a broken file');
});

test('AC-64.15 ATTACK: a vault entry that is not the sealed package gives null: an old bare key, plain JSON, a package with a bad address or key', T, async (t) => {
  const { setProvider, readProvider } = await load('providers.mjs');
  const v = useVault(t);
  const file = freshStore(t);
  assert.equal(setProvider('acme', URL, KEY, file), null);
  assert.deepEqual(readProvider('acme'), { url: URL, key: KEY }, 'control: the sealed entry reads');
  const entries = {
    'an old bare key': KEY,
    'plain JSON': JSON.stringify({ url: URL, key: KEY }),
    'an empty entry': '',
    'something that is not base64': 'not a package ***',
    'base64 of text that is not JSON': b64url('hello'),
    'a package with an http address': b64url({ url: 'http://api.acme.test/anthropic', key: KEY }),
    'a package with a short key': b64url({ url: URL, key: 'short' }),
    'a package with user info in the address': b64url({ url: 'https://user:pw@api.acme.test/x', key: KEY }),
    'a package without an address': b64url({ key: KEY }),
    'a package without a key': b64url({ url: URL }),
    'a package that is an array': b64url([URL, KEY]),
  };
  for (const [label, entry] of Object.entries(entries)) {
    fs.writeFileSync(path.join(v.dir, `${encodeURIComponent('acme')}.vault`), entry);
    let got;
    try { got = readProvider('acme'); } catch { got = null; }
    assert.equal(got, null, label);
  }
});

test('AC-64.2 readProvider gives null for a name with no entry and for names that are not providers', T, async (t) => {
  const { setProvider, readProvider } = await load('providers.mjs');
  useVault(t);
  assert.equal(setProvider('acme', URL, KEY, freshStore(t)), null);
  for (const name of ['other', 'beta', 'Acme', 'constructor', 'prototype', '', '../acme', 'acme/x', undefined, null, 5, {}]) {
    let got;
    try { got = readProvider(name); } catch { got = null; }
    assert.equal(got, null, JSON.stringify(name));
  }
});

test('AC-64.10 removeKey takes the vault entry and the metadata; limits, spend and the catalog stay; a missing name is not an error', T, async (t) => {
  const { setProvider, removeKey, readProvider, hasKey, setLimit, addSpend, spentOn, addCatalog, readStore } = await load('providers.mjs');
  const v = useVault(t);
  const file = freshStore(t);
  assert.equal(setProvider('acme', URL, KEY, file), null);
  assert.equal(setProvider('beta', 'https://beta.example/api', KEY_2, file), null);
  setLimit('acme', 2.5, file);
  addSpend('acme', 1.5, '2026-11-01', file);
  assert.equal(addCatalog('acme', { model: MODEL }, file), null);
  assert.ok([null, undefined].includes(removeKey('acme', file)));
  assert.equal(readProvider('acme'), null);
  assert.equal(hasKey('acme', { file }), false);
  assert.deepEqual(Object.keys(v.files()), ['beta'], 'the other provider stays');
  assert.equal(hasKey('beta', { file }), true);
  assert.equal(readStore(file).limits.acme, 2.5);
  assert.equal(spentOn('acme', '2026-11-01', file), 1.5);
  assert.equal(Object.hasOwn(readStore(file).catalog.acme, MODEL), true);
  assert.doesNotThrow(() => removeKey('acme', file), 'twice');
  assert.doesNotThrow(() => removeKey('gamma', file), 'never set');
  assert.doesNotThrow(() => removeKey('acme', path.join(path.dirname(file), 'none', 'providers.json')), 'no file');
});

test('AC-64.10 removeKey with a vault that cannot open returns an error text and keeps the metadata, so the panel still shows the key', T, async (t) => {
  const { setProvider, removeKey, hasKey } = await load('providers.mjs');
  const dir = tmpDir(t, 'pk-vault-');
  useVault(t, 'ok', dir);
  const file = freshStore(t);
  assert.equal(setProvider('acme', URL, KEY, file), null);
  useVault(t, 'locked', dir);
  const err = removeKey('acme', file);
  assert.equal(typeof err, 'string');
  assert.match(err, /\S/);
  assert.equal(err.includes(KEY), false);
  assert.equal(hasKey('acme', { file }), true, 'the metadata stays');
  assert.equal(Object.keys(vaultFiles(dir)).join(), 'acme', 'and so does the vault entry');
});

test('AC-64.10 hasKey and keyInfo read the metadata only: the vault is not opened, a plain keys entry or a variable is not a key', T, async (t) => {
  const { setProvider, hasKey, keyInfo, providerNames } = await load('providers.mjs');
  const v = useVault(t);
  const file = freshStore(t);
  assert.equal(setProvider('acme', URL, KEY, file), null);
  v.calls.read = v.calls.save = v.calls.remove = 0;
  assert.equal(hasKey('acme', { file }), true);
  assert.equal(hasKey('beta', { file }), false);
  assert.equal(hasKey('constructor', { file }), false);
  const info = keyInfo('acme', { file });
  assert.deepEqual(Object.keys(info).sort(), ['addedAt', 'host', 'present'], 'no last four, no source');
  assert.equal(info.present, true);
  assert.equal(info.host, HOST);
  assert.ok(Math.abs(Date.now() - Date.parse(info.addedAt)) < 60000);
  assert.deepEqual(keyInfo('beta', { file }), { present: false, addedAt: null, host: null });
  assert.deepEqual(keyInfo('constructor', { file }), { present: false, addedAt: null, host: null });
  providerNames(file);
  assert.deepEqual(v.calls, { save: 0, read: 0, remove: 0 }, 'the vault was not opened');
  // Old plain entries and a variable do not make a key
  const old = freshStore(t);
  write(old, JSON.stringify({ keys: { acme: KEY }, keyMeta: {} }));
  const had = process.env.ACME_API_KEY;
  process.env.ACME_API_KEY = KEY;
  t.after(() => { if (had === undefined) delete process.env.ACME_API_KEY; else process.env.ACME_API_KEY = had; });
  assert.equal(hasKey('acme', { file: old }), false, 'a plain keys entry');
  assert.equal(keyInfo('acme', { file: old }).present, false);
  assert.equal(hasKey('acme', { file: old, env: { ACME_API_KEY: KEY } }), false, 'a variable');
});

test('AC-64.2 providerNames is the sorted union of the metadata, the catalog and the limits, and only holds real names', T, async (t) => {
  const { providerNames, isProvider } = await load('providers.mjs');
  const file = freshStore(t);
  assert.deepEqual(providerNames(path.join(path.dirname(file), 'none.json')), [], 'no file');
  write(file, JSON.stringify({
    keyMeta: { zed: { addedAt: '2026-11-01T00:00:00.000Z', host: 'z.example' }, 'Bad Name': { addedAt: 'x', host: 'x' } },
    catalog: { acme: { [MODEL]: {} }, '../evil': { 'a/b': {} }, constructor: {} },
    limits: { beta: 1, acme: 2, con: 3, 'A': 4 },
    spend: { ghost: { '2026-11-01': 1 } },
  }));
  const names = providerNames(file);
  assert.deepEqual(names, ['acme', 'beta', 'zed']);
  assert.equal(names.every((n) => isProvider(n)), true, 'every name is safe to put in a command');
});

test('AC-64.10 purgePlainKeys removes the keys field of an old providers.json and keeps the rest; it never throws on a broken file', T, async (t) => {
  const { purgePlainKeys, readStore } = await load('providers.mjs');
  const file = freshStore(t);
  write(file, JSON.stringify({ keys: { acme: KEY, beta: KEY_2 }, limits: { acme: 3 }, spend: { acme: { '2026-11-01': 0.5 } }, keyMeta: { acme: { addedAt: '2026-11-01T00:00:00.000Z', host: HOST } }, catalog: { acme: { [MODEL]: { input: 1, output: 2, context: 3 } } } }));
  purgePlainKeys(file);
  const text = fs.readFileSync(file, 'utf8');
  assert.equal(text.includes(KEY), false);
  assert.equal(text.includes(KEY_2), false);
  assert.equal(Object.hasOwn(JSON.parse(text), 'keys'), false, 'the field itself is gone');
  const s = readStore(file);
  assert.equal(s.limits.acme, 3);
  assert.equal(s.spend.acme['2026-11-01'], 0.5);
  assert.equal(s.keyMeta.acme.host, HOST);
  assert.equal(Object.hasOwn(s.catalog.acme, MODEL), true);
  for (const broken of ['', 'not json', '{"keys":', 'null', '[]', '12']) {
    const f = path.join(path.dirname(file), 'broken.json');
    fs.writeFileSync(f, broken);
    assert.doesNotThrow(() => purgePlainKeys(f), JSON.stringify(broken));
  }
  assert.doesNotThrow(() => purgePlainKeys(path.join(path.dirname(file), 'none.json')), 'no file');
  assert.equal(fs.existsSync(path.join(path.dirname(file), 'none.json')), false, 'and no file is made');
});

test('AC-64.10 models.mjs, run-role.mjs and the panel delete a plain keys field when they start', T, async (t) => {
  const p = project(t);
  const old = () => write(storeOf(p.home), JSON.stringify({ keys: { acme: KEY }, limits: {}, spend: {}, keyMeta: {} }));
  old();
  assert.equal(p.run('models.mjs', ['--show']).status, 0);
  assert.equal(fs.readFileSync(storeOf(p.home), 'utf8').includes(KEY), false, 'models.mjs --show');
  old();
  write(path.join(p.root, 'p.md'), 'do the task\n');
  write(path.join(p.root, '.claude', 'state', 'models.json'), JSON.stringify({ code: `acme/${MODEL}:high` })); // a role sits at the top, a job under tasks
  p.run('run-role.mjs', ['code', 'p.md']); // refused for want of a key, and still cleans up
  assert.equal(fs.readFileSync(storeOf(p.home), 'utf8').includes(KEY), false, 'run-role.mjs');
  old();
  const panelProbe = path.join(p.home, 'panel-probe.mjs');
  write(panelProbe, `import { createPanel } from ${JSON.stringify(pathToFileURL(path.join(p.root, '.claude', 'hooks', 'models-panel.mjs')).href)};\nconst panel = await createPanel({ root: ${JSON.stringify(p.root)} });\nawait panel.close();\n`);
  const r = spawnSync(process.execPath, ['--import', FAKE_VAULT_URL, panelProbe], { cwd: p.root, encoding: 'utf8', timeout: 60000, env: p.env() });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(fs.readFileSync(storeOf(p.home), 'utf8').includes(KEY), false, 'the panel');
});

// ============================================================================================
// Names in a job choice (AC-64.2) and the optional limit and price (AC-64.3, 64.4)
// ============================================================================================

test('AC-64.2 parseExternal reads provider/model:effort for any well-formed provider name and refuses a reserved or malformed one', T, async () => {
  const { parseExternal } = await load('providers.mjs');
  assert.deepEqual(parseExternal(`acme/${MODEL}:high`), { provider: 'acme', model: MODEL, effort: 'high' });
  assert.deepEqual(parseExternal('my-llm/a/b:batch:low'), { provider: 'my-llm', model: 'a/b:batch', effort: 'low' });
  for (const value of ['Acme/x:high', 'constructor/x:high', 'prototype/x:high', 'con/x:high', 'nul/x:high', 'com1/x:high', 'lpt1/x:high', '__proto__/x:high', 'acme/x:max', 'acme/x', 'acme/-x:high', '/x:high', 'https://evil.example/x:high', undefined, null, 5, {}])
    assert.equal(parseExternal(value), null, JSON.stringify(value));
});

test('AC-64.3 addCatalog takes a model with no price and no context; a price that is given is still checked', T, async (t) => {
  const { addCatalog, readStore } = await load('providers.mjs');
  const file = freshStore(t);
  assert.equal(addCatalog('acme', { model: MODEL }, file), null);
  assert.equal(Object.hasOwn(readStore(file).catalog.acme, MODEL), true);
  assert.equal(addCatalog('beta', { model: 'x/y', context: 8000 }, file), null, 'a context without a price');
  assert.equal(addCatalog('acme', { model: 'vendor/priced', input: 2, output: 4, context: 32000 }, file), null);
  for (const entry of [{ model: 'vendor/p', input: -1, output: 4 }, { model: 'vendor/p', input: 0, output: 0 }, { model: 'vendor/p', input: 2, output: 4, context: -5 }, { model: 'vendor/p', input: 2, output: 4, context: 'big' }, { model: '../x' }, { model: '' }, { model: 5 }]) {
    assert.equal(typeof addCatalog('acme', entry, file), 'string', JSON.stringify(entry));
  }
  for (const name of ['Acme', 'con', 'constructor', '', undefined]) assert.equal(typeof addCatalog(name, { model: MODEL }, file), 'string', String(name));
  assert.equal(Object.hasOwn(readStore(file).catalog.acme, 'vendor/p'), false);
});

test('AC-64.4 spendAllowed with no limit is true, even when the ledger cannot be read; with a limit an unreadable ledger is a no', T, async (t) => {
  const { spendAllowed, addSpend } = await load('providers.mjs');
  const dir = tmpDir(t, 'pk-ledger-');
  const day = '2026-11-01';
  assert.equal(spendAllowed('acme', undefined, day, path.join(dir, 'none.json')), true, 'no limit, no file');
  for (const broken of ['', 'not json', '{"spend":', 'null', '[]']) {
    const f = path.join(dir, 'broken.json');
    fs.writeFileSync(f, broken);
    assert.equal(spendAllowed('acme', undefined, day, f), true, `no limit, ${JSON.stringify(broken)}`);
    assert.equal(spendAllowed('acme', 5, day, f), false, `a limit of 5, ${JSON.stringify(broken)}`);
  }
  assert.equal(spendAllowed('acme', 5, day, path.join(dir, 'none.json')), false, 'a limit and no file');
  const file = path.join(dir, 'ledger.json');
  addSpend('acme', 4, day, file);
  assert.equal(spendAllowed('acme', undefined, day, file), true, 'spend with no limit');
  assert.equal(spendAllowed('acme', 5, day, file), true);
  assert.equal(spendAllowed('acme', 4, day, file), false, 'at the limit');
  for (const bad of [0, -1, NaN]) assert.equal(spendAllowed('acme', bad, day, file), false, `a limit that cannot be right: ${bad}`);
});

// ============================================================================================
// Nothing fixed in the code, no variable route, no VIBE_KIT_VAULT (AC-64.1, 64.5, 64.11, 64.12)
// ============================================================================================

const hookSources = () => fs.readdirSync(HOOKS).filter((f) => f.endsWith('.mjs') && f !== 'messages.mjs').map((f) => [f, fs.readFileSync(path.join(HOOKS, f), 'utf8')])
  .concat(fs.existsSync(path.join(HOOKS, 'panel')) ? fs.readdirSync(path.join(HOOKS, 'panel')).filter((f) => /\.(js|html)$/.test(f)).map((f) => [`panel/${f}`, fs.readFileSync(path.join(HOOKS, 'panel', f), 'utf8')]) : []);
// Comments are not code: a line that starts with a comment mark, or a comment after code
const stripComments = (s) => s.split('\n').filter((l) => !/^\s*(\/\/|\/?\*)/.test(l)).map((l) => l.replace(/\s\/\/\s.*$/, '')).join('\n');

test('AC-64.1 ATTACK: no provider name, address, key format, check address or price list is written into the code', T, () => {
  const names = /openrouter|deepseek|moonshot|\bkimi\b/i;
  const identifiers = /\b(PROVIDERS|CHECK_URL|KNOWN_PRICES|OPENROUTER_MODELS|listModels|EXTERNAL_ROLES|keyFormatOk|resolveKey|checkKey)\b/;
  const found = [];
  for (const [file, source] of hookSources()) {
    const code = stripComments(source);
    if (names.test(code)) found.push(`${file}: a provider name or address`);
    if (file !== 'destructive-guard.mjs' && identifiers.test(code)) found.push(`${file}: ${code.match(identifiers)[0]}`);
    if (/\/api\/openrouter-models|sk-or-|api\.openrouter|\/v1\/key\b/.test(code)) found.push(`${file}: a provider address or key format`);
  }
  assert.deepEqual(found, []);
});

test('AC-64.1 providers.mjs and models.mjs no longer export the fixed tables or the key check', T, async () => {
  const providers = await load('providers.mjs');
  const models = await load('models.mjs');
  for (const name of ['PROVIDERS', 'EXTERNAL_ROLES', 'keyFormatOk', 'resolveKey', 'checkKey', 'KNOWN_PRICES']) {
    assert.equal(Object.hasOwn(providers, name), false, `providers.mjs ${name}`);
    assert.equal(Object.hasOwn(models, name), false, `models.mjs ${name}`);
  }
  for (const name of ['isProvider', 'parseProviderUrl', 'keyOk', 'setProvider', 'readProvider', 'removeKey', 'hasKey', 'keyInfo', 'providerNames', 'purgePlainKeys', 'unsafeEnv', 'addCatalog', 'spendAllowed'])
    assert.equal(typeof providers[name], 'function', `providers.mjs exports ${name}`);
  const runRole = await load('run-role.mjs');
  assert.equal(Object.hasOwn(runRole, 'KNOWN_PRICES'), false);
});

test('AC-64.5 the panel files never use the vault functions, and keystore.mjs is imported for systemExe only', T, () => {
  const used = [];
  for (const file of ['models-panel.mjs', 'panel-data.mjs']) {
    const code = stripComments(fs.readFileSync(path.join(HOOKS, file), 'utf8'));
    for (const name of ['resolveKey', 'setKey', 'removeKey', 'vaultRead', 'vaultSave', 'vaultDelete', 'readProvider', 'setProvider']) if (new RegExp(`\\b${name}\\b`).test(code)) used.push(`${file}: ${name}`);
    const imports = [...code.matchAll(/import\s*\{([^}]*)\}\s*from\s*'\.\/keystore\.mjs'/g)].flatMap((m) => m[1].split(',').map((x) => x.trim()).filter(Boolean));
    assert.deepEqual(imports.filter((x) => x !== 'systemExe'), [], `${file} imports from keystore.mjs`);
  }
  assert.deepEqual(used, []);
});

test('AC-64.11 ATTACK: no provider key variable is read: the code names no OPENROUTER_API_KEY style variable and no *_API_KEY lookup', T, () => {
  const found = [];
  // The one allowed mention: the child gets ANTHROPIC_API_KEY set to '' so a real Anthropic key never reaches the provider. Any other mention or lookup fails.
  const blanking = /\bANTHROPIC_API_KEY\s*:\s*''/g;
  for (const file of ['providers.mjs', 'run-role.mjs', 'run-session.mjs', 'models.mjs', 'models-panel.mjs', 'keystore.mjs']) {
    assert.equal(fs.existsSync(path.join(HOOKS, file)), true, file);
    const code = stripComments(fs.readFileSync(path.join(HOOKS, file), 'utf8')).replace(blanking, '');
    if (/_API_KEY/.test(code)) found.push(file);
  }
  assert.deepEqual(found, []);
});

test('AC-64.11 the child of a role run and of a session gets ANTHROPIC_API_KEY blanked and the run token instead, whatever the parent holds', T, async () => {
  const { childEnv } = await load('run-role.mjs');
  const { sessionEnv } = await load('run-session.mjs');
  const real = 'sk-ant-' + 'r'.repeat(30);
  const base = { PATH: 'keep-me', ANTHROPIC_API_KEY: real, ACME_API_KEY: real, ANTHROPIC_AUTH_TOKEN: real };
  const role = childEnv(base, { port: 4321, token: 'run-token-value-123456', model: MODEL, root: 'project-root' });
  const session = sessionEnv(base, { port: 4321, token: 'run-token-value-123456', provider: 'acme', model: MODEL, effort: 'high', root: 'project-root' });
  for (const [label, env] of [['role', role], ['session', session]]) {
    assert.equal(env.ANTHROPIC_API_KEY, '', label);
    assert.equal(env.ANTHROPIC_AUTH_TOKEN, 'run-token-value-123456', label);
    assert.equal(JSON.stringify(env).includes(real), false, `${label}: the real key is nowhere in the child env`);
    assert.equal('ACME_API_KEY' in env, false, label);
  }
});

test('AC-64.12 VIBE_KIT_VAULT is gone: the variable does not switch the vault off, and no hook names it', T, async (t) => {
  const had = process.env.VIBE_KIT_VAULT;
  process.env.VIBE_KIT_VAULT = 'none';
  t.after(() => { if (had === undefined) delete process.env.VIBE_KIT_VAULT; else process.env.VIBE_KIT_VAULT = had; });
  useVault(t);
  assert.equal(keystore.vaultKind(), 'fake', 'the backend in place is used whatever the variable says');
  const { setProvider, readProvider } = await load('providers.mjs');
  assert.equal(setProvider('acme', URL, KEY, freshStore(t)), null);
  assert.deepEqual(readProvider('acme'), { url: URL, key: KEY });
  assert.deepEqual(hookSources().filter(([, source]) => source.includes('VIBE_KIT_VAULT')).map(([f]) => f), []);
});

test('AC-64.12 control: the vault helper is a preload, so a process started with it gets the fake backend and no other', T, async (t) => {
  const p = project(t);
  const probe = path.join(p.home, 'kind-probe.mjs');
  write(probe, `import { vaultKind } from ${JSON.stringify(pathToFileURL(path.join(p.root, '.claude', 'hooks', 'keystore.mjs')).href)};\nconsole.log(String(vaultKind()));\n`);
  const r = spawnSync(process.execPath, ['--import', FAKE_VAULT_URL, probe], { cwd: p.root, encoding: 'utf8', timeout: 60000, env: p.env() });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout.trim(), 'fake');
});

// AC-64.13: keystore.mjs in a child on a made-up Windows. Every write is recorded and none is done, so the real folder is never touched.
const DPAPI_PROBE = path.join(TMP_HOME, 'pk-dpapi-probe.mjs');
fs.writeFileSync(DPAPI_PROBE, String.raw`
import fs from 'node:fs';
import os from 'node:os';
import cp from 'node:child_process';
Object.defineProperty(process, 'platform', { value: 'win32' });
delete process.env.SYSTEMROOT; process.env.SystemRoot = process.env.PK_SYSTEMROOT;
const writes = [];
for (const name of ['mkdirSync', 'writeFileSync', 'renameSync', 'rmSync', 'appendFileSync', 'copyFileSync']) fs[name] = (...a) => { writes.push(String(a[0])); if (typeof a[1] === 'string' && name === 'renameSync') writes.push(a[1]); };
cp.execFileSync = () => 'QUJD';
const ks = await import(process.env.PK_KEYSTORE);
let error = null;
try { ks.vaultSave('acme', 'k'.repeat(40)); } catch (e) { error = String(e.message); }
console.log(JSON.stringify({ kind: ks.vaultKind(), writes, error, home: os.userInfo().homedir, envHome: process.env.USERPROFILE ?? process.env.HOME }));
`);

test('AC-64.13 ATTACK: the DPAPI file path comes from os.userInfo().homedir, so a project cannot steer it with USERPROFILE or HOME', T, (t) => {
  const root = tmpDir(t, 'pk-dp-root-');
  const fakeHome = tmpDir(t, 'pk-dp-home-');
  const win = tmpDir(t, 'pk-dp-win-');
  write(path.join(win, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'), '');
  const r = spawnSync(process.execPath, [DPAPI_PROBE], {
    cwd: root, encoding: 'utf8', timeout: 30000,
    env: { ...process.env, HOME: fakeHome, USERPROFILE: fakeHome, CLAUDE_PROJECT_DIR: root, PK_SYSTEMROOT: win, PK_KEYSTORE: pathToFileURL(path.join(HOOKS, 'keystore.mjs')).href },
  });
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  const out = JSON.parse(r.stdout.trim().split('\n').at(-1));
  assert.equal(out.kind, 'dpapi', 'control: the made-up Windows has a vault');
  assert.equal(out.error, null);
  const keyWrites = out.writes.filter((w) => /\.vibe-kit/i.test(w));
  assert.ok(keyWrites.length >= 1, `the save wrote somewhere under .vibe-kit (${JSON.stringify(out.writes)})`);
  const same = (a, b) => path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase();
  for (const w of keyWrites) {
    assert.equal(path.resolve(w).toLowerCase().startsWith(path.resolve(out.home).toLowerCase() + path.sep), true, `${w} is under the home the system reports`);
    assert.equal(path.resolve(w).toLowerCase().startsWith(path.resolve(fakeHome).toLowerCase() + path.sep), false, `${w} is not under HOME or USERPROFILE`);
  }
  assert.equal(same(out.envHome, fakeHome), true, 'control: the variable did point somewhere else');
});

// ============================================================================================
// findProgram (AC-64.16b)
// ============================================================================================

test('AC-64.16b findProgram gives the full path of a program on PATH, and null for one that is not there', T, async (t) => {
  const { findProgram } = await load('shared.mjs');
  const root = tmpDir(t, 'pk-find-root-');
  const bin = tmpDir(t, 'pk-find-bin-');
  const file = path.join(bin, process.platform === 'win32' ? 'tool-x.exe' : 'tool-x');
  write(file, process.platform === 'win32' ? '' : '#!/bin/sh\nexit 0\n');
  if (process.platform !== 'win32') fs.chmodSync(file, 0o755);
  const had = { PATH: process.env.PATH, Path: process.env.Path, PATHEXT: process.env.PATHEXT };
  t.after(() => { for (const [k, v] of Object.entries(had)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } });
  const pathKey = Object.keys(process.env).find((k) => k.toLowerCase() === 'path') ?? 'PATH';
  process.env[pathKey] = [bin, path.dirname(process.execPath)].join(path.delimiter);
  const found = findProgram('tool-x', root);
  assert.equal(typeof found, 'string');
  assert.equal(path.isAbsolute(found), true, found);
  assert.equal(fs.realpathSync(found).toLowerCase(), fs.realpathSync(file).toLowerCase());
  assert.equal(findProgram('tool-that-is-not-there', root), null);
  assert.equal(findProgram('', root), null);
});

test('AC-64.16b ATTACK: findProgram refuses a program that sits inside the project, however PATH reaches it', T, async (t) => {
  const { findProgram } = await load('shared.mjs');
  const root = tmpDir(t, 'pk-find-root-');
  const inside = path.join(root, process.platform === 'win32' ? 'tool-y.exe' : 'tool-y');
  write(inside, process.platform === 'win32' ? '' : '#!/bin/sh\nexit 0\n');
  if (process.platform !== 'win32') fs.chmodSync(inside, 0o755);
  write(path.join(root, 'node_modules', '.bin', process.platform === 'win32' ? 'tool-y.exe' : 'tool-y'), '');
  const outside = tmpDir(t, 'pk-find-link-');
  const had = process.cwd();
  const pathKey = Object.keys(process.env).find((k) => k.toLowerCase() === 'path') ?? 'PATH';
  const oldPath = process.env[pathKey];
  try {
    for (const entry of [root, path.join(root, 'node_modules', '.bin'), '.', '']) {
      process.chdir(root);
      process.env[pathKey] = entry;
      assert.equal(findProgram('tool-y', root), null, `PATH entry ${JSON.stringify(entry)}`);
    }
    // A link to a folder inside the project is inside too
    let linked = true;
    try { fs.symlinkSync(root, path.join(outside, 'link'), 'junction'); } catch { linked = false; }
    if (linked) {
      process.env[pathKey] = path.join(outside, 'link');
      assert.equal(findProgram('tool-y', root), null, 'through a link');
    }
  } finally {
    process.chdir(had);
    process.env[pathKey] = oldPath;
  }
});

// ============================================================================================
// A project in a temp folder for the commands (models.mjs, run-session.mjs, run-role.mjs) with a fake vault, a spy and a stand-in claude
// ============================================================================================

const UNSAFE = ['NODE_TLS_REJECT_UNAUTHORIZED', 'NODE_EXTRA_CA_CERTS', 'SSL_CERT_FILE', 'SSL_CERT_DIR', 'NODE_USE_ENV_PROXY'];
// NODE_USE_SYSTEM_CA is not on the list: the Claude desktop app sets it to 1 in every child, and it only trusts what the system already trusts
const UNSAFE_VALUE = { NODE_TLS_REJECT_UNAUTHORIZED: '0', NODE_USE_ENV_PROXY: '1' };
const SYSTEM_CA = ['NODE_USE_SYSTEM_CA'];

function cleanEnv() {
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (/^(ANTHROPIC|CLAUDE)|_API_KEY$|^KIT_/i.test(k) || UNSAFE.includes(k.toUpperCase()) || SYSTEM_CA.includes(k.toUpperCase())) delete env[k];
  return env;
}
const pathKeyOf = (env) => Object.keys(env).find((k) => k.toLowerCase() === 'path') ?? 'PATH';

function project(t, { models, settings = true } = {}) {
  const root = tmpDir(t, 'pk-proj-');
  const home = tmpDir(t, 'pk-home-');
  const vault = tmpDir(t, 'pk-vaultdir-');
  const bin = tmpDir(t, 'pk-bin-');
  const claude = makeFakeClaude(bin);
  fs.cpSync(HOOKS, path.join(root, '.claude', 'hooks'), { recursive: true });
  fs.cpSync(path.join(ROOT, '.claude', 'agents'), path.join(root, '.claude', 'agents'), { recursive: true });
  if (settings) fs.copyFileSync(path.join(ROOT, '.claude', 'settings.json'), path.join(root, '.claude', 'settings.json'));
  write(path.join(root, '.kit.json'), JSON.stringify({ type: 'web-saas', lang: 'en' }));
  write(path.join(root, 'AGENTS.md'), '# Fixture\n\n## Commands\n\n```bash\ntest:        npm test\n```\n');
  write(path.join(root, 'p.md'), 'do the task\n');
  if (models) write(path.join(root, '.claude', 'state', 'models.json'), JSON.stringify(models));
  const spy = path.join(home, 'spy.jsonl');
  const env = (extra = {}) => {
    const base = { ...cleanEnv(), HOME: home, USERPROFILE: home, CLAUDE_PROJECT_DIR: root, KIT_TEST_VAULT_DIR: vault, KIT_TEST_SPY: spy };
    base[pathKeyOf(base)] = [bin, path.dirname(process.execPath), process.env[pathKeyOf(process.env)] ?? ''].join(path.delimiter);
    return { ...base, ...extra };
  };
  const run = (script, args = [], { extra = {}, tty = false, input = '', mode } = {}) => {
    const file = path.join(root, '.claude', 'hooks', script);
    assert.equal(fs.existsSync(file), true, `.claude/hooks/${script} exists`);
    fs.rmSync(spy, { force: true });
    const r = spawnSync(process.execPath, ['--import', FAKE_VAULT_URL, file, ...args], {
      cwd: root, encoding: 'utf8', input, timeout: 60000,
      env: env({ ...(tty ? { KIT_TEST_FAKE_TTY: '1' } : {}), ...(mode ? { KIT_TEST_VAULT_MODE: mode } : {}), ...extra }),
    });
    const spied = fs.existsSync(spy) ? fs.readFileSync(spy, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
    return { status: r.status, stdout: r.stdout, stderr: r.stderr, out: r.stdout + r.stderr, spied, programs: spied.filter((s) => s.kind === 'program'), net: spied.filter((s) => s.kind === 'net') };
  };
  return { root, home, vault, bin, claude, spy, env, run, store: storeOf(home) };
}
// The key goes in through the same code the command uses, in this process, into this project's vault
async function seed(t, p, { name = 'acme', url = URL, key = KEY } = {}) {
  const { setProvider } = await load('providers.mjs');
  keystore.setVaultBackend(fileBackend(p.vault));
  t.after(() => keystore.setVaultBackend(fileBackend(DEFAULT_VAULT)));
  assert.equal(setProvider(name, url, key, p.store), null);
}
const noCrash = (r) => assert.doesNotMatch(r.out, /TypeError|ReferenceError|SyntaxError|ERR_MODULE_NOT_FOUND|at file:/);

// ============================================================================================
// models.mjs --set-key (AC-64.6, 64.16, 64.9)
// ============================================================================================

test('AC-64.6 ATTACK: --set-key refuses outside a real terminal, whatever is on stdin, and saves nothing', T, (t) => {
  const p = project(t);
  const r = p.run('models.mjs', ['--set-key', 'acme'], { input: `${URL}\n${KEY}\n` });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /terminal|tty/i);
  assert.doesNotMatch(r.stderr, /Usage/);
  noCrash(r);
  assert.equal(r.out.includes(KEY), false, 'the key is not echoed');
  assert.deepEqual(vaultFiles(p.vault), {}, 'nothing in the vault');
  assert.deepEqual(vaultCalls(p.vault), [], 'the vault was not even asked');
  assert.equal(fs.existsSync(p.store), false, 'no providers.json');
  assert.deepEqual(holders([p.home, p.root], KEY), []);
});

test('AC-64.6 ATTACK: --set-key refuses an extra argument (a key typed into the command) and never prints it', T, (t) => {
  const p = project(t);
  const typed = 'zk_' + 'TypedOnTheCommandLine'.repeat(2);
  // "openrouter" is an ordinary name now (the user's own choice), so the extra argument is the only thing wrong with these
  for (const args of [['--set-key', 'openrouter', typed], ['--set-key', 'openrouter', URL, typed], ['--set-key', typed], ['--set-key', 'openrouter', '--key', typed], ['--set-key', 'openrouter', `--key=${typed}`]]) {
    for (const tty of [false, true]) {
      const r = p.run('models.mjs', args, { tty, input: '' });
      assert.equal(r.status, 1, `${args.join(' ').replace(typed, '<key>')} tty=${tty}: a refusal, not a prompt that waits for input`);
      noCrash(r);
      assert.equal(r.out.includes(typed), false, 'the value is not printed');
      assert.equal(r.out.includes(typed.slice(0, 12)), false, 'nor a part of it');
      assert.deepEqual(vaultFiles(p.vault), {}, 'nothing in the vault');
      assert.equal(fs.existsSync(p.store), false, 'no providers.json');
    }
  }
});

test('AC-64.9 ATTACK: --set-key refuses a missing, malformed or reserved name and saves nothing', T, (t) => {
  const p = project(t);
  for (const name of [undefined, '', 'Acme', 'ACME', 'constructor', 'prototype', 'con', 'nul', 'com1', 'lpt1', '__proto__', '../x', 'a b', 'z'.repeat(33), '--all', '*']) {
    const args = name === undefined ? ['--set-key'] : ['--set-key', name];
    for (const tty of [false, true]) {
      const r = p.run('models.mjs', args, { tty });
      assert.notEqual(r.status, 0, `${String(name)} tty=${tty}`);
      assert.notEqual(r.status, null, `${String(name)} ends by itself`);
      noCrash(r);
    }
  }
  assert.deepEqual(vaultFiles(p.vault), {});
  assert.equal(fs.existsSync(p.store), false);
});

test('AC-64.16 unsafeEnv names the variables that would send the key to a forged certificate or a proxy, and only those', T, async (t) => {
  const { unsafeEnv } = await load('providers.mjs');
  assert.deepEqual(unsafeEnv({}), []);
  for (const name of UNSAFE) assert.deepEqual(unsafeEnv({ [name]: UNSAFE_VALUE[name] ?? '/x/evil.pem' }), [name], name);
  assert.deepEqual([...unsafeEnv(Object.fromEntries(UNSAFE.map((n) => [n, UNSAFE_VALUE[n] ?? '/x/evil.pem'])))].sort(), [...UNSAFE].sort(), 'all of them');
  // Not looked for: NODE_OPTIONS (a preload runs before any check), and a proxy variable alone (fetch ignores it without NODE_USE_ENV_PROXY)
  assert.deepEqual(unsafeEnv({ NODE_OPTIONS: '--no-warnings', HTTPS_PROXY: 'http://proxy.example:1', HTTP_PROXY: 'http://proxy.example:1', PATH: '/bin', HOME: '/h', NODE_ENV: 'test' }), []);
  if (process.platform === 'win32') assert.deepEqual(unsafeEnv({ node_extra_ca_certs: 'x.pem' }).map((n) => n.toUpperCase()), ['NODE_EXTRA_CA_CERTS'], 'Windows ignores the case of a name');
  // NODE_USE_SYSTEM_CA is the Claude desktop app's own setting in every child; it trusts only what the system already trusts
  assert.deepEqual(unsafeEnv({ NODE_USE_SYSTEM_CA: '1' }), []);
  assert.deepEqual(unsafeEnv({ NODE_USE_SYSTEM_CA: '1', SSL_CERT_DIR: '/x/certs' }), ['SSL_CERT_DIR'], 'it does not hide a real one');
  // With no argument it reads this process: the variables of this machine are put aside first, so the result is the same everywhere
  const aside = Object.fromEntries(Object.entries(process.env).filter(([k]) => UNSAFE.includes(k.toUpperCase()) || SYSTEM_CA.includes(k.toUpperCase())));
  for (const k of Object.keys(aside)) delete process.env[k];
  t.after(() => { for (const k of [...UNSAFE, ...SYSTEM_CA]) delete process.env[k]; Object.assign(process.env, aside); });
  assert.deepEqual(unsafeEnv(), [], 'a clean process');
  process.env.NODE_USE_SYSTEM_CA = '1';
  assert.deepEqual(unsafeEnv(), [], 'this process with the desktop setting');
  process.env.SSL_CERT_DIR = '/x/certs';
  assert.deepEqual(unsafeEnv(), ['SSL_CERT_DIR']);
});

test('AC-64.16 ATTACK: --set-key does not start with any of those variables set, and saves nothing', T, (t) => {
  const p = project(t);
  for (const name of UNSAFE) {
    for (const tty of [false, true]) {
      const r = p.run('models.mjs', ['--set-key', 'openrouter'], { tty, input: `${URL}\n${KEY}\n`, extra: { [name]: UNSAFE_VALUE[name] ?? path.join(p.home, 'evil.pem') } });
      assert.equal(r.status, 1, `${name} tty=${tty}: a refusal, not a prompt that waits for input`);
      noCrash(r);
      assert.equal(r.out.includes(KEY), false);
      if (tty) assert.match(r.out, new RegExp(name), `${name} is named when the terminal check is passed`);
    }
  }
  assert.deepEqual(vaultFiles(p.vault), {});
  assert.equal(fs.existsSync(p.store), false);
});

test('AC-64.16 an ordinary proxy variable alone does not stop --set-key from reaching its terminal check', T, (t) => {
  const p = project(t);
  const r = p.run('models.mjs', ['--set-key', 'acme'], { extra: { HTTPS_PROXY: 'http://proxy.example:1', NODE_OPTIONS: '--no-warnings' } });
  assert.equal(r.status, 1);
  assert.match(r.stderr, /terminal|tty/i, 'it is the terminal check that stops it, not the proxy variable');
  assert.doesNotMatch(r.stderr, /HTTPS_PROXY|NODE_OPTIONS/);
});

test('AC-64.10 --remove-key works without a terminal: it takes that provider only, and a missing or made-up name is no crash', T, async (t) => {
  const p = project(t);
  await seed(t, p, { name: 'acme' });
  await seed(t, p, { name: 'beta', url: 'https://beta.example/api', key: KEY_2 });
  const r = p.run('models.mjs', ['--remove-key', 'acme']);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(Object.keys(vaultFiles(p.vault)), ['beta']);
  assert.equal(r.out.includes(KEY), false);
  assert.equal(p.run('models.mjs', ['--remove-key', 'acme']).status, 0, 'twice');
  assert.equal(p.run('models.mjs', ['--remove-key', 'gamma']).status, 0, 'never set');
  const before = JSON.stringify(vaultFiles(p.vault));
  for (const name of [undefined, 'constructor', '__proto__', 'Acme', '*', '--all', '../x']) {
    const bad = p.run('models.mjs', name === undefined ? ['--remove-key'] : ['--remove-key', name]);
    assert.notEqual(bad.status, null, `${String(name)} ends by itself`);
    noCrash(bad);
    assert.equal(JSON.stringify(vaultFiles(p.vault)), before, `${String(name)}: nothing removed`);
  }
});

// ============================================================================================
// run-session.mjs (AC-64.26): the pieces, and the refusals
// ============================================================================================

test('AC-64.26 sessionArgs opens an interactive session on the chosen model with MCP closed and no bypass', T, async () => {
  const { sessionArgs } = await load('run-session.mjs');
  const args = sessionArgs({ model: MODEL });
  assert.equal(Array.isArray(args), true);
  assert.deepEqual(args.filter((a) => typeof a !== 'string'), [], 'strings only');
  assert.equal(args[args.indexOf('--model') + 1], MODEL, 'the bare model id');
  assert.equal(args.includes('--strict-mcp-config'), true);
  assert.deepEqual(JSON.parse(args[args.indexOf('--mcp-config') + 1]), { mcpServers: {} });
  assert.equal(args.includes('-p'), false, 'not a one-shot print run: it is a session at a terminal');
  assert.equal(args.includes('--print'), false);
  assert.doesNotMatch(args.join('\n'), /dangerously|bypassPermissions|--max-budget-usd/i);
  for (const model of ['--dangerously-skip-permissions', '-x']) {
    const odd = sessionArgs({ model });
    const end = odd.indexOf('--');
    assert.equal((end === -1 ? odd : odd.slice(0, end)).filter((a) => a === model).length <= 1, true);
  }
});

test('AC-64.26 sessionEnv points the session at the local proxy with a run token, holds no key and marks the session as an outside model', T, async () => {
  const { sessionEnv } = await load('run-session.mjs');
  const secretValue = 'ghs_' + 'k'.repeat(36);
  const base = { PATH: 'keep-me', HOME: '/h', GITHUB_TOKEN: secretValue, AWS_SECRET_ACCESS_KEY: 'x', MY_API_KEY: 'x', ANTHROPIC_BASE_URL: 'http://evil.example', ANTHROPIC_API_KEY: 'x', KIT_EXTERNAL_SESSION: 'other/preset', NODE_OPTIONS: '--no-warnings', HTTPS_PROXY: 'http://evil.example:1' };
  const env = sessionEnv(base, { port: 43210, token: 'run-token-value-123456', provider: 'acme', model: MODEL, effort: 'high', root: 'project-root' });
  assert.equal(env.ANTHROPIC_BASE_URL, 'http://127.0.0.1:43210');
  assert.equal(env.ANTHROPIC_AUTH_TOKEN, 'run-token-value-123456');
  assert.equal(env.ANTHROPIC_API_KEY, '');
  for (const slot of ['ANTHROPIC_MODEL', 'ANTHROPIC_DEFAULT_OPUS_MODEL', 'ANTHROPIC_DEFAULT_SONNET_MODEL', 'ANTHROPIC_DEFAULT_HAIKU_MODEL', 'CLAUDE_CODE_SUBAGENT_MODEL']) assert.equal(env[slot], MODEL, slot);
  assert.equal(env.CLAUDE_CODE_EFFORT_LEVEL, 'high');
  assert.equal(env.CLAUDE_PROJECT_DIR, 'project-root');
  assert.equal(env.PATH, 'keep-me');
  assert.match(env.KIT_EXTERNAL_SESSION, new RegExp(`^acme/${MODEL.replace('/', '\\/')}`), 'the provider and the model; the value of the parent is not kept');
  const text = JSON.stringify(env);
  for (const gone of [secretValue, 'evil.example', 'no-warnings', 'other/preset']) assert.equal(text.includes(gone), false, gone);
  for (const name of ['GITHUB_TOKEN', 'AWS_SECRET_ACCESS_KEY', 'MY_API_KEY', 'NODE_OPTIONS', 'HTTPS_PROXY']) assert.equal(name in env, false, name);
});

test('AC-64.26 ATTACK: run-session.mjs refuses outside a real terminal, starts no program, reads no key and sends nothing', T, async (t) => {
  const p = project(t, { models: { tasks: { main: `acme/${MODEL}:high` } } });
  await seed(t, p);
  const r = p.run('run-session.mjs', [], { input: '' });
  assert.notEqual(r.status, 0);
  assert.notEqual(r.status, null);
  assert.match(r.out, /terminal|tty/i);
  noCrash(r);
  assert.deepEqual(r.spied, [], 'no claude, no network');
  assert.equal(r.out.includes(KEY), false);
  assert.deepEqual(vaultCalls(p.vault).filter((l) => l.startsWith('read')), [], 'the vault was not read before the terminal check');
});

test('AC-64.26 ATTACK: run-session.mjs explains and stops when the main job is not an outside model, and when the provider has no key', T, async (t) => {
  for (const models of [null, { tasks: { main: 'opus:high' } }, { plan: 'sonnet:low' }]) {
    const p = project(t, { models });
    await seed(t, p);
    const r = p.run('run-session.mjs', [], { tty: true });
    assert.notEqual(r.status, 0, JSON.stringify(models));
    assert.notEqual(r.status, null);
    assert.match(r.out, /main/i);
    assert.match(r.out, /external|outside|--set main/i, 'it says how to choose one');
    noCrash(r);
    assert.deepEqual(r.spied, []);
  }
  const nokey = project(t, { models: { tasks: { main: `acme/${MODEL}:high` } } });
  const r = nokey.run('run-session.mjs', [], { tty: true });
  assert.notEqual(r.status, 0);
  assert.match(r.out, /key/i);
  assert.match(r.out, /--set-key acme/, 'it names the command that adds the key');
  noCrash(r);
  assert.deepEqual(r.spied, []);
});

test('AC-64.26 ATTACK: run-session.mjs does not start with a certificate or proxy variable that would carry the key off, and says which one', T, async (t) => {
  const p = project(t, { models: { tasks: { main: `acme/${MODEL}:high` } } });
  await seed(t, p);
  for (const name of UNSAFE) {
    const r = p.run('run-session.mjs', [], { tty: true, extra: { [name]: UNSAFE_VALUE[name] ?? path.join(p.home, 'evil.pem') } });
    assert.notEqual(r.status, 0, name);
    assert.match(r.out, new RegExp(name), `${name} is named`);
    assert.deepEqual(r.spied, [], `${name}: no claude, no network`);
    assert.equal(r.out.includes(KEY), false);
  }
});

test('AC-64.15 an old vault entry that is not sealed is not used: run-session.mjs says to enter the key again', T, async (t) => {
  const p = project(t, { models: { tasks: { main: `acme/${MODEL}:high` } } });
  write(p.store, JSON.stringify({ keyMeta: { acme: { addedAt: '2026-10-01T00:00:00.000Z', host: HOST } } }));
  write(path.join(p.vault, `${encodeURIComponent('acme')}.vault`), KEY);
  const r = p.run('run-session.mjs', [], { tty: true });
  assert.notEqual(r.status, 0);
  assert.match(r.out, /enter[^\n]{0,40}key[^\n]{0,20}again|again[^\n]{0,40}key|--set-key acme/i);
  assert.equal(r.out.includes(KEY), false);
  assert.deepEqual(r.spied, [], 'nothing was sent and no program started');
});

// ============================================================================================
// external-session-guard.mjs (AC-64.27)
// ============================================================================================

// The call of an Agent tool, in both shapes a guard might receive: the tool input itself, or the whole hook input around it
const agentCall = (toolInput) => ({ tool_name: 'Agent', ...toolInput, tool_input: toolInput });
function agentsRoot(t, files = {}) {
  const root = tmpDir(t, 'pk-agents-');
  for (const [name, model] of Object.entries(files)) write(path.join(root, '.claude', 'agents', `${name}.md`), `---\nname: ${name}\ndescription: test agent\n${model === undefined ? '' : `model: ${model}\n`}---\nYou are ${name}.\n`);
  return root;
}
const SESSION = `acme/${MODEL}:high`;
const guardModule = () => load('external-session-guard.mjs');

test('AC-64.27 decideAgent lets everything through when the session is not an outside model', T, async (t) => {
  const { decideAgent } = await guardModule();
  const root = agentsRoot(t, { 'code-reviewer': 'sonnet' });
  for (const env of [{}, { KIT_EXTERNAL_SESSION: '' }, { OTHER: 'x' }]) {
    for (const input of [agentCall({ subagent_type: 'general-purpose', model: 'opus' }), agentCall({ subagent_type: 'code-reviewer' }), agentCall({ subagent_type: 'x', model: 'claude-opus-4-5' })])
      assert.equal(decideAgent({ env, input, root }), null, JSON.stringify(env));
  }
});

test('AC-64.27 ATTACK: in an outside-model session an Agent call that names a Claude model is denied, in any case and spelling', T, async (t) => {
  const { decideAgent } = await guardModule();
  const root = agentsRoot(t);
  for (const model of ['opus', 'sonnet', 'haiku', 'fable', 'OPUS', 'Sonnet', ' opus', 'claude-opus-4-5', 'claude-sonnet-4-5-20250929', 'claude-haiku-4-5', 'Claude-Opus-4', 'CLAUDE-SONNET-4', 'claude-3-5-sonnet-20241022']) {
    const r = decideAgent({ env: { KIT_EXTERNAL_SESSION: SESSION }, input: agentCall({ subagent_type: 'general-purpose', model }), root });
    assert.equal(r?.decision, 'deny', JSON.stringify(model));
    assert.equal(typeof r.reason, 'string');
    assert.match(r.reason, /\S/);
    assert.deepEqual(Object.keys(r).sort(), ['decision', 'reason']);
  }
});

test('AC-64.27 in an outside-model session inherit and a model that is not Claude pass', T, async (t) => {
  const { decideAgent } = await guardModule();
  const root = agentsRoot(t);
  const env = { KIT_EXTERNAL_SESSION: SESSION };
  for (const model of ['inherit', 'INHERIT', MODEL, 'acme/other-model', 'gpt-5', 'claudette-x', 'my-claude']) assert.equal(decideAgent({ env, input: agentCall({ subagent_type: 'general-purpose', model }), root }), null, model);
});

test('AC-64.27 with no model on the call the guard reads the model: line of the agent file', T, async (t) => {
  const { decideAgent } = await guardModule();
  const root = agentsRoot(t, { 'uses-sonnet': 'sonnet', 'uses-opus': 'opus', 'uses-claude-id': 'claude-haiku-4-5', 'inherits': 'inherit', 'no-model-line': undefined, 'uses-other': MODEL });
  const env = { KIT_EXTERNAL_SESSION: SESSION };
  const ask = (type, extra = {}) => decideAgent({ env, input: agentCall({ subagent_type: type, ...extra }), root });
  for (const type of ['uses-sonnet', 'uses-opus', 'uses-claude-id']) assert.equal(ask(type)?.decision, 'deny', type);
  for (const type of ['inherits', 'no-model-line', 'uses-other']) assert.equal(ask(type), null, type);
  assert.equal(ask('uses-sonnet', { model: 'inherit' }), null, 'the model on the call wins over the file');
  assert.equal(ask('inherits', { model: 'opus' })?.decision, 'deny', 'and a Claude model on the call is denied whatever the file says');
});

test('AC-64.27 ATTACK: the agent name cannot lead the guard out of .claude/agents, and odd input never makes it throw', T, async (t) => {
  const { decideAgent } = await guardModule();
  const root = agentsRoot(t, { real: 'inherit' });
  write(path.join(root, 'outside.md'), '---\nname: outside\nmodel: sonnet\n---\n');
  const env = { KIT_EXTERNAL_SESSION: SESSION };
  for (const type of ['../../outside', '..\\..\\outside', '../agents/real', 'a/b', 'a\\b', '/etc/passwd', 'C:\\x', 'a\0b', '', ' ', 'z'.repeat(5000), '.', '..', 'CON', undefined, null, 5, {}, ['real']]) {
    let r;
    assert.doesNotThrow(() => { r = decideAgent({ env, input: agentCall({ subagent_type: type }), root }); }, JSON.stringify(type));
    assert.equal(r === null || r.decision === 'deny', true, JSON.stringify(type));
  }
  for (const input of [null, undefined, 'text', 5, [], {}, { model: 5 }, { model: ['opus'] }, { model: {} }, agentCall({ model: null })])
    assert.doesNotThrow(() => decideAgent({ env, input, root }), JSON.stringify(input));
  for (const env2 of [null, undefined, 'x', 5]) assert.doesNotThrow(() => decideAgent({ env: env2, input: agentCall({ model: 'opus' }), root }));
});

test('AC-64.27 the guard is a PreToolUse hook on Agent and Task in settings.json, and as a program it denies a Claude model only inside an outside-model session', T, (t) => {
  const settings = JSON.parse(read('.claude/settings.json'));
  const entry = (settings.hooks?.PreToolUse ?? []).find((h) => JSON.stringify(h.hooks ?? []).includes('external-session-guard.mjs'));
  assert.notEqual(entry, undefined, 'no PreToolUse entry runs external-session-guard.mjs');
  assert.deepEqual(entry.matcher.split('|').sort(), ['Agent', 'Task']);
  const root = agentsRoot(t, { reviewer: 'sonnet' });
  const script = path.join(HOOKS, 'external-session-guard.mjs');
  assert.equal(fs.existsSync(script), true, 'external-session-guard.mjs exists');
  const run = (env, tool_input) => spawnSync(process.execPath, [script], { input: JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Agent', tool_input }), encoding: 'utf8', timeout: 20000, env: { ...cleanEnv(), CLAUDE_PROJECT_DIR: root, ...env } });
  const denied = run({ KIT_EXTERNAL_SESSION: SESSION }, { subagent_type: 'general-purpose', model: 'opus', prompt: 'x' });
  assert.equal(denied.status, 0, denied.stderr);
  assert.equal(JSON.parse(denied.stdout).hookSpecificOutput.permissionDecision, 'deny');
  const byFile = run({ KIT_EXTERNAL_SESSION: SESSION }, { subagent_type: 'reviewer', prompt: 'x' });
  assert.equal(JSON.parse(byFile.stdout).hookSpecificOutput.permissionDecision, 'deny');
  const plain = run({}, { subagent_type: 'general-purpose', model: 'opus', prompt: 'x' });
  assert.equal(plain.status, 0);
  assert.equal(plain.stdout.trim(), '', 'outside such a session it says nothing');
  const unreadable = spawnSync(process.execPath, [script], { input: 'not json', encoding: 'utf8', timeout: 20000, env: { ...cleanEnv(), CLAUDE_PROJECT_DIR: root, KIT_EXTERNAL_SESSION: SESSION } });
  assert.equal(unreadable.status, 0, 'unreadable input does not crash the hook');
});

// ============================================================================================
// Guards (AC-64.19, 64.20, 64.21, 64.21b, 64.21c)
// ============================================================================================

const CTXS = [{}, { tool: 'claude', agent: '' }, { tool: 'claude', agent: 'test-writer' }];
const covers = (rule, cmd) => {
  const m = rule.match(/^Bash\((.*)\)$/);
  if (!m) return rule === 'Bash';
  const src = m[1].replace(/:\*$/, '*').replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
  return new RegExp(`^${src}$`).test(cmd);
};

test('AC-64.19 the guard asks for a --set whose value holds a "/", for any provider name, any job and main', T, async () => {
  const { evaluate } = await load('destructive-guard.mjs');
  const asked = [
    'node .claude/hooks/models.mjs --set code=acme/vendor/model-1:high', 'node .claude/hooks/models.mjs --set main=acme/m:high', 'node .claude/hooks/models.mjs --set plan.task=zed/m:low',
    'node .claude/hooks/models.mjs --set review.code=my-llm/vendor/m:medium', 'node .claude/hooks/models.mjs --set board.qa=acme/m:high', 'node .claude/hooks/models.mjs --set findings.tech=acme/m:high',
    'node .claude/hooks/models.mjs --set docs=acme/m:high', 'node .claude/hooks/models.mjs --set code=sonnet:high main=acme/m:high', 'node .claude/hooks/models.mjs --set code.ui=a/b/c/d:xhigh',
  ];
  const free = ['node .claude/hooks/models.mjs --set code=sonnet:high', 'node .claude/hooks/models.mjs --set main=opus:high', 'node .claude/hooks/models.mjs --for main', 'node .claude/hooks/models.mjs --show', 'node .claude/hooks/models.mjs --reset main', 'git commit -m "docs: --set main=acme/m:high"'];
  for (const ctx of CTXS) {
    assert.deepEqual(asked.filter((c) => evaluate(c, ctx)?.decision !== 'ask'), [], `asked (${JSON.stringify(ctx)})`);
    assert.deepEqual(free.filter((c) => evaluate(c, ctx) !== null), [], `free (${JSON.stringify(ctx)})`);
  }
});

test('AC-64.19 the allow list in settings.json cannot let an outside --set through unseen: the guard asks even where a rule allows the prefix', T, async () => {
  const { evaluate } = await load('destructive-guard.mjs');
  const { allow } = JSON.parse(read('.claude/settings.json')).permissions;
  const cmd = 'node .claude/hooks/models.mjs --set main=acme/m:high';
  assert.equal(allow.some((r) => covers(r, cmd)), true, 'control: the prefix rule for --set is there, so only the guard stops this');
  for (const ctx of CTXS) assert.equal(evaluate(cmd, ctx)?.decision, 'ask', JSON.stringify(ctx));
});

test('AC-64.20 --set-key, --remove-key and --set-limit are asked as AI commands: by the guard and by the ask list in settings.json', T, async () => {
  const { evaluate } = await load('destructive-guard.mjs');
  const cmds = ['node .claude/hooks/models.mjs --set-key acme', 'node .claude/hooks/models.mjs --remove-key acme', 'node .claude/hooks/models.mjs --set-limit acme 5'];
  const { ask, allow } = JSON.parse(read('.claude/settings.json')).permissions;
  for (const cmd of cmds) {
    for (const ctx of CTXS) assert.equal(evaluate(cmd, ctx)?.decision, 'ask', `${cmd} ${JSON.stringify(ctx)}`);
    assert.equal(ask.some((r) => covers(r, cmd)), true, `settings.json ask list: ${cmd}`);
    assert.equal(allow.some((r) => covers(r, cmd) && !ask.some((a) => covers(a, cmd))), false, `no allow rule is the only one for ${cmd}`);
  }
  const tricks = ['node .claude/hooks/models.mjs "--set-key" acme', 'node .claude/hooks/models.mjs --set"-key" acme', 'node .claude/hooks/models.mjs --remove-k\\ey acme', 'cd .claude/hooks && node models.mjs --set-limit acme 5', 'node ".claude/hooks/models.mjs" --set-key acme', 'git status && node .claude/hooks/models.mjs --set-key acme'];
  assert.deepEqual(tricks.filter((c) => !['ask', 'deny'].includes(evaluate(c)?.decision)), []);
  assert.equal(evaluate('git commit -m "docs: run models.mjs --set-key acme in your own terminal"'), null, 'a commit message only names it');
});

test('AC-64.21b ATTACK: every export of keystore.mjs and providers.mjs that reads a key is named in the guard pattern, so a new one cannot slip past', T, async () => {
  const { evaluate } = await load('destructive-guard.mjs');
  const ks = await load('keystore.mjs');
  const providers = await load('providers.mjs');
  // Exports that cannot give a key back. Everything else must be asked about, so a new reader fails here until the guard names it.
  const harmless = {
    'keystore.mjs': ['systemExe', 'setVaultBackend', 'vaultKind', 'vaultSave', 'vaultDelete'],
    'providers.mjs': ['MODEL_ID', 'EFFORTS', 'storePath', 'readStore', 'isProvider', 'parseProviderUrl', 'keyOk', 'setProvider', 'removeKey', 'hasKey', 'keyInfo', 'providerNames', 'purgePlainKeys', 'unsafeEnv',
      'setLimit', 'today', 'spentOn', 'addSpend', 'addModelSpend', 'validPrice', 'addCatalog', 'removeCatalog', 'spendAllowed', 'parseExternal'],
  };
  for (const required of ['vaultRead']) assert.equal(typeof ks[required], 'function', `keystore.mjs exports ${required}`);
  assert.equal(typeof providers.readProvider, 'function', 'providers.mjs exports readProvider');
  const missed = [];
  for (const [file, mod] of [['keystore.mjs', ks], ['providers.mjs', providers]]) {
    for (const name of Object.keys(mod)) {
      if (harmless[file].includes(name)) continue;
      for (const command of [`node tools/x.mjs ${name}`, `node -e "import('./.claude/hooks/${file}').then((m) => console.log(m.${name}('acme')))"`])
        if (evaluate(command)?.decision !== 'ask') missed.push(`${file} ${name}: ${command.slice(0, 30)}`);
    }
  }
  assert.deepEqual(missed, []);
  assert.equal(evaluate('node tools/x.mjs vaultRead')?.decision, 'ask');
  assert.equal(evaluate('node tools/x.mjs readProvider')?.decision, 'ask');
  assert.equal(evaluate('git commit -m "fix: readProvider is never called by --show"'), null, 'a commit message only names it');
});

test('AC-64.21c ATTACK: the guard asks for any *_API_KEY, *_SECRET or *_TOKEN variable, printenv, a bare env and a listing of Env:', T, async () => {
  const { evaluate } = await load('destructive-guard.mjs');
  const asked = [
    'echo $MY_API_KEY', 'echo ${ACME_API_KEY}', 'echo "$STRIPE_SECRET"', 'echo $GITHUB_TOKEN', 'echo $NPM_TOKEN', 'printenv ACME_API_KEY', 'env | grep API_KEY', 'echo %ACME_TOKEN%',
    'powershell -c "$env:MY_SECRET"', 'node -e "console.log(process.env.SOME_API_KEY)"', 'python3 -c "import os; print(os.environ[\'X_TOKEN\'])"', 'echo $API_KEY', 'echo $TOKEN', 'echo $SECRET',
    'printenv', 'printenv | sort', 'env', 'env | sort', 'env > out.txt', 'git status && env', 'cd /tmp; env',
    'Get-ChildItem Env:', 'Get-ChildItem env:ACME_API_KEY', 'gci Env:', 'ls Env:', 'dir env:', 'Get-ChildItem -Path Env:',
  ];
  const tricks = ['echo $ACME_API""_KEY', 'echo $ACME_TO\\KEN', 'bash -c "printenv"', 'env | cat'];
  const free = [
    'git status', 'node --version', 'echo hello', 'env FOO=1 npm test', 'env NODE_ENV=test node x.js', 'echo $TOKENIZERS_PARALLELISM', 'echo $PATH', 'cat README.md',
    'git commit -m "docs: mention ACME_API_KEY and printenv"', 'git commit -m "fix: the env command is not run by the hook"', 'node -e "console.log(process.env.NODE_ENV)"', 'npm run environment-check',
  ];
  for (const ctx of CTXS) {
    assert.deepEqual(asked.filter((c) => evaluate(c, ctx)?.decision !== 'ask'), [], `asked (${JSON.stringify(ctx)})`);
    assert.deepEqual(tricks.filter((c) => !['ask', 'deny'].includes(evaluate(c, ctx)?.decision)), [], `tricky spellings (${JSON.stringify(ctx)})`);
    assert.deepEqual(free.filter((c) => evaluate(c, ctx) !== null), [], `free (${JSON.stringify(ctx)})`);
  }
});

// doc-guard: the .vibe-kit folder by its real path
const DOC_GUARD = path.join(HOOKS, 'doc-guard.mjs');
function docGuard(root, tool_name, tool_input) {
  const r = spawnSync(process.execPath, [DOC_GUARD], { input: JSON.stringify({ hook_event_name: 'PreToolUse', tool_name, tool_input }), encoding: 'utf8', timeout: 20000, env: { ...cleanEnv(), CLAUDE_PROJECT_DIR: root } });
  assert.equal(r.status, 0, r.stderr);
  return r.stdout.trim() === '' ? 'pass' : JSON.parse(r.stdout).hookSpecificOutput.permissionDecision;
}
// The 8.3 short name of a folder on a Windows volume that keeps them, else null
function shortName(dir) {
  if (process.platform !== 'win32') return null;
  const r = spawnSync('cmd.exe', ['/d', '/s', '/c', `"for %I in ("${dir}") do @echo %~sI"`], { encoding: 'utf8', timeout: 20000, windowsVerbatimArguments: true });
  const short = r.stdout.trim();
  return r.status === 0 && short && short.toLowerCase() !== dir.toLowerCase() && !short.includes('"') ? short : null;
}

test('AC-64.21 doc-guard denies Read, Grep and Glob inside a .vibe-kit folder, and lets the preferences and the approval folder through', T, (t) => {
  const root = tmpDir(t, 'pk-doc-root-');
  const area = tmpDir(t, 'pk-doc-home-');
  const kit = path.join(area, '.vibe-kit');
  for (const f of ['providers.json', 'keys/acme.dpapi', 'models-default.json', 'preferences.md', 'gate-approval/abc.json', 'notes.txt']) write(path.join(kit, f), 'x');
  write(path.join(area, '.vibe-kit-extra', 'x.md'), 'x');
  write(path.join(area, '.vibe-kit2', 'x.md'), 'x');
  for (const f of ['providers.json', 'keys/acme.dpapi', 'models-default.json', 'notes.txt']) {
    assert.equal(docGuard(root, 'Read', { file_path: path.join(kit, f) }), 'deny', `Read ${f}`);
  }
  assert.equal(docGuard(root, 'Grep', { pattern: 'zk_', path: kit }), 'deny', 'Grep in the folder');
  assert.equal(docGuard(root, 'Grep', { pattern: 'zk_', path: path.join(kit, 'providers.json') }), 'deny', 'Grep in the file');
  assert.equal(docGuard(root, 'Glob', { pattern: '*', path: kit }), 'deny', 'Glob in the folder');
  assert.equal(docGuard(root, 'Glob', { pattern: path.join(kit, '**', '*') }), 'deny', 'Glob by pattern');
  assert.equal(docGuard(root, 'Read', { file_path: path.join(area, 'x', '..', '.vibe-kit', 'providers.json') }), 'deny', 'a path with ".."');
  // The exception is the one the shell guard has
  assert.equal(docGuard(root, 'Read', { file_path: path.join(kit, 'preferences.md') }), 'pass', 'preferences');
  assert.equal(docGuard(root, 'Read', { file_path: path.join(kit, 'gate-approval', 'abc.json') }), 'pass', 'gate approval');
  // Names that only start like it
  assert.equal(docGuard(root, 'Read', { file_path: path.join(area, '.vibe-kit-extra', 'x.md') }), 'pass');
  assert.equal(docGuard(root, 'Read', { file_path: path.join(area, '.vibe-kit2', 'x.md') }), 'pass');
});

test('AC-64.21 ATTACK: a link with another name, or an 8.3 short name, still lands in .vibe-kit and is denied; a project file named providers.json is not', T, (t) => {
  const root = tmpDir(t, 'pk-doc-root-');
  const area = tmpDir(t, 'pk-doc-home-');
  const kit = path.join(area, '.vibe-kit');
  write(path.join(kit, 'providers.json'), 'x');
  write(path.join(kit, 'keys', 'acme.dpapi'), 'x');
  const innocent = path.join(root, 'docs-link');
  let linked = true;
  try { fs.symlinkSync(kit, innocent, 'junction'); } catch { linked = false; }
  if (linked) {
    assert.equal(docGuard(root, 'Read', { file_path: path.join(innocent, 'providers.json') }), 'deny', 'Read through a link');
    assert.equal(docGuard(root, 'Grep', { pattern: 'x', path: innocent }), 'deny', 'Grep through a link');
    assert.equal(docGuard(root, 'Glob', { pattern: '*', path: path.join(innocent, 'keys') }), 'deny', 'Glob through a link');
  }
  const short = shortName(kit);
  if (short) {
    assert.equal(docGuard(root, 'Read', { file_path: path.join(short, 'providers.json') }), 'deny', `Read by the short name ${short}`);
    assert.equal(docGuard(root, 'Grep', { pattern: 'x', path: short }), 'deny', 'Grep by the short name');
  }
  // Nothing is blocked by the file name alone
  write(path.join(root, 'providers.json'), '{}');
  write(path.join(root, 'src', 'providers.json'), '{}');
  write(path.join(root, 'keys', 'acme.dpapi'), 'x');
  for (const f of ['providers.json', 'src/providers.json', 'keys/acme.dpapi']) assert.equal(docGuard(root, 'Read', { file_path: path.join(root, f) }), 'pass', f);
  assert.equal(docGuard(root, 'Grep', { pattern: 'providers', path: root }), 'pass');
  assert.equal(docGuard(root, 'Glob', { pattern: '**/providers.json' }), 'pass');
  assert.equal(docGuard(root, 'Read', { file_path: path.join(root, 'does-not-exist', 'providers.json') }), 'pass', 'a path that does not exist');
});
