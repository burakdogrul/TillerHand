// Run: node --test kit/tests/model-panel.test.mjs
// 3.63.0: the model panel (models-panel.mjs, keystore.mjs, providers.mjs, models.mjs applyChanges, panel-data.mjs, cost.mjs --all,
// usage.mjs --record, run-role token counts, the destructive guard, the command texts). The criteria are AC-63.1 .. AC-63.20;
// AC-63.10 (screens, themes, widths, keyboard) is checked by hand.
// Hard limits of this file: no real claude, no real network, no browser, no real key, no real home folder.
//   - createPanel() is used, never the CLI (the CLI opens a browser). fetchImpl is always a fake.
//   - run-role runs get a preload that replaces spawn('claude') and the provider network; cost.mjs gets a fake npx first on PATH.
// 3.64.0: no ready-made providers; a key and its address are sealed together in the vault (setProvider / readProvider). The vault is a fake backend
//   (setVaultBackend, or a folder through fake-vault.mjs), never the real one: the real DPAPI file sits in the real home folder, which a test cannot move.
// NOT covered here: the real Windows DPAPI, macOS Keychain and Linux secret-tool paths. They need a real machine of that kind.
// Modules load inside the tests, so a missing module or export turns that test red on its own, not the whole file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import cp, { spawnSync } from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { fileBackend, makeFakeClaude, FAKE_VAULT_URL } from './fake-vault.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const HOOKS = path.join(ROOT, '.claude', 'hooks');
const PANEL_DIR = path.join(HOOKS, 'panel');
const load = (name) => import(pathToFileURL(path.join(HOOKS, name)).href);
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const T = { timeout: 120000 };
const IS_WIN = process.platform === 'win32';

// Nothing in this file may touch the real home folder or a real vault
const TMP_HOME = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-top-home-')));
process.env.HOME = TMP_HOME;
process.env.USERPROFILE = TMP_HOME;
process.on('exit', () => { try { fs.rmSync(TMP_HOME, { recursive: true, force: true }); } catch { /* temp */ } });

// Split up so this file does not trip the secret scan
const OR_KEY = 'sk-' + 'or-v1-' + 'a1b2c3d4'.repeat(6); // last four: c3d4
const OR_KEY_2 = 'sk-' + 'or-v1-' + 'f0e1d2c3'.repeat(6);
const DS_KEY = 'sk-' + '0123456789abcdef'.repeat(2); // last four: cdef
const EXT = 'openrouter/x/y:high';
const OR_URL = 'https://openrouter.ai/api';
const DS_URL = 'https://api.deepseek.com/anthropic';

const tmpDir = (t, prefix) => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  t.after(() => { try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 }); } catch { /* temp */ } });
  return dir;
};
const write = (file, text) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); };
const walk = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)])) : []);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const close = (a, b, label) => assert.ok(Math.abs(a - b) < 1e-9, `${label ?? 'value'}: ${a} is not ${b}`);
async function until(fn, label, ms = 30000) {
  const end = Date.now() + ms;
  for (;;) {
    const v = await fn();
    if (v) return v;
    assert.ok(Date.now() < end, `timed out waiting for: ${label}`);
    await wait(50);
  }
}
// Files (under the given folders) that hold the secret in any plain encoding
const holders = (dirs, secret) => {
  const needles = [Buffer.from(secret), Buffer.from(secret, 'utf16le'), Buffer.from(Buffer.from(secret).toString('base64'))];
  return dirs.flatMap(walk).filter((f) => { const b = fs.readFileSync(f); return needles.some((n) => b.includes(n)); });
};

// Env for this test only, restored after it. undefined deletes the variable.
const envUndo = new WeakMap();
function withEnv(t, vars) {
  // One hook per test, undone newest first: a second withEnv on the same variable must not leave the first value behind
  let undo = envUndo.get(t);
  if (!undo) {
    undo = [];
    envUndo.set(t, undo);
    t.after(() => { for (const [k, v] of undo.reverse()) { if (v === undefined) delete process.env[k]; else process.env[k] = v; } });
  }
  for (const [k, v] of Object.entries(vars)) {
    undo.push([k, process.env[k]]);
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
}
const freshHome = (t) => {
  const home = tmpDir(t, 'mp-home-');
  // A provider key set on the machine running the tests must not show up as a key
  withEnv(t, { HOME: home, USERPROFILE: home, OPENROUTER_API_KEY: undefined, DEEPSEEK_API_KEY: undefined, MOONSHOT_API_KEY: undefined });
  return home;
};
// In this process the vault is a folder (never null: null would fall back to the real vault of this machine); children get one through the preload
const DEFAULT_VAULT = path.join(TMP_HOME, 'default-vault');
{
  const ks = await load('keystore.mjs');
  ks.setVaultBackend(fileBackend(DEFAULT_VAULT));
}
// The key and its address go in through the same code the command uses, into the vault folder of one project
async function sealKey(vaultDir, file, name = 'openrouter', url = OR_URL, key = OR_KEY) {
  const ks = await load('keystore.mjs');
  const { setProvider } = await load('providers.mjs');
  ks.setVaultBackend(fileBackend(vaultDir));
  try { return setProvider(name, url, key, file); } finally { ks.setVaultBackend(fileBackend(DEFAULT_VAULT)); }
}
const storeOf = (home) => path.join(home, '.vibe-kit', 'providers.json');

// A vault that lives in memory and counts every call
function fakeVault({ kind = 'keychain', failSave = false, failRead = false, failRemove = false } = {}) {
  const store = new Map();
  const calls = { save: 0, read: 0, remove: 0 };
  const backend = {
    kind,
    save: (provider, key) => { calls.save++; if (failSave) throw new Error('vault is locked'); store.set(provider, key); },
    read: (provider) => { calls.read++; if (failRead) throw new Error('vault is locked'); return store.get(provider) ?? null; },
    remove: (provider) => { calls.remove++; if (failRemove) throw new Error('vault is locked'); store.delete(provider); },
  };
  return { backend, store, calls };
}
async function installVault(t, opts) {
  const ks = await load('keystore.mjs');
  const v = fakeVault(opts);
  ks.setVaultBackend(v.backend);
  t.after(() => ks.setVaultBackend(fileBackend(DEFAULT_VAULT)));
  return v;
}

function cleanEnv() {
  const env = { ...process.env };
  // What a run refuses to start under, and what the desktop app sets in every child, are put aside: the result must not depend on this machine
  for (const k of Object.keys(env)) if (/^(ANTHROPIC|CLAUDE|KIT_)|_API_KEY$|^(NODE_TLS_REJECT_UNAUTHORIZED|NODE_EXTRA_CA_CERTS|NODE_USE_SYSTEM_CA|NODE_USE_ENV_PROXY|SSL_CERT_FILE|SSL_CERT_DIR)$/i.test(k) || /^FAKE_NPX_/.test(k)) delete env[k];
  return env;
}
const pathKey = (env) => Object.keys(env).find((k) => k.toLowerCase() === 'path') ?? 'PATH';
const prependPath = (env, dir) => { const k = pathKey(env); return { ...env, [k]: dir + path.delimiter + (env[k] ?? '') }; };

// fetchImpl fakes: every call is recorded; the default handler refuses, so a test that expects no network sees it
const offline = async () => { throw new Error('no network in this test'); };
function fetchFake(handler) {
  const calls = [];
  const impl = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method ?? 'GET', headers: Object.fromEntries(new Headers(init.headers ?? {})), init });
    return handler(String(url), init, calls.length);
  };
  return { impl, calls };
}

// ---- Dates and Claude usage samples (ccusage "daily" entries) ----

const pad = (n) => String(n).padStart(2, '0');
const dayStr = (offset = 0) => {
  const d = new Date();
  d.setHours(12, 0, 0, 0);
  d.setDate(d.getDate() + offset);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};
const OPUS = 'claude-opus-4-5-20251101', SONNET = 'claude-sonnet-4-5-20250929', HAIKU = 'claude-haiku-4-5-20251001';
const bd = (modelName, cost, inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens) => ({ modelName, inputTokens, outputTokens, cacheCreationTokens, cacheReadTokens, cost });
// The day totals of a real ccusage entry count every model, non-Claude ones too
const dayOf = (date, modelBreakdowns) => {
  const sum = (f) => modelBreakdowns.reduce((a, b) => a + b[f], 0);
  return {
    date, inputTokens: sum('inputTokens'), outputTokens: sum('outputTokens'), cacheCreationTokens: sum('cacheCreationTokens'), cacheReadTokens: sum('cacheReadTokens'),
    totalTokens: sum('inputTokens') + sum('outputTokens') + sum('cacheCreationTokens') + sum('cacheReadTokens'), totalCost: sum('cost'),
    modelsUsed: modelBreakdowns.map((b) => b.modelName), modelBreakdowns,
  };
};
// All values are powers of two or sums of them, so the float sums are exact
const SAMPLE = [
  dayOf('2026-10-12', [bd(HAIKU, 0.125, 10, 10, 0, 0), bd('<synthetic>', 0, 0, 0, 0, 0)]),
  dayOf('2026-11-04', [bd(OPUS, 1.5, 100, 50, 10, 40), bd(SONNET, 0.25, 10, 5, 0, 5), bd('gpt-5', 9, 1000, 1000, 0, 0)]),
  dayOf('2026-09-20', [bd(OPUS, 8, 80, 80, 0, 0)]),
  dayOf('2026-11-01', [bd(OPUS, 2, 200, 100, 0, 100)]),
  dayOf('2026-10-25', [bd(OPUS, 4, 400, 0, 0, 0)]),
  dayOf('2026-11-02', [bd(HAIKU, 0.5, 20, 10, 5, 5)]),
  dayOf('2026-10-26', [bd(SONNET, 1, 50, 25, 25, 0)]),
];
const R = {
  today: { from: '2026-11-04', to: '2026-11-04' },
  thisWeek: { from: '2026-11-02', to: '2026-11-08' },
  lastWeek: { from: '2026-10-26', to: '2026-11-01' },
  days30: { from: '2026-10-06', to: '2026-11-04' },
};

// ============================================================================================
// Key store: keystore.mjs and providers.mjs (AC-63.11 .. AC-63.14, AC-63.17)
// ============================================================================================

test('AC-63.11 vaultKind names the backend the system has, no variable switches the vault off, and a backend put in place is the one used', T, async (t) => {
  const ks = await load('keystore.mjs');
  t.after(() => ks.setVaultBackend(fileBackend(DEFAULT_VAULT)));
  ks.setVaultBackend(null); // the system's own choice: only its kind is read here, nothing is opened
  const real = ks.vaultKind();
  const allowed = { win32: ['dpapi'], darwin: ['keychain'], linux: ['secret-tool', null] }[process.platform] ?? [null];
  assert.ok(allowed.includes(real), `${process.platform}: ${real}`);
  withEnv(t, { VIBE_KIT_VAULT: 'none' });
  assert.equal(ks.vaultKind(), real, 'VIBE_KIT_VAULT is not read any more (3.64.0)');
  for (const kind of ['dpapi', 'keychain', 'secret-tool']) {
    ks.setVaultBackend({ kind, save() {}, read() { return null; }, remove() {} });
    assert.equal(ks.vaultKind(), kind);
  }
});

test('AC-63.11 vaultSave, vaultRead and vaultDelete go to the backend; a missing key reads as null; a vault that cannot open throws', T, async (t) => {
  const ks = await load('keystore.mjs');
  const v = await installVault(t);
  ks.vaultSave('openrouter', OR_KEY);
  assert.equal(v.store.get('openrouter'), OR_KEY);
  assert.equal(ks.vaultRead('openrouter'), OR_KEY);
  assert.equal(ks.vaultRead('deepseek'), null);
  ks.vaultDelete('openrouter');
  assert.equal(ks.vaultRead('openrouter'), null);
  const locked = fakeVault({ failSave: true, failRead: true });
  ks.setVaultBackend(locked.backend);
  assert.throws(() => ks.vaultSave('openrouter', OR_KEY));
  assert.throws(() => ks.vaultRead('openrouter'));
});

test('AC-63.11 setProvider seals the address and the key into the vault, readProvider reads them back, and the store keeps only metadata (each backend kind)', T, async (t) => {
  const { setProvider, readProvider, keyInfo, readStore } = await load('providers.mjs');
  for (const kind of ['dpapi', 'keychain', 'secret-tool']) {
    const v = await installVault(t, { kind });
    const file = path.join(tmpDir(t, 'mp-store-'), 'providers.json');
    assert.equal(setProvider('openrouter', OR_URL, OR_KEY, file), null, kind);
    const sealed = v.store.get('openrouter');
    assert.notEqual(sealed, OR_KEY, `${kind}: the vault holds the sealed package, not the bare key`);
    assert.equal(String(sealed).includes(OR_KEY), false, `${kind}: and the key is not readable in it`);
    assert.match(sealed, /^[\w-]+$/, `${kind}: only characters the macOS Keychain command line takes`);
    assert.deepEqual(readProvider('openrouter'), { url: OR_URL, key: OR_KEY }, `${kind}: read back`);
    assert.equal(fs.readFileSync(file, 'utf8').includes(OR_KEY), false, `${kind}: not in providers.json`);
    assert.equal(Object.hasOwn(readStore(file), 'keys'), false, `${kind}: no plain entry`);
    const info = keyInfo('openrouter', { file });
    assert.deepEqual(Object.keys(info).sort(), ['addedAt', 'host', 'present'], `${kind}: metadata only`);
    assert.equal(info.present, true);
    assert.equal(info.host, 'openrouter.ai');
    assert.equal(Number.isNaN(Date.parse(info.addedAt)), false, 'addedAt is a date');
    assert.ok(Math.abs(Date.now() - Date.parse(info.addedAt)) < 60000, 'addedAt is now');
  }
});

// The DPAPI file sits in the real home folder (os.userInfo().homedir, which a project cannot steer), so a real round trip cannot run under a temp home.
// Instead keystore.mjs runs in a child on a made-up Windows: every child process it starts and every file it writes is recorded, and none is really done.
test('AC-63.12 ATTACK: the key reaches the DPAPI child process through its stdin only: never argv, command or env, and no written file holds it', T, (t) => {
  const win = tmpDir(t, 'mp-argv-win-');
  const root = tmpDir(t, 'mp-argv-root-');
  write(path.join(win, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'), '');
  const sealed = Buffer.from(JSON.stringify({ url: OR_URL, key: OR_KEY })).toString('base64url');
  const probe = path.join(root, 'argv-probe.mjs');
  write(probe, [
    "import fs from 'node:fs';",
    "import cp from 'node:child_process';",
    "Object.defineProperty(process, 'platform', { value: 'win32' });",
    "delete process.env.SYSTEMROOT; process.env.SystemRoot = process.env.MP_SYSTEMROOT;",
    'const calls = [], writes = [];',
    "for (const name of ['mkdirSync', 'writeFileSync', 'renameSync', 'rmSync', 'appendFileSync', 'copyFileSync']) fs[name] = (...a) => { writes.push(a.map((x) => String(x))); };",
    "for (const name of ['execFileSync', 'execSync', 'spawnSync', 'spawn', 'execFile', 'exec']) cp[name] = (...a) => {",
    "  const opts = a.find((x) => x && typeof x === 'object' && !Array.isArray(x)) ?? {};",
    "  calls.push({ cmd: typeof a[0] === 'string' ? a[0] : '', argv: Array.isArray(a[1]) ? a[1] : [], env: opts.env ?? {}, input: opts.input ?? null });",
    "  return 'QUJD';",
    '};',
    'const ks = await import(process.env.MP_KEYSTORE);',
    'ks.vaultSave("openrouter", process.env.MP_PAYLOAD);',
    'console.log(JSON.stringify({ kind: ks.vaultKind(), calls, writes }));',
  ].join('\n'));
  const r = spawnSync(process.execPath, [probe], {
    cwd: root, encoding: 'utf8', timeout: 30000,
    env: { ...cleanEnv(), CLAUDE_PROJECT_DIR: root, MP_SYSTEMROOT: win, MP_KEYSTORE: pathToFileURL(path.join(HOOKS, 'keystore.mjs')).href, MP_PAYLOAD: sealed },
  });
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  const out = JSON.parse(r.stdout.trim().split('\n').at(-1));
  assert.equal(out.kind, 'dpapi');
  assert.ok(out.calls.length >= 1, 'DPAPI runs through a child process, so there was something to watch');
  assert.ok(out.calls.some((c) => c.input === sealed), 'the payload goes in as stdin');
  const forms = [OR_KEY, sealed, Buffer.from(OR_KEY).toString('base64'), Buffer.from(OR_KEY, 'utf16le').toString('base64'), Buffer.from(OR_KEY).toString('hex')];
  for (const c of out.calls) {
    const seen = JSON.stringify({ cmd: c.cmd, argv: c.argv, env: c.env });
    for (const f of forms) assert.equal(seen.includes(f), false, `a child process got the key (${f.slice(0, 8)}...) in argv, command or env`);
  }
  for (const f of forms) assert.equal(JSON.stringify(out.writes).includes(f), false, 'a written file holds the key or the package');
});

test('AC-63.12 ATTACK: after setProvider the key is in no providers.json, no project file and no file under the home folder', T, async (t) => {
  const home = freshHome(t);
  const { setProvider, readStore } = await load('providers.mjs');
  const v = await installVault(t);
  const project = tmpDir(t, 'mp-proj-');
  write(path.join(project, '.kit.json'), JSON.stringify({ type: 'web-saas', lang: 'en' }));
  const file = storeOf(home);
  assert.equal(setProvider('openrouter', OR_URL, OR_KEY, file), null);
  assert.equal(setProvider('deepseek', DS_URL, DS_KEY, file), null);
  assert.deepEqual(holders([home, project], OR_KEY), []);
  assert.deepEqual(holders([home, project], DS_KEY), []);
  assert.equal(JSON.stringify(readStore(file)).includes(OR_KEY), false, 'readStore returns no key');
  for (const last4 of [OR_KEY.slice(-4), DS_KEY.slice(-4)]) assert.equal(fs.readFileSync(file, 'utf8').includes(last4), false, 'not even the last four');
  assert.equal(v.store.size, 2);
});

test('AC-63.12 ATTACK: a refused key or address never reaches the vault, and an old plain entry is gone once a key is saved', T, async (t) => {
  const { setProvider, readStore } = await load('providers.mjs');
  const v = await installVault(t);
  const file = path.join(tmpDir(t, 'mp-store-'), 'providers.json');
  // 3.64.0: a key has no format per provider; the one rule is printable ASCII of 16 to 512 characters, and the address must be https
  for (const [provider, url, key] of [['openrouter', OR_URL, ''], ['openrouter', OR_URL, 'short'], ['openrouter', OR_URL, `${OR_KEY}\r\nx-evil: 1`], ['openrouter', OR_URL, `${OR_KEY} x`], ['openrouter', 'http://openrouter.ai/api', OR_KEY],
    ['openrouter', 'https://user:pw@openrouter.ai/api', OR_KEY], ['openrouter', 'https://openrouter.ai/api?x=1', OR_KEY], ['__proto__', OR_URL, OR_KEY], ['constructor', OR_URL, OR_KEY], ['Evil', OR_URL, OR_KEY], ['con', OR_URL, OR_KEY], ['openrouter', undefined, OR_KEY]]) {
    const err = setProvider(provider, url, key, file);
    assert.equal(typeof err, 'string', `${provider} ${url}: error text`);
    assert.match(err, /\S/);
    assert.equal(err.includes(OR_KEY), false, 'the error does not echo the key');
  }
  assert.equal(v.calls.save, 0, 'nothing reached the vault');
  assert.equal(v.store.size, 0);
  assert.equal(fs.existsSync(file), false, 'nothing written');
  // A plain entry from an older release goes when the store is next written
  write(file, JSON.stringify({ keys: { openrouter: OR_KEY_2 }, limits: { openrouter: 3 }, spend: {} }));
  assert.equal(setProvider('openrouter', OR_URL, OR_KEY, file), null);
  assert.equal(Object.hasOwn(JSON.parse(fs.readFileSync(file, 'utf8')), 'keys'), false, 'the plain entry is removed');
  assert.equal(fs.readFileSync(file, 'utf8').includes(OR_KEY_2), false);
  assert.equal(readStore(file).limits.openrouter, 3, 'the limit stays');
});

test('AC-63.13 readModels, resolveJob, hasKey, keyInfo, readStore and applyChanges never open the vault (fake backend counts zero reads)', T, async (t) => {
  const home = freshHome(t);
  const { setProvider, hasKey, keyInfo, readStore, readProvider, providerNames } = await load('providers.mjs');
  const models = await load('models.mjs');
  const v = await installVault(t);
  const file = storeOf(home);
  assert.equal(setProvider('openrouter', OR_URL, OR_KEY, file), null);
  const modelsFile = path.join(tmpDir(t, 'mp-state-'), 'models.json');
  write(modelsFile, JSON.stringify({ code: EXT, tasks: { 'docs.report': EXT } }));
  v.calls.read = 0;
  assert.equal(hasKey('openrouter', { file }), true);
  assert.equal(hasKey('deepseek', { file }), false);
  assert.equal(keyInfo('openrouter', { file }).present, true);
  assert.deepEqual(providerNames(file), ['openrouter']);
  assert.equal(typeof readStore(file), 'object');
  assert.equal(models.readModels(modelsFile).code, EXT, 'the external role is valid from the metadata alone');
  assert.equal(models.resolveJob('code.ui', modelsFile).value, EXT);
  assert.equal(models.resolveJob('docs.report', modelsFile).value, EXT);
  assert.deepEqual(models.resolveJob('code.ui', modelsFile).notes, []);
  const r = models.applyChanges({ changes: { 'test.simple': EXT } }, modelsFile);
  assert.equal(r.ok, true, r.message);
  assert.equal(v.calls.read, 0, 'no read of the vault');
  assert.deepEqual(readProvider('openrouter'), { url: OR_URL, key: OR_KEY }, 'control: readProvider does read it');
  assert.equal(v.calls.read, 1);
});

const COUNT_PRELOAD = path.join(TMP_HOME, 'mp-vault-count.mjs');
fs.writeFileSync(COUNT_PRELOAD, [
  "import fs from 'node:fs';",
  'const ks = await import(process.env.MP_KEYSTORE);',
  'const log = (op) => fs.appendFileSync(process.env.MP_SPY, op + "\\n");',
  "ks.setVaultBackend({ kind: 'keychain', save: () => log('save'), read: () => { log('read'); return null; }, remove: () => log('remove') });",
].join('\n'));

function countedProject(t) {
  const root = tmpDir(t, 'mp-count-');
  const home = tmpDir(t, 'mp-count-home-');
  write(path.join(root, '.kit.json'), JSON.stringify({ type: 'web-saas', lang: 'en' }));
  write(path.join(root, '.claude', 'state', 'models.json'), JSON.stringify({ code: EXT }));
  const spy = path.join(home, 'vault-spy.txt');
  const env = { ...cleanEnv(), HOME: home, USERPROFILE: home, CLAUDE_PROJECT_DIR: root, MP_SPY: spy, MP_KEYSTORE: pathToFileURL(path.join(HOOKS, 'keystore.mjs')).href };
  const run = (script, args, extra = {}) => spawnSync(process.execPath, ['--import', pathToFileURL(COUNT_PRELOAD).href, ...script, ...args], { cwd: root, encoding: 'utf8', timeout: 90000, env: { ...env, ...extra } });
  const reads = () => (fs.existsSync(spy) ? fs.readFileSync(spy, 'utf8').split('\n').filter(Boolean) : []);
  return { root, home, run, reads, spy, env };
}

test('AC-63.13 models.mjs --show and --for never open the vault, and still see an external role by its metadata (child processes)', T, async (t) => {
  const p = countedProject(t);
  const { setProvider } = await load('providers.mjs');
  const v = await installVault(t);
  withEnv(t, { HOME: p.home, USERPROFILE: p.home });
  assert.equal(setProvider('openrouter', OR_URL, OR_KEY, storeOf(p.home)), null);
  assert.equal(v.store.size, 1);
  const control = p.run(['-e'], ['import(process.env.MP_KEYSTORE).then((m) => m.vaultRead("openrouter"))']);
  assert.equal(control.status, 0, control.stderr);
  assert.deepEqual(p.reads(), ['read'], 'control: the counting vault works inside a child');
  fs.rmSync(p.spy);
  const models = path.join(HOOKS, 'models.mjs');
  const show = p.run([models], ['--show']);
  assert.equal(show.status, 0, show.stderr);
  assert.match(show.stdout, /^code: openrouter\/x\/y \/ high/m, 'the external role is valid from the metadata');
  for (const job of ['code', 'code.ui', 'docs.report']) {
    const r = p.run([models], ['--for', job]);
    assert.equal(r.status, 0, `${job} ${r.stderr}`);
    if (job !== 'docs.report') assert.match(r.stdout.trim(), new RegExp(`^${EXT} .*run-role\\.mjs ${job.replace('.', '\\.')}`), job);
  }
  assert.deepEqual(p.reads(), [], 'no vault read by --show or --for');
});

test('AC-63.13 the dashboard never opens the vault', T, async (t) => {
  const p = countedProject(t);
  const { setProvider } = await load('providers.mjs');
  await installVault(t);
  withEnv(t, { HOME: p.home, USERPROFILE: p.home });
  assert.equal(setProvider('openrouter', OR_URL, OR_KEY, storeOf(p.home)), null);
  const r = p.run([path.join(HOOKS, 'dashboard.mjs')], [p.root]);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(fs.existsSync(path.join(p.root, 'dashboard.html')), true);
  assert.deepEqual(p.reads(), [], 'no vault read by the dashboard');
});

test('AC-63.14 a vault that throws on save: setProvider returns an error and saves nothing: no metadata, and no plain fallback', T, async (t) => {
  const { setProvider, readStore, keyInfo, readProvider } = await load('providers.mjs');
  const v = await installVault(t, { failSave: true });
  const file = path.join(tmpDir(t, 'mp-store-'), 'providers.json');
  const err = setProvider('openrouter', OR_URL, OR_KEY, file);
  assert.equal(typeof err, 'string');
  assert.match(err, /\S/);
  assert.equal(err.includes(OR_KEY), false, 'the error does not echo the key');
  assert.equal(v.store.size, 0);
  if (fs.existsSync(file)) {
    const store = readStore(file);
    assert.equal(Object.hasOwn(store, 'keys'), false, 'no plain fallback');
    assert.deepEqual(store.keyMeta, {}, 'no metadata for a key that was not saved');
  }
  assert.equal(keyInfo('openrouter', { file }).present, false);
  assert.equal(readProvider('openrouter'), null);
  assert.deepEqual(holders([path.dirname(file)], OR_KEY), []);
});

test('AC-63.11 removeKey: the vault entry, the metadata and an old plain entry all go; other providers stay', T, async (t) => {
  const { setProvider, removeKey, hasKey, readStore, readProvider } = await load('providers.mjs');
  const v = await installVault(t);
  const file = path.join(tmpDir(t, 'mp-store-'), 'providers.json');
  assert.equal(setProvider('openrouter', OR_URL, OR_KEY, file), null);
  assert.equal(setProvider('deepseek', DS_URL, DS_KEY, file), null);
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  raw.keys = { ...raw.keys, openrouter: OR_KEY_2 };
  write(file, JSON.stringify(raw));
  removeKey('openrouter', file);
  assert.equal(v.store.has('openrouter'), false, 'vault');
  assert.equal(readStore(file).keyMeta.openrouter, undefined, 'metadata');
  assert.equal(Object.hasOwn(JSON.parse(fs.readFileSync(file, 'utf8')), 'keys'), false, 'plain entry');
  assert.equal(fs.readFileSync(file, 'utf8').includes(OR_KEY_2), false);
  assert.equal(hasKey('openrouter', { file }), false);
  assert.equal(hasKey('deepseek', { file }), true, 'the other provider stays');
  assert.deepEqual(readProvider('deepseek'), { url: DS_URL, key: DS_KEY });
  assert.doesNotThrow(() => removeKey('kimi', file), 'a provider with no key');
  assert.doesNotThrow(() => removeKey('openrouter', file), 'twice');
});


// ============================================================================================
// Catalog and per-model spend (AC-63.15 store side)
// ============================================================================================

test('AC-63.15 readStore also returns keyMeta, modelSpend and catalog (empty on a missing file)', T, async (t) => {
  const { readStore } = await load('providers.mjs');
  const dir = tmpDir(t, 'mp-store-');
  // 3.64.0: no keys part: a plain keys field is never read
  const empty = { limits: {}, spend: {}, keyMeta: {}, modelSpend: {}, catalog: {} };
  assert.deepEqual(readStore(path.join(dir, 'none.json')), empty);
  write(path.join(dir, 'odd.json'), JSON.stringify({ keys: [], keyMeta: 'x', modelSpend: 5, catalog: null }));
  assert.deepEqual(readStore(path.join(dir, 'odd.json')), empty);
  write(path.join(dir, 'old.json'), JSON.stringify({ keys: { openrouter: OR_KEY }, limits: { openrouter: 2 } }));
  assert.equal(JSON.stringify(readStore(path.join(dir, 'old.json'))).includes(OR_KEY), false, 'an old plain key is not carried');
});

test('AC-63.15 addModelSpend adds up per day, and externalFromStore reads it back by range', T, async (t) => {
  const { addModelSpend, readStore } = await load('providers.mjs');
  const { externalFromStore } = await load('panel-data.mjs');
  const file = path.join(tmpDir(t, 'mp-store-'), 'providers.json');
  addModelSpend('openrouter/acme/x', { usd: 0.125, input: 1000, output: 500, seconds: 3 }, '2026-11-03', file);
  addModelSpend('openrouter/acme/x', { usd: 0.0625, input: 200, output: 100, seconds: 2 }, '2026-11-03', file);
  addModelSpend('openrouter/acme/x', { usd: 0.25, input: 1, output: 1, seconds: 1 }, '2026-11-04', file);
  addModelSpend('deepseek/deepseek-chat', { usd: 0.5, input: 10, output: 20, seconds: 4 }, '2026-11-03', file);
  const store = readStore(file);
  const one = externalFromStore(store, { from: '2026-11-03', to: '2026-11-03' });
  assert.deepEqual(Object.keys(one).sort(), ['models', 'usd']);
  close(one.usd, 0.6875, 'total');
  const x = one.models.find((m) => m.key === 'openrouter/acme/x');
  assert.ok(x, 'the model is listed');
  assert.equal(x.provider, 'openrouter');
  close(x.usd, 0.1875, 'usd adds up');
  assert.equal(x.input, 1200);
  assert.equal(x.output, 600);
  assert.equal(x.seconds, 5);
  assert.deepEqual(x.jobs, [], 'the store holds no job names');
  assert.deepEqual(Object.keys(x.byDay), ['2026-11-03']);
  close(x.byDay['2026-11-03'], 0.1875);
  assert.equal(one.models.find((m) => m.key === 'deepseek/deepseek-chat').provider, 'deepseek');
  const both = externalFromStore(store, { from: '2026-11-03', to: '2026-11-04' });
  close(both.usd, 0.9375);
  assert.deepEqual(Object.keys(both.models.find((m) => m.key === 'openrouter/acme/x').byDay).sort(), ['2026-11-03', '2026-11-04']);
  const none = externalFromStore(store, { from: '2026-12-01', to: '2026-12-31' });
  assert.equal(none.usd, 0);
  assert.deepEqual(none.models, []);
});

test('AC-63.15 addCatalog and removeCatalog keep external model prices (USD per million); free models (price 0) are allowed', T, async (t) => {
  const { addCatalog, removeCatalog, readStore } = await load('providers.mjs');
  const file = path.join(tmpDir(t, 'mp-store-'), 'providers.json');
  assert.ok([null, undefined].includes(addCatalog('openrouter', { model: 'acme/priced-1', input: 2, output: 4, context: 32000 }, file)));
  assert.ok([null, undefined].includes(addCatalog('openrouter', { model: 'acme/free-1:free', input: 0, output: 0, context: 8000 }, file)));
  const text = JSON.stringify(readStore(file).catalog);
  assert.ok(text.includes('acme/priced-1') && text.includes('acme/free-1:free'));
  removeCatalog('openrouter', 'acme/priced-1', file);
  const after = JSON.stringify(readStore(file).catalog);
  assert.equal(after.includes('acme/priced-1'), false);
  assert.ok(after.includes('acme/free-1:free'), 'the other model stays');
  assert.doesNotThrow(() => removeCatalog('openrouter', 'acme/never-added', file));
});

test('AC-63.15 ATTACK: addCatalog refuses a bad model id, a bad price, a bad context and a malformed provider name, and writes nothing', T, async (t) => {
  const { addCatalog, readStore } = await load('providers.mjs');
  const file = path.join(tmpDir(t, 'mp-store-'), 'providers.json');
  const good = { model: 'acme/priced-1', input: 2, output: 4, context: 32000 };
  const bad = [
    ['openrouter', { ...good, model: '' }], ['openrouter', { ...good, model: ' ' }], ['openrouter', { ...good, model: '../x' }], ['openrouter', { ...good, model: '/etc/passwd' }],
    ['openrouter', { ...good, model: 'a b' }], ['openrouter', { ...good, model: 'x\n' }], ['openrouter', { ...good, model: '<img src=x onerror=1>' }], ['openrouter', { ...good, model: '__proto__' }],
    ['openrouter', { ...good, model: 5 }], ['openrouter', { ...good, model: undefined }],
    ['openrouter', { ...good, input: -1 }], ['openrouter', { ...good, input: NaN }], ['openrouter', { ...good, input: Infinity }], ['openrouter', { ...good, input: '2' }], ['openrouter', { ...good, input: null }], ['openrouter', { ...good, input: undefined }],
    ['openrouter', { ...good, output: -1 }], ['openrouter', { ...good, output: NaN }], ['openrouter', { ...good, output: '4' }], ['openrouter', { ...good, output: undefined }],
    ['openrouter', { ...good, context: -5 }], ['openrouter', { ...good, context: NaN }], ['openrouter', { ...good, context: 'big' }],
    ['Evil', good], ['__proto__', good], ['constructor', good], ['con', good], ['a b', good], ['../x', good], [undefined, good], ['openrouter', null], ['openrouter', 'acme/priced-1'],
  ];
  for (const [provider, entry] of bad) {
    const err = addCatalog(provider, entry, file);
    assert.equal(typeof err, 'string', `${provider} ${JSON.stringify(entry)}`);
    assert.match(err, /\S/);
  }
  assert.equal(fs.existsSync(file) ? JSON.stringify(readStore(file).catalog) : '{}', '{}', 'nothing was written');
  assert.equal(({}).polluted, undefined);
});

// ============================================================================================
// Usage data: panel-data.mjs (AC-63.6, AC-63.7)
// ============================================================================================

test('AC-63.6 rangeOf: today, this week, last week and 30 days as YYYY-MM-DD; a week runs Monday to Sunday', T, async () => {
  const { rangeOf } = await load('panel-data.mjs');
  const wed = new Date(2026, 10, 4, 12, 0, 0).getTime();
  assert.deepEqual(rangeOf('today', wed), { from: '2026-11-04', to: '2026-11-04' });
  assert.deepEqual(rangeOf('lastWeek', wed), { from: '2026-10-26', to: '2026-11-01' });
  const week = rangeOf('thisWeek', wed);
  assert.equal(week.from, '2026-11-02', 'Monday');
  assert.ok(week.to >= '2026-11-04' && week.to <= '2026-11-08', `to is today or the Sunday: ${week.to}`);
  const d30 = rangeOf('days30', wed);
  assert.equal(d30.to, '2026-11-04');
  assert.ok(['2026-10-05', '2026-10-06'].includes(d30.from), `30 days: ${d30.from}`);
  for (const r of [week, d30]) assert.match(r.from + r.to, /^\d{4}-\d{2}-\d{2}\d{4}-\d{2}-\d{2}$/);
  // Monday just after midnight and Sunday just before it
  const mon = new Date(2026, 10, 2, 0, 5, 0).getTime();
  assert.equal(rangeOf('thisWeek', mon).from, '2026-11-02');
  assert.deepEqual(rangeOf('lastWeek', mon), { from: '2026-10-26', to: '2026-11-01' });
  assert.deepEqual(rangeOf('today', mon), { from: '2026-11-02', to: '2026-11-02' });
  const sun = new Date(2026, 10, 8, 23, 55, 0).getTime();
  assert.equal(rangeOf('thisWeek', sun).from, '2026-11-02');
  assert.deepEqual(rangeOf('lastWeek', sun), { from: '2026-10-26', to: '2026-11-01' });
  assert.deepEqual(rangeOf('today', sun), { from: '2026-11-08', to: '2026-11-08' });
  // A week that crosses the year
  const fri = new Date(2027, 0, 1, 12, 0, 0).getTime();
  assert.equal(rangeOf('thisWeek', fri).from, '2026-12-28');
  assert.deepEqual(rangeOf('lastWeek', fri), { from: '2026-12-21', to: '2026-12-27' });
  assert.deepEqual(rangeOf('today', fri), { from: '2027-01-01', to: '2027-01-01' });
});

function rangeIn(tz, kind, ms) {
  const url = pathToFileURL(path.join(HOOKS, 'panel-data.mjs')).href;
  const r = spawnSync(process.execPath, ['--input-type=module', '-e', `process.env.TZ = ${JSON.stringify(tz)}; const m = await import(${JSON.stringify(url)}); console.log(JSON.stringify(m.rangeOf(${JSON.stringify(kind)}, ${ms})));`], { encoding: 'utf8', env: { ...process.env, TZ: tz }, timeout: 30000 });
  assert.equal(r.status, 0, r.stderr);
  return JSON.parse(r.stdout);
}

test('AC-63.6 ATTACK: rangeOf uses local time, not UTC (checked in a zone far ahead of UTC and one behind it)', T, async () => {
  // Pacific/Auckland is UTC+13 in November: this instant is Sunday 11:10 UTC but Monday 2026-11-09 00:10 there
  const auckland = Date.UTC(2026, 10, 8, 11, 10);
  assert.deepEqual(rangeIn('Pacific/Auckland', 'today', auckland), { from: '2026-11-09', to: '2026-11-09' });
  assert.equal(rangeIn('Pacific/Auckland', 'thisWeek', auckland).from, '2026-11-09', 'a new week has begun there');
  assert.deepEqual(rangeIn('Pacific/Auckland', 'lastWeek', auckland), { from: '2026-11-02', to: '2026-11-08' });
  // America/Los_Angeles is UTC-8 in November (daylight time ended 1 Nov): Monday 07:50 UTC is still Sunday 2026-11-08 23:50 there
  const la = Date.UTC(2026, 10, 9, 7, 50);
  assert.deepEqual(rangeIn('America/Los_Angeles', 'today', la), { from: '2026-11-08', to: '2026-11-08' });
  assert.equal(rangeIn('America/Los_Angeles', 'thisWeek', la).from, '2026-11-02', 'still the old week there');
  assert.deepEqual(rangeIn('America/Los_Angeles', 'lastWeek', la), { from: '2026-10-26', to: '2026-11-01' });
});

test('AC-63.6 claudeUsage: USD and token totals match the sample data exactly for today, this week, last week and 30 days', T, async () => {
  const { claudeUsage } = await load('panel-data.mjs');
  const expect = {
    today: { usd: 1.75, tokens: { input: 110, output: 55, cache: 55, total: 220 } },
    thisWeek: { usd: 2.25, tokens: { input: 130, output: 65, cache: 65, total: 260 } },
    lastWeek: { usd: 3, tokens: { input: 250, output: 125, cache: 125, total: 500 } },
    days30: { usd: 9.375, tokens: { input: 790, output: 200, cache: 190, total: 1180 } },
  };
  for (const [kind, want] of Object.entries(expect)) {
    const got = claudeUsage(SAMPLE, R[kind]);
    assert.equal(got.usd, want.usd, `${kind} usd (the non-Claude entry is left out)`);
    assert.deepEqual(got.tokens, want.tokens, `${kind} tokens`);
    assert.deepEqual(Object.keys(got).sort(), ['byDay', 'byModel', 'tokens', 'usd'], `${kind}: no combined or extra field`);
  }
  const d30 = claudeUsage(SAMPLE, R.days30);
  assert.deepEqual(d30.byModel.opus, { usd: 7.5, input: 700, output: 150, cache: 150 });
  assert.deepEqual(d30.byModel.sonnet, { usd: 1.25, input: 60, output: 30, cache: 30 });
  assert.deepEqual(d30.byModel.haiku, { usd: 0.625, input: 30, output: 20, cache: 10 });
  assert.equal(Object.keys(d30.byModel).some((k) => /gpt|synthetic/i.test(k)), false, 'non-Claude models are not listed');
  const today = claudeUsage(SAMPLE, R.today);
  assert.deepEqual(today.byModel.opus, { usd: 1.5, input: 100, output: 50, cache: 50 });
  assert.equal(today.byModel.haiku?.usd ?? 0, 0);
});

test('AC-63.6 claudeUsage byDay: one entry per day with data, split by model family, inside the range, in date order', T, async () => {
  const { claudeUsage } = await load('panel-data.mjs');
  const got = claudeUsage(SAMPLE, R.days30);
  const dates = got.byDay.map((d) => d.date);
  assert.deepEqual(dates, [...dates].sort(), 'ascending');
  assert.ok(dates.every((d) => d >= R.days30.from && d <= R.days30.to), 'inside the range');
  assert.equal(new Set(dates).size, dates.length, 'each date once');
  const find = (date) => got.byDay.find((d) => d.date === date);
  const nov4 = find('2026-11-04');
  assert.equal(nov4.usd, 1.75);
  assert.equal(nov4.tokens, 220);
  assert.equal(nov4.models.opus, 1.5);
  assert.equal(nov4.models.sonnet, 0.25);
  assert.equal(nov4.models.haiku ?? 0, 0);
  assert.equal(Object.keys(nov4.models).some((k) => /gpt/i.test(k)), false);
  assert.deepEqual({ usd: find('2026-11-02').usd, tokens: find('2026-11-02').tokens, haiku: find('2026-11-02').models.haiku }, { usd: 0.5, tokens: 40, haiku: 0.5 });
  assert.deepEqual({ usd: find('2026-10-25').usd, tokens: find('2026-10-25').tokens }, { usd: 4, tokens: 400 });
  assert.equal(find('2026-09-20'), undefined, 'outside the range');
  assert.equal(got.byDay.reduce((a, d) => a + d.usd, 0), got.usd, 'the days add up to the total');
});

test('AC-63.6 claudeUsage: empty data, junk entries and a missing daily array give zeros and do not throw', T, async () => {
  const { claudeUsage } = await load('panel-data.mjs');
  const zero = { input: 0, output: 0, cache: 0, total: 0 };
  for (const daily of [[], null, undefined, {}, 'x', 5]) {
    const got = claudeUsage(daily, R.days30);
    assert.equal(got.usd, 0, String(daily));
    assert.deepEqual(got.tokens, zero, String(daily));
    assert.ok(got.byDay.every((d) => d.usd === 0), 'any day entry is empty');
  }
  const junk = [null, 5, 'x', {}, { date: '2026-11-04' }, { date: '2026-11-04', modelBreakdowns: 'nope' }, { date: '2026-11-04', modelBreakdowns: [null, { modelName: 5 }, { modelName: OPUS, cost: 'abc' }, { cost: 3 }] }, { modelBreakdowns: [bd(OPUS, 9, 9, 9, 9, 9)] }];
  const got = claudeUsage(junk, R.days30);
  assert.equal(Number.isFinite(got.usd), true);
  assert.equal(got.usd, 0);
  assert.equal(got.tokens.total, 0);
});

test('AC-63.7 externalFromRuns: totals per model from role-runs lines, local days, bad lines skipped', T, async () => {
  const { externalFromRuns } = await load('panel-data.mjs');
  const at = (day, h = 10, m = 0) => new Date(2026, 10, day, h, m, 0).toISOString();
  const run = (over) => ({ date: at(4), job: 'code.ui', role: 'code', provider: 'openrouter', model: 'deepseek/x', seconds: 10, usd: 0.0625, priceKnown: true, exit: 0, input: 1000, output: 500, ...over });
  const lines = [
    run({}),
    run({ date: at(4, 0, 30), job: 'code.feature', seconds: 20, usd: 0.125, input: 2000, output: 100 }), // 00:30 local: still the 4th, whatever the zone
    run({ date: at(3, 9), seconds: 5, usd: 0.03125, input: 500, output: 50 }),
    run({ provider: 'deepseek', model: 'deepseek-chat', job: 'docs.report', seconds: 7, usd: 0.5, priceKnown: false, input: undefined, output: undefined }),
    run({ date: at(1, 9), usd: 100 }),
    null, 'text', 42, [], {}, { date: 'nope', usd: 1 }, { usd: 1 },
  ];
  const today = externalFromRuns(lines, { from: '2026-11-04', to: '2026-11-04' });
  assert.deepEqual(Object.keys(today).sort(), ['models', 'usd'], 'no combined field');
  close(today.usd, 0.6875, 'total');
  assert.equal(today.models.length, 2);
  const x = today.models.find((m) => m.key === 'openrouter/deepseek/x');
  assert.ok(x);
  assert.equal(x.provider, 'openrouter');
  close(x.usd, 0.1875);
  assert.equal(x.input, 3000);
  assert.equal(x.output, 600);
  assert.equal(x.runs, 2);
  assert.equal(x.seconds, 30);
  assert.deepEqual([...x.jobs].sort(), ['code.feature', 'code.ui']);
  assert.equal(x.priceKnown, true);
  assert.deepEqual(Object.keys(x.byDay), ['2026-11-04']);
  close(x.byDay['2026-11-04'], 0.1875);
  const d = today.models.find((m) => m.key === 'deepseek/deepseek-chat');
  assert.deepEqual({ provider: d.provider, input: d.input, output: d.output, runs: d.runs, seconds: d.seconds, jobs: d.jobs, priceKnown: d.priceKnown }, { provider: 'deepseek', input: 0, output: 0, runs: 1, seconds: 7, jobs: ['docs.report'], priceKnown: false });
  const week = externalFromRuns(lines, { from: '2026-11-02', to: '2026-11-08' });
  const wx = week.models.find((m) => m.key === 'openrouter/deepseek/x');
  close(wx.usd, 0.21875);
  assert.equal(wx.runs, 3);
  assert.deepEqual(Object.keys(wx.byDay).sort(), ['2026-11-03', '2026-11-04']);
  assert.deepEqual(externalFromRuns([], { from: '2026-11-04', to: '2026-11-04' }), { usd: 0, models: [] });
  assert.deepEqual(externalFromRuns(null, { from: '2026-11-04', to: '2026-11-04' }), { usd: 0, models: [] });
});

// ============================================================================================
// models.mjs: modelsVersion, applyChanges, defaults (AC-63.4, AC-63.9)
// ============================================================================================

function mfile(t) {
  const root = tmpDir(t, 'mp-models-');
  const file = path.join(root, '.claude', 'state', 'models.json');
  return {
    root, file, local: path.join(root, '.claude', 'settings.local.json'),
    put: (v) => write(file, typeof v === 'string' ? v : JSON.stringify(v)),
    saved: () => JSON.parse(fs.readFileSync(file, 'utf8')),
    bytes: () => fs.readFileSync(file, 'utf8'),
    has: () => fs.existsSync(file),
  };
}

test('AC-63.9 modelsVersion is a string that changes when the file changes', T, async (t) => {
  const { modelsVersion } = await load('models.mjs');
  const m = mfile(t);
  const none = modelsVersion(m.file);
  assert.equal(typeof none, 'string');
  m.put({ code: 'haiku:low' });
  const a = modelsVersion(m.file);
  assert.equal(typeof a, 'string');
  assert.notEqual(a, none);
  assert.equal(modelsVersion(m.file), a, 'stable while the file is the same');
  m.put({ code: 'haiku:low', tasks: { 'code.ui': 'opus:high' } });
  assert.notEqual(modelsVersion(m.file), a);
});

test('AC-63.9 applyChanges: a role change moves the followers and keeps custom jobs; null resets one; unknown fields stay', T, async (t) => {
  const { applyChanges, resolveJob, modelsVersion } = await load('models.mjs');
  const m = mfile(t);
  const val = (job) => resolveJob(job, m.file).value;
  m.put({ code: 'haiku:medium', acknowledged: { review: '2026-11-02' }, tasks: { 'code.ui': 'opus:high', 'test.simple': 'haiku:low' } });
  let r = applyChanges({ changes: { code: 'sonnet:low' } }, m.file);
  assert.equal(r.ok, true, r.message);
  assert.equal(r.version, modelsVersion(m.file), 'the version of the new file');
  assert.equal(val('code.feature'), 'sonnet:low', 'a follower moved');
  assert.equal(val('code.ui'), 'opus:high', 'a custom job stayed');
  assert.equal(val('test.simple'), 'haiku:low');
  assert.deepEqual(m.saved().acknowledged, { review: '2026-11-02' }, 'unknown fields survive');
  r = applyChanges({ changes: { 'code.ui': null } }, m.file);
  assert.equal(r.ok, true, r.message);
  assert.equal(val('code.ui'), 'sonnet:low', 'a reset job follows the role again');
  assert.equal(Object.hasOwn(m.saved().tasks ?? {}, 'code.ui'), false);
  assert.equal(m.saved().tasks['test.simple'], 'haiku:low');
  r = applyChanges({ changes: { code: null, 'board.qa': 'opus:low' } }, m.file);
  assert.equal(r.ok, true, r.message);
  assert.equal(Object.hasOwn(m.saved(), 'code'), false, 'the role key is gone');
  assert.equal(val('code.feature'), 'sonnet:high', 'recommended again');
  assert.equal(val('board.qa'), 'opus:low', 'two changes in one call');
  assert.equal(applyChanges({ changes: {} }, m.file).ok, true, 'no change is fine');
});

test('AC-63.9 applyChanges clearJobsUnder removes the saved jobs under that role only, keeps the role and board.commit', T, async (t) => {
  const { applyChanges } = await load('models.mjs');
  const m = mfile(t);
  const all = { code: 'haiku:low', tasks: { 'code.ui': 'opus:high', 'code.simple': 'main', 'code.critical': 'opus:xhigh', 'test.simple': 'haiku:low', 'review.code': 'opus:low', 'board.commit': 'sonnet:low', 'board.qa': 'opus:low', 'findings.tech': 'opus:low', main: 'sonnet:low', 'plan.task': 'sonnet:medium' } };
  m.put(all);
  let r = applyChanges({ changes: {}, clearJobsUnder: 'code' }, m.file);
  assert.equal(r.ok, true, r.message);
  assert.equal(m.saved().code, 'haiku:low', 'the role stays');
  assert.deepEqual(Object.keys(m.saved().tasks).sort(), ['board.commit', 'board.qa', 'findings.tech', 'main', 'plan.task', 'review.code', 'test.simple']);
  m.put(all);
  r = applyChanges({ changes: {}, clearJobsUnder: 'review' }, m.file);
  assert.equal(r.ok, true, r.message);
  assert.deepEqual(Object.keys(m.saved().tasks).sort(), ['board.commit', 'code.critical', 'code.simple', 'code.ui', 'main', 'plan.task', 'test.simple'], 'board.commit survives a review clear');
  m.put(all);
  r = applyChanges({ changes: { code: 'sonnet:medium' }, clearJobsUnder: 'code' }, m.file);
  assert.equal(r.ok, true, r.message);
  assert.equal(m.saved().code, 'sonnet:medium', 'the change and the clear in one call');
  assert.equal(Object.keys(m.saved().tasks).some((k) => k.startsWith('code.')), false);
  m.put({ code: 'haiku:low', tasks: { 'code.ui': 'opus:high' } });
  r = applyChanges({ changes: {}, clearJobsUnder: 'code' }, m.file);
  assert.equal(r.ok, true, r.message);
  assert.deepEqual(Object.keys(m.saved().tasks ?? {}), [], 'nothing left under tasks');
  assert.equal(m.saved().code, 'haiku:low');
});

test('AC-63.9 applyChanges conflict: a stale ifVersion is refused and the file stays as it was; the current one is accepted', T, async (t) => {
  const { applyChanges, modelsVersion } = await load('models.mjs');
  const m = mfile(t);
  const none = modelsVersion(m.file);
  let r = applyChanges({ changes: { 'code.ui': 'opus:high' }, ifVersion: none }, m.file);
  assert.equal(r.ok, true, 'the version of a file that does not exist yet is a valid ifVersion');
  const v1 = r.version;
  r = applyChanges({ changes: { 'code.ui': 'opus:xhigh' }, ifVersion: v1 }, m.file);
  assert.equal(r.ok, true, r.message);
  assert.notEqual(r.version, v1);
  const before = m.bytes();
  r = applyChanges({ changes: { 'code.ui': 'haiku:low' }, ifVersion: v1 }, m.file);
  assert.equal(r.ok, false);
  assert.equal(r.code, 'conflict');
  assert.match(r.message, /\S/);
  assert.equal(m.bytes(), before, 'nothing written');
  assert.equal(applyChanges({ changes: { 'code.ui': 'haiku:low' }, ifVersion: 'not-a-version' }, m.file).code, 'conflict');
  assert.equal(applyChanges({ changes: { 'code.ui': 'haiku:low' } }, m.file).ok, true, 'no ifVersion: no check');
});

test('AC-63.9 ATTACK: applyChanges refuses a bad job or value, writes nothing, and one bad pair stops the whole call', T, async (t) => {
  freshHome(t); // no key for any provider here
  const { applyChanges } = await load('models.mjs');
  const m = mfile(t);
  const bad = [
    { 'code.nope': 'opus:high' }, { 'code.ui': 'gpt-9:ultra' }, { 'code.ui': 'opus' }, { 'code.ui': 'opus:' }, { 'code.ui': 5 }, { 'code.ui': ['opus:high'] }, { 'code.ui': {} }, { 'code.ui': true },
    JSON.parse('{"__proto__":"opus:high"}'), { constructor: 'opus:high' }, { tasks: 'opus:high' }, { acknowledged: 'opus:high' }, { toString: 'opus:high' },
    { main: 'opus:max' }, { 'code.feature': 'main' }, { plan: 'main' }, { 'review.code': EXT }, { 'board.commit': EXT }, { main: EXT }, { 'code.ui': 'openrouter/x/y:max' }, { 'code.ui': EXT }, // EXT: no key for the provider here
    { 'code.ui': 'opus:high', 'code.nope': 'sonnet:low' },
  ];
  for (const changes of bad) {
    const r = applyChanges({ changes }, m.file);
    assert.equal(r.ok, false, JSON.stringify(changes));
    assert.equal(r.code, 'invalid', JSON.stringify(changes));
    assert.match(r.message, /\S/);
    assert.equal(m.has(), false, `nothing written: ${JSON.stringify(changes)}`);
  }
  for (const input of [{ changes: undefined }, { changes: null }, { changes: [] }, { changes: 'code.ui=opus:high' }, { changes: 5 }, {}]) {
    const r = applyChanges(input, m.file);
    assert.equal(r.ok, false, JSON.stringify(input));
    assert.equal(r.code, 'invalid', JSON.stringify(input));
  }
  for (const clear of ['nope', '__proto__', 'constructor', 5, 'CODE ']) {
    const r = applyChanges({ changes: {}, clearJobsUnder: clear }, m.file);
    assert.equal(r.ok, false, `clearJobsUnder ${clear}`);
    assert.equal(r.code, 'invalid');
  }
  m.put({ code: 'haiku:low', tasks: { 'code.ui': 'opus:high' } });
  const before = m.bytes();
  assert.equal(applyChanges({ changes: { 'code.ui': 'sonnet:low', 'code.nope': 'x' } }, m.file).code, 'invalid');
  assert.equal(m.bytes(), before, 'the good pair was not written either');
  assert.equal(({}).polluted, undefined);
});

test('AC-63.9 applyChanges broken: an unreadable file is refused unless overwriteBroken is set', T, async (t) => {
  const { applyChanges, resolveJob } = await load('models.mjs');
  const m = mfile(t);
  for (const broken of ['{"code":', '', 'null', '[]', '12']) {
    m.put(broken);
    const r = applyChanges({ changes: { 'code.ui': 'opus:high' } }, m.file);
    assert.equal(r.ok, false, JSON.stringify(broken));
    assert.equal(r.code, 'broken', JSON.stringify(broken));
    assert.equal(m.bytes(), broken, 'untouched');
    const forced = applyChanges({ changes: { 'code.ui': 'opus:high' }, overwriteBroken: true }, m.file);
    assert.equal(forced.ok, true, `${JSON.stringify(broken)} ${forced.message}`);
    assert.equal(m.saved().tasks['code.ui'], 'opus:high');
    assert.equal(resolveJob('code.ui', m.file).value, 'opus:high');
  }
});

test('AC-63.9 ATTACK: a failed write leaves the old file whole (partial write, and a failed rename)', T, async (t) => {
  const { applyChanges } = await load('models.mjs');
  const m = mfile(t);
  const old = { code: 'haiku:low', tasks: { 'code.ui': 'opus:high', 'docs.report': 'haiku:medium' } };
  m.put(old);
  const before = m.bytes();
  const realWrite = fs.writeFileSync, realRename = fs.renameSync;
  const restore = () => { fs.writeFileSync = realWrite; fs.renameSync = realRename; syncBuiltinESMExports(); };
  t.after(restore);
  const forTarget = (p) => typeof p === 'string' && path.resolve(p).startsWith(path.dirname(m.file) + path.sep);
  // 1: the disk fills up halfway through the write
  fs.writeFileSync = function (p, data, ...rest) {
    if (forTarget(p)) { realWrite.call(this, p, String(data).slice(0, Math.floor(String(data).length / 2)), ...rest); throw Object.assign(new Error('no space left on device'), { code: 'ENOSPC' }); }
    return realWrite.call(this, p, data, ...rest);
  };
  syncBuiltinESMExports();
  let r;
  try { r = applyChanges({ changes: { 'code.ui': 'opus:xhigh', 'test.simple': 'haiku:low' } }, m.file); } finally { restore(); }
  assert.equal(r.ok, false, 'a failed write is an answer, not a crash');
  assert.match(r.message, /\S/);
  assert.equal(m.bytes(), before, 'partial write: the old file is whole');
  // 2: the rename that puts the new file in place fails
  fs.renameSync = function (a, b, ...rest) {
    if (path.resolve(String(b)) === path.resolve(m.file)) throw Object.assign(new Error('resource busy'), { code: 'EBUSY' });
    return realRename.call(this, a, b, ...rest);
  };
  syncBuiltinESMExports();
  try { r = applyChanges({ changes: { 'code.ui': 'opus:xhigh' } }, m.file); } finally { restore(); }
  assert.equal(r.ok, false);
  assert.equal(m.bytes(), before, 'failed rename: the old file is whole');
  assert.equal(applyChanges({ changes: { 'code.ui': 'opus:xhigh' } }, m.file).ok, true, 'and the next write works');
});

test('AC-63.4 applyChanges main also writes settings.local.json and keeps its other keys; null takes the kit-written pair out', T, async (t) => {
  const { applyChanges } = await load('models.mjs');
  const m = mfile(t);
  const others = { permissions: { allow: ['Bash(ls)'] }, enabledPlugins: { 'a@b': true }, note: 'İıŞş' };
  write(m.local, JSON.stringify(others));
  const r = applyChanges({ changes: { main: 'sonnet:high', 'code.ui': 'opus:high' } }, m.file);
  assert.equal(r.ok, true, r.message);
  const local = JSON.parse(fs.readFileSync(m.local, 'utf8'));
  assert.equal(local.model, 'sonnet');
  assert.equal(local.effortLevel, 'high');
  assert.deepEqual({ ...local, model: undefined, effortLevel: undefined }, { ...others, model: undefined, effortLevel: undefined });
  assert.equal(m.saved().tasks.main, 'sonnet:high');
  assert.equal(m.saved().tasks['code.ui'], 'opus:high', 'other keys are saved too');
  assert.equal(applyChanges({ changes: { main: null } }, m.file).ok, true);
  assert.deepEqual(JSON.parse(fs.readFileSync(m.local, 'utf8')), others, 'the kit-written pair is taken out');
  assert.equal(Object.hasOwn(m.saved().tasks, 'main'), false);
  // A job other than main never touches the file
  const text = fs.readFileSync(m.local, 'utf8');
  assert.equal(applyChanges({ changes: { code: 'haiku:low' } }, m.file).ok, true);
  assert.equal(fs.readFileSync(m.local, 'utf8'), text);
});

test('AC-63.4 ATTACK: with a broken settings.local.json, a main change is refused as a whole and neither file changes', T, async (t) => {
  const { applyChanges } = await load('models.mjs');
  const m = mfile(t);
  write(m.local, '{"model":');
  m.put({ code: 'haiku:low' });
  const before = m.bytes();
  const r = applyChanges({ changes: { main: 'sonnet:high', code: 'opus:low' } }, m.file);
  assert.equal(r.ok, false);
  assert.match(r.message, /\S/);
  assert.equal(m.bytes(), before);
  assert.equal(fs.readFileSync(m.local, 'utf8'), '{"model":');
});

test('AC-63.9 setDefaults saves the project choice as the global default and readDefaults returns it', T, async (t) => {
  const home = freshHome(t);
  const { setDefaults, readDefaults } = await load('models.mjs');
  const m = mfile(t);
  const none = readDefaults();
  assert.ok(none === null || none === undefined || (typeof none === 'object' && Object.keys(none).length === 0), 'nothing saved yet');
  m.put({ code: 'haiku:low', tasks: { 'code.ui': 'opus:high' } });
  setDefaults(m.file);
  const file = path.join(home, '.vibe-kit', 'models-default.json');
  assert.equal(fs.existsSync(file), true, '~/.vibe-kit/models-default.json');
  const back = readDefaults();
  assert.equal(back.code, 'haiku:low');
  assert.equal(back.tasks['code.ui'], 'opus:high');
  m.put({ code: 'sonnet:medium' });
  setDefaults(m.file);
  assert.equal(readDefaults().code, 'sonnet:medium', 'a second save replaces the first');
  assert.equal(Object.hasOwn(readDefaults().tasks ?? {}, 'code.ui'), false);
});

test('AC-63.9 ATTACK: --use-default is on the allow list, so a default that holds an external model is not applied without approval', T, async (t) => {
  const { evaluate } = await load('destructive-guard.mjs');
  const home = tmpDir(t, 'mp-usedef-home-');
  const root = tmpDir(t, 'mp-usedef-proj-');
  write(path.join(root, '.kit.json'), JSON.stringify({ type: 'web-saas', lang: 'en' }));
  // The machine has a key for the provider, so the external value would pass the ordinary validity check
  write(storeOf(home), JSON.stringify({ keys: { openrouter: OR_KEY }, limits: {}, spend: {}, keyMeta: { openrouter: { last4: OR_KEY.slice(-4), addedAt: new Date().toISOString(), source: 'plain' } } }));
  write(path.join(home, '.vibe-kit', 'models-default.json'), JSON.stringify({ code: EXT, tasks: { 'docs.report': EXT, 'test.simple': 'haiku:low' } }));
  const env = { ...cleanEnv(), HOME: home, USERPROFILE: home, CLAUDE_PROJECT_DIR: root };
  const run = (...args) => spawnSync(process.execPath, [path.join(HOOKS, 'models.mjs'), ...args], { cwd: root, encoding: 'utf8', timeout: 30000, env });
  const guard = evaluate('node .claude/hooks/models.mjs --use-default');
  const r = run('--use-default');
  const file = path.join(root, '.claude', 'state', 'models.json');
  const saved = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
  if (guard?.decision === 'ask') return; // the guard puts the person in front of it: fine
  assert.equal(saved.includes('openrouter/'), false, 'no external model was applied by an allowed command');
  assert.equal(run('--for', 'code').stdout.trim(), 'sonnet:high');
  assert.equal(r.stdout.includes(OR_KEY) || r.stderr.includes(OR_KEY), false);
});

// ============================================================================================
// Scripts: usage.mjs --record, cost.mjs --all (AC-63.5, AC-63.8)
// ============================================================================================

const futureEpoch = (secs) => Math.floor(Date.now() / 1000) + secs;

function usageProject(t) {
  const root = tmpDir(t, 'mp-usage-');
  write(path.join(root, '.kit.json'), JSON.stringify({ type: 'web-saas', lang: 'en' }));
  const file = path.join(root, '.claude', 'state', 'usage.json');
  const run = (...args) => spawnSync(process.execPath, [path.join(HOOKS, 'usage.mjs'), ...args], { cwd: root, encoding: 'utf8', timeout: 30000, env: { ...cleanEnv(), CLAUDE_PROJECT_DIR: root } });
  return { root, file, run };
}

test('AC-63.5 usage.mjs --record writes usage.json for the desktop app, and readLimits reads it', T, async (t) => {
  const u = usageProject(t);
  const r5 = futureEpoch(3600), r7 = futureEpoch(3 * 86400);
  const r = u.run('--record', '26.5', String(r5), '39', String(r7));
  assert.equal(r.status, 0, r.stderr);
  const data = JSON.parse(fs.readFileSync(u.file, 'utf8'));
  assert.equal(typeof data.readAt, 'number');
  assert.ok(Math.abs(Date.now() - data.readAt) < 60000);
  assert.deepEqual(data.five_hour, { percent: 26.5, resetsAt: r5 });
  assert.deepEqual(data.seven_day, { percent: 39, resetsAt: r7 });
  const { readLimits } = await load('usage.mjs');
  const limits = readLimits(u.root);
  assert.equal(limits.five_hour.percent, 26.5);
  assert.equal(limits.seven_day.percent, 39);
  assert.equal(u.run('--record', '0', String(r5), '100', String(r7)).status, 0, '0 and 100 are valid percentages');
});

test('AC-63.5 ATTACK: usage.mjs --record with bad numbers exits 1 and writes nothing (and leaves an earlier file as it was)', T, async (t) => {
  const u = usageProject(t);
  const ok = String(futureEpoch(3600));
  const bad = [
    ['--record'], ['--record', '1', ok, '2'], ['--record', '1', ok, '2', ok, '3'], ['--record', 'abc', ok, '2', ok], ['--record', '1', 'abc', '2', ok], ['--record', '1', ok, 'abc', ok], ['--record', '1', ok, '2', 'abc'],
    ['--record', 'NaN', ok, '2', ok], ['--record', 'Infinity', ok, '2', ok], ['--record', '1', 'Infinity', '2', ok], ['--record', '', ok, '2', ok], ['--record', '1', '', '2', ok],
    ['--record', '-5', ok, '2', ok], ['--record', '150', ok, '2', ok], ['--record', '1', ok, '101', ok], ['--record', '1', '-1', '2', ok], ['--record', '1e999', ok, '2', ok], ['--record', '1', ok, '2', '1e999'],
  ];
  for (const args of bad) {
    const r = u.run(...args);
    assert.equal(r.status, 1, JSON.stringify(args));
    assert.match(r.stderr, /\S/, `${JSON.stringify(args)}: says why`);
    assert.doesNotMatch(r.stderr, /TypeError|at file:/, JSON.stringify(args));
    assert.equal(fs.existsSync(u.file), false, `nothing written: ${JSON.stringify(args)}`);
  }
  assert.equal(u.run('--record', '10', ok, '20', ok).status, 0);
  const before = fs.readFileSync(u.file, 'utf8');
  for (const args of bad) assert.equal(u.run(...args).status, 1, JSON.stringify(args));
  assert.equal(fs.readFileSync(u.file, 'utf8'), before, 'a refused record leaves the file as it was');
  assert.equal(u.run().status, 0, 'no flag: the summary, as before');
});

// A fake npx first on PATH: cost.mjs and the panel's refresh never reach the real ccusage or the network
// Its log, mode and output are file paths written into the script, not environment variables: cost.mjs passes npx an allow-listed env (AC-63.27)
function fakeNpx(t, { mode, daily = SAMPLE }) {
  const bin = tmpDir(t, 'mp-bin-');
  const js = path.join(bin, 'fake-npx.mjs');
  const log = path.join(bin, 'npx.log');
  const out = path.join(bin, 'out.json');
  const modeFile = path.join(bin, 'mode.txt');
  write(modeFile, mode);
  write(js, [
    "import fs from 'node:fs';",
    `const LOG = ${JSON.stringify(log)}, OUT = ${JSON.stringify(out)}, MODE = ${JSON.stringify(modeFile)};`,
    "fs.appendFileSync(LOG, process.argv.slice(2).join(' ') + '\\n');",
    "fs.appendFileSync(LOG + '.env', JSON.stringify(Object.keys(process.env)) + '\\n');",
    "const mode = fs.readFileSync(MODE, 'utf8');",
    "if (mode === 'slow') await new Promise((r) => setTimeout(r, 1500));",
    "if (mode === 'fail') { console.error('ccusage failed on purpose'); process.exit(1); }",
    "process.stdout.write(fs.readFileSync(OUT, 'utf8'));",
  ].join('\n'));
  if (IS_WIN) write(path.join(bin, 'npx.cmd'), `@echo off\r\n"${process.execPath}" "${js}" %*\r\n`);
  else { write(path.join(bin, 'npx'), `#!/bin/sh\nexec "${process.execPath}" "${js}" "$@"\n`); fs.chmodSync(path.join(bin, 'npx'), 0o755); }
  const setOutput = (rows) => write(out, JSON.stringify({ daily: rows, totals: { totalCost: 1, totalTokens: 2 } }));
  setOutput(daily);
  const setMode = (m) => write(modeFile, m);
  const envNames = () => (fs.existsSync(`${log}.env`) ? fs.readFileSync(`${log}.env`, 'utf8').split('\n').filter(Boolean).flatMap((l) => JSON.parse(l)) : []);
  return { bin, setOutput, setMode, envNames, calls: () => (fs.existsSync(log) ? fs.readFileSync(log, 'utf8').split('\n').filter(Boolean) : []), env: (base) => prependPath(base, bin) };
}
function useFakeNpx(t, npx) {
  const k = pathKey(process.env);
  withEnv(t, { [k]: npx.bin + path.delimiter + process.env[k] });
}

function costRun(t, args, npx) {
  const root = tmpDir(t, 'mp-cost-');
  write(path.join(root, '.kit.json'), JSON.stringify({ type: 'web-saas', lang: 'en' }));
  const r = spawnSync(process.execPath, [path.join(HOOKS, 'cost.mjs'), ...args.map((a) => (a === '<root>' ? root : a))], { cwd: root, encoding: 'utf8', timeout: 90000, env: { ...npx.env(cleanEnv()), CLAUDE_PROJECT_DIR: root } });
  return { root, r, state: (f) => path.join(root, '.claude', 'state', f) };
}

test('AC-63.8 cost.mjs --all runs ccusage without --project and writes cost-all.json, not cost.json', T, async (t) => {
  const npx = fakeNpx(t, { mode: 'ok' });
  const { root, r, state } = costRun(t, ['--all', '<root>'], npx);
  assert.equal(r.status, 0, r.stderr);
  const calls = npx.calls();
  assert.equal(calls.length, 1, 'ccusage ran once, through the fake');
  assert.match(calls[0], /ccusage/);
  assert.match(calls[0], /\bdaily\b/);
  assert.doesNotMatch(calls[0], /--project/, 'all projects');
  const saved = JSON.parse(fs.readFileSync(state('cost-all.json'), 'utf8'));
  assert.equal(typeof saved.readAt, 'string');
  assert.deepEqual(saved.data.daily, JSON.parse(JSON.stringify(SAMPLE)));
  assert.equal(fs.existsSync(state('cost.json')), false, 'the project file is not touched');
  assert.equal(root.length > 0, true);
});

test('AC-63.8 cost.mjs without --all behaves as before: --project and cost.json', T, async (t) => {
  const { ccusageProjectName } = await load('dashboard-data.mjs');
  const npx = fakeNpx(t, { mode: 'ok' });
  const { root, r, state } = costRun(t, ['<root>'], npx);
  assert.equal(r.status, 0, r.stderr);
  const calls = npx.calls();
  assert.equal(calls.length, 1);
  assert.ok(calls[0].includes(`--project ${ccusageProjectName(root)}`), calls[0]);
  assert.deepEqual(JSON.parse(fs.readFileSync(state('cost.json'), 'utf8')).data.daily, JSON.parse(JSON.stringify(SAMPLE)));
  assert.equal(fs.existsSync(state('cost-all.json')), false);
});

// ============================================================================================
// run-role: tokens, job and per-model spend (AC-63.15)
// ============================================================================================

// A preload that replaces spawn('claude') and the provider network. The fake child calls the local proxy once, so the usage is counted for real.
const RUN_PRELOAD = path.join(TMP_HOME, 'mp-run-preload.mjs');
fs.writeFileSync(RUN_PRELOAD, String.raw`
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import tls from 'node:tls';
import cp from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
const rec = (o) => fs.appendFileSync(process.env.MP_SPY, JSON.stringify(o) + '\n');
// MP_INF: the provider reports an absurd token count (1e999 parses to Infinity), so the cost of the run is not finite
const ev = (o) => 'event: ' + o.type + '\ndata: ' + JSON.stringify(o).replace('"__INF__"', '1e999') + '\n\n';
const SSE = [
  ev({ type: 'message_start', message: { id: 'm1', type: 'message', role: 'assistant', model: 'x', content: [], usage: { input_tokens: process.env.MP_INF ? '__INF__' : 1000, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 } } }),
  ev({ type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 500 } }),
  ev({ type: 'message_stop' }),
].join('');
const isLoop = (h) => /^(127\.0\.0\.1|localhost|\[::1\])$/.test(h);
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  const u = new URL(typeof input === 'string' ? input : input.url ?? String(input));
  if (isLoop(u.hostname)) return realFetch(input, init);
  rec({ kind: 'net', url: u.href });
  return new Response(SSE, { status: 200, headers: { 'content-type': 'text/event-stream' } });
};
https.request = (...a) => { rec({ kind: 'net-blocked', args: String(a[0]) }); throw new Error('real network is blocked in this test'); };
tls.connect = (...a) => { rec({ kind: 'tls-blocked' }); throw new Error('real network is blocked in this test'); };
const realHttpRequest = http.request.bind(http);
const post = (env) => new Promise((resolve, reject) => {
  const u = new URL(env.ANTHROPIC_BASE_URL + '/v1/messages?beta=true');
  const req = realHttpRequest({ host: u.hostname, port: u.port, path: u.pathname + u.search, method: 'POST', agent: false,
    headers: { 'content-type': 'application/json', 'anthropic-version': '2023-06-01', authorization: 'Bearer ' + env.ANTHROPIC_AUTH_TOKEN } },
    (res) => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
  req.on('error', reject);
  req.end(JSON.stringify({ model: env.ANTHROPIC_MODEL, stream: true, messages: [{ role: 'user', content: 'x' }] }));
});
const isClaude = (cmd, args) => [cmd, ...(Array.isArray(args) ? args.slice(0, 2) : [])].some((x) => /(^|[\\/\s])claude(\.exe|\.cmd)?(\s|$)/i.test(String(x)));
const realSpawn = cp.spawn, realSpawnSync = cp.spawnSync, realExecFileSync = cp.execFileSync, realExecSync = cp.execSync;
cp.spawn = (cmd, args, opts) => {
  if (!isClaude(cmd, args)) return realSpawn(cmd, args, opts);
  const o = (Array.isArray(args) ? opts : args) ?? {};
  rec({ kind: 'spawn', cmd });
  const child = new EventEmitter();
  Object.assign(child, { stdout: new PassThrough(), stderr: new PassThrough(), stdin: new PassThrough(), pid: 4242, kill: () => true });
  setTimeout(async () => {
    let code = 0;
    try { rec({ kind: 'child-call', status: await post(o.env ?? process.env) }); } catch (e) { code = 1; rec({ kind: 'child-error', message: String(e) }); }
    const reply = 'fake child done';
    for (const line of [{ type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: reply }] } }, { type: 'result', subtype: 'success', is_error: false, result: reply }])
      child.stdout.write(JSON.stringify(line) + '\n');
    child.stdout.end(); child.stderr.end();
    setTimeout(() => { child.emit('exit', code, null); child.emit('close', code, null); }, 20);
  }, 30);
  return child;
};
cp.spawnSync = (cmd, args, opts) => (isClaude(cmd, args) ? (rec({ kind: 'claude-sync' }), { status: 0, stdout: '', stderr: '', output: [], pid: 1 }) : realSpawnSync(cmd, args, opts));
cp.execFileSync = (cmd, args, opts) => (isClaude(cmd, args) ? (rec({ kind: 'claude-sync' }), '') : realExecFileSync(cmd, args, opts));
cp.execSync = (cmd, opts) => (isClaude(cmd) ? (rec({ kind: 'claude-sync' }), '') : realExecSync(cmd, opts));
syncBuiltinESMExports();
`);

const AGENTS_FIXTURE = '# Fixture\n\n## Commands\n\n```bash\ntest:        npm test\n```\n';

async function runProject(t, { model, catalog, tamper, env = {} } = {}) {
  const { setLimit, addCatalog } = await load('providers.mjs');
  const root = tmpDir(t, 'mp-run-');
  const home = tmpDir(t, 'mp-run-home-');
  const vault = tmpDir(t, 'mp-run-vault-');
  const bin = tmpDir(t, 'mp-run-bin-');
  makeFakeClaude(bin); // findProgram needs a claude on PATH outside the project; the preload never runs it
  fs.cpSync(HOOKS, path.join(root, '.claude', 'hooks'), { recursive: true });
  fs.cpSync(path.join(ROOT, '.claude', 'agents'), path.join(root, '.claude', 'agents'), { recursive: true });
  fs.copyFileSync(path.join(ROOT, '.claude', 'settings.json'), path.join(root, '.claude', 'settings.json'));
  write(path.join(root, '.kit.json'), JSON.stringify({ type: 'web-saas', lang: 'en' }));
  write(path.join(root, 'AGENTS.md'), AGENTS_FIXTURE);
  write(path.join(root, 'p.md'), 'PROMPT-MARKER do the task\n');
  write(path.join(root, '.claude', 'state', 'models.json'), JSON.stringify({ tasks: { 'code.ui': `openrouter/${model}:high` } }));
  const store = storeOf(home);
  assert.equal(await sealKey(vault, store), null);
  setLimit('openrouter', 5, store);
  if (catalog) assert.ok([null, undefined].includes(addCatalog('openrouter', { model, ...catalog }, store)));
  if (tamper) { const raw = JSON.parse(fs.readFileSync(store, 'utf8')); tamper(raw.catalog.openrouter[model]); fs.writeFileSync(store, JSON.stringify(raw)); }
  const spy = path.join(home, 'spy.jsonl');
  const base = { ...cleanEnv(), HOME: home, USERPROFILE: home, CLAUDE_PROJECT_DIR: root, KIT_TEST_VAULT_DIR: vault, MP_SPY: spy, ...env };
  // Only the stand-in claude is on PATH (plus node and the system folder); the preload catches the spawn, and a real claude would not be found anyway
  const systemRoot = process.env.SystemRoot ?? process.env.SYSTEMROOT;
  base[pathKey(base)] = [bin, path.dirname(process.execPath), ...(systemRoot ? [path.join(systemRoot, 'System32')] : [])].join(path.delimiter);
  const r = spawnSync(process.execPath, ['--import', FAKE_VAULT_URL, '--import', pathToFileURL(RUN_PRELOAD).href, path.join(root, '.claude', 'hooks', 'run-role.mjs'), 'code.ui', 'p.md'], { cwd: root, encoding: 'utf8', timeout: 60000, env: base });
  const spied = fs.existsSync(spy) ? fs.readFileSync(spy, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
  const logFile = path.join(root, '.claude', 'state', 'role-runs.jsonl');
  const rows = fs.existsSync(logFile) ? fs.readFileSync(logFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
  return { r, spied, rows, store, home };
}

test('AC-63.15 a run-role line holds input, output and job, modelSpend grows, and an unknown price is flagged (default price)', T, async (t) => {
  const { readStore } = await load('providers.mjs');
  const { externalFromStore, externalFromRuns } = await load('panel-data.mjs');
  const model = 'acme/unpriced-1';
  const p = await runProject(t, { model });
  assert.equal(p.r.status, 0, `${p.r.stdout}\n${p.r.stderr}`);
  assert.equal(p.spied.filter((s) => s.kind === 'spawn').length, 1, 'the fake child ran, not a real claude');
  assert.deepEqual(p.spied.filter((s) => s.kind === 'claude-sync' || s.kind === 'net-blocked' || s.kind === 'tls-blocked'), []);
  assert.equal(p.rows.length, 1);
  const row = p.rows[0];
  assert.equal(row.job, 'code.ui');
  assert.equal(row.role, 'code');
  assert.equal(row.model, model);
  assert.equal(row.input, 1000);
  assert.equal(row.output, 500);
  assert.equal(row.priceKnown, false);
  close(row.usd, 0.0175, 'default price: 1000 x 5 + 500 x 25 per million');
  const today = { from: dayStr(0), to: dayStr(0) };
  const fromStore = externalFromStore(readStore(p.store), today).models.find((m) => m.key === `openrouter/${model}`);
  assert.ok(fromStore, 'modelSpend grew');
  close(fromStore.usd, 0.0175);
  assert.equal(fromStore.input, 1000);
  assert.equal(fromStore.output, 500);
  const fromRuns = externalFromRuns(p.rows, today).models.find((m) => m.key === `openrouter/${model}`);
  assert.deepEqual({ runs: fromRuns.runs, input: fromRuns.input, output: fromRuns.output, jobs: fromRuns.jobs, priceKnown: fromRuns.priceKnown }, { runs: 1, input: 1000, output: 500, jobs: ['code.ui'], priceKnown: false });
});

test('AC-63.15 a price from the catalog wins over the default price and sets priceKnown', T, async (t) => {
  const { readStore } = await load('providers.mjs');
  const { externalFromStore } = await load('panel-data.mjs');
  const model = 'acme/priced-1';
  const p = await runProject(t, { model, catalog: { input: 2, output: 4, context: 32000 } });
  assert.equal(p.r.status, 0, `${p.r.stdout}\n${p.r.stderr}`);
  assert.equal(p.rows.length, 1);
  assert.equal(p.rows[0].priceKnown, true);
  close(p.rows[0].usd, 0.004, 'catalog price: 1000 x 2 + 500 x 4 per million');
  assert.equal(p.rows[0].input, 1000);
  assert.equal(p.rows[0].output, 500);
  const spent = externalFromStore(readStore(p.store), { from: dayStr(0), to: dayStr(0) }).models.find((m) => m.key === `openrouter/${model}`);
  close(spent.usd, 0.004);
});

// ============================================================================================
// Panel server (AC-63.1 .. AC-63.8, AC-63.16)
// ============================================================================================

function panelProject(t, { lang = 'en', i18n = true, files = {} } = {}) {
  const root = tmpDir(t, 'mp-panel-');
  fs.cpSync(HOOKS, path.join(root, '.claude', 'hooks'), { recursive: true });
  if (i18n) fs.cpSync(path.join(ROOT, '.claude', 'i18n'), path.join(root, '.claude', 'i18n'), { recursive: true });
  write(path.join(root, '.kit.json'), JSON.stringify({ type: 'web-saas', lang }));
  for (const [f, text] of Object.entries(files)) write(path.join(root, f), typeof text === 'string' ? text : JSON.stringify(text));
  // A panel that ignored the root it was given would otherwise write to this repository
  withEnv(t, { CLAUDE_PROJECT_DIR: root, ANTHROPIC_MODEL: undefined, CLAUDE_CODE_EFFORT_LEVEL: undefined, CLAUDE_CODE_SUBAGENT_MODEL: undefined });
  const models = path.join(root, '.claude', 'state', 'models.json');
  return {
    root, models, local: path.join(root, '.claude', 'settings.local.json'), stateDir: path.join(root, '.claude', 'state'),
    saved: () => JSON.parse(fs.readFileSync(models, 'utf8')),
    forJob: (job) => spawnSync(process.execPath, [path.join(HOOKS, 'models.mjs'), '--for', job], { encoding: 'utf8', timeout: 30000, env: { ...cleanEnv(), HOME: process.env.HOME, USERPROFILE: process.env.USERPROFILE, CLAUDE_PROJECT_DIR: root } }).stdout.trim(),
  };
}

// secret: the per-tab session secret, sent as x-panel-session (there is no cookie any more)
const call = (panel, { method = 'GET', url = '/', secret, headers = {}, body, origin, type, host } = {}) => new Promise((resolve, reject) => {
  const h = { ...headers };
  if (host !== undefined) h.host = host;
  if (secret !== undefined) h['x-panel-session'] = secret;
  if (method !== 'GET') {
    if (origin !== null) h.origin = origin ?? h.origin ?? `http://127.0.0.1:${panel.port}`;
    if (type !== null) h['content-type'] = type ?? h['content-type'] ?? 'application/json';
  }
  const data = body === undefined ? undefined : (Buffer.isBuffer(body) || typeof body === 'string' ? body : JSON.stringify(body));
  if (data !== undefined) h['content-length'] = Buffer.byteLength(data);
  const req = http.request({ host: '127.0.0.1', port: panel.port, method, path: url, headers: h, agent: false }, (res) => {
    const chunks = [];
    res.on('data', (c) => chunks.push(c));
    res.on('end', () => {
      const raw = Buffer.concat(chunks);
      resolve({ status: res.statusCode, headers: res.headers, raw, text: raw.toString('utf8'), json: () => JSON.parse(raw.toString('utf8')) });
    });
    res.on('error', reject);
  });
  req.on('error', reject);
  req.setTimeout(20000, () => req.destroy(new Error('request timed out')));
  req.end(data);
});

async function startPanel(t, proj, opts = {}) {
  const { createPanel } = await load('models-panel.mjs');
  const panel = await createPanel({ root: proj.root, idleMs: 10 * 60 * 1000, fetchImpl: offline, ...opts });
  t.after(async () => { try { await panel.close(); } catch { /* closed already */ } });
  assert.equal(typeof panel.port, 'number');
  assert.equal(typeof panel.close, 'function');
  return panel;
}

// The secret in <meta name="panel-session" content="...">; null when the page holds none
const secretOf = (html) => {
  const tag = html.match(/<meta\b[^>]*\bname\s*=\s*["']panel-session["'][^>]*>/i)?.[0];
  const value = tag?.match(/\bcontent\s*=\s*["']([^"']*)["']/i)?.[1];
  return value ? value : null;
};

async function session(t, proj, opts = {}) {
  const panel = await startPanel(t, proj, opts);
  const r = await call(panel, { url: `/?t=${panel.token}` });
  assert.equal(r.status, 200, `login: ${r.status} ${r.text.slice(0, 200)}`);
  const secret = secretOf(r.text);
  assert.match(secret ?? '', /^\S{32,}$/, 'the token page holds the session secret');
  const get = (url, extra) => call(panel, { url, secret, ...extra });
  return {
    panel, secret, get, login: r,
    post: (url, body, extra) => call(panel, { method: 'POST', url, secret, body, ...extra }),
    del: (url, body, extra) => call(panel, { method: 'DELETE', url, secret, body, ...extra }),
    state: async (query = '') => { const s = await get(`/api/state${query}`); assert.equal(s.status, 200, s.text.slice(0, 300)); return s.json(); },
  };
}

// stdout and stderr while the test runs, for "a key is in no output"
function capture(t) {
  const seen = [];
  const out = process.stdout.write, err = process.stderr.write;
  process.stdout.write = function (chunk, ...rest) { seen.push(Buffer.isBuffer(chunk) ? chunk.toString('latin1') : String(chunk)); return out.call(this, chunk, ...rest); };
  process.stderr.write = function (chunk, ...rest) { seen.push(Buffer.isBuffer(chunk) ? chunk.toString('latin1') : String(chunk)); return err.call(this, chunk, ...rest); };
  t.after(() => { process.stdout.write = out; process.stderr.write = err; });
  return () => seen.join('');
}

const isOpen = (port) => new Promise((resolve) => {
  const s = net.connect({ host: '127.0.0.1', port }, () => { s.destroy(); resolve(true); });
  s.on('error', () => resolve(false));
});

test('AC-63.2 login: a 256-bit token is exchanged once for a page holding the session secret; reuse and a forged secret are refused', T, async (t) => {
  freshHome(t);
  const proj = panelProject(t);
  const panel = await startPanel(t, proj);
  assert.match(panel.token, /^[A-Za-z0-9_-]{43,}$|^[0-9a-f]{64,}$/, 'at least 256 bits of token');
  const login = await call(panel, { url: `/?t=${panel.token}` });
  assert.equal(login.status, 200, 'no redirect and no cookie: the page itself');
  assert.match(login.headers['content-type'], /text\/html/);
  const secret = secretOf(login.text);
  assert.match(secret ?? '', /^[A-Za-z0-9_-]{43,}$|^[0-9a-f]{64,}$/, 'at least 256 bits of session secret');
  assert.notEqual(secret, panel.token, 'the secret is not the token');
  assert.equal(login.text.includes(panel.token), false, 'the page does not repeat the token');
  assert.equal((await call(panel, { url: '/api/state', secret })).status, 200, 'the secret opens the API');
  const reuse = await call(panel, { url: `/?t=${panel.token}` });
  assert.equal(reuse.status, 403, 'single use');
  assert.equal(secretOf(reuse.text), null, 'a reused token gets no secret');
  const reuseWithSecret = await call(panel, { url: `/?t=${panel.token}`, secret });
  assert.equal(reuseWithSecret.status, 403);
  assert.equal(secretOf(reuseWithSecret.text), null);
  assert.equal((await call(panel, { url: '/api/state', secret })).status, 200, 'the session survives a refused reuse');
  assert.equal((await call(panel, { url: '/api/state', secret: 'f'.repeat(secret.length) })).status, 401, 'forged value');
  assert.equal((await call(panel, { url: '/api/state', secret: secret.slice(0, -1) })).status, 401, 'cut value');
  assert.equal((await call(panel, { url: '/api/state', secret: `${secret}x` })).status, 401, 'longer value');
  assert.equal((await call(panel, { url: '/api/state', headers: { 'x-panel-session': secret.toUpperCase() === secret ? secret.toLowerCase() : secret.toUpperCase() } })).status, 401, 'other case');
  assert.equal((await call(panel, { url: '/api/state', headers: { 'x-session': secret } })).status, 401, 'right value, wrong header name');
});

test('AC-63.2 ATTACK: /api/* without the session secret gives 401; static files need none; a wrong, empty, truncated or extended token gives 403', T, async (t) => {
  freshHome(t);
  const proj = panelProject(t);
  const panel = await startPanel(t, proj);
  for (const url of ['/api/state', '/api/state?range=today', '/api/openrouter-models', '/api/', '/api/nothing-here']) {
    assert.equal((await call(panel, { url })).status, 401, url);
  }
  for (const url of ['/', '/panel.js', '/panel.css', '/font/geist-latin.woff2', '/font/geist-latin-ext.woff2']) {
    const r = await call(panel, { url });
    assert.equal(r.status, 200, `${url} needs no session`);
    assert.equal(secretOf(r.text), null, `${url} holds no secret`);
  }
  for (const method of ['POST', 'DELETE']) {
    for (const url of ['/api/jobs', '/api/key', '/api/limit', '/api/refresh', '/api/close', '/api/default']) {
      const r = await call(panel, { method, url, body: {} });
      assert.equal(r.status, 401, `${method} ${url} without a session secret`);
    }
  }
  const tokens = ['', 'x', 'null', panel.token.slice(0, -1), `${panel.token}x`, 'A'.repeat(64), '..%2f..', '%00'];
  for (const bad of tokens) {
    const r = await call(panel, { url: `/?t=${bad}` });
    assert.equal(r.status, 403, JSON.stringify(bad));
    assert.equal(secretOf(r.text), null, 'no secret for a wrong token');
  }
  assert.equal(fs.existsSync(proj.models), false, 'nothing written');
});

test('AC-63.2 ATTACK: a wrong Host (DNS rebinding) is refused on every route, with a good session secret', T, async (t) => {
  freshHome(t);
  const proj = panelProject(t);
  const s = await session(t, proj);
  const p = s.panel.port;
  for (const host of ['evil.example', `localhost:${p}`, '127.0.0.1', `127.0.0.1:${p + 1}`, `127.0.0.1:${p}.evil.example`, `[::1]:${p}`, `0.0.0.0:${p}`, `127.0.0.1:${p}@evil.example`, `evil.example:${p}`]) {
    const r = await s.get('/api/state', { host });
    assert.equal(r.status, 403, `Host: ${host}`);
    assert.equal(r.text.includes('"lang"'), false, 'no state for a wrong host');
    const w = await s.post('/api/jobs', { changes: { 'code.ui': 'opus:high' } }, { host });
    assert.equal(w.status, 403, `POST Host: ${host}`);
    for (const url of ['/', '/panel.js', '/panel.css', '/font/geist-latin.woff2', '/health']) assert.equal((await s.get(url, { host })).status, 403, `${url} with Host: ${host}`);
  }
  assert.equal(fs.existsSync(proj.models), false, 'nothing written');
  assert.equal((await s.get('/api/state')).status, 200, 'control: the right Host works');
});

test('AC-63.2 ATTACK: a write needs the right Origin, a JSON content type and a body of at most 64 KB; refused writes change nothing', T, async (t) => {
  freshHome(t);
  const proj = panelProject(t);
  const s = await session(t, proj);
  const p = s.panel.port;
  const body = { changes: { 'code.ui': 'opus:high' } };
  for (const origin of [null, 'http://evil.example', `http://localhost:${p}`, `http://127.0.0.1:${p + 1}`, `https://127.0.0.1:${p}`, 'null', `http://127.0.0.1:${p}.evil.example`, '']) {
    const r = await s.post('/api/jobs', body, { origin });
    assert.equal(r.status, 403, `Origin: ${JSON.stringify(origin)}`);
    const d = await s.del('/api/catalog', { provider: 'openrouter', model: 'acme/x' }, { origin });
    assert.equal(d.status, 403, `DELETE Origin: ${JSON.stringify(origin)}`);
  }
  for (const type of [null, 'text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data; boundary=x', 'text/html', 'application/xml']) {
    const r = await s.post('/api/jobs', JSON.stringify(body), { type });
    assert.ok([403, 415].includes(r.status), `Content-Type ${JSON.stringify(type)}: ${r.status}`);
  }
  const noSecret = await call(s.panel, { method: 'POST', url: '/api/jobs', body });
  assert.equal(noSecret.status, 401, 'a good Origin without the session secret');
  const big = JSON.stringify({ changes: {}, pad: 'a'.repeat(64 * 1024 + 16) });
  assert.ok(big.length > 64 * 1024);
  for (const url of ['/api/jobs', '/api/limit']) {
    const r = await s.post(url, big);
    assert.equal(r.status, 413, `${url}: over 64 KB`);
  }
  const invalid = await s.post('/api/jobs', '{"changes":');
  assert.ok(invalid.status >= 400 && invalid.status < 500, `a body that is not JSON: ${invalid.status}`);
  assert.equal(fs.existsSync(proj.models), false, 'no refused request wrote anything');
  assert.equal(fs.existsSync(storeOf(process.env.HOME)), false);
  const ok = await s.post('/api/jobs', body);
  assert.equal(ok.status, 200, `control: a well-formed write works (${ok.text})`);
  assert.equal(proj.saved().tasks['code.ui'], 'opus:high');
});

test('AC-63.2 no response carries a CORS header; every HTML response has a strict CSP; static files come from the panel folder', T, async (t) => {
  freshHome(t);
  const proj = panelProject(t);
  const panel = await startPanel(t, proj);
  const responses = [await call(panel, { url: '/' }), await call(panel, { url: '/?t=wrong' }), await call(panel, { method: 'OPTIONS', url: '/api/jobs', headers: { origin: 'http://evil.example', 'access-control-request-method': 'POST' } })];
  const login = await call(panel, { url: `/?t=${panel.token}` });
  responses.push(login);
  const secret = secretOf(login.text);
  const get = (url, extra) => call(panel, { url, secret, ...extra });
  const page = await get('/');
  responses.push(page, await get('/api/state'), await get('/nothing'), await get('/panel.css'), await get('/panel.js'), await get('/font/geist-latin.woff2'),
    await call(panel, { method: 'POST', url: '/api/jobs', secret, body: {}, origin: 'http://evil.example' }),
    await get('/api/state', { headers: { origin: 'http://evil.example' } }));
  for (const r of responses) assert.deepEqual(Object.keys(r.headers).filter((h) => h.startsWith('access-control-')), [], `status ${r.status}`);
  // The HTML page
  assert.equal(page.status, 200, 'the panel page is served');
  assert.match(page.headers['content-type'], /text\/html/);
  const csp = page.headers['content-security-policy'];
  assert.equal(typeof csp, 'string', 'a CSP header');
  assert.match(csp, /(^|;)\s*default-src 'none'/);
  assert.doesNotMatch(csp, /unsafe-inline|unsafe-eval|\*/);
  assert.doesNotMatch(csp, /https?:/);
  for (const directive of csp.split(';').map((d) => d.trim()).filter(Boolean)) {
    const [name, ...sources] = directive.split(/\s+/);
    assert.match(name, /^[a-z-]+$/);
    for (const src of sources) assert.match(src, /^'(?:none|self|sha256-[\w+/=]+|nonce-[\w+/=-]+)'$|^data:$/, `${name}: ${src}`);
  }
  assert.match(page.text, /<!doctype html>/i, 'the page is panel.html');
  // Static files
  const css = await get('/panel.css');
  assert.equal(css.status, 200);
  assert.match(css.headers['content-type'], /text\/css/);
  assert.equal(css.text, fs.readFileSync(path.join(PANEL_DIR, 'panel.css'), 'utf8'));
  const js = await get('/panel.js');
  assert.equal(js.status, 200);
  assert.match(js.headers['content-type'], /javascript/);
  assert.equal(js.text, fs.readFileSync(path.join(PANEL_DIR, 'panel.js'), 'utf8'));
  for (const font of ['/font/geist-latin.woff2', '/font/geist-latin-ext.woff2']) {
    const r = await get(font);
    assert.equal(r.status, 200, font);
    assert.match(r.headers['content-type'], /woff2/);
    assert.equal(r.raw.subarray(0, 4).toString('latin1'), 'wOF2', `${font}: a woff2 file`);
  }
});

test('AC-63.2 ATTACK: no request path reaches the file system; anything outside the five static routes is 404', T, async (t) => {
  freshHome(t);
  const proj = panelProject(t);
  const s = await session(t, proj);
  const paths = [
    '/font/../../../../.kit.json', '/%2e%2e/%2e%2e/.kit.json', '/..%2f..%2f.kit.json', '/panel/../../settings.json', '/font/geist-latin.woff2/../../providers.mjs',
    '/.claude/hooks/providers.mjs', '/providers.mjs', '/models-panel.mjs', '/panel.html', '/GEIST-LICENSE.txt', '/font/', '/font', '/font/geist-latin', '/font/geist-latin.woff',
    '/font/..%5C..%5C.kit.json', '/..%5C..%5C.kit.json', '/%2e%2e%5c.kit.json', '//etc/passwd', '/C:/Windows/win.ini', '/%00', '/panel.js%00.png', '/api/', '/api', '/.kit.json', '/package.json',
    '/font/geist-latin.woff2%00.png', '/font/%2e%2e/panel.js/../providers.mjs',
  ];
  for (const url of paths) {
    const r = await s.get(url);
    assert.equal(r.status, 404, `${url}: ${r.status}`);
    assert.doesNotMatch(r.text, /web-saas|export const PROVIDERS|permissions|root:|\[fonts\]/, `${url}: leaked file content`);
  }
});

test('AC-63.1 a choice saved through POST /api/jobs is what models.mjs --for reads; conflict, invalid and broken answer 409 and 422', T, async (t) => {
  freshHome(t);
  const proj = panelProject(t);
  const s = await session(t, proj);
  const v0 = (await s.state()).version;
  assert.equal(typeof v0, 'string');
  let r = await s.post('/api/jobs', { changes: { 'code.ui': 'opus:xhigh', 'docs.report': 'haiku:low' }, ifVersion: v0 });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json().ok, true);
  const v1 = r.json().version;
  assert.equal(typeof v1, 'string');
  assert.notEqual(v1, v0);
  assert.equal(proj.forJob('code.ui'), 'opus:xhigh');
  assert.equal(proj.forJob('docs.report'), 'haiku:low');
  assert.equal(proj.forJob('code.feature'), 'sonnet:high', 'a job nobody touched still follows its role');
  const st = await s.state();
  assert.equal(st.version, v1);
  assert.equal(st.saved.tasks['code.ui'], 'opus:xhigh');
  // conflict
  const before = fs.readFileSync(proj.models, 'utf8');
  r = await s.post('/api/jobs', { changes: { 'code.ui': 'haiku:low' }, ifVersion: v0 });
  assert.equal(r.status, 409);
  assert.equal(r.json().ok, false);
  assert.equal(r.json().code, 'conflict');
  assert.equal(fs.readFileSync(proj.models, 'utf8'), before);
  // invalid
  r = await s.post('/api/jobs', { changes: { 'code.nope': 'opus:high' } });
  assert.equal(r.status, 422);
  assert.equal(r.json().code, 'invalid');
  assert.equal(fs.readFileSync(proj.models, 'utf8'), before);
  // role change moves followers, reset one job, clear the rest
  r = await s.post('/api/jobs', { changes: { code: 'haiku:medium', 'code.ui': null } });
  assert.equal(r.status, 200, r.text);
  assert.equal(proj.forJob('code.feature'), 'haiku:medium');
  assert.equal(proj.forJob('code.ui'), 'haiku:medium');
  r = await s.post('/api/jobs', { changes: { 'code.ui': 'opus:low', 'code.critical': 'opus:high' } });
  r = await s.post('/api/jobs', { changes: {}, clearJobsUnder: 'code' });
  assert.equal(r.status, 200, r.text);
  assert.equal(proj.forJob('code.ui'), 'haiku:medium', 'cleared');
  assert.equal(proj.forJob('docs.report'), 'haiku:low', 'another role is not cleared');
  // broken file
  write(proj.models, '{"code":');
  r = await s.post('/api/jobs', { changes: { 'code.ui': 'opus:high' } });
  assert.equal(r.status, 422);
  assert.equal(r.json().code, 'broken');
  assert.equal(fs.readFileSync(proj.models, 'utf8'), '{"code":');
  const broken = await s.state();
  assert.equal(broken.saved.broken, true, 'the page can say the file is broken');
  r = await s.post('/api/jobs', { changes: { 'code.ui': 'opus:high' }, overwriteBroken: true });
  assert.equal(r.status, 200, r.text);
  assert.equal(proj.forJob('code.ui'), 'opus:high');
});

test('AC-63.1 two writes with the same ifVersion at the same moment: one wins, one gets 409', T, async (t) => {
  freshHome(t);
  const proj = panelProject(t);
  const s = await session(t, proj);
  const v = (await s.state()).version;
  const [a, b] = await Promise.all([
    s.post('/api/jobs', { changes: { 'code.ui': 'opus:high' }, ifVersion: v }),
    s.post('/api/jobs', { changes: { 'docs.report': 'haiku:low' }, ifVersion: v }),
  ]);
  assert.deepEqual([a.status, b.status].sort(), [200, 409]);
  const tasks = proj.saved().tasks;
  assert.equal(Object.keys(tasks).length, 1, 'only the winner is saved');
});

test('AC-63.4 a main change through the panel goes to settings.local.json and keeps its other keys', T, async (t) => {
  freshHome(t);
  const others = { permissions: { allow: ['Bash(ls)'] }, enabledPlugins: { 'a@b': true } };
  const proj = panelProject(t, { files: { '.claude/settings.local.json': others } });
  const s = await session(t, proj);
  const r = await s.post('/api/jobs', { changes: { main: 'sonnet:high' } });
  assert.equal(r.status, 200, r.text);
  const local = JSON.parse(fs.readFileSync(proj.local, 'utf8'));
  assert.equal(local.model, 'sonnet');
  assert.equal(local.effortLevel, 'high');
  assert.deepEqual(local.permissions, others.permissions);
  assert.deepEqual(local.enabledPlugins, others.enabledPlugins);
  assert.equal(proj.forJob('main'), 'sonnet:high');
  const reset = await s.post('/api/jobs', { changes: { main: null } });
  assert.equal(reset.status, 200, reset.text);
  assert.deepEqual(JSON.parse(fs.readFileSync(proj.local, 'utf8')), others);
});

test('AC-63.4 ATTACK: with a broken settings.local.json the panel refuses a main change and neither file changes', T, async (t) => {
  freshHome(t);
  const proj = panelProject(t, { files: { '.claude/settings.local.json': '{"model":', '.claude/state/models.json': { code: 'haiku:low' } } });
  const s = await session(t, proj);
  const before = fs.readFileSync(proj.models, 'utf8');
  const r = await s.post('/api/jobs', { changes: { main: 'sonnet:high', code: 'opus:low' } });
  assert.equal(r.status, 422, r.text);
  assert.equal(fs.readFileSync(proj.models, 'utf8'), before);
  assert.equal(fs.readFileSync(proj.local, 'utf8'), '{"model":');
});

test('AC-63.5 with no cost file the state says why in claude.error, and the page still works', T, async (t) => {
  freshHome(t);
  const proj = panelProject(t);
  const s = await session(t, proj);
  for (const query of ['', '?range=today&scope=project', '?range=days30&scope=all']) {
    const st = await s.state(query);
    assert.equal(typeof st.claude.error, 'string', `error text for ${query}`);
    assert.match(st.claude.error, /\S/);
    assert.equal(st.claude.usd, 0);
    assert.equal(st.claude.tokens.total, 0);
  }
  assert.equal((await s.get('/')).status, 200);
  write(path.join(proj.stateDir, 'cost.json'), '{"readAt":');
  const bad = await s.state('?scope=project');
  assert.match(bad.claude.error, /\S/, 'an unreadable cost file is explained too');
  assert.equal(bad.claude.usd, 0);
  assert.equal((await s.get('/')).status, 200);
});

// One day of data for each place a range test needs it, built from the real local date
function costDaily() {
  const monday = (() => { const d = new Date(); d.setHours(12, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d; })();
  const sundayBefore = new Date(monday); sundayBefore.setDate(sundayBefore.getDate() - 1);
  const sunStr = `${sundayBefore.getFullYear()}-${pad(sundayBefore.getMonth() + 1)}-${pad(sundayBefore.getDate())}`;
  return [
    dayOf(dayStr(0), [bd(OPUS, 1.5, 100, 50, 10, 40), bd(SONNET, 0.25, 10, 5, 0, 5), bd('gpt-5', 9, 1000, 1000, 0, 0)]),
    dayOf(sunStr, [bd(OPUS, 2, 200, 100, 0, 100)]),
    dayOf(dayStr(-20), [bd(HAIKU, 0.125, 10, 10, 0, 0)]),
    dayOf(dayStr(-45), [bd(OPUS, 8, 80, 80, 0, 0)]),
  ];
}
const writeCost = (proj, name, daily, readAt = new Date(Date.now() - 3600e3).toISOString()) => { write(path.join(proj.stateDir, name), JSON.stringify({ readAt, data: { daily, totals: {} } })); return readAt; };

test('AC-63.6 GET /api/state?range= follows the range, reads cost-all.json for scope=all, and carries readAt', T, async (t) => {
  freshHome(t);
  const proj = panelProject(t);
  const readAt = writeCost(proj, 'cost.json', costDaily());
  writeCost(proj, 'cost-all.json', [dayOf(dayStr(0), [bd(OPUS, 7.5, 1, 2, 3, 4)])]);
  const s = await session(t, proj);
  const expect = { today: [1.75, 220], thisWeek: [1.75, 220], lastWeek: [2, 400], days30: [3.875, 640] };
  for (const [range, [usd, total]] of Object.entries(expect)) {
    const st = await s.state(`?range=${range}&scope=project`);
    assert.equal(st.claude.usd, usd, range);
    assert.equal(st.claude.tokens.total, total, range);
    assert.equal(st.claude.readAt, readAt);
    assert.ok([null, '', undefined].includes(st.claude.error), `${range}: no error`);
    assert.equal(Object.keys(st.claude.byModel).some((k) => /gpt/i.test(k)), false);
  }
  const today = await s.state('?range=today&scope=project');
  assert.equal(today.claude.byModel.opus.usd, 1.5);
  const all = await s.state('?range=today&scope=all');
  assert.equal(all.claude.usd, 7.5, 'scope=all reads cost-all.json');
  assert.equal((await s.state('?range=today&scope=project')).claude.usd, 1.75);
  const noAll = panelProject(t);
  const s2 = await session(t, noAll);
  const missing = await s2.state('?range=today&scope=all');
  assert.match(missing.claude.error, /\S/, 'scope=all without cost-all.json says why');
});

test('AC-63.8 if ccusage fails the panel still answers, with the last data and the reason; a good refresh then clears the reason', T, async (t) => {
  freshHome(t);
  const proj = panelProject(t);
  const readAt = writeCost(proj, 'cost.json', costDaily());
  const npx = fakeNpx(t, { mode: 'fail' });
  useFakeNpx(t, npx);
  const s = await session(t, proj);
  assert.equal((await s.state('?range=today')).claude.usd, 1.75);
  const r = await s.post('/api/refresh', { scope: 'project' });
  assert.ok([200, 202].includes(r.status), `${r.status} ${r.text}`);
  await until(async () => npx.calls().length >= 1 && (await s.state('?range=today')).refreshing === false, 'the failed refresh to end');
  assert.equal(npx.calls().length, 1, 'the fake ccusage ran, the real one did not');
  assert.match(npx.calls()[0], /--project/);
  const st = await s.state('?range=today');
  assert.equal(st.claude.usd, 1.75, 'the last data is still shown');
  assert.equal(st.claude.readAt, readAt, 'with its own time');
  assert.equal(typeof st.claude.error, 'string');
  assert.match(st.claude.error, /\S/, 'and the reason');
  assert.equal((await s.get('/')).status, 200, 'the page works');
  // A good refresh
  const fresh = [dayOf(dayStr(0), [bd(OPUS, 3, 1, 1, 1, 1)])];
  npx.setOutput(fresh);
  npx.setMode('ok');
  await s.post('/api/refresh', { scope: 'project' });
  await until(async () => npx.calls().length >= 2 && (await s.state('?range=today')).refreshing === false, 'the good refresh to end');
  const good = await s.state('?range=today');
  assert.equal(good.claude.usd, 3);
  assert.ok([null, '', undefined].includes(good.claude.error), 'the reason is gone');
  assert.notEqual(good.claude.readAt, readAt);
});

test('AC-63.8 a refresh runs in the background: the panel answers while it runs, and scope=all uses no --project', T, async (t) => {
  freshHome(t);
  const proj = panelProject(t);
  const npx = fakeNpx(t, { mode: 'slow', daily: [dayOf(dayStr(0), [bd(OPUS, 7.5, 1, 2, 3, 4)])] });
  useFakeNpx(t, npx);
  const s = await session(t, proj);
  const r = await s.post('/api/refresh', { scope: 'all' });
  assert.ok([200, 202].includes(r.status), `${r.status} ${r.text}`);
  const during = await s.state('?range=today&scope=all');
  assert.equal(during.refreshing, true, 'refreshing while ccusage runs');
  assert.equal((await s.get('/')).status, 200);
  await until(async () => (await s.state('?scope=all')).refreshing === false, 'the refresh to end');
  assert.equal(npx.calls().length, 1);
  assert.doesNotMatch(npx.calls()[0], /--project/);
  assert.equal(fs.existsSync(path.join(proj.stateDir, 'cost-all.json')), true);
  assert.equal((await s.state('?range=today&scope=all')).claude.usd, 7.5);
});

test('AC-63.8 ATTACK: /api/refresh with an unknown scope runs nothing', T, async (t) => {
  freshHome(t);
  const proj = panelProject(t);
  const npx = fakeNpx(t, { mode: 'ok' });
  useFakeNpx(t, npx);
  const s = await session(t, proj);
  for (const scope of ['everything', '--project x', '; echo hi', '../..', '', 5, null, ['all']]) {
    const r = await s.post('/api/refresh', { scope });
    assert.ok(r.status >= 400 && r.status < 500, `${JSON.stringify(scope)}: ${r.status}`);
  }
  await wait(300);
  assert.deepEqual(npx.calls(), [], 'ccusage was never started');
});

test('AC-63.7 there is no field that combines Claude and external USD, and the strings label Claude USD as API equivalent', T, async (t) => {
  const home = freshHome(t);
  const { addModelSpend } = await load('providers.mjs');
  const proj = panelProject(t);
  writeCost(proj, 'cost.json', costDaily());
  addModelSpend('openrouter/acme/x', { usd: 0.1875, input: 100, output: 50, seconds: 3 }, dayStr(0), storeOf(home));
  // The same spend as a role-runs line, so it shows whichever of the two sources a scope reads
  write(path.join(proj.stateDir, 'role-runs.jsonl'), JSON.stringify({ date: new Date().toISOString(), job: 'code.ui', role: 'code', provider: 'openrouter', model: 'acme/x', seconds: 3, usd: 0.1875, priceKnown: true, exit: 0, input: 100, output: 50 }) + '\n');
  const s = await session(t, proj);
  const st = await s.state('?range=today&scope=project');
  close(st.claude.usd, 1.75);
  close(st.external.usd, 0.1875, 'external total');
  close((await s.state('?range=today&scope=all')).external.usd, 0.1875, 'external total, all projects');
  assert.deepEqual(Object.keys(st.external).sort(), ['models', 'usd']);
  const numbers = [];
  const keys = [];
  const visit = (v) => { if (typeof v === 'number') numbers.push(v); else if (Array.isArray(v)) v.forEach(visit); else if (v && typeof v === 'object') for (const [k, x] of Object.entries(v)) { keys.push(k); visit(x); } };
  visit(st);
  assert.equal(numbers.some((n) => Math.abs(n - 1.9375) < 1e-6), false, 'no number is Claude + external');
  assert.equal(keys.some((k) => /combined|grand|overall|everything/i.test(k)), false, keys.filter((k) => /combined|grand|overall/i.test(k)).join());
  assert.equal(JSON.stringify(st).includes('1.9375'), false);
  assert.ok(Object.values(st.strings).some((x) => /API equivalent/i.test(x)), 'the Claude USD label says API equivalent');
  const tr = panelProject(t, { lang: 'tr' });
  const s2 = await session(t, tr);
  assert.ok(Object.values((await s2.state()).strings).some((x) => /API karşılığı/i.test(x)), 'and in Turkish');
});

test('AC-63.1 the state carries the pieces the page needs: lang, locale, version, saved, jobs, recommended, main, overrides, providers, catalog, limits, external, refreshing', T, async (t) => {
  const home = freshHome(t);
  const models = await load('models.mjs');
  const { setLimit, addSpend, addCatalog, setProvider } = await load('providers.mjs');
  await installVault(t);
  const proj = panelProject(t, { files: { '.claude/state/models.json': { code: 'haiku:low', tasks: { 'code.ui': 'opus:high' } } } });
  withEnv(t, { ANTHROPIC_MODEL: 'override-marker-model', CLAUDE_CODE_SUBAGENT_MODEL: 'override-marker-sub' });
  const file = storeOf(home);
  setLimit('openrouter', 5, file);
  addSpend('openrouter', 0.5, dayStr(0), file);
  assert.ok([null, undefined].includes(addCatalog('openrouter', { model: 'acme/priced-1', input: 2, output: 4, context: 32000 }, file)));
  write(path.join(proj.stateDir, 'usage.json'), JSON.stringify({ readAt: Date.now(), five_hour: { percent: 26, resetsAt: futureEpoch(3600) }, seven_day: { percent: 39, resetsAt: futureEpoch(86400) } }));
  const s = await session(t, proj);
  const st = await s.state();
  assert.equal(st.lang, 'en');
  assert.equal(st.locale, 'en');
  assert.equal(st.version, models.modelsVersion(proj.models));
  assert.equal(st.saved.code, 'haiku:low');
  assert.equal(st.saved.tasks['code.ui'], 'opus:high');
  const jobsText = JSON.stringify(st.jobs);
  for (const name of [...Object.keys(models.ROLES), ...Object.keys(models.JOBS)]) assert.ok(jobsText.includes(JSON.stringify(name)), `jobs lists ${name}`);
  for (const rec of ['opus:high', 'sonnet:high', 'haiku:high', 'haiku:low']) assert.ok(JSON.stringify(st.recommended).includes(rec), `recommended holds ${rec}`);
  assert.ok(Object.hasOwn(st, 'main'));
  assert.deepEqual([...st.overrides].sort(), ['ANTHROPIC_MODEL', 'CLAUDE_CODE_SUBAGENT_MODEL'], 'names of the set variables');
  assert.equal(JSON.stringify(st).includes('override-marker'), false, 'names only, never the values');
  // 3.64.0: no ready-made providers. The list holds the names the user has used (a key, a catalog entry or a limit), and nothing else.
  assert.deepEqual(Object.keys(st.providers), ['openrouter'], 'only the name that has a limit and a catalog entry');
  assert.deepEqual(Object.keys(st.choices).sort(), ['efforts', 'links', 'models'], 'no externalRoles: any job may take an outside model');
  assert.equal(st.providers.openrouter.limit, 5);
  assert.equal(st.providers.openrouter.keyInfo.present, false);
  assert.ok(JSON.stringify(st.providers.openrouter).includes('0.5'), "today's spend");
  assert.ok(JSON.stringify(st.catalog).includes('acme/priced-1'));
  assert.equal(st.limits.five_hour.percent, 26);
  assert.equal(st.limits.seven_day.percent, 39);
  assert.equal(typeof st.limits.ageMin, 'number');
  assert.equal(st.refreshing, false);
  assert.equal(st.saved.broken, undefined);
  // A provider with a key shows what the store holds: the date and the host, never the key or its last four
  const v = await installVault(t);
  assert.equal(setProvider('acme', 'https://api.acme.test/anthropic', OR_KEY, file), null);
  v.calls.read = 0;
  const after = await s.state();
  assert.deepEqual(Object.keys(after.providers).sort(), ['acme', 'openrouter']);
  assert.deepEqual(Object.keys(after.providers.acme.keyInfo).sort(), ['addedAt', 'host', 'present']);
  assert.equal(after.providers.acme.keyInfo.present, true);
  assert.equal(after.providers.acme.keyInfo.host, 'api.acme.test');
  assert.equal(JSON.stringify(after).includes(OR_KEY), false);
  assert.equal(JSON.stringify(after).includes(OR_KEY.slice(-4)), false, 'not even the last four');
  assert.equal(v.calls.read, 0, 'GET /api/state does not open the vault');
});

test('AC-64.5 ATTACK: the panel has no key, key check or provider list route: a session secret cannot write, check, remove or read a key', T, async (t) => {
  const home = freshHome(t);
  const { setProvider } = await load('providers.mjs');
  const v = await installVault(t);
  const out = capture(t);
  const proj = panelProject(t);
  assert.equal(setProvider('openrouter', OR_URL, OR_KEY, storeOf(home)), null, 'the key is in the vault, as --set-key leaves it');
  const sealed = v.store.get('openrouter');
  const before = fs.readFileSync(storeOf(home), 'utf8');
  v.calls.read = v.calls.save = v.calls.remove = 0;
  const s = await session(t, proj);
  const seen = [];
  for (const [method, url, body] of [
    ['POST', '/api/key', { provider: 'openrouter', key: OR_KEY_2 }], ['POST', '/api/key', { provider: 'openrouter', url: 'https://evil.example', key: OR_KEY_2 }], ['POST', '/api/key/check', { provider: 'openrouter' }],
    ['DELETE', '/api/key', { provider: 'openrouter' }], ['GET', '/api/key'], ['GET', '/api/openrouter-models'], ['GET', '/api/providers'], ['GET', '/api/keys'],
  ]) {
    const r = method === 'GET' ? await s.get(url) : method === 'POST' ? await s.post(url, body) : await s.del(url, body);
    assert.equal(r.status, 404, `${method} ${url}`);
    seen.push(r);
  }
  // Everything the page can ask for, with the key in the vault
  for (const url of ['/api/state', '/api/state?range=days30&scope=all', '/', '/panel.js', '/panel.css']) seen.push(await s.get(url));
  for (const r of seen) {
    for (const secret of [OR_KEY, OR_KEY_2, OR_KEY.slice(-4), sealed]) {
      assert.equal(r.text.includes(secret), false, `a response (status ${r.status}) holds ${secret.length === 4 ? 'the last four' : 'a key'}`);
      assert.equal(JSON.stringify(r.headers).includes(secret), false);
    }
  }
  assert.deepEqual(v.calls, { save: 0, read: 0, remove: 0 }, 'the panel never opened the vault');
  assert.equal(v.store.get('openrouter'), sealed, 'and the key is as it was');
  assert.equal(fs.readFileSync(storeOf(home), 'utf8'), before, 'the store is as it was');
  const page = fs.readFileSync(path.join(PANEL_DIR, 'panel.js'), 'utf8');
  assert.doesNotMatch(page, /\/api\/key|openrouter-models/, 'the page does not call a route that is gone');
  await s.panel.close();
  assert.equal(out().includes(OR_KEY), false, 'stdout or stderr holds the key');
  const panelJson = path.join(proj.stateDir, 'panel.json');
  if (fs.existsSync(panelJson)) {
    const text = fs.readFileSync(panelJson, 'utf8');
    assert.equal(text.includes(OR_KEY), false);
    assert.equal(text.includes(s.panel.token), false, 'panel.json holds no token');
  }
  assert.deepEqual(holders([proj.root, home], OR_KEY), [], 'no file holds the key');
  assert.deepEqual(holders([proj.root, home], s.panel.token), [], 'no file holds the token');
  assert.deepEqual(holders([proj.root, home], s.secret), [], 'no file holds the session secret');
  assert.equal(out().includes(s.secret), false, 'no output holds the session secret');
});

test('AC-63.1 POST /api/limit sets the daily limit; a bad amount is refused and the old limit stays', T, async (t) => {
  const home = freshHome(t);
  const proj = panelProject(t);
  const s = await session(t, proj);
  assert.equal((await s.post('/api/limit', { provider: 'openrouter', usd: 2.5 })).status, 200);
  assert.equal((await s.state()).providers.openrouter.limit, 2.5);
  // 3.64.0: any well-formed name takes a limit; a malformed one is refused
  for (const body of [{ provider: 'openrouter', usd: 0 }, { provider: 'openrouter', usd: -1 }, { provider: 'openrouter', usd: 'abc' }, { provider: 'openrouter', usd: null }, { provider: 'openrouter', usd: 1e999 }, { provider: 'Evil', usd: 1 }, { provider: '__proto__', usd: 1 }, { provider: 'con', usd: 1 }, { provider: '../x', usd: 1 }, { usd: 1 }, {}]) {
    const r = await s.post('/api/limit', body);
    assert.ok(r.status >= 400 && r.status < 500, `${JSON.stringify(body)}: ${r.status}`);
  }
  assert.equal((await s.state()).providers.openrouter.limit, 2.5, 'the old limit stays');
  assert.equal(JSON.parse(fs.readFileSync(storeOf(home), 'utf8')).limits.openrouter, 2.5);
});

test('AC-63.9 POST /api/default saves the project choice as the global default', T, async (t) => {
  const home = freshHome(t);
  const { readDefaults } = await load('models.mjs');
  const proj = panelProject(t, { files: { '.claude/state/models.json': { code: 'haiku:low', tasks: { 'code.ui': 'opus:high' } } } });
  const s = await session(t, proj);
  const r = await s.post('/api/default', {});
  assert.equal(r.status, 200, r.text);
  assert.equal(fs.existsSync(path.join(home, '.vibe-kit', 'models-default.json')), true);
  assert.equal(readDefaults().code, 'haiku:low');
  assert.equal(readDefaults().tasks['code.ui'], 'opus:high');
});

test('AC-63.16 strings: every panel.* text, in the project language, and locale; en is built in', T, async (t) => {
  freshHome(t);
  const { MESSAGES } = await load('messages.mjs');
  const panelKeys = Object.keys(MESSAGES).filter((k) => k.startsWith('panel.')).sort();
  assert.ok(panelKeys.length >= 20, `the panel has its texts in messages.mjs (${panelKeys.length})`);
  const s = await session(t, panelProject(t));
  const st = await s.state();
  assert.equal(st.lang, 'en');
  assert.equal(st.locale, 'en');
  assert.deepEqual(Object.keys(st.strings).sort(), panelKeys, 'all panel.* texts and nothing else');
  for (const k of panelKeys) assert.equal(st.strings[k], MESSAGES[k].en, k);
});

test('AC-63.16 strings in Turkish come from the shipped tr.json, and locale is Turkish', T, async (t) => {
  freshHome(t);
  const { MESSAGES } = await load('messages.mjs');
  const tr = JSON.parse(read('.claude/i18n/tr.json'));
  const panelKeys = Object.keys(MESSAGES).filter((k) => k.startsWith('panel.')).sort();
  assert.ok(panelKeys.length >= 20);
  const s = await session(t, panelProject(t, { lang: 'tr' }));
  const st = await s.state();
  assert.equal(st.lang, 'tr');
  assert.match(st.locale, /^tr(-|$)/);
  assert.deepEqual(Object.keys(st.strings).sort(), panelKeys);
  for (const k of panelKeys) assert.equal(st.strings[k], tr[k], k);
  const same = panelKeys.filter((k) => tr[k] === MESSAGES[k].en);
  assert.ok(same.length <= panelKeys.length * 0.3, `translated, not copied (${same.length} of ${panelKeys.length} are the English text)`);
  assert.ok(Object.values(st.strings).some((x) => /[çğıöşüÇĞİÖŞÜ]/.test(x)), 'Turkish letters, including the dotted and dotless i');
});

test('AC-63.16 an unknown language falls back to English per key; a language with a partial file mixes the two', T, async (t) => {
  freshHome(t);
  const { MESSAGES } = await load('messages.mjs');
  const panelKeys = Object.keys(MESSAGES).filter((k) => k.startsWith('panel.')).sort();
  const plain = panelKeys.filter((k) => !/\{\w+\}|\n/.test(MESSAGES[k].en));
  assert.ok(plain.length >= 2, 'texts with no placeholder exist');
  const de = await session(t, panelProject(t, { lang: 'de' }));
  const deState = await de.state();
  assert.equal(deState.lang, 'de');
  assert.match(deState.locale, /^de(-|$)/);
  for (const k of panelKeys) assert.equal(deState.strings[k], MESSAGES[k].en, `de has no file: ${k} is English`);
  const [first, second] = plain;
  const xx = await session(t, panelProject(t, { lang: 'xx', files: { '.claude/i18n/xx.json': { [first]: 'ZZZ translated' } } }));
  const xxState = await xx.state();
  assert.equal(xxState.strings[first], 'ZZZ translated');
  assert.equal(xxState.strings[second], MESSAGES[second].en, 'every other key is English');
  assert.deepEqual(Object.keys(xxState.strings).sort(), panelKeys);
});

test('AC-63.16 tr.json is complete for the panel: every panel.* key has a Turkish text with the same placeholders', T, async () => {
  const { MESSAGES } = await load('messages.mjs');
  const { translationIssue } = await load('lang.mjs');
  const tr = JSON.parse(read('.claude/i18n/tr.json'));
  const panelKeys = Object.keys(MESSAGES).filter((k) => k.startsWith('panel.'));
  assert.ok(panelKeys.length >= 20);
  assert.deepEqual(panelKeys.filter((k) => typeof tr[k] !== 'string' || tr[k].trim() === ''), [], 'missing in tr.json');
  assert.deepEqual(panelKeys.filter((k) => translationIssue(tr[k], MESSAGES[k].en) !== null), [], 'a translation that lang.mjs would refuse');
});

test('AC-63.16 every job and every role has a label key in messages.mjs and in tr.json', T, async () => {
  const { MESSAGES } = await load('messages.mjs');
  const { JOBS, ROLES } = await load('models.mjs');
  const tr = JSON.parse(read('.claude/i18n/tr.json'));
  // panel.<group>.<name>: the name is the job or role, so the key has exactly one group segment between "panel." and the name
  const keyFor = (name) => Object.keys(MESSAGES).find((k) => k.startsWith('panel.') && k.endsWith(`.${name}`) && k.split('.').length === 2 + name.split('.').length);
  const names = [...Object.keys(ROLES), ...Object.keys(JOBS)];
  assert.deepEqual(names.filter((n) => !keyFor(n)), [], 'no label key');
  const labels = names.map((n) => MESSAGES[keyFor(n)].en);
  assert.equal(new Set(labels).size, labels.length, 'each label is different');
  assert.deepEqual(names.filter((n) => typeof tr[keyFor(n)] !== 'string'), [], 'no Turkish label');
});

test('AC-63.2 idle: after idleMs the panel closes itself and removes panel.json; POST /api/close does the same at once', T, async (t) => {
  freshHome(t);
  const proj = panelProject(t);
  const panelJson = path.join(proj.stateDir, 'panel.json');
  const idle = await startPanel(t, proj, { idleMs: 300 });
  if (fs.existsSync(panelJson)) {
    const rec = JSON.parse(fs.readFileSync(panelJson, 'utf8'));
    assert.equal(rec.port, idle.port);
    assert.equal(JSON.stringify(rec).includes(idle.token), false, 'panel.json holds no token');
  }
  assert.equal(await isOpen(idle.port), true);
  await until(async () => !(await isOpen(idle.port)), 'the idle panel to close', 8000);
  assert.equal(fs.existsSync(panelJson), false, 'panel.json is removed');
  const s = await session(t, proj);
  const r = await s.post('/api/close', {});
  assert.equal(r.status, 200, r.text);
  await until(async () => !(await isOpen(s.panel.port)), 'the panel to close', 8000);
  assert.equal(fs.existsSync(panelJson), false);
});

// ============================================================================================
// Panel files, guard, commands and docs (AC-63.18 .. AC-63.20)
// ============================================================================================

test('AC-63.18 panel files exist, hold no http:// or https:// resource (SVG namespace aside), and the Geist license ships beside the fonts', T, () => {
  const NS = 'http://www.w3.org/2000/svg';
  for (const f of ['panel.html', 'panel.css', 'panel.js']) assert.equal(fs.existsSync(path.join(PANEL_DIR, f)), true, `${f} exists`);
  for (const f of ['panel.html', 'panel.css', 'panel.js']) {
    const text = fs.readFileSync(path.join(PANEL_DIR, f), 'utf8');
    const stripped = text.replaceAll(NS, '');
    assert.doesNotMatch(stripped, /https?:\/\//i, `${f}: an outside address`);
    assert.doesNotMatch(stripped, /\b(?:src|href|action)\s*=\s*["']?\/\//i, `${f}: a protocol-relative address`);
    assert.doesNotMatch(stripped, /@import|\bimportScripts\b/, `${f}: an import`);
  }
  const css = fs.readFileSync(path.join(PANEL_DIR, 'panel.css'), 'utf8');
  for (const [, url] of css.matchAll(/url\(\s*([^)]*?)\s*\)/g)) assert.match(url.replace(/^["']|["']$/g, ''), /^(?:\/font\/[\w.-]+\.woff2|#[\w-]+|data:)/, `css url(${url})`);
  assert.equal(fs.existsSync(path.join(PANEL_DIR, 'GEIST-LICENSE.txt')), true, 'the license ships with the fonts');
  assert.match(fs.readFileSync(path.join(PANEL_DIR, 'GEIST-LICENSE.txt'), 'utf8'), /SIL Open Font License/i);
  assert.ok(fs.readdirSync(PANEL_DIR).filter((f) => f.endsWith('.woff2')).length >= 2, 'the two font files');
});

test('AC-63.18 panel.html holds no user-visible text of its own, no inline script or style, and no event attributes', T, () => {
  const html = fs.readFileSync(path.join(PANEL_DIR, 'panel.html'), 'utf8');
  assert.doesNotMatch(html, /<script\b(?![^>]*\bsrc\s*=)/i, 'an inline script');
  assert.doesNotMatch(html, /<style\b/i, 'an inline style block');
  assert.doesNotMatch(html, /\sstyle\s*=/i, 'an inline style attribute');
  assert.doesNotMatch(html, /\son[a-z]+\s*=/i, 'an event attribute');
  const body = html.replace(/<!--[\s\S]*?-->/g, '').replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '');
  const text = body.replace(/<[^>]*>/g, '').replace(/&nbsp;|&#160;/g, '');
  assert.equal(text.replace(/\s+/g, ''), '', 'text between tags (the <title> too): it comes from strings');
  for (const [, name, value] of html.matchAll(/\b(title|alt|aria-label|aria-description|placeholder|value)\s*=\s*"([^"]*)"/gi))
    assert.match(value, /^$|^panel\.[\w.-]+$/, `${name}="${value}" is visible text`);
});

test('AC-63.19 the destructive guard asks on secret-tool lookup, security find-generic-password and anything holding Unprotect', T, async () => {
  const { evaluate } = await load('destructive-guard.mjs');
  const asked = [
    'secret-tool lookup service vibe-kit provider openrouter',
    'security find-generic-password -s vibe-kit -a openrouter -w',
    'powershell -NoProfile -Command "[System.Security.Cryptography.ProtectedData]::Unprotect($bytes, $null, \'CurrentUser\')"',
    'pwsh -c "Add-Type -AssemblyName System.Security; [Security.Cryptography.ProtectedData]::Unprotect($b, $null, 0)"',
    'node -e "require(\'child_process\').execSync(\'secret-tool lookup a b\')"',
    'echo Unprotect',
  ];
  const tricks = [
    '/usr/bin/secret-tool lookup service vibe-kit', 'secret-tool   lookup service vibe-kit', 'secret-tool "lookup" service vibe-kit', 'secret"-tool" lookup x y', 'cd /tmp && secret-tool lookup a b', 'env secret-tool lookup a b', 'bash -c "secret-tool lookup a b"',
    'sec""urity find-generic-password -w', '/usr/bin/security find-generic-password -w -s x', 'security  find-generic-password -w', 'SECURITY find-generic-password -w', 'security find-generic-password',
    'powershell -c "[...]::UNPROTECT($x)"', 'powershell -c "[...]::Un\'\'protect($x)"',
  ];
  const free = ['git status', 'node --version', 'security find-identity -v -p codesigning', 'git commit -m "feat: add the panel"'];
  for (const ctx of [{}, { tool: 'claude', agent: '' }, { tool: 'claude', agent: 'test-writer' }]) {
    assert.deepEqual(asked.filter((c) => evaluate(c, ctx)?.decision !== 'ask'), [], `asked (${JSON.stringify(ctx)})`);
    assert.deepEqual(tricks.filter((c) => !['ask', 'deny'].includes(evaluate(c, ctx)?.decision)), [], `tricky spellings (${JSON.stringify(ctx)})`);
    assert.deepEqual(free.filter((c) => evaluate(c, ctx) !== null), [], `free (${JSON.stringify(ctx)})`);
  }
});

const stepBlock = (text, re) => {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => re.test(l));
  if (start < 0) return '';
  let end = start + 1;
  while (end < lines.length && !/^\d+[a-z]?\.\s/.test(lines[end])) end++;
  return lines.slice(start, end).join('\n');
};

test('AC-63.20 start.md step 0e asks one question: start with the recommended setup, or open the panel; a saved default comes first; no model is saved by --set', T, () => {
  const step = stepBlock(read('.claude/commands/start.md'), /^0e\./);
  assert.notEqual(step, '', 'step 0e is still there');
  assert.match(step, /AskUserQuestion/);
  assert.match(step, /models-panel\.mjs/);
  assert.match(step, /recommended/i);
  assert.match(step, /default/i, 'the saved global default');
  assert.doesNotMatch(step, /screens?\b/i, 'not the old two screens');
  assert.doesNotMatch(step, /models\.mjs --set/);
  assert.equal((step.match(/AskUserQuestion/g) ?? []).length, 1, 'one question');
  const adopt = read('.claude/commands/adopt.md');
  assert.match(adopt, /0e/, '/adopt applies the same step');
  assert.doesNotMatch(adopt, /two screens|models\.mjs --set/i);
});

test('AC-63.20 /build step 0b and /release step 0 still ask nothing about models and never offer the panel as a question', T, () => {
  const build = stepBlock(read('.claude/commands/build.md'), /^0b\./);
  const release = stepBlock(read('.claude/commands/release.md'), /^0\./);
  assert.notEqual(build, '');
  for (const [name, step] of [['build 0b', build], ['release 0', release]]) {
    if (step === '') continue;
    assert.doesNotMatch(step, /AskUserQuestion/, name);
    assert.doesNotMatch(step, /\bask\b/i, name);
    assert.doesNotMatch(step, /models-panel/, name);
    assert.doesNotMatch(step, /screens?\b/i, name);
  }
});

test('AC-63.20 /models opens the panel, records the limit first on desktop, and keeps the chat path for SSH and cloud', T, () => {
  const text = read('.claude/commands/models.md');
  assert.match(text, /node \.claude\/hooks\/models-panel\.mjs/);
  assert.match(text, /usage\.mjs --record/);
  assert.match(text, /desktop/i);
  assert.match(text, /SSH/);
  assert.match(text, /cloud/i);
  assert.match(text, /models\.mjs --show/, 'the chat path stays');
  assert.match(text, /models\.mjs --set/, 'the chat path stays');
});

test('AC-63.20 the dashboard shows the panel command', T, async (t) => {
  const root = tmpDir(t, 'mp-dash-');
  const home = tmpDir(t, 'mp-dash-home-');
  write(path.join(root, '.kit.json'), JSON.stringify({ type: 'web-saas', lang: 'en' }));
  const r = spawnSync(process.execPath, [path.join(HOOKS, 'dashboard.mjs'), root], { cwd: root, encoding: 'utf8', timeout: 90000, env: { ...cleanEnv(), HOME: home, USERPROFILE: home, CLAUDE_PROJECT_DIR: root } });
  assert.equal(r.status, 0, r.stderr);
  const html = fs.readFileSync(path.join(root, 'dashboard.html'), 'utf8');
  assert.ok(html.includes('node .claude/hooks/models-panel.mjs'), 'the command is on the page');
});

test('AC-63.20 settings.json allows models-panel.mjs and usage.mjs --record, and does not allow reading ~/.vibe-kit', T, async () => {
  const { evaluate } = await load('destructive-guard.mjs');
  const { allow, deny } = JSON.parse(read('.claude/settings.json')).permissions;
  const covers = (rule, cmd) => {
    const m = rule.match(/^Bash\((.*)\)$/);
    if (!m) return rule === 'Bash';
    const src = m[1].replace(/:\*$/, '*').replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    return new RegExp(`^${src}$`).test(cmd);
  };
  assert.ok(allow.some((r) => covers(r, 'node .claude/hooks/models-panel.mjs')), 'models-panel.mjs is allowed');
  assert.ok(allow.some((r) => covers(r, 'node .claude/hooks/usage.mjs --record 26 1893456000 39 1893888000')), 'usage.mjs --record is allowed');
  assert.deepEqual(allow.filter((r) => /vibe-kit/.test(r)), [], 'no allow rule names ~/.vibe-kit');
  // The rule "models.mjs --set:*" stays, and reads like a prefix, so --set-key is held back by the guard, not by the allow list
  for (const cmd of ['cat ~/.vibe-kit/providers.json', 'node .claude/hooks/run-role.mjs code p.md', 'secret-tool lookup a b'])
    assert.equal(allow.some((r) => covers(r, cmd)), false, `not allowed: ${cmd}`);
  for (const ctx of [{}, { tool: 'claude', agent: '' }, { tool: 'claude', agent: 'test-writer' }]) {
    assert.equal(evaluate('node .claude/hooks/models.mjs --set-key openrouter', ctx)?.decision, 'ask', `--set-key is asked (${JSON.stringify(ctx)})`);
    assert.equal(evaluate('node .claude/hooks/models.mjs --set-limit openrouter 5', ctx)?.decision, 'ask');
  }
  assert.ok(deny.includes('Read(~/.vibe-kit/**)'), 'reading ~/.vibe-kit stays denied');
  assert.ok(deny.includes('Edit(~/.vibe-kit/**)'));
});

// ============================================================================================
// Security changes after the audit (AC-63.21 .. AC-63.26): no cookie, a per-tab session secret, prices, spend, confirm, guard
// ============================================================================================

test('AC-63.21 ATTACK: no response sets a cookie, and /api/* with a cookie but no x-panel-session is 401', T, async (t) => {
  freshHome(t);
  const proj = panelProject(t);
  const panel = await startPanel(t, proj);
  const login = await call(panel, { url: `/?t=${panel.token}` });
  const secret = secretOf(login.text);
  assert.ok(secret, 'control: the token page was served with a secret');
  const seen = [login, await call(panel, { url: `/?t=${panel.token}` }), await call(panel, { url: '/?t=wrong' }), await call(panel, { url: '/' }), await call(panel, { url: '/panel.js' }), await call(panel, { url: '/panel.css' }),
    await call(panel, { url: '/font/geist-latin.woff2' }), await call(panel, { url: '/api/state' }), await call(panel, { url: '/api/state', secret }), await call(panel, { url: '/nothing' }), await call(panel, { url: '/health' }),
    await call(panel, { method: 'POST', url: '/api/jobs', secret, body: { changes: { 'code.ui': 'opus:high' } } }),
    await call(panel, { method: 'POST', url: '/api/jobs', secret, body: {}, origin: 'http://evil.example' }),
    await call(panel, { method: 'POST', url: '/api/jobs', body: {} })];
  for (const r of seen) assert.equal(r.headers['set-cookie'], undefined, `a cookie on status ${r.status}`);
  // The authorised write above did land; from here on only refused requests follow, and none of them may change it
  assert.equal(JSON.parse(fs.readFileSync(proj.models, 'utf8')).tasks['code.ui'], 'opus:high', 'control: the authorised write was saved');
  const afterAuthorised = fs.readFileSync(proj.models, 'utf8');
  // A cookie is not a credential, whatever its name or value
  const cookie = `panel-session=${secret}; session=${secret}; sid=${secret}; x-panel-session=${secret}`;
  for (const url of ['/api/state', '/api/openrouter-models']) assert.equal((await call(panel, { url, headers: { cookie } })).status, 401, `${url} with a cookie`);
  for (const [method, url] of [['POST', '/api/jobs'], ['POST', '/api/key'], ['POST', '/api/limit'], ['DELETE', '/api/key'], ['POST', '/api/close']]) assert.equal((await call(panel, { method, url, body: {}, headers: { cookie } })).status, 401, `${method} ${url} with a cookie`);
  // The secret only counts in the x-panel-session header
  assert.equal((await call(panel, { url: `/api/state?x-panel-session=${secret}` })).status, 401, 'query string');
  assert.equal((await call(panel, { url: '/api/state', headers: { authorization: `Bearer ${secret}` } })).status, 401, 'Authorization header');
  assert.equal((await call(panel, { url: '/api/state', secret: '' })).status, 401, 'empty header');
  assert.equal((await call(panel, { url: '/api/state', secret })).status, 200, 'control: the header works');
  assert.equal(fs.readFileSync(proj.models, 'utf8'), afterAuthorised, 'nothing written by a refused request');
});

test('AC-63.21 ATTACK: / after login holds no secret; the token page holds it once, in the panel-session meta; the secret is in no other response', T, async (t) => {
  freshHome(t);
  const proj = panelProject(t);
  const s = await session(t, proj);
  assert.equal(s.login.text.split(s.secret).length - 1, 1, 'the secret appears exactly once on the token page');
  assert.equal((s.login.text.match(/name\s*=\s*["']panel-session["']/gi) ?? []).length, 1, 'one meta tag');
  for (const url of ['/', '/?t=wrong', `/?t=${s.panel.token}`, '/panel.js', '/panel.css', '/health']) {
    const r = await s.get(url);
    assert.equal(r.text.includes(s.secret), false, `${url} must not hold the secret`);
    assert.equal(secretOf(r.text), null, url);
  }
  assert.equal(JSON.stringify(await s.state()).includes(s.secret), false, 'the state does not repeat it');
  const other = await session(t, proj);
  assert.notEqual(other.secret, s.secret, 'each panel has its own secret');
  assert.notEqual(other.panel.token, s.panel.token);
  assert.equal((await call(other.panel, { url: '/api/state', secret: s.secret })).status, 401, 'the secret of another panel opens nothing');
});

test('AC-63.21 GET /health answers { app, pid, root } only, with a Host check and no session (AC-63.27 added app and root)', T, async (t) => {
  freshHome(t);
  const proj = panelProject(t);
  const s = await session(t, proj);
  const r = await call(s.panel, { url: '/health' });
  assert.equal(r.status, 200);
  assert.match(r.headers['content-type'], /json/);
  assert.deepEqual(Object.keys(r.json()).sort(), ['app', 'pid', 'root']);
  assert.equal(r.json().app, 'vibe-panel');
  assert.equal(r.json().root, proj.root);
  assert.equal(r.json().pid, process.pid);
  assert.equal((await call(s.panel, { url: '/health', host: 'evil.example' })).status, 403);
  assert.equal((await call(s.panel, { url: '/health', host: `localhost:${s.panel.port}` })).status, 403);
});

test('AC-63.22 validPrice: finite, 0 to 1000 USD per million, and 0 for both only on a model id ending in :free', T, async () => {
  const { validPrice } = await load('providers.mjs');
  assert.equal(typeof validPrice, 'function', 'validPrice is exported');
  for (const [price, model] of [[{ input: 2, output: 4 }, 'a/b'], [{ input: 0, output: 1 }, 'a/b'], [{ input: 1, output: 0 }, 'a/b'], [{ input: 1000, output: 1000 }, 'a/b'], [{ input: 0, output: 0 }, 'a/b:free'], [{ input: 0.15, output: 0.6 }, 'a/b:free'], [{ input: 0.001, output: 0.001 }, 'a/b']])
    assert.equal(validPrice(price, model), true, `${JSON.stringify(price)} ${model}`);
  const bad = [
    [{ input: 0, output: 0 }, 'a/b'], [{ input: 0, output: 0 }, 'a/free'], [{ input: 0, output: 0 }, 'a/b:free2'], [{ input: 0, output: 0 }, 'a/b:free:high'], [{ input: 0, output: 0 }, ''], [{ input: 0, output: 0 }, undefined],
    [{ input: -1, output: 1 }, 'a/b'], [{ input: 1, output: -0.01 }, 'a/b'], [{ input: -0.0001, output: 0 }, 'a/b:free'], [{ input: 1.7e308, output: 1 }, 'a/b'], [{ input: 1, output: 1.7e308 }, 'a/b'],
    [{ input: 1000.01, output: 1 }, 'a/b'], [{ input: 1, output: 1001 }, 'a/b'], [{ input: NaN, output: 1 }, 'a/b'], [{ input: 1, output: NaN }, 'a/b'], [{ input: Infinity, output: 1 }, 'a/b'], [{ input: 1, output: -Infinity }, 'a/b'],
    [{ input: '2', output: '4' }, 'a/b'], [{ input: 2, output: '4' }, 'a/b'], [{ input: null, output: null }, 'a/b'], [{ input: undefined, output: 1 }, 'a/b'], [{ input: [2], output: 1 }, 'a/b'], [{}, 'a/b'], [null, 'a/b'], [undefined, 'a/b'], ['2', 'a/b'], [5, 'a/b'],
  ];
  for (const [price, model] of bad) assert.equal(validPrice(price, model), false, `${JSON.stringify(price)} ${model}`);
});

test('AC-63.22 ATTACK: addCatalog refuses prices of 0 (except :free), negative, 1.7e308, NaN, Infinity, over 1000 and strings, and writes nothing', T, async (t) => {
  const { addCatalog, readStore } = await load('providers.mjs');
  const file = path.join(tmpDir(t, 'mp-store-'), 'providers.json');
  const entry = (model, input, output) => ({ model, input, output, context: 8000 });
  for (const [input, output] of [[0, 0], [-1, 4], [2, -1], [1.7e308, 4], [2, 1.7e308], [NaN, 4], [2, NaN], [Infinity, 4], [2, Infinity], [1000.5, 4], [2, 1001], ['2', 4], [2, '4'], [null, 4], [undefined, 4]]) {
    const err = addCatalog('openrouter', entry('acme/priced-1', input, output), file);
    assert.equal(typeof err, 'string', `${input} / ${output}`);
    assert.match(err, /\S/);
  }
  assert.equal(fs.existsSync(file) ? JSON.stringify(readStore(file).catalog) : '{}', '{}', 'nothing was written');
  assert.ok([null, undefined].includes(addCatalog('openrouter', entry('acme/free-1:free', 0, 0), file)), 'a free model may cost nothing');
  assert.ok([null, undefined].includes(addCatalog('openrouter', entry('acme/edge-1', 1000, 1000), file)), '1000 is the top');
  assert.ok([null, undefined].includes(addCatalog('openrouter', entry('acme/cheap-1', 0, 0.5), file)), 'one side may be 0');
  assert.equal(typeof addCatalog('openrouter', entry('acme/zero-1', 0, 0), file), 'string', 'zero for both on a paid model');
});

test('AC-63.22 ATTACK: POST /api/catalog applies the same check and answers 422 for a bad price', T, async (t) => {
  freshHome(t);
  const proj = panelProject(t);
  const s = await session(t, proj);
  const body = (over) => ({ provider: 'openrouter', model: 'acme/priced-1', input: 2, output: 4, context: 32000, ...over });
  for (const bad of [{ input: 0, output: 0 }, { input: -1 }, { output: 1.7e308 }, { input: 'free' }, { input: 1001 }, { model: '../x' }]) {
    const r = await s.post('/api/catalog', body(bad));
    assert.equal(r.status, 422, JSON.stringify(bad));
  }
  assert.equal(JSON.stringify((await s.state()).catalog).includes('acme/priced-1'), false, 'nothing was saved');
  const ok = await s.post('/api/catalog', body({}));
  assert.equal(ok.status, 200, ok.text);
  assert.ok(JSON.stringify((await s.state()).catalog).includes('acme/priced-1'));
  const free = await s.post('/api/catalog', body({ model: 'acme/free-1:free', input: 0, output: 0 }));
  assert.equal(free.status, 200, free.text);
});

test('AC-63.22 ATTACK: run-role ignores a hand-edited bad catalog price and uses the default price (priceKnown false)', T, async (t) => {
  const model = 'acme/priced-1';
  for (const [input, output] of [[1.7e308, 4], [-1, 4], [0, 0], ['2', '4'], [null, null], [2, 1001]]) {
    const p = await runProject(t, { model, catalog: { input: 2, output: 4, context: 32000 }, tamper: (e) => { e.input = input; e.output = output; } });
    assert.equal(p.r.status, 0, `${input}/${output}: ${p.r.stdout}\n${p.r.stderr}`);
    assert.equal(p.rows.length, 1, `${input}/${output}`);
    assert.equal(p.rows[0].priceKnown, false, `${input}/${output}: the price is not trusted`);
    close(p.rows[0].usd, 0.0175, `${input}/${output}: default price, 1000 x 5 + 500 x 25 per million`);
    assert.equal(p.rows[0].input, 1000);
  }
});

test('AC-63.22 ATTACK: addSpend and addModelSpend refuse a usd that is not finite or is negative; the ledger stays as it was and spendAllowed stays false at the limit', T, async (t) => {
  const { setLimit, addSpend, addModelSpend, spendAllowed, spentOn, readStore, today } = await load('providers.mjs');
  const file = path.join(tmpDir(t, 'mp-store-'), 'providers.json');
  const day = today();
  assert.equal(setLimit('openrouter', 1, file), null);
  addSpend('openrouter', 1, day, file);
  addModelSpend('openrouter/acme/x', { usd: 0.5, input: 10, output: 5, seconds: 1 }, day, file);
  assert.equal(spendAllowed('openrouter', 1, day, file), false, 'control: at the limit');
  const before = JSON.stringify(readStore(file));
  for (const bad of [Infinity, -Infinity, NaN, -1, -1e-9, 1e309, -5]) {
    try { addSpend('openrouter', bad, day, file); } catch { /* a refusal may throw */ }
    try { addModelSpend('openrouter/acme/x', { usd: bad, input: 1, output: 1, seconds: 1 }, day, file); } catch { /* a refusal may throw */ }
    assert.equal(JSON.stringify(readStore(file)), before, `usd ${bad}: the ledger changed`);
    assert.equal(spentOn('openrouter', day, file), 1, `usd ${bad}`);
    assert.equal(spendAllowed('openrouter', 1, day, file), false, `usd ${bad}: still at the limit`);
  }
  addSpend('openrouter', 0.25, day, file);
  assert.equal(spentOn('openrouter', day, file), 1.25, 'control: a good amount still adds');
});

test('AC-63.23 bootstrapPage holds the token and only the fixed local address, and escapes what it is given', T, async () => {
  const { bootstrapPage } = await load('models-panel.mjs');
  const token = 'tok' + 'a1b2'.repeat(10);
  const html = bootstrapPage(54321, token);
  assert.equal(typeof html, 'string');
  assert.match(html, /<meta\b[^>]*http-equiv\s*=\s*["']refresh["']/i);
  assert.ok(html.includes(`http://127.0.0.1:54321/?t=${token}`), 'the fixed local address with the token');
  const urls = html.match(/[a-z][a-z0-9+.-]*:\/\/[^\s"'<>]*/gi) ?? [];
  assert.ok(urls.length >= 1);
  for (const u of urls) assert.ok(u.startsWith('http://127.0.0.1:54321/'), `an address that is not the panel: ${u}`);
  assert.doesNotMatch(html, /<script\b/i);
  const hostile = bootstrapPage(54321, 'a"><script>alert(1)</script>');
  assert.doesNotMatch(hostile, /<script\b/i, 'a token cannot add markup');
  assert.doesNotMatch(hostile, /"><\w/, 'a token cannot close the attribute');
});

test('AC-63.23 the browser opener argv names the temp file and holds no token and no address', T, async (t) => {
  const { openerArgs } = await load('models-panel.mjs');
  const dir = tmpDir(t, 'mp open dir ');
  const files = [path.join(dir, 'panel-open.html'), path.join(dir, 'a&b panel.html')];
  for (const file of files) {
    const r = openerArgs(file);
    const argv = Array.isArray(r) ? r : [r?.command ?? r?.cmd ?? r?.file, ...(r?.args ?? r?.argv ?? [])];
    assert.ok(argv.length >= 1);
    assert.ok(argv.every((a) => typeof a === 'string'), 'every argument is a string');
    assert.ok(argv.some((a) => a === file || a === pathToFileURL(file).href), `the path is one argument of its own: ${JSON.stringify(argv)}`);
    const text = JSON.stringify(argv);
    assert.doesNotMatch(text, /\?t=|[?&]token/i, 'no token');
    assert.doesNotMatch(text, /https?:\/\//i, 'no address');
    assert.doesNotMatch(text, /127\.0\.0\.1|localhost/i);
  }
});

test('AC-63.24 /api/jobs: an external value needs confirmExternal: true, else 422 with code confirm; with it, saved', T, async (t) => {
  const home = freshHome(t);
  const { setProvider } = await load('providers.mjs');
  await installVault(t);
  const proj = panelProject(t);
  const s = await session(t, proj);
  assert.equal(setProvider('openrouter', OR_URL, OR_KEY, storeOf(home)), null);
  for (const changes of [{ 'code.ui': EXT }, { code: EXT }, { 'docs.report': EXT }, { 'code.ui': EXT, 'test.simple': 'haiku:low' }, { main: EXT }, { 'review.code': EXT }, { plan: EXT }]) {
    const r = await s.post('/api/jobs', { changes });
    assert.equal(r.status, 422, JSON.stringify(changes));
    assert.equal(r.json().code, 'confirm', JSON.stringify(changes));
    assert.equal(r.json().ok, false);
  }
  for (const confirmExternal of [false, 'true', 1, 'yes', null, {}, [true]]) {
    const r = await s.post('/api/jobs', { changes: { 'code.ui': EXT }, confirmExternal });
    assert.equal(r.status, 422, `confirmExternal ${JSON.stringify(confirmExternal)}`);
    assert.equal(r.json().code, 'confirm');
  }
  assert.equal(fs.existsSync(proj.models), false, 'nothing was saved without the confirmation');
  const plain = await s.post('/api/jobs', { changes: { 'code.simple': 'haiku:low', 'test.simple': 'opus:low' } });
  assert.equal(plain.status, 200, `a plain value needs no confirmation: ${plain.text}`);
  const ok = await s.post('/api/jobs', { changes: { 'code.ui': EXT }, confirmExternal: true });
  assert.equal(ok.status, 200, ok.text);
  assert.equal(proj.saved().tasks['code.ui'], EXT);
  assert.match(proj.forJob('code.ui'), new RegExp(`^${EXT} `));
  const role = await s.post('/api/jobs', { changes: { docs: EXT }, confirmExternal: true });
  assert.equal(role.status, 200, role.text);
  assert.equal(proj.saved().docs, EXT);
  // 3.64.0: any job may take an outside model once its provider has a key; main and the review jobs too
  for (const job of ['review.code', 'board.qa', 'plan.task', 'main']) {
    const r = await s.post('/api/jobs', { changes: { [job]: EXT }, confirmExternal: true });
    assert.equal(r.status, 200, `${job}: ${r.text}`);
    assert.equal(proj.saved().tasks[job], EXT, job);
  }
  assert.match(proj.forJob('main'), /^openrouter\/x\/y:high .*run-session\.mjs$/, 'main is opened by run-session.mjs');
  assert.equal(fs.existsSync(proj.local), false, 'an outside main leaves settings.local.json alone');
  const reset = await s.post('/api/jobs', { changes: { 'code.ui': null } });
  assert.equal(reset.status, 200, 'taking an external value away needs no confirmation');
  // Confirming does not make a value valid: a provider with no key is refused
  const bad = await s.post('/api/jobs', { changes: { 'code.ui': 'nokey/x/y:high' }, confirmExternal: true });
  assert.equal(bad.status, 422);
  assert.equal(bad.json().code, 'invalid', 'confirming does not make an invalid value valid');
  const upper = await s.post('/api/jobs', { changes: { 'code.ui': 'Openrouter/x/y:high' }, confirmExternal: true });
  assert.equal(upper.status, 422);
});

test('AC-63.25 ATTACK: the guard asks on security -i, dump-keychain, find-internet-password, a pipe into security, readProvider, vaultRead and key variable names', T, async () => {
  const { evaluate } = await load('destructive-guard.mjs');
  const asked = [
    'security -i', 'security   -i', '/usr/bin/security -i', 'security dump-keychain', 'security dump-keychain -d login.keychain', 'security find-internet-password -s x -w',
    'echo "find-generic-password -s x -w" | security', 'cat cmds.txt | /usr/bin/security -i', 'printf "dump-keychain" | security',
    'node -e "import(\'./.claude/hooks/providers.mjs\').then((m) => console.log(m.readProvider(\'openrouter\')))"', 'node -e "import(\'./.claude/hooks/keystore.mjs\').then((m) => console.log(m.vaultRead(\'openrouter\')))"', 'node tools/x.mjs readProvider', 'node tools/x.mjs vaultRead',
    'echo $OPENROUTER_API_KEY', 'printenv DEEPSEEK_API_KEY', 'env | grep MOONSHOT_API_KEY', 'powershell -c "$env:OPENROUTER_API_KEY"', 'echo %DEEPSEEK_API_KEY%', 'node -e "console.log(process.env.MOONSHOT_API_KEY)"', 'echo ${OPENROUTER_API_KEY}', 'echo "$DEEPSEEK_API_KEY"',
  ];
  const tricks = ['cd /tmp && security dump-keychain', 'sec""urity dump-keychain', 'printenv | grep -i openrouter_api_key', 'echo $OPENROUTER_API""_KEY', 'echo $DEEPSEEK_API\\_KEY', 'node -e "m.read\'\'Provider()"', 'bash -c "security -i"'];
  const free = ['git status', 'node --version', 'echo hello', 'security find-identity -v', 'git commit -m "docs: mention OPENROUTER_API_KEY and readProvider"', 'git commit -m "feat: vaultRead is never called by --show"', 'git commit -m "fix: DEEPSEEK_API_KEY and MOONSHOT_API_KEY are documented"'];
  for (const ctx of [{}, { tool: 'claude', agent: '' }, { tool: 'claude', agent: 'test-writer' }]) {
    assert.deepEqual(asked.filter((c) => evaluate(c, ctx)?.decision !== 'ask'), [], `asked (${JSON.stringify(ctx)})`);
    assert.deepEqual(tricks.filter((c) => !['ask', 'deny'].includes(evaluate(c, ctx)?.decision)), [], `tricky spellings (${JSON.stringify(ctx)})`);
    assert.deepEqual(free.filter((c) => evaluate(c, ctx) !== null), [], `free (${JSON.stringify(ctx)})`);
  }
});

test('AC-63.26 ATTACK: an unauthorised request does not restart the idle timer; an authorised one does', T, async (t) => {
  freshHome(t);
  const proj = panelProject(t);
  // Control: authorised calls keep a 1 s panel open for more than twice that
  const a = await session(t, proj, { idleMs: 1000 });
  const end = Date.now() + 2500;
  while (Date.now() < end) { assert.equal((await a.get('/api/state')).status, 200); await wait(250); }
  assert.equal(await isOpen(a.panel.port), true, 'authorised requests keep it open');
  await until(async () => !(await isOpen(a.panel.port)), 'the idle panel to close', 8000);
  // Attack: requests with no secret, a wrong secret or a wrong Host keep coming
  const b = await startPanel(t, proj, { idleMs: 1000 });
  const stop = Date.now() + 4000;
  let closed = false;
  while (Date.now() < stop && !closed) {
    try {
      await call(b, { url: '/api/state' });
      await call(b, { url: '/api/state', secret: 'wrong' });
      await call(b, { url: '/api/state', host: 'evil.example' });
      await call(b, { url: '/?t=wrong' });
    } catch { closed = true; }
    if (!closed) await wait(150);
  }
  assert.equal(closed, true, 'the panel closed itself although unauthorised requests kept arriving');
});

test('AC-63.26 removeKey with a vault that throws returns an error text and keeps the metadata (and the key stays in the vault)', T, async (t) => {
  const { setProvider, removeKey, readStore, hasKey, readProvider } = await load('providers.mjs');
  const ks = await load('keystore.mjs');
  const v = await installVault(t);
  const file = path.join(tmpDir(t, 'mp-store-'), 'providers.json');
  assert.equal(setProvider('openrouter', OR_URL, OR_KEY, file), null);
  ks.setVaultBackend(fakeVault({ failRemove: true }).backend);
  const err = removeKey('openrouter', file);
  assert.equal(typeof err, 'string', 'an error text');
  assert.match(err, /\S/);
  assert.equal(err.includes(OR_KEY), false);
  assert.equal(typeof readStore(file).keyMeta.openrouter, 'object', 'the metadata stays, so the panel still shows the key');
  assert.equal(hasKey('openrouter', { file }), true);
  assert.notEqual(v.store.get('openrouter'), undefined, 'the key is still in the vault');
  ks.setVaultBackend(v.backend);
  assert.deepEqual(readProvider('openrouter'), { url: OR_URL, key: OR_KEY }, 'and it still reads back');
  assert.ok([null, undefined].includes(removeKey('openrouter', file)), 'control: a working vault removes it');
  assert.equal(readStore(file).keyMeta.openrouter, undefined);
  assert.equal(v.store.has('openrouter'), false);
});

test('AC-63.26 safeEnv strips names holding _API_KEY, _TOKEN, SECRET or PASSWORD and keeps PATH (AC-63.27 turned the deny list into an allow list: the rest is dropped too)', T, async (t) => {
  // cost.mjs must be safe to import; if it is not, the fake npx and the temp project keep an import from reaching ccusage or this repository
  const root = tmpDir(t, 'mp-safeenv-');
  const npx = fakeNpx(t, { mode: 'fail' });
  useFakeNpx(t, npx);
  withEnv(t, { CLAUDE_PROJECT_DIR: root });
  const { safeEnv } = await load('cost.mjs');
  assert.equal(typeof safeEnv, 'function', 'safeEnv is exported');
  const input = {
    PATH: '/bin', Path: 'C:\\bin', HOME: '/home/x', SYSTEMROOT: 'C:\\Windows', TZ: 'UTC', npm_config_registry: 'https://registry.npmjs.org', TOKENIZERS_PARALLELISM: 'false', NODE_OPTIONS: '--no-warnings',
    OPENROUTER_API_KEY: 'a', DEEPSEEK_API_KEY: 'b', MOONSHOT_API_KEY: 'c', ANTHROPIC_API_KEY: 'd', openrouter_api_key: 'e', GITHUB_TOKEN: 'f', NPM_TOKEN: 'g', ANTHROPIC_AUTH_TOKEN: 'h', MY_SECRET: 'i', AWS_SECRET_ACCESS_KEY: 'j', DB_PASSWORD: 'k', github_token: 'l',
  };
  const copy = { ...input };
  const out = safeEnv(input);
  assert.deepEqual(input, copy, 'the input is not changed');
  assert.deepEqual(Object.keys(out).sort(), ['HOME', 'PATH', 'Path', 'SYSTEMROOT', 'TZ', 'npm_config_registry'].sort());
  for (const k of Object.keys(out)) assert.equal(out[k], input[k], k);
});

test('AC-63.26 cost.mjs gives npx an env without key, token, secret and password variables, and with PATH', T, async (t) => {
  const npx = fakeNpx(t, { mode: 'ok' });
  const root = tmpDir(t, 'mp-cost-env-');
  write(path.join(root, '.kit.json'), JSON.stringify({ type: 'web-saas', lang: 'en' }));
  const env = { ...npx.env(cleanEnv()), CLAUDE_PROJECT_DIR: root, OPENROUTER_API_KEY: 'a', DEEPSEEK_API_KEY: 'b', GITHUB_TOKEN: 'c', MY_SECRET: 'd', DB_PASSWORD: 'e' };
  const r = spawnSync(process.execPath, [path.join(HOOKS, 'cost.mjs'), root], { cwd: root, encoding: 'utf8', timeout: 90000, env });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(npx.calls().length, 1, 'ccusage ran once, through the fake');
  const names = npx.envNames();
  assert.ok(names.some((n) => n.toLowerCase() === 'path'), 'PATH is kept');
  assert.deepEqual(names.filter((n) => /_API_KEY|_TOKEN|SECRET|PASSWORD/i.test(n)), [], 'no secret-looking variable reached npx');
});

test('AC-63.26 setModels writes settings.local.json through a temp file and a rename: a failed write leaves the old file whole', T, async (t) => {
  const { setModels } = await load('models.mjs');
  const m = mfile(t);
  const others = { permissions: { allow: ['Bash(ls)'] }, model: 'opus', effortLevel: 'low' };
  write(m.local, JSON.stringify(others));
  const before = fs.readFileSync(m.local, 'utf8');
  const realWrite = fs.writeFileSync, realRename = fs.renameSync;
  const restore = () => { fs.writeFileSync = realWrite; fs.renameSync = realRename; syncBuiltinESMExports(); };
  t.after(restore);
  const inClaudeDir = (p) => typeof p === 'string' && path.dirname(path.resolve(p)) === path.dirname(m.local);
  fs.writeFileSync = function (p, data, ...rest) {
    if (inClaudeDir(p)) { realWrite.call(this, p, String(data).slice(0, Math.floor(String(data).length / 2)), ...rest); throw Object.assign(new Error('no space left on device'), { code: 'ENOSPC' }); }
    return realWrite.call(this, p, data, ...rest);
  };
  syncBuiltinESMExports();
  let err;
  try { err = setModels(['main=sonnet:high'], m.file); } finally { restore(); }
  assert.equal(typeof err, 'string', 'a failed write is reported');
  assert.equal(fs.readFileSync(m.local, 'utf8'), before, 'partial write: the old settings.local.json is whole');
  assert.equal(m.has(), false, 'and models.json was not written');
  fs.renameSync = function (a, b, ...rest) {
    if (path.resolve(String(b)) === path.resolve(m.local)) throw Object.assign(new Error('resource busy'), { code: 'EBUSY' });
    return realRename.call(this, a, b, ...rest);
  };
  syncBuiltinESMExports();
  try { err = setModels(['main=sonnet:high'], m.file); } finally { restore(); }
  assert.equal(typeof err, 'string');
  assert.equal(fs.readFileSync(m.local, 'utf8'), before, 'failed rename: the old file is whole');
  assert.equal(setModels(['main=sonnet:high'], m.file), null, 'control: the next write works');
  assert.equal(JSON.parse(fs.readFileSync(m.local, 'utf8')).model, 'sonnet');
});

// ============================================================================================
// Second audit pass (AC-63.27): price floor, the panel token out of the AI's reach, more guard commands, SystemRoot,
// panel.json, atomic writes, safeEnv allow list, KNOWN_PRICES and a non-finite run cost
// Hard limit of the guard tests: a name split inside a script ('resolve' + 'Key', 'vibe-' + 'panel-') is a known limit of a text check; it is not tested.
// ============================================================================================

const GUARD_CTXS = [{}, { tool: 'claude', agent: '' }, { tool: 'claude', agent: 'test-writer' }];

test('AC-63.27 validPrice: a non-zero price below 0.001 is refused; 0.001 is the floor; both zero stays free-only', T, async () => {
  const { validPrice } = await load('providers.mjs');
  for (const [price, model] of [[{ input: 0.001, output: 0.001 }, 'a/b'], [{ input: 0, output: 0.001 }, 'a/b'], [{ input: 0.001, output: 0 }, 'a/b'], [{ input: 0, output: 0 }, 'a/b:free'], [{ input: 0.001, output: 1000 }, 'a/b:free']])
    assert.equal(validPrice(price, model), true, `${JSON.stringify(price)} ${model}`);
  const bad = [
    [{ input: 0, output: 1e-300 }, 'a/b'], [{ input: 1e-300, output: 1e-300 }, 'a/b'], [{ input: 1e-300, output: 0 }, 'a/b'], [{ input: 5e-324, output: 1 }, 'a/b'], [{ input: 1, output: 5e-324 }, 'a/b'],
    [{ input: 0.0009, output: 1 }, 'a/b'], [{ input: 1, output: 0.0009 }, 'a/b'], [{ input: 0.00099999, output: 0.00099999 }, 'a/b'], [{ input: 0.0001, output: 0.0001 }, 'a/b'],
    [{ input: 0, output: 1e-300 }, 'a/b:free'], [{ input: 1e-300, output: 1e-300 }, 'a/b:free'], [{ input: 0, output: 0.0005 }, 'a/b:free'],
    [{ input: 0, output: 0 }, 'a/b'], [{ input: 0, output: 0 }, 'a/b:free2'],
  ];
  for (const [price, model] of bad) assert.equal(validPrice(price, model), false, `${JSON.stringify(price)} ${model}`);
});

test('AC-63.27 ATTACK: a price of 1e-300 is refused by addCatalog and POST /api/catalog (nothing saved), and run-role ignores one that was hand-edited into the catalog', T, async (t) => {
  const { addCatalog, readStore } = await load('providers.mjs');
  const file = path.join(tmpDir(t, 'mp-store-'), 'providers.json');
  const entry = (model, input, output) => ({ model, input, output, context: 8000 });
  for (const [input, output] of [[0, 1e-300], [1e-300, 1e-300], [1e-300, 0], [0.0009, 4], [2, 0.0009]]) {
    const err = addCatalog('openrouter', entry('acme/priced-1', input, output), file);
    assert.equal(typeof err, 'string', `${input} / ${output}`);
    assert.match(err, /\S/);
  }
  assert.equal(fs.existsSync(file) ? JSON.stringify(readStore(file).catalog) : '{}', '{}', 'nothing was written');
  assert.ok([null, undefined].includes(addCatalog('openrouter', entry('acme/floor-1', 0.001, 0.001), file)), 'control: the floor itself is allowed');

  freshHome(t);
  const s = await session(t, panelProject(t));
  for (const bad of [{ input: 1e-300, output: 1e-300 }, { input: 0, output: 1e-300 }, { input: 0.0009, output: 4 }]) {
    const r = await s.post('/api/catalog', { provider: 'openrouter', model: 'acme/priced-2', input: 2, output: 4, context: 32000, ...bad });
    assert.equal(r.status, 422, JSON.stringify(bad));
  }
  assert.equal(JSON.stringify((await s.state()).catalog).includes('acme/priced-2'), false, 'nothing was saved');

  const model = 'acme/priced-1';
  for (const [input, output] of [[1e-300, 1e-300], [0, 1e-300], [0.0009, 5]]) {
    const p = await runProject(t, { model, catalog: { input: 2, output: 4, context: 32000 }, tamper: (e) => { e.input = input; e.output = output; } });
    assert.equal(p.r.status, 0, `${input}/${output}: ${p.r.stdout}\n${p.r.stderr}`);
    assert.equal(p.rows.length, 1, `${input}/${output}`);
    assert.equal(p.rows[0].priceKnown, false, `${input}/${output}: the price is not trusted`);
    close(p.rows[0].usd, 0.0175, `${input}/${output}: default price`);
  }
});

// ---- The panel token out of the AI's reach ----

test('AC-63.27 ATTACK: the guard asks on any command naming panel-open.html, vibe-panel-, x-panel-session or panel-session', T, async () => {
  const { evaluate } = await load('destructive-guard.mjs');
  const asked = [
    'cat /tmp/vibe-panel-a1b2c3/panel-open.html', String.raw`type %TEMP%\vibe-panel-x\panel-open.html`, String.raw`Get-Content $env:TEMP\vibe-panel-ab\panel-open.html`, 'ls /tmp/vibe-panel-*', 'ls -d /var/folders/*/vibe-panel-*', 'cat /tmp/*/panel-open.html',
    'curl -H "x-panel-session: abc" http://127.0.0.1:5000/api/state', 'grep panel-session page.html', `node -e "fetch(u,{headers:{'x-panel-session':s}})"`, 'echo panel-session',
  ];
  const tricks = ['cd /tmp && cat vibe-panel-x/panel-open.html', 'bash -c "cat /tmp/vibe-panel-x/panel-open.html"', 'curl -H "X-Panel-Session: abc" http://127.0.0.1:5000/api/state', 'env cat /tmp/vibe-panel-x/panel-open.html', 'cat   /tmp/vibe-panel-x/panel-open.html'];
  const free = ['git status', 'node --version', 'echo hello', 'node .claude/hooks/models-panel.mjs', 'security find-identity -v', 'cat ~/.bashrc', 'git log --oneline'];
  for (const ctx of GUARD_CTXS) {
    assert.deepEqual(asked.filter((c) => evaluate(c, ctx)?.decision !== 'ask'), [], `asked (${JSON.stringify(ctx)})`);
    assert.deepEqual(tricks.filter((c) => !['ask', 'deny'].includes(evaluate(c, ctx)?.decision)), [], `tricky spellings (${JSON.stringify(ctx)})`);
    assert.deepEqual(free.filter((c) => evaluate(c, ctx) !== null), [], `free (${JSON.stringify(ctx)})`);
  }
});

test('AC-63.27 ATTACK: a hook on the Read tool denies a path holding vibe-panel-, and lets other reads through', T, () => {
  const blocks = JSON.parse(read('.claude/settings.json')).hooks.PreToolUse.filter((b) => new RegExp(`^(?:${b.matcher})$`).test('Read'));
  const scripts = [...new Set(blocks.flatMap((b) => b.hooks.map((h) => h.command.match(/hooks[\\/]([\w.-]+\.mjs)/)?.[1])))];
  assert.ok(scripts.length >= 1 && scripts.every((s) => typeof s === 'string'), `hooks on Read: ${JSON.stringify(scripts)}`);
  const decisions = (file) => scripts.map((s) => {
    const r = spawnSync(process.execPath, [path.join(HOOKS, s)], {
      input: JSON.stringify({ hook_event_name: 'PreToolUse', cwd: ROOT, session_id: 'mp-test', tool_name: 'Read', tool_input: { file_path: file } }),
      encoding: 'utf8', timeout: 30000, env: { ...cleanEnv(), CLAUDE_PROJECT_DIR: ROOT },
    });
    assert.equal(r.status, 0, `${s}: ${r.stderr}`);
    try { return JSON.parse(r.stdout).hookSpecificOutput?.permissionDecision ?? null; } catch { return null; }
  });
  const denied = [
    path.join(os.tmpdir(), 'vibe-panel-Ab12Cd', 'panel-open.html'), '/tmp/vibe-panel-xyz/panel-open.html', String.raw`C:\Windows\Temp\vibe-panel-q1w2e3\panel-open.html`,
    '/var/folders/zz/T/vibe-panel-k9/panel-open.html', '/tmp/vibe-panel-xyz/anything-else.txt',
  ];
  for (const file of denied) assert.ok(decisions(file).includes('deny'), `a Read of ${file} must be denied by one of ${scripts.join(', ')}`);
  for (const file of ['README.md', path.join(os.tmpdir(), 'notes.txt'), 'docs/vibe-panel.md', '/tmp/panel-open.txt'])
    assert.deepEqual(decisions(file).filter((d) => d === 'deny' || d === 'ask'), [], `a Read of ${file} must pass`);
});

// The CLI is run with a preload that never signals a process and never opens a browser: it records both
const CLI_PRELOAD = path.join(TMP_HOME, 'mp-cli-preload.mjs');
fs.writeFileSync(CLI_PRELOAD, String.raw`
import fs from 'node:fs';
import cp from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { EventEmitter } from 'node:events';
const rec = (o) => fs.appendFileSync(process.env.MP_SPY, JSON.stringify(o) + '\n');
process.kill = (pid, signal) => { rec({ kind: 'kill', pid, signal }); return true; };
const fake = (kind) => (cmd, args) => { rec({ kind, cmd: String(cmd), args: Array.isArray(args) ? args : [] }); const c = new EventEmitter(); c.unref = () => {}; c.kill = () => true; return c; };
cp.spawn = fake('spawn');
cp.execFile = fake('execFile');
syncBuiltinESMExports();
`);
const readJson = (file) => { try { return JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return null; } };

// Starts models-panel.mjs as the CLI. Its temp folder is private, so the bootstrap file can be found.
async function startCli(t, root) {
  const home = tmpDir(t, 'mp-cli-home-');
  const tmp = tmpDir(t, 'mp-cli-tmp-');
  const spyFile = path.join(home, 'spy.jsonl');
  const env = { ...cleanEnv(), HOME: home, USERPROFILE: home, TEMP: tmp, TMP: tmp, TMPDIR: tmp, CLAUDE_PROJECT_DIR: root, MP_SPY: spyFile };
  const child = cp.spawn(process.execPath, ['--import', pathToFileURL(CLI_PRELOAD).href, path.join(HOOKS, 'models-panel.mjs')], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let out = '';
  child.stdout.on('data', (d) => { out += d; });
  child.stderr.on('data', (d) => { out += d; });
  t.after(() => { try { child.kill(); } catch { /* gone */ } });
  const panelFile = path.join(root, '.claude', 'state', 'panel.json');
  await until(() => readJson(panelFile)?.pid === child.pid, `the CLI to write panel.json (output so far: ${out})`);
  return {
    child, tmp, panelFile, output: () => out,
    spied: () => (fs.existsSync(spyFile) ? fs.readFileSync(spyFile, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : []),
    bootstrapFiles: () => walk(tmp).filter((f) => path.basename(f) === 'panel-open.html'),
  };
}

test('AC-63.27 ATTACK: the CLI deletes the bootstrap file at the latest 60 s after start, although nobody opened it, and the panel keeps running', { timeout: 150000 }, async (t) => {
  freshHome(t);
  const proj = panelProject(t);
  const cli = await startCli(t, proj.root);
  assert.equal(cli.bootstrapFiles().length, 1, `the bootstrap file exists after start; output: ${cli.output()}`);
  const file = cli.bootstrapFiles()[0];
  assert.match(fs.readFileSync(file, 'utf8'), /\?t=/, 'it holds the token, which is why it must not stay');
  await until(() => !fs.existsSync(file), 'the unused bootstrap file to be deleted', 62000);
  assert.equal(cli.child.exitCode, null, 'the CLI is still running, so the file was not removed by its exit');
  assert.equal(await isOpen(readJson(cli.panelFile).port), true, 'and the panel still answers');
});

// ---- panel.json: who is signalled, and how it is written ----

async function oldPanel(t, handler) {
  const server = http.createServer(handler);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((done) => { server.closeAllConnections(); server.close(done); }));
  return server.address().port;
}
const FAKE_PID = 2000000011; // never a real process: the preload records the signal and sends none

async function secondStart(t, health) {
  freshHome(t);
  const proj = panelProject(t);
  const second = await oldPanel(t, (req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ app: 'vibe-panel', pid: FAKE_PID, root: proj.root }));
  });
  const port = await oldPanel(t, (req, res) => {
    const h = health({ root: proj.root, pid: FAKE_PID, second });
    if (h.redirect) { res.writeHead(302, { location: h.redirect }).end(); return; }
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify(h.body));
  });
  write(path.join(proj.stateDir, 'panel.json'), JSON.stringify({ port, pid: FAKE_PID }));
  const cli = await startCli(t, proj.root);
  return cli.spied().filter((e) => e.kind === 'kill');
}

test('AC-63.27 a second start signals the recorded process when /health answers with the same app, pid and root (control)', T, async (t) => {
  const kills = await secondStart(t, ({ root, pid }) => ({ body: { app: 'vibe-panel', pid, root } }));
  assert.ok(kills.length >= 1, 'the old panel was signalled');
  assert.deepEqual(kills.filter((k) => k.pid !== FAKE_PID), [], 'and nothing else');
});

test('AC-63.27 ATTACK: a hostile panel.json signals nothing: wrong app, no app, wrong root, wrong pid, or a port that redirects', T, async (t) => {
  const cases = {
    'wrong app': ({ root, pid }) => ({ body: { app: 'some-other-server', pid, root } }),
    'no app': ({ root, pid }) => ({ body: { pid, root } }),
    'app is not a string': ({ root, pid }) => ({ body: { app: ['vibe-panel'], pid, root } }),
    'wrong root': ({ root, pid }) => ({ body: { app: 'vibe-panel', pid, root: `${root}-elsewhere` } }),
    'no root': ({ pid }) => ({ body: { app: 'vibe-panel', pid } }),
    'wrong pid': ({ root, pid }) => ({ body: { app: 'vibe-panel', pid: pid + 1, root } }),
    'the old { pid } answer': ({ pid }) => ({ body: { pid } }),
    'a redirect to a port that answers correctly': ({ second }) => ({ redirect: `http://127.0.0.1:${second}/health` }),
  };
  const signalled = [];
  for (const [name, health] of Object.entries(cases)) if ((await secondStart(t, health)).length) signalled.push(name);
  assert.deepEqual(signalled, [], 'cases where the old process was signalled although it is not this panel');
});

test('AC-63.27 ATTACK: panel.json is written through a temp file and a rename: a hard link or a symlink at that path is replaced, not followed', T, async (t) => {
  freshHome(t);
  const outside = tmpDir(t, 'mp-outside-');
  // A hard link: writing through it would change the victim
  const proj = panelProject(t);
  const panelJson = path.join(proj.stateDir, 'panel.json');
  const victim = path.join(outside, 'victim.txt');
  write(victim, 'VICTIM');
  fs.mkdirSync(proj.stateDir, { recursive: true });
  fs.linkSync(victim, panelJson);
  const panel = await startPanel(t, proj);
  assert.equal(fs.readFileSync(victim, 'utf8'), 'VICTIM', 'a hard link was not written through');
  assert.equal(readJson(panelJson)?.port, panel.port, 'panel.json holds the port');
  assert.equal(fs.lstatSync(panelJson).nlink, 1, 'and is a file of its own now');
  assert.deepEqual(fs.readdirSync(proj.stateDir), ['panel.json'], 'no temp file is left behind');
  // A symlink to a file that does not exist yet: following it would create that file
  const proj2 = panelProject(t);
  const link = path.join(proj2.stateDir, 'panel.json');
  const target = path.join(outside, 'created-by-attack.txt');
  fs.mkdirSync(proj2.stateDir, { recursive: true });
  let linked = true;
  try { fs.symlinkSync(target, link, 'file'); } catch { linked = false; } // Windows without the symlink privilege: the hard link case above still ran
  const panel2 = await startPanel(t, proj2);
  if (linked) {
    assert.equal(fs.existsSync(target), false, 'a symlink was not followed');
    assert.equal(fs.lstatSync(link).isSymbolicLink(), false, 'the symlink was replaced');
  }
  assert.equal(readJson(link)?.port, panel2.port);
});

test('AC-63.27 writeSaved (models.json) is written through a temp file and a rename: a hard link or a symlink at that path is replaced, not followed', T, async (t) => {
  const { setModels } = await load('models.mjs');
  const outside = tmpDir(t, 'mp-outside-');
  const m = mfile(t);
  const victim = path.join(outside, 'victim.json');
  write(victim, '{"keep":"me"}');
  fs.mkdirSync(path.dirname(m.file), { recursive: true });
  fs.linkSync(victim, m.file);
  assert.equal(setModels(['code.ui=haiku:low'], m.file), null);
  assert.equal(fs.readFileSync(victim, 'utf8'), '{"keep":"me"}', 'a hard link was not written through');
  assert.equal(m.saved().tasks['code.ui'], 'haiku:low', 'the choice was saved');
  assert.equal(fs.lstatSync(m.file).nlink, 1);
  assert.deepEqual(fs.readdirSync(path.dirname(m.file)), ['models.json'], 'no temp file is left behind');
  const m2 = mfile(t);
  const target = path.join(outside, 'created-by-attack.json');
  fs.mkdirSync(path.dirname(m2.file), { recursive: true });
  let linked = true;
  try { fs.symlinkSync(target, m2.file, 'file'); } catch { linked = false; }
  assert.equal(setModels(['code.ui=haiku:low'], m2.file), null);
  if (linked) {
    assert.equal(fs.existsSync(target), false, 'a symlink was not followed');
    assert.equal(fs.lstatSync(m2.file).isSymbolicLink(), false);
  }
  assert.equal(m2.saved().tasks['code.ui'], 'haiku:low');
});

// ---- SystemRoot and the Linux secret-tool path ----

// keystore.mjs in a child process, on a platform of our choosing; child_process.execFileSync only records the program it was asked to run
const VAULT_PROBE = path.join(TMP_HOME, 'mp-vault-probe.mjs');
fs.writeFileSync(VAULT_PROBE, String.raw`
import cp from 'node:child_process';
Object.defineProperty(process, 'platform', { value: process.env.MP_PLATFORM });
// Set after start: Windows node does not start with a made-up SystemRoot
if (process.env.MP_SYSTEMROOT !== undefined) { delete process.env.SYSTEMROOT; process.env.SystemRoot = process.env.MP_SYSTEMROOT; }
const calls = [];
cp.execFileSync = (cmd) => { calls.push(String(cmd)); return ''; };
const ks = await import(process.env.MP_KEYSTORE);
let saveError = null;
try { ks.vaultSave('openrouter', 'k'.repeat(40)); } catch (e) { saveError = String(e.message); }
console.log(JSON.stringify({ kind: ks.vaultKind(), calls, saveError }));
`);
function vaultProbe(t, { platform, systemRoot, root, extraPath }) {
  const home = tmpDir(t, 'mp-probe-home-');
  const env = { ...cleanEnv(), HOME: home, USERPROFILE: home, CLAUDE_PROJECT_DIR: root, MP_PLATFORM: platform, MP_KEYSTORE: pathToFileURL(path.join(HOOKS, 'keystore.mjs')).href };
  if (systemRoot !== undefined) env.MP_SYSTEMROOT = systemRoot;
  const withPath = extraPath ? prependPath(env, extraPath) : env;
  const r = spawnSync(process.execPath, [VAULT_PROBE], { cwd: root, encoding: 'utf8', timeout: 30000, env: withPath });
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  return JSON.parse(r.stdout.trim().split('\n').at(-1));
}
const fakeWindows = (dir) => { write(path.join(dir, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe'), ''); return dir; };

test('AC-63.27 SystemRoot is used only when absolute, outside the project root, and holding powershell.exe; otherwise the vault is absent', T, async (t) => {
  const root = tmpDir(t, 'mp-sr-root-');
  const outside = tmpDir(t, 'mp-sr-outside-');
  const good = fakeWindows(path.join(outside, 'okwin'));
  const powershell = path.join(good, 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
  const ok = vaultProbe(t, { platform: 'win32', systemRoot: good, root });
  assert.equal(ok.kind, 'dpapi', 'control: a good SystemRoot');
  assert.deepEqual(ok.calls.map((c) => path.normalize(c)), [path.normalize(powershell)], 'control: the program run is that powershell.exe');
  assert.equal(ok.saveError, null);
  const none = vaultProbe(t, { platform: 'win32', systemRoot: path.join(outside, 'emptywin'), root });
  assert.equal(none.kind, null, 'absolute and outside, but no powershell.exe');
  assert.equal(typeof none.saveError, 'string');
});

test('AC-63.27 ATTACK: a SystemRoot inside the project root, or a relative one, never runs the powershell.exe found there', T, async (t) => {
  const root = tmpDir(t, 'mp-sr-root-');
  fakeWindows(path.join(root, 'fakewin'));
  fakeWindows(path.join(root, 'nested', 'deeper', 'win'));
  fakeWindows(root);
  for (const [label, systemRoot] of [['inside the root', path.join(root, 'fakewin')], ['deep inside the root', path.join(root, 'nested', 'deeper', 'win')], ['the root itself', root],
    ['relative', 'fakewin'], ['relative with dot', `.${path.sep}fakewin`], ['relative upward', `..${path.sep}${path.basename(root)}${path.sep}fakewin`]]) {
    const r = vaultProbe(t, { platform: 'win32', systemRoot, root });
    assert.equal(r.kind, null, `${label}: vaultKind behaves as on a machine with no vault`);
    assert.deepEqual(r.calls, [], `${label}: no program was run`);
    assert.equal(typeof r.saveError, 'string', `${label}: saving is refused`);
  }
});

test('AC-63.27 Linux: secret-tool is called by its full path /usr/bin/secret-tool, and a look-alike on PATH gives no vault', T, async (t) => {
  const root = tmpDir(t, 'mp-lx-root-');
  const bin = tmpDir(t, 'mp-lx-bin-');
  write(path.join(bin, 'secret-tool'), '#!/bin/sh\nexit 0\n');
  fs.chmodSync(path.join(bin, 'secret-tool'), 0o755);
  const real = fs.existsSync('/usr/bin/secret-tool');
  const r = vaultProbe(t, { platform: 'linux', root, extraPath: bin });
  assert.equal(r.kind, real ? 'secret-tool' : null, real ? '/usr/bin/secret-tool exists' : '/usr/bin/secret-tool is missing, so there is no vault, whatever PATH holds');
  if (real) assert.deepEqual(r.calls, ['/usr/bin/secret-tool'], 'called by full path');
  else { assert.deepEqual(r.calls, [], 'the look-alike on PATH was not run'); assert.equal(typeof r.saveError, 'string'); }
});

// ---- cost.mjs and run-role ----

test('AC-63.27 safeEnv is an allow list: the ENV_ALLOWED names of run-role.mjs and names starting npm_config_; everything else is dropped', T, async (t) => {
  const root = tmpDir(t, 'mp-safeenv-');
  const npx = fakeNpx(t, { mode: 'fail' });
  useFakeNpx(t, npx);
  withEnv(t, { CLAUDE_PROJECT_DIR: root });
  const { safeEnv } = await load('cost.mjs');
  const kept = [
    'PATH', 'Path', 'PATHEXT', 'SYSTEMROOT', 'SystemRoot', 'SYSTEMDRIVE', 'WINDIR', 'COMSPEC', 'TEMP', 'TMP', 'TMPDIR', 'HOME', 'HOMEDRIVE', 'HOMEPATH', 'USERPROFILE', 'USERNAME', 'USER', 'LOGNAME', 'APPDATA', 'LOCALAPPDATA', 'PROGRAMDATA',
    'PROGRAMFILES', 'PROGRAMFILES(X86)', 'PROGRAMW6432', 'COMMONPROGRAMFILES', 'COMMONPROGRAMFILES(X86)', 'COMMONPROGRAMW6432', 'OS', 'PROCESSOR_ARCHITECTURE', 'NUMBER_OF_PROCESSORS', 'LANG', 'LC_ALL', 'TZ', 'TERM', 'SHELL', 'XDG_CONFIG_HOME',
    'CLAUDE_CODE_GIT_BASH_PATH', 'npm_config_registry', 'npm_config_cache', 'npm_config_prefix',
  ];
  const dropped = [
    'SUPABASE_SERVICE_ROLE_KEY', 'STRIPE_KEY', 'AWS_ACCESS_KEY_ID', 'DATABASE_URL', 'NODE_OPTIONS', 'GITHUB_TOKEN', 'OPENROUTER_API_KEY', 'ANTHROPIC_API_KEY', 'MY_SECRET', 'DB_PASSWORD', 'TOKENIZERS_PARALLELISM',
    'PATHEXT_X', 'MYPATH', 'XPATH', 'PATH2', 'HOME_DIR', 'FAKE_TZ', 'npm_config', 'npm_configx', 'xnpm_config_a', 'CLAUDE_PROJECT_DIR', 'ANTHROPIC_BASE_URL',
  ];
  const input = Object.fromEntries([...kept, ...dropped].map((k) => [k, `value-of-${k}`]));
  const out = safeEnv(input);
  assert.deepEqual(Object.keys(out).sort(), [...kept].sort());
  for (const k of kept) assert.equal(out[k], input[k], k);
  assert.equal(Object.keys(input).length, kept.length + dropped.length, 'the input is not changed');
  assert.equal(Object.keys(safeEnv({})).length, 0, 'empty in, empty out');
});

test('AC-63.27 cost.mjs and run-role.mjs share one definition of the allowed environment names', T, () => {
  const holders = fs.readdirSync(HOOKS).filter((f) => f.endsWith('.mjs') && fs.readFileSync(path.join(HOOKS, f), 'utf8').includes('SYSTEMDRIVE'));
  assert.equal(holders.length, 1, `the name list is written in one file only, found in: ${holders.join(', ')}`);
});

test('AC-63.27 ATTACK: npx started by cost.mjs gets PATH and none of SUPABASE_SERVICE_ROLE_KEY, STRIPE_KEY, AWS_ACCESS_KEY_ID, DATABASE_URL, NODE_OPTIONS', T, async (t) => {
  const npx = fakeNpx(t, { mode: 'ok' });
  const root = tmpDir(t, 'mp-cost-env-');
  write(path.join(root, '.kit.json'), JSON.stringify({ type: 'web-saas', lang: 'en' }));
  const hostile = { SUPABASE_SERVICE_ROLE_KEY: 'a', STRIPE_KEY: 'b', AWS_ACCESS_KEY_ID: 'c', DATABASE_URL: 'postgres://u:p@h/db', NODE_OPTIONS: '--no-warnings', MY_APP_CONFIG: 'd' };
  const r = spawnSync(process.execPath, [path.join(HOOKS, 'cost.mjs'), root], { cwd: root, encoding: 'utf8', timeout: 90000, env: { ...npx.env(cleanEnv()), CLAUDE_PROJECT_DIR: root, ...hostile } });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(npx.calls().length, 1, 'ccusage ran once, through the fake');
  const names = npx.envNames();
  assert.ok(names.some((n) => n.toLowerCase() === 'path'), 'PATH is kept');
  assert.deepEqual(names.filter((n) => Object.hasOwn(hostile, n)), [], 'none of the hostile variables reached npx');
});

test('AC-63.27 ATTACK: a model id that is a property of Object (constructor, toString, hasOwnProperty, valueOf) has an unknown price: the default price is used', T, async (t) => {
  for (const model of ['constructor', 'toString', 'hasOwnProperty', 'valueOf']) {
    const p = await runProject(t, { model });
    assert.equal(p.r.status, 0, `${model}: ${p.r.stdout}\n${p.r.stderr}`);
    assert.equal(p.rows.length, 1, model);
    assert.equal(p.rows[0].priceKnown, false, `${model}: not a known price`);
    close(p.rows[0].usd, 0.0175, `${model}: default price, 1000 x 5 + 500 x 25 per million`);
  }
});

test('AC-63.27 ATTACK: a run whose cost is not finite counts as the daily limit reached: it is reported, and the ledger does not look unspent', T, async (t) => {
  const { spentOn, spendAllowed, today } = await load('providers.mjs');
  const p = await runProject(t, { model: 'acme/unpriced-1', env: { MP_INF: '1' } });
  assert.deepEqual(p.spied.filter((s) => s.kind === 'claude-sync' || s.kind === 'net-blocked' || s.kind === 'tls-blocked'), []);
  assert.equal(p.spied.filter((s) => s.kind === 'spawn').length, 1, 'the fake child ran, not a real claude');
  assert.equal(p.spied.filter((s) => s.kind === 'child-call').length, 1, 'the fake child reached the proxy once');
  const spent = spentOn('openrouter', today(), p.store);
  assert.equal(Number.isFinite(spent), true, `the ledger holds a finite number, got ${spent}`);
  assert.ok(spent >= 5, `the day counts as spent up to the limit of 5, got ${spent}`);
  assert.equal(spendAllowed('openrouter', 5, today(), p.store), false, 'no further spend is allowed today');
  assert.match(p.r.stdout + p.r.stderr, /daily limit/i, 'the run says why it stopped');
  assert.doesNotMatch(p.r.stdout + p.r.stderr, /Infinity|NaN/, 'and does not print a broken number');
});

// ---- More commands the guard asks on ----

test('AC-63.27 ATTACK: the guard asks on secret-tool search, security with a flag before find-, find-generic-pass* globs, keyring get, import keyring and globs of ~/.vibe-kit', T, async () => {
  const { evaluate } = await load('destructive-guard.mjs');
  const asked = [
    'secret-tool search service tillerhand', 'secret-tool   search --all service tillerhand', 'secret-tool search --unlock service x',
    'security -q find-generic-password -w', 'security -q -a x find-generic-password -w', 'security -v find-generic-password -s tillerhand', '/usr/bin/security -q find-generic-password -s x -w',
    'security find-generic-pass* -w', '/usr/bin/security find-generic-pass* -s tillerhand', 'security -q find-generic-pass* -w',
    'keyring get tillerhand openrouter', 'python3 -m keyring get tillerhand openrouter',
    'python3 -c "import keyring; print(keyring.get_password(1, 2))"', 'import keyring',
    'cat ~/.v?be-kit/providers.json', 'cat ~/.v*/providers.json', 'ls ~/.*kit', 'cat $HOME/.v?be-kit/providers.json', 'cat "$HOME"/.v*/providers.json', 'ls ~/.*kit/keys',
  ];
  const tricks = ['cd /tmp && secret-tool search service x', 'bash -c "security -q find-generic-password -w"', 'sec""urity -q find-generic-password -w', 'env keyring get a b'];
  const free = ['git status', 'node --version', 'echo hello', 'security find-identity -v', 'security -q find-identity -v', 'cat ~/.bashrc', 'ls ~/Documents', 'ls ~/.config', 'node .claude/hooks/models-panel.mjs'];
  for (const ctx of GUARD_CTXS) {
    assert.deepEqual(asked.filter((c) => evaluate(c, ctx)?.decision !== 'ask'), [], `asked (${JSON.stringify(ctx)})`);
    assert.deepEqual(tricks.filter((c) => !['ask', 'deny'].includes(evaluate(c, ctx)?.decision)), [], `tricky spellings (${JSON.stringify(ctx)})`);
    assert.deepEqual(free.filter((c) => evaluate(c, ctx) !== null), [], `free (${JSON.stringify(ctx)})`);
  }
});

// ---- Third audit pass (AC-63.28): the opener path, the token out of Read/Grep/Glob, globs and the token address in commands ----

// openerArgs in a child process, on a platform of our choosing and with a SystemRoot of our choosing
const OPENER_PROBE = path.join(TMP_HOME, 'mp-opener-probe.mjs');
fs.writeFileSync(OPENER_PROBE, String.raw`
Object.defineProperty(process, 'platform', { value: process.env.MP_PLATFORM });
if (process.env.MP_SYSTEMROOT !== undefined) { delete process.env.SYSTEMROOT; process.env.SystemRoot = process.env.MP_SYSTEMROOT; }
const mod = await import(process.env.MP_PANEL);
console.log(JSON.stringify({ result: mod.openerArgs(process.env.MP_FILE) }));
`);
const MP_OPEN_FILE = path.join(os.tmpdir(), 'vibe-panel-Zz9', 'panel-open.html');
function openerProbe(t, { platform, systemRoot, root }) {
  const home = tmpDir(t, 'mp-open-home-');
  const env = { ...cleanEnv(), HOME: home, USERPROFILE: home, CLAUDE_PROJECT_DIR: root, MP_PLATFORM: platform, MP_PANEL: pathToFileURL(path.join(HOOKS, 'models-panel.mjs')).href, MP_FILE: MP_OPEN_FILE };
  if (systemRoot !== undefined) env.MP_SYSTEMROOT = systemRoot;
  const r = spawnSync(process.execPath, [OPENER_PROBE], { cwd: root, encoding: 'utf8', timeout: 30000, env });
  assert.equal(r.status, 0, `${r.stdout}\n${r.stderr}`);
  return JSON.parse(r.stdout.trim().split('\n').at(-1)).result;
}
const withRundll = (dir) => { write(path.join(dir, 'System32', 'rundll32.exe'), ''); return dir; };

test('AC-63.28 openerArgs on win32: a SystemRoot that is absolute, outside the project and holding System32\\rundll32.exe gives that full path; the args are the url.dll handler and the file only', T, async (t) => {
  const root = tmpDir(t, 'mp-op-root-');
  const outside = withRundll(path.join(tmpDir(t, 'mp-op-outside-'), 'okwin'));
  const r = openerProbe(t, { platform: 'win32', systemRoot: outside, root });
  assert.deepEqual(r && { command: path.normalize(r.command), args: r.args }, { command: path.normalize(path.join(outside, 'System32', 'rundll32.exe')), args: ['url.dll,FileProtocolHandler', MP_OPEN_FILE] });
  assert.equal(path.isAbsolute(r.command), true, 'a full path, not a bare name');
  assert.equal(r.args.some((a) => /https?:|127\.0\.0\.1|[?&]t=/i.test(a)), false, 'no address and no token in the args');
});

test('AC-63.28 ATTACK: on win32 a relative SystemRoot, one inside the project, or one with no System32\\rundll32.exe gives null, never a command under that folder', T, async (t) => {
  const root = tmpDir(t, 'mp-op-root-');
  withRundll(path.join(root, 'fakewin'));
  withRundll(path.join(root, 'nested', 'deeper', 'win'));
  withRundll(root);
  const outsideEmpty = path.join(tmpDir(t, 'mp-op-outside-'), 'emptywin');
  fs.mkdirSync(outsideEmpty, { recursive: true });
  for (const [label, systemRoot] of [['relative', 'fakewin'], ['relative with dot', `.${path.sep}fakewin`], ['relative upward', `..${path.sep}${path.basename(root)}${path.sep}fakewin`],
    ['inside the root', path.join(root, 'fakewin')], ['deep inside the root', path.join(root, 'nested', 'deeper', 'win')], ['the root itself', root], ['absolute, outside, no rundll32.exe', outsideEmpty]]) {
    assert.equal(openerProbe(t, { platform: 'win32', systemRoot, root }), null, label);
  }
});

test('AC-63.28 openerArgs with the real SystemRoot (win32 hosts only) gives the full path to the real rundll32.exe', T, (t) => {
  if (process.platform !== 'win32') { t.skip('needs a Windows host'); return; }
  const root = tmpDir(t, 'mp-op-root-');
  const real = process.env.SystemRoot ?? process.env.SYSTEMROOT;
  const r = openerProbe(t, { platform: 'win32', root });
  assert.equal(path.normalize(r.command).toLowerCase(), path.normalize(path.join(real, 'System32', 'rundll32.exe')).toLowerCase());
  assert.equal(fs.existsSync(r.command), true);
});

test('AC-63.28 openerArgs on linux and darwin: the full paths /usr/bin/xdg-open and /usr/bin/open, the file as the only argument', T, async (t) => {
  const root = tmpDir(t, 'mp-op-root-');
  assert.deepEqual(openerProbe(t, { platform: 'linux', root }), { command: '/usr/bin/xdg-open', args: [MP_OPEN_FILE] });
  assert.deepEqual(openerProbe(t, { platform: 'darwin', root }), { command: '/usr/bin/open', args: [MP_OPEN_FILE] });
});

// doc-guard on Read, Grep and Glob
function docGuardDecision(toolName, toolInput) {
  const r = spawnSync(process.execPath, [path.join(HOOKS, 'doc-guard.mjs')], {
    input: JSON.stringify({ hook_event_name: 'PreToolUse', cwd: ROOT, session_id: 'mp-test', tool_name: toolName, tool_input: toolInput }),
    encoding: 'utf8', timeout: 30000, env: { ...cleanEnv(), CLAUDE_PROJECT_DIR: ROOT },
  });
  assert.equal(r.status, 0, r.stderr);
  try { return JSON.parse(r.stdout).hookSpecificOutput?.permissionDecision ?? null; } catch { return null; }
}

test('AC-63.28 settings.json: a PreToolUse matcher covering Read, Grep and Glob runs doc-guard.mjs', T, () => {
  const blocks = JSON.parse(read('.claude/settings.json')).hooks.PreToolUse;
  for (const tool of ['Read', 'Grep', 'Glob']) {
    const hit = blocks.filter((b) => new RegExp(`^(?:${b.matcher})$`).test(tool) && b.hooks.some((h) => /hooks[\\/]doc-guard\.mjs/.test(h.command)));
    assert.equal(hit.length, 1, `doc-guard must be on ${tool}`);
  }
});

test('AC-63.28 ATTACK: doc-guard denies a Read file_path, a Grep path or glob and a Glob path or pattern that names the panel files, in any case, or spells them with a glob', T, () => {
  const names = [
    'vibe-panel-', 'VIBE-PANEL-x', 'panel-open', 'Panel-Open.html', '/tmp/vibe-panel-Ab12/panel-open.html', '/tmp/vibe-panel-*', '/tmp/*/panel-open.html',
    'vib*', '/tmp/vib*/x', '*panel-*', '/tmp/*panel-*/x', 'panel-o*', '/tmp/*/panel-o*', 'v?be-panel*', '/tmp/V?BE-PANEL*/x', 'VIB*', '*PANEL-*', 'Panel-O*',
  ];
  const slots = [['Read', 'file_path'], ['Grep', 'path'], ['Grep', 'glob'], ['Glob', 'path'], ['Glob', 'pattern']];
  const missed = [];
  for (const [tool, field] of slots) for (const name of names) {
    if (docGuardDecision(tool, { [field]: name, ...(tool === 'Grep' ? { pattern: 'x' } : {}), ...(tool === 'Glob' && field === 'path' ? { pattern: '*' } : {}) }) !== 'deny') missed.push(`${tool}.${field}=${name}`);
  }
  assert.deepEqual(missed, []);
});

test('AC-63.28 doc-guard lets ordinary Read, Grep and Glob calls through, and keeps the PDF rule', T, () => {
  const ok = [
    ['Read', { file_path: 'README.md' }], ['Read', { file_path: 'docs/vibe-panel.md' }], ['Read', { file_path: '/tmp/panel-open.txt' }],
    ['Grep', { pattern: 'todo', path: 'src' }], ['Grep', { pattern: 'todo', glob: '*.ts' }], ['Grep', { pattern: 'todo', path: 'src', glob: '**/*.mjs' }],
    ['Glob', { pattern: '**/*.md' }], ['Glob', { pattern: 'src/**/*.ts', path: 'src' }],
  ];
  for (const [tool, input] of ok) assert.equal(docGuardDecision(tool, input), null, `${tool} ${JSON.stringify(input)} must pass`);
  assert.equal(docGuardDecision('Read', { file_path: 'docs/a.pdf' }), 'deny', 'a whole PDF is still refused');
  assert.equal(docGuardDecision('Read', { file_path: 'docs/a.pdf', pages: '1-3' }), null, 'a PDF with pages still passes');
});

test('AC-63.28 ATTACK: the guard asks on globs of the panel folder and on a panel address carrying a long token, and leaves short values and other commands alone', T, async () => {
  const { evaluate } = await load('destructive-guard.mjs');
  const asked = [
    'cat /tmp/vib*/*', 'cat /tmp/*panel-*/x',
    'curl http://127.0.0.1:5000/?t=abcdefghijklmnopqrstuvwxyz', 'curl "http://127.0.0.1:5000/?t=abc123def456ghi789jkl"',
  ];
  const free = ['git commit -m "fix: panel ?t= handling"', 'ls src', 'curl https://example.com/?t=1'];
  for (const ctx of GUARD_CTXS) {
    assert.deepEqual(asked.filter((c) => evaluate(c, ctx)?.decision !== 'ask'), [], `asked (${JSON.stringify(ctx)})`);
    assert.deepEqual(free.filter((c) => evaluate(c, ctx) !== null), [], `free (${JSON.stringify(ctx)})`);
  }
});

// ---- Windows 8.3 short names of the panel's temporary page (AC-63.29) ----

test('AC-63.29 ATTACK: doc-guard denies the 8.3 short spellings of the panel folder and file, in any case, in Read, Grep and Glob', T, () => {
  const short = ['VIBE-P~1', 'vibe-p~2', String.raw`C:\Temp\VIBE-P~1\PANEL-~1.HTM`, '/tmp/VIBE-P~1/x', 'VI3A2F~1', 'PANEL-~1.HTM', 'panel-~1'];
  const names = [...new Set(short.flatMap((n) => [n, n.toLowerCase(), n.toUpperCase()]))];
  const slots = [['Read', 'file_path'], ['Grep', 'path'], ['Grep', 'glob'], ['Glob', 'path'], ['Glob', 'pattern']];
  const missed = [];
  for (const [tool, field] of slots) for (const name of names) {
    if (docGuardDecision(tool, { [field]: name, ...(tool === 'Grep' ? { pattern: 'x' } : {}), ...(tool === 'Glob' && field === 'path' ? { pattern: '*' } : {}) }) !== 'deny') missed.push(`${tool}.${field}=${name}`);
  }
  assert.deepEqual(missed, []);
});

test('AC-63.29 ATTACK: the guard asks on a command that names the 8.3 short spelling of the panel folder or file', T, async () => {
  const { evaluate } = await load('destructive-guard.mjs');
  const asked = [String.raw`type C:\Temp\VIBE-P~1\PANEL-~1.HTM`, 'cat /c/Temp/VIBE-P~1/PANEL-~1.HTM', 'dir VI3A2F~1'];
  for (const ctx of GUARD_CTXS) {
    assert.deepEqual(asked.filter((c) => evaluate(c, ctx)?.decision !== 'ask'), [], `asked (${JSON.stringify(ctx)})`);
  }
});

test('AC-63.29 no false alarm: doc-guard passes other ~1 names, and the guard leaves git revisions like HEAD~1 alone', T, async () => {
  const ok = [
    ['Read', { file_path: 'src/file~1.txt' }], ['Read', { file_path: 'docs/PROGRA~1/a.md' }], ['Read', { file_path: String.raw`C:\PROGRA~1\x` }], ['Read', { file_path: 'README.md' }],
    ['Grep', { pattern: 'x', path: 'docs/PROGRA~1' }], ['Glob', { pattern: 'src/file~1.txt' }],
  ];
  for (const [tool, input] of ok) assert.equal(docGuardDecision(tool, input), null, `${tool} ${JSON.stringify(input)} must pass`);

  const { evaluate } = await load('destructive-guard.mjs');
  const free = ['git diff HEAD~1', 'git show main~2', 'git log review~3'];
  for (const ctx of GUARD_CTXS) {
    assert.deepEqual(free.filter((c) => evaluate(c, ctx) !== null), [], `free (${JSON.stringify(ctx)})`);
  }
});
