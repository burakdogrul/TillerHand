// Run: node --test kit/tests/provider-setup.test.mjs
// 3.65.0: the setup of outside providers and the first-run texts. Criteria AC-65.1 .. AC-65.17 and AC-65.19 .. AC-65.21 (AC-65.18 is in dashboard-language.test.mjs).
//   A  session.resume has no slash command in the visible text          C  levelOf (easy / medium / hard)
//   D  provider-presets.mjs                                              E  provider-test.mjs testModel
//   F  panel routes: POST /api/test, POST /api/models-update, /api/state presets, levels and modelLists
//   G  addressFor (the empty answer takes the preset address)          H  panel text and strings    I  design brief texts
// provider-models.mjs (updateModelLists, readModelLists) refreshes the model list of every preset with one call.
// Hard limits of this file: no real network (fetchImpl is always a fake), no real vault (a memory backend), no real home folder, no real key.
//   - NOT covered here: the browser page itself (tabs, wizard, level filter, #models and #keys redirect) is checked by hand;
//     a person typing into --set-key (the empty Enter) is checked by hand: only addressFor is tested.
// Modules load inside the tests, so a missing module or export turns that test red on its own, not the whole file.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const HOOKS = path.join(ROOT, '.claude', 'hooks');
const PANEL_DIR = path.join(HOOKS, 'panel');
const load = (name) => import(pathToFileURL(path.join(HOOKS, name)).href);
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const T = { timeout: 120000 };

// Nothing in this file may touch the real home folder or a real vault
const TMP_HOME = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'ps-top-home-')));
process.env.HOME = TMP_HOME;
process.env.USERPROFILE = TMP_HOME;
process.on('exit', () => { try { fs.rmSync(TMP_HOME, { recursive: true, force: true }); } catch { /* temp */ } });

// Split up so this file does not trip the secret scan. KEY_SPECIAL holds a quote, a plus, a slash and a backslash: its JSON and URL forms differ from the plain one.
const KEY = 'zk_' + 'A1b2C3d4'.repeat(4) + 'Zq9X'; // last four: Zq9X
const KEY_SPECIAL = 'zk_' + 'q"W+e/R\\t5Y' + '_u7I9o0P';
const ACME_URL = 'https://api.acme.test/anthropic';
const MODEL = 'vendor/model-1';
const DAY_PRICE = { input: 2, output: 4 };

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
// Every plain form a key can take in a reply: as is, JSON-escaped, URL-encoded
const forms = (key) => [...new Set([key, JSON.stringify(key).slice(1, -1), encodeURIComponent(key)])];
const leaks = (text, key = KEY) => forms(key).some((f) => String(text).includes(f));
const holders = (dirs, secret) => {
  const needles = [Buffer.from(secret), Buffer.from(secret, 'utf16le'), Buffer.from(Buffer.from(secret).toString('base64'))];
  return dirs.flatMap(walk).filter((f) => { const b = fs.readFileSync(f); return needles.some((n) => b.includes(n)); });
};

const envUndo = new WeakMap();
function withEnv(t, vars) {
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
  const home = tmpDir(t, 'ps-home-');
  withEnv(t, { HOME: home, USERPROFILE: home });
  return home;
};
const storeOf = (home) => path.join(home, '.vibe-kit', 'providers.json');
const listsOf = (home) => path.join(home, '.vibe-kit', 'model-lists.json');

// A vault that lives in memory and counts every call
async function installVault(t) {
  const ks = await load('keystore.mjs');
  const store = new Map();
  const calls = { save: 0, read: 0, remove: 0 };
  ks.setVaultBackend({
    kind: 'keychain',
    save: (p, k) => { calls.save++; store.set(p, k); },
    read: (p) => { calls.read++; return store.get(p) ?? null; },
    remove: (p) => { calls.remove++; store.delete(p); },
  });
  t.after(() => ks.setVaultBackend({ kind: 'keychain', save() {}, read() { return null; }, remove() {} }));
  return { store, calls };
}
// Seals each given provider, returns the store file the metadata went into
async function sealed(t, entries = { acme: [ACME_URL, KEY] }, file = path.join(tmpDir(t, 'ps-store-'), '.vibe-kit', 'providers.json')) {
  const vault = await installVault(t);
  const { setProvider } = await load('providers.mjs');
  for (const [name, [url, key]] of Object.entries(entries)) assert.equal(setProvider(name, url, key, file), null, name);
  return { vault, file };
}

// fetchImpl fakes: every call is recorded; the default handler refuses, so a test that expects no network sees it
const offline = async () => { throw new Error('no network in this test'); };
function fetchFake(handler) {
  const calls = [];
  const impl = async (url, init = {}) => {
    calls.push({ url: String(url), method: init.method ?? 'GET', headers: Object.fromEntries(new Headers(init.headers ?? {})), body: init.body, init });
    return handler(String(url), init, calls.length);
  };
  return { impl, calls };
}
const reply = (status, body, headers = {}) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers });
const TOOL_OK = { id: 'msg_1', type: 'message', role: 'assistant', content: [{ type: 'text', text: 'calling' }, { type: 'tool_use', id: 'tu_1', name: 'ping', input: {} }], usage: { input_tokens: 1000, output_tokens: 500 } };

// Contract C, written out here so the test does not lean on the code it tests
const HARD = ['main', 'plan', 'plan.task', 'plan.architecture', 'code.critical', 'test.adversarial', 'test.critical', 'review.security', 'findings.security'];
const EASY = ['docs', 'code.simple', 'test.simple', 'board.commit'];
const expectedLevel = (name) => (HARD.includes(name) ? 'hard' : EASY.includes(name) || name.startsWith('docs.') ? 'easy' : 'medium');

// ============================================================================================
// A. The resume text (AC-65.1)
// ============================================================================================

function setupProject(t, { lang, phase, step = '3/9' }) {
  const root = tmpDir(t, 'ps-sess-');
  write(path.join(root, '.kit.json'), JSON.stringify({ type: 'web-saas', lang }));
  write(path.join(root, 'AGENTS.md'), '# P\n');
  write(path.join(root, 'docs', 'workflow', 'progress.md'), `# Progress\n\n**Last updated:** -\n**Active phase:** ${phase}\n**Active task:** -\n**Setup step:** ${step}\n**Question mode:** on · closed topics: none\n**Profile:** -\n`);
  fs.cpSync(path.join(ROOT, '.claude', 'i18n'), path.join(root, '.claude', 'i18n'), { recursive: true });
  return root;
}
function sessionStart(root) {
  const r = spawnSync(process.execPath, [path.join(HOOKS, 'session-start.mjs')], {
    input: '{}', encoding: 'utf8', timeout: 60000, env: { ...process.env, CLAUDE_PROJECT_DIR: root, HOME: root, USERPROFILE: root },
  });
  assert.equal(r.status, 0, r.stderr);
  const o = JSON.parse(r.stdout);
  return { screen: o.systemMessage ?? '', context: o.hookSpecificOutput.additionalContext };
}

test('AC-65.1 session.resume is the plain sentence in English and in Turkish, and has no command', T, async () => {
  const { MESSAGES } = await load('messages.mjs');
  assert.equal(MESSAGES['session.resume'].en, 'To continue, say "continue" (setup step {step})');
  assert.equal(JSON.parse(read('.claude/i18n/tr.json'))['session.resume'], 'Devam etmek için "devam et" yaz (kurulum adımı {step})');
});

test('AC-65.1 a project in setup shows the resume sentence on the screen with no /start and no /adopt, in English and Turkish', T, (t) => {
  const want = { en: 'To continue, say "continue" (setup step 3/9)', tr: 'Devam etmek için "devam et" yaz (kurulum adımı 3/9)' };
  for (const lang of ['en', 'tr']) {
    for (const phase of ['Setup', 'Setup (adopt)']) {
      const { screen } = sessionStart(setupProject(t, { lang, phase }));
      assert.ok(screen.includes(want[lang]), `${lang} ${phase}: ${screen}`);
      assert.doesNotMatch(screen, /\/start|\/adopt/, `${lang} ${phase}: no command on the screen`);
    }
  }
});

test('AC-65.1 the AI note keeps "/start was left unfinished (step 3/9)" (and /adopt) and says to resume when the user says continue', T, (t) => {
  for (const [phase, command] of [['Setup', '/start'], ['Setup (adopt)', '/adopt']]) {
    const { context } = sessionStart(setupProject(t, { lang: 'en', phase }));
    assert.ok(context.includes(`${command} was left unfinished (step 3/9)`), `${phase}: ${context}`);
    assert.match(context, /says?\s+["“']?continue/i, `${phase}: the note tells the AI what to do on "continue"`);
  }
});

test('AC-65.1 start.md tells the user to say "continue" after /clear, not to type a command', T, () => {
  const text = read('.claude/commands/start.md');
  const resuming = text.split('\n').find((l) => l.startsWith('**Resuming:**')) ?? '';
  assert.match(resuming, /["“]continue["”]/, 'the resume sentence is the plain word');
});

// ============================================================================================
// C. levelOf (AC-65.2)
// ============================================================================================

test('AC-65.2 levelOf gives hard, easy or medium for every role and job, exactly as listed', T, async () => {
  const { levelOf, ROLES, JOBS } = await load('models.mjs');
  const names = [...Object.keys(ROLES), ...Object.keys(JOBS)];
  assert.ok(names.length >= 40, 'every name is checked');
  for (const name of names) assert.equal(levelOf(name), expectedLevel(name), name);
  for (const name of [...HARD, ...EASY]) assert.ok(names.includes(name), `${name} is a real role or job`);
  assert.deepEqual(names.filter((n) => levelOf(n) === 'hard').sort(), [...HARD].sort());
  assert.deepEqual(names.filter((n) => levelOf(n) === 'easy').sort(), ['board.commit', 'code.simple', 'docs', 'docs.changelog', 'docs.report', 'docs.research', 'docs.scan', 'test.simple']);
  assert.equal(names.filter((n) => levelOf(n) === 'medium').length, names.length - HARD.length - 8);
});

test('AC-65.2 ATTACK: levelOf of a name that is no job is medium, also for names of Object properties and odd input', T, async () => {
  const { levelOf } = await load('models.mjs');
  for (const name of ['nope', 'code.nope', 'constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf', '', 'MAIN', 'docs-x', ' main', 'main ']) assert.equal(levelOf(name), 'medium', JSON.stringify(name));
  for (const odd of [undefined, null, 5, {}, []]) assert.equal(levelOf(odd), 'medium', String(odd));
});

// ============================================================================================
// D. Presets (AC-65.3)
// ============================================================================================

const PRESET_NAMES = ['deepseek', 'kimi', 'minimax', 'openrouter', 'qwen', 'zai'];
const LIST_URLS = {
  openrouter: 'https://openrouter.ai/api/v1/models', zai: 'https://api.z.ai/api/paas/v4/models', deepseek: 'https://api.deepseek.com/models',
  kimi: 'https://api.moonshot.ai/v1/models', minimax: 'https://api.minimax.io/anthropic/v1/models', qwen: 'https://dashscope-intl.aliyuncs.com/compatible-mode/v1/models',
};

test('AC-65.3 PRESETS holds the six ready providers and nothing else', T, async () => {
  const { PRESETS } = await load('provider-presets.mjs');
  assert.deepEqual(Object.keys(PRESETS).sort(), PRESET_NAMES);
});

test('AC-65.3 every preset has a label, https links, an address that parses, a check date, and models with valid ids and prices', T, async () => {
  const { PRESETS } = await load('provider-presets.mjs');
  const { isProvider, parseProviderUrl, MODEL_ID, validPrice } = await load('providers.mjs');
  const days = (iso) => Date.parse(`${iso}T00:00:00Z`);
  for (const [name, p] of Object.entries(PRESETS)) {
    assert.equal(isProvider(name), true, `${name} is not a reserved or malformed name`);
    assert.equal(typeof p.label, 'string', name);
    assert.ok(p.label.trim().length >= 2, `${name}: label`);
    assert.notEqual(parseProviderUrl(p.url), null, `${name}: url ${p.url}`);
    for (const field of ['url', 'keyUrl', 'modelsUrl', 'listUrl']) {
      assert.match(p[field] ?? '', /^https:\/\//, `${name}.${field}`);
      assert.doesNotThrow(() => new URL(p[field]), `${name}.${field} is an address`);
      assert.equal(new URL(p[field]).username + new URL(p[field]).password, '', `${name}.${field}: no user info`);
    }
    assert.match(p.checkedAt, /^\d{4}-\d{2}-\d{2}$/, `${name}: checkedAt`);
    assert.equal(Number.isNaN(days(p.checkedAt)), false, `${name}: a real date`);
    assert.ok(days(p.checkedAt) <= Date.now() + 864e5, `${name}: not in the future`);
    assert.ok(days(p.checkedAt) >= Date.parse('2026-01-01T00:00:00Z'), `${name}: a recent date`);
    assert.ok(Array.isArray(p.models) && p.models.length >= 1, `${name}: models`);
    assert.equal(new Set(p.models.map((m) => m.id)).size, p.models.length, `${name}: ids are unique`);
    for (const m of p.models) {
      assert.equal(typeof m.id, 'string');
      assert.match(m.id, MODEL_ID, `${name}: ${m.id}`);
      assert.equal(m.input === undefined, m.output === undefined, `${name}/${m.id}: both prices or none`);
      if (m.input !== undefined) assert.equal(validPrice({ input: m.input, output: m.output }, m.id), true, `${name}/${m.id}: price`);
      if (m.context !== undefined) assert.ok(Number.isFinite(m.context) && m.context > 0, `${name}/${m.id}: context`);
      assert.deepEqual(Object.keys(m).filter((k) => !['id', 'input', 'output', 'context'].includes(k)), [], `${name}/${m.id}: no other field`);
    }
    assert.equal(Object.hasOwn(p, 'liveModels'), false, `${name}: the live list route is gone, the update button uses listUrl`);
  }
});

test('AC-65.3 the list address of each preset is fixed, only openrouter is public, and a keyed list shares the origin of the preset address', T, async () => {
  const { PRESETS } = await load('provider-presets.mjs');
  for (const name of PRESET_NAMES) {
    assert.equal(PRESETS[name].listUrl, LIST_URLS[name], `${name}.listUrl`);
    assert.equal(PRESETS[name].listNeedsKey, name !== 'openrouter', `${name}.listNeedsKey`);
    if (PRESETS[name].listNeedsKey) assert.equal(new URL(PRESETS[name].listUrl).origin, new URL(PRESETS[name].url).origin, `${name}: the sealed address and the list address share the origin`);
  }
  assert.doesNotMatch(JSON.stringify(PRESETS), /sk-|Bearer|api[_-]?key["']?\s*:/i, 'no key or key format in the table');
});

// ============================================================================================
// G. addressFor (AC-65.4)
// ============================================================================================

test('AC-65.4 addressFor: the typed address is trimmed and wins; an empty answer takes the preset address; no preset gives an empty text', T, async () => {
  const { addressFor } = await load('models.mjs');
  const { PRESETS } = await load('provider-presets.mjs');
  for (const name of PRESET_NAMES) {
    assert.equal(addressFor(name, ''), PRESETS[name].url, name);
    assert.equal(addressFor(name, '   '), PRESETS[name].url, `${name}: spaces only`);
    assert.equal(addressFor(name, '\t\n'), PRESETS[name].url, `${name}: whitespace only`);
  }
  assert.equal(addressFor('openrouter', '  https://typed.example/anthropic \n'), 'https://typed.example/anthropic');
  assert.equal(addressFor('deepseek', 'https://typed.example'), 'https://typed.example');
  assert.equal(addressFor('acme', ''), '');
  assert.equal(addressFor('acme', ' https://api.acme.test/x '), 'https://api.acme.test/x');
  for (const name of ['constructor', '__proto__', 'toString', 'hasOwnProperty']) assert.equal(addressFor(name, ''), '', `${name}: a property of Object is no preset`);
});

// ============================================================================================
// E. testModel (AC-65.5 .. AC-65.9)
// ============================================================================================

test('AC-65.5 testModel sends one fixed request to the sealed address: POST /v1/messages, three headers, a ping tool, redirect refused, a timeout', T, async (t) => {
  const { testModel } = await load('provider-test.mjs');
  const { file } = await sealed(t);
  const f = fetchFake(() => reply(200, TOOL_OK));
  const r = await testModel({ provider: 'acme', model: MODEL, fetchImpl: f.impl, file });
  assert.equal(f.calls.length, 1);
  const c = f.calls[0];
  assert.equal(c.url, `${ACME_URL}/v1/messages`);
  assert.equal(c.method, 'POST');
  assert.deepEqual(Object.keys(c.headers).sort(), ['anthropic-version', 'authorization', 'content-type']);
  assert.equal(c.headers.authorization, `Bearer ${KEY}`);
  assert.equal(c.headers['content-type'], 'application/json');
  assert.equal(c.headers['anthropic-version'], '2023-06-01');
  assert.equal(c.init.redirect, 'error');
  assert.ok(c.init.signal instanceof AbortSignal, 'a timeout signal');
  const body = JSON.parse(c.body);
  assert.deepEqual(Object.keys(body).sort(), ['max_tokens', 'messages', 'model', 'tools']);
  assert.equal(body.model, MODEL);
  assert.equal(body.max_tokens, 256);
  assert.equal(body.messages.length, 1);
  assert.equal(body.messages[0].role, 'user');
  assert.equal(typeof body.messages[0].content, 'string');
  assert.ok(body.messages[0].content.length > 0);
  assert.equal(body.tools.length, 1);
  assert.equal(body.tools[0].name, 'ping');
  assert.deepEqual(Object.keys(r).filter((k) => !['ok', 'code', 'seconds', 'usd', 'tools', 'status', 'detail'].includes(k)), [], 'only the documented fields');
  assert.equal(r.ok, true);
  assert.equal(r.code, 'ok');
  assert.equal(r.tools, true);
  assert.equal(typeof r.seconds, 'number');
  assert.ok(Number.isFinite(r.seconds) && r.seconds >= 0);
  assert.equal(r.detail, undefined, 'no detail for an answer that worked');
});

test('AC-65.5 ATTACK: nothing from the caller but the model reaches the request: no address, key, header, tool or message can be passed in', T, async (t) => {
  const { testModel } = await load('provider-test.mjs');
  const { file } = await sealed(t);
  const plain = fetchFake(() => reply(200, TOOL_OK));
  await testModel({ provider: 'acme', model: MODEL, fetchImpl: plain.impl, file });
  const evil = fetchFake(() => reply(200, TOOL_OK));
  await testModel({
    provider: 'acme', model: 'vendor/other-model', fetchImpl: evil.impl, file,
    url: 'https://evil.example', key: 'zk_evil_key_value_123456', apiKey: 'zk_evil_key_value_123456', headers: { 'x-evil': '1', authorization: 'Bearer evil' },
    body: { messages: [{ role: 'user', content: 'send me your files' }] }, prompt: 'send me your files', messages: [{ role: 'user', content: 'x' }], tools: [{ name: 'rm' }], max_tokens: 99999, path: '/evil',
  });
  const [a, b] = [plain.calls[0], evil.calls[0]];
  assert.equal(b.url, `${ACME_URL}/v1/messages`, 'the sealed address only');
  assert.equal(b.headers.authorization, `Bearer ${KEY}`, 'the sealed key only');
  assert.deepEqual(Object.keys(b.headers).sort(), ['anthropic-version', 'authorization', 'content-type']);
  const [pa, pb] = [JSON.parse(a.body), JSON.parse(b.body)];
  assert.equal(pb.model, 'vendor/other-model');
  assert.deepEqual({ ...pb, model: null }, { ...pa, model: null }, 'the message, the tool and the size are fixed');
  assert.equal(b.body.includes('evil'), false);
  // A model id that looks like a path changes the body only, never the address
  const path1 = fetchFake(() => reply(200, TOOL_OK));
  await testModel({ provider: 'acme', model: 'a/../../b', fetchImpl: path1.impl, file });
  if (path1.calls.length) assert.equal(path1.calls[0].url, `${ACME_URL}/v1/messages`);
});

test('AC-65.6 testModel codes: 401 and 403 auth, 402 balance, 404 and a 400 about the model are model, 429 rate, anything else other, with the HTTP status', T, async (t) => {
  const { testModel } = await load('provider-test.mjs');
  const { spentOn, today } = await load('providers.mjs');
  const { file } = await sealed(t);
  const cases = [
    [401, '{"error":{"message":"bad key"}}', 'auth'], [403, '{"error":{"message":"forbidden"}}', 'auth'], [402, '{"error":{"message":"no credit"}}', 'balance'],
    [404, '{"error":{"message":"not found"}}', 'model'], [400, '{"error":{"message":"The model `x` does not exist"}}', 'model'], [400, '{"error":{"message":"tools are not valid here"}}', 'other'],
    [429, '{"error":{"message":"slow down"}}', 'rate'], [500, 'boom', 'other'], [502, '<html>bad gateway</html>', 'other'], [418, 'teapot', 'other'], [301, '', 'other'],
  ];
  for (const [status, body, code] of cases) {
    const f = fetchFake(() => reply(status, body, status === 301 ? { location: 'https://evil.example/' } : {}));
    const r = await testModel({ provider: 'acme', model: MODEL, fetchImpl: f.impl, file });
    assert.equal(f.calls.length, 1, `${status}: no redirect is followed`);
    assert.equal(r.ok, false, String(status));
    assert.equal(r.code, code, `${status} ${body}`);
    assert.equal(r.status, status);
    assert.equal(r.tools, false, `${status}: tools`);
    if (r.detail !== undefined) { assert.equal(typeof r.detail, 'string'); assert.ok(r.detail.length <= 160, `${status}: detail is cut at 160`); }
  }
  assert.equal(spentOn('acme', today(), file), 0, 'a failed call adds nothing to the ledger');
});

test('AC-65.6 a 2xx without a tool call is noTools, a 2xx that is not JSON is other, a thrown fetch (a refused redirect too) is network', T, async (t) => {
  const { testModel } = await load('provider-test.mjs');
  const { file } = await sealed(t);
  const run = async (handler) => { const f = fetchFake(handler); return { r: await testModel({ provider: 'acme', model: MODEL, fetchImpl: f.impl, file }), f }; };
  let { r } = await run(() => reply(200, { content: [{ type: 'text', text: 'I cannot call tools' }], usage: { input_tokens: 10, output_tokens: 5 } }));
  assert.equal(r.ok, false);
  assert.equal(r.code, 'noTools');
  assert.equal(r.tools, false);
  ({ r } = await run(() => reply(200, 'this is not JSON')));
  assert.equal(r.ok, false);
  assert.equal(r.code, 'other');
  ({ r } = await run(() => reply(200, '')));
  assert.equal(r.code, 'other');
  for (const err of [new TypeError('fetch failed'), Object.assign(new TypeError('fetch failed'), { cause: new Error('unexpected redirect') }), Object.assign(new Error('aborted'), { name: 'AbortError' })]) {
    ({ r } = await run(() => { throw err; }));
    assert.equal(r.ok, false);
    assert.equal(r.code, 'network', err.message);
    assert.equal(r.detail, undefined, 'a network error has no provider reply to quote');
  }
});

test('AC-65.7 testModel refuses before any request: no key, a bad provider, a bad model id, an unsafe environment, a daily limit that is spent', T, async (t) => {
  const { testModel } = await load('provider-test.mjs');
  const { setLimit, addSpend, today } = await load('providers.mjs');
  const { file } = await sealed(t);
  const f = fetchFake(() => reply(200, TOOL_OK));
  const run = (args) => testModel({ fetchImpl: f.impl, file, ...args });
  let r = await run({ provider: 'other', model: MODEL });
  assert.deepEqual([r.ok, r.code], [false, 'noKey'], 'a provider that has no sealed key (the key of acme is not used for it)');
  for (const provider of ['Evil', '../x', '__proto__', 'constructor', 'con', '', undefined, null, 5, {}]) {
    r = await run({ provider, model: MODEL });
    assert.deepEqual([r.ok, r.code], [false, 'badRequest'], `provider ${JSON.stringify(provider)}`);
  }
  for (const model of ['', '../x', 'a b', 'a\nb', '-x', undefined, null, 5, {}, ['a']]) {
    r = await run({ provider: 'acme', model });
    assert.deepEqual([r.ok, r.code], [false, 'badRequest'], `model ${JSON.stringify(model)}`);
  }
  assert.equal(f.calls.length, 0, 'none of these sent anything');
  withEnv(t, { SSL_CERT_FILE: path.join(os.tmpdir(), 'ca.pem') });
  r = await run({ provider: 'acme', model: MODEL });
  assert.deepEqual([r.ok, r.code], [false, 'unsafeEnv'], 'a certificate variable would send the key to a forged host');
  assert.equal(f.calls.length, 0);
  withEnv(t, { SSL_CERT_FILE: undefined });
  setLimit('acme', 1, file);
  addSpend('acme', 0.25, today(), file);
  r = await run({ provider: 'acme', model: MODEL });
  assert.equal(r.code, 'ok', 'control: a limit that is not reached lets the test through');
  assert.equal(f.calls.length, 1);
  addSpend('acme', 1, today(), file);
  r = await run({ provider: 'acme', model: MODEL });
  assert.deepEqual([r.ok, r.code], [false, 'limit']);
  assert.equal(f.calls.length, 1, 'no request once the day is spent');
});

test('AC-65.7 with no vault entry nothing is sent, and a vault entry that is not the sealed package gives noKey', T, async (t) => {
  const { testModel } = await load('provider-test.mjs');
  const { vault, file } = await sealed(t, {});
  const f = fetchFake(() => reply(200, TOOL_OK));
  assert.equal((await testModel({ provider: 'acme', model: MODEL, fetchImpl: f.impl, file })).code, 'noKey');
  vault.store.set('acme', KEY); // an old bare key, no address with it
  assert.equal((await testModel({ provider: 'acme', model: MODEL, fetchImpl: f.impl, file })).code, 'noKey');
  assert.equal(f.calls.length, 0);
});

test('AC-65.8 usd is the cost of the reply at the catalog price, else at the default price, and it goes into the daily ledger; the sum grows with each test', T, async (t) => {
  const { testModel } = await load('provider-test.mjs');
  const { DEFAULT_PRICE } = await load('run-role.mjs');
  const { addCatalog, spentOn, today } = await load('providers.mjs');
  const { file } = await sealed(t);
  const f = fetchFake(() => reply(200, TOOL_OK));
  const dflt = (1000 * DEFAULT_PRICE.input + 500 * DEFAULT_PRICE.output) / 1e6;
  let r = await testModel({ provider: 'acme', model: MODEL, fetchImpl: f.impl, file });
  close(r.usd, dflt, 'default price');
  close(spentOn('acme', today(), file), dflt, 'ledger after one test');
  assert.equal(addCatalog('acme', { model: MODEL, ...DAY_PRICE }, file), null);
  r = await testModel({ provider: 'acme', model: MODEL, fetchImpl: f.impl, file });
  close(r.usd, (1000 * 2 + 500 * 4) / 1e6, 'catalog price');
  close(spentOn('acme', today(), file), dflt + 0.004, 'ledger after two tests');
  // another model of the same provider has no catalog entry: default price again
  r = await testModel({ provider: 'acme', model: 'vendor/model-2', fetchImpl: f.impl, file });
  close(r.usd, dflt, 'a model with no catalog price');
  // a reply with no usage costs nothing and is not an error
  const none = fetchFake(() => reply(200, { content: TOOL_OK.content }));
  r = await testModel({ provider: 'acme', model: MODEL, fetchImpl: none.impl, file });
  assert.equal(r.ok, true);
  assert.equal(r.usd, 0);
});

test('AC-65.8 ATTACK: a usage that is negative, huge or not a number never makes the ledger shrink or break', T, async (t) => {
  const { testModel } = await load('provider-test.mjs');
  const { spentOn, today } = await load('providers.mjs');
  const { file } = await sealed(t);
  for (const usage of [{ input_tokens: -1000, output_tokens: -500 }, { input_tokens: 'many', output_tokens: null }, { input_tokens: 1e308, output_tokens: 1e308 }, null, 'x']) {
    const f = fetchFake(() => reply(200, { ...TOOL_OK, usage }));
    const before = spentOn('acme', today(), file);
    const r = await testModel({ provider: 'acme', model: MODEL, fetchImpl: f.impl, file });
    assert.equal(Number.isFinite(r.usd), true, JSON.stringify(usage));
    assert.ok(r.usd >= 0, `${JSON.stringify(usage)}: no negative cost`);
    assert.ok(spentOn('acme', today(), file) >= before, `${JSON.stringify(usage)}: the ledger never shrinks`);
  }
});

test('AC-65.9 ATTACK: the key is in no field of the result, whatever the provider echoes (plain, JSON-escaped, URL-encoded, in a JSON field), and detail is cut at 160', T, async (t) => {
  const { testModel } = await load('provider-test.mjs');
  const { file } = await sealed(t, { acme: [ACME_URL, KEY_SPECIAL] });
  const out = [];
  const stdout = process.stdout.write, stderr = process.stderr.write;
  process.stdout.write = function (c, ...a) { out.push(String(c)); return stdout.call(this, c, ...a); };
  process.stderr.write = function (c, ...a) { out.push(String(c)); return stderr.call(this, c, ...a); };
  t.after(() => { process.stdout.write = stdout; process.stderr.write = stderr; });
  const echoes = [
    [401, `invalid key ${KEY_SPECIAL}`], [401, JSON.stringify({ error: { message: `invalid key ${KEY_SPECIAL}` } })], [403, `denied for ${encodeURIComponent(KEY_SPECIAL)}`],
    [500, `Authorization: Bearer ${KEY_SPECIAL}`], [429, `${'x'.repeat(100)} ${KEY_SPECIAL} ${'y'.repeat(300)}`], [400, `bad model, key ${KEY_SPECIAL} ${JSON.stringify(KEY_SPECIAL)}`],
    [200, `not json ${KEY_SPECIAL}`], [404, `${KEY_SPECIAL}`.repeat(10)],
  ];
  assert.notEqual(forms(KEY_SPECIAL).length, 1, 'the three forms of this key differ');
  for (const [status, body] of echoes) {
    const f = fetchFake(() => reply(status, body));
    const r = await testModel({ provider: 'acme', model: MODEL, fetchImpl: f.impl, file });
    assert.equal(leaks(JSON.stringify(r), KEY_SPECIAL), false, `${status}: ${JSON.stringify(r)}`);
    assert.equal(r.ok, false);
    if (r.detail !== undefined) assert.ok(r.detail.length <= 160, `${status}: detail length ${r.detail.length}`);
  }
  const field = fetchFake(() => reply(200, { ...TOOL_OK, id: KEY_SPECIAL, echo: KEY_SPECIAL, content: [...TOOL_OK.content, { type: 'text', text: `key ${KEY_SPECIAL}` }] }));
  assert.equal(leaks(JSON.stringify(await testModel({ provider: 'acme', model: MODEL, fetchImpl: field.impl, file })), KEY_SPECIAL), false, 'a key in a JSON field of a good reply');
  const thrown = fetchFake(() => { throw Object.assign(new TypeError(`connect failed for ${KEY_SPECIAL}`), { cause: new Error(`tls: ${KEY_SPECIAL}`) }); });
  assert.equal(leaks(JSON.stringify(await testModel({ provider: 'acme', model: MODEL, fetchImpl: thrown.impl, file })), KEY_SPECIAL), false, 'a key in the message of a thrown error');
  assert.equal(leaks(out.join(''), KEY_SPECIAL), false, 'stdout and stderr');
  assert.deepEqual(holders([path.dirname(file)], KEY_SPECIAL), [], 'no file next to the store holds the key');
});

test('AC-65.9 ATTACK: the key goes to the sealed address only, and one provider never gets the key of another', T, async (t) => {
  const { testModel } = await load('provider-test.mjs');
  const { file } = await sealed(t, { acme: [ACME_URL, KEY], beta: ['https://api.beta.test/anthropic', KEY_SPECIAL] });
  const f = fetchFake(() => reply(200, TOOL_OK));
  await testModel({ provider: 'beta', model: MODEL, fetchImpl: f.impl, file });
  await testModel({ provider: 'acme', model: MODEL, fetchImpl: f.impl, file });
  assert.deepEqual(f.calls.map((c) => [c.url, c.headers.authorization]), [
    ['https://api.beta.test/anthropic/v1/messages', `Bearer ${KEY_SPECIAL}`], [`${ACME_URL}/v1/messages`, `Bearer ${KEY}`],
  ]);
});

// ============================================================================================
// Model lists: provider-models.mjs (AC-65.10)
// ============================================================================================

const reasonable = (list) => [...list].sort((a, b) => a.id.localeCompare(b.id));
async function listSetup(t, entries = {}) {
  const { PRESETS } = await load('provider-presets.mjs');
  const { file: store, vault } = await sealed(t, entries);
  const file = path.join(tmpDir(t, 'ps-lists-'), 'model-lists.json');
  const nameOf = Object.fromEntries(Object.entries(PRESETS).map(([n, p]) => [p.listUrl, n]));
  const run = async (handlers, opts = {}) => {
    const { updateModelLists } = await load('provider-models.mjs');
    const f = fetchFake((url, init) => { const h = handlers[nameOf[url]]; return h ? h(url, init) : reply(401, '{"error":"no access"}'); });
    const out = await updateModelLists({ fetchImpl: f.impl, file, ...opts });
    return { ...out, calls: f.calls };
  };
  return { PRESETS, vault, store, file, run, nameOf };
}
const OR_ENTRIES = [
  { id: 'acme/a', pricing: { prompt: '0.000002', completion: '0.000004' }, context_length: 32000, supported_parameters: ['tools', 'temperature'], description: 'x'.repeat(50) },
  { id: 'acme/b2', pricing: { prompt: '0.0000005', completion: '0.0000015' }, supported_parameters: ['tools'] },
  { id: 'acme/m:free', pricing: { prompt: '0', completion: '0' }, context_length: 8000, supported_parameters: ['tools'] },
  { id: 'acme/plain' },
  { id: 'acme/no-tools', pricing: { prompt: '0.000001', completion: '0.000002' }, supported_parameters: ['temperature'] },
  { id: 'acme/batch:batch', pricing: { prompt: '0.000001', completion: '0.000002' }, supported_parameters: ['tools'] },
  { id: 'acme/neg', pricing: { prompt: '-0.000001', completion: '0.000002' }, supported_parameters: ['tools'] },
  { id: 'acme/nan', pricing: { prompt: 'abc', completion: '0.000002' }, supported_parameters: ['tools'] },
  { id: 'acme/inf', pricing: { prompt: '1e999', completion: '0.000002' }, supported_parameters: ['tools'] },
  { id: 'bad id with space', supported_parameters: ['tools'] }, { id: '' }, { id: '../x', supported_parameters: ['tools'] }, { id: 5 }, { id: ['a'] }, {}, [], 'junk', null, 7, true,
];

test('AC-65.10 updateModelLists reads the public openrouter list: tools only, no :batch, bad ids and junk dropped, prices in USD per million, nothing sent along', T, async (t) => {
  const s = await listSetup(t, { openrouter: [new URL(LIST_URLS.openrouter).origin + '/api', KEY] });
  const out = await s.run({ openrouter: () => reply(200, { data: OR_ENTRIES }) });
  assert.deepEqual(Object.keys(out.results).sort(), PRESET_NAMES, 'a result for every preset');
  assert.equal(out.results.openrouter.ok, true);
  assert.equal(out.results.openrouter.code, 'ok');
  assert.equal(out.results.openrouter.count, 4);
  assert.equal(out.results.openrouter.added, 4);
  const call = out.calls.find((c) => c.url === LIST_URLS.openrouter);
  assert.ok(call, 'the list was asked for');
  assert.equal(call.headers.authorization, undefined, 'a public list gets no key, though one is sealed for this provider');
  assert.equal(leaks(JSON.stringify(call.headers)), false);
  assert.equal(call.init.redirect, 'error');
  assert.ok(call.init.signal instanceof AbortSignal);
  assert.equal(call.method, 'GET');
  const saved = JSON.parse(fs.readFileSync(s.file, 'utf8'));
  assert.deepEqual(Object.keys(saved), ['openrouter'], 'only a provider whose list arrived is written');
  assert.equal(new Date(saved.openrouter.at).toISOString(), saved.openrouter.at, 'at is an ISO date');
  assert.ok(Math.abs(Date.now() - Date.parse(saved.openrouter.at)) < 60000, 'at is now');
  const models = reasonable(saved.openrouter.models);
  assert.deepEqual(models.map((m) => m.id), ['acme/a', 'acme/b2', 'acme/m:free', 'acme/plain']);
  const by = Object.fromEntries(models.map((m) => [m.id, m]));
  close(by['acme/a'].input, 2, 'input of a'); close(by['acme/a'].output, 4, 'output of a'); assert.equal(by['acme/a'].context, 32000);
  close(by['acme/b2'].input, 0.5, 'input of b2'); close(by['acme/b2'].output, 1.5, 'output of b2'); assert.equal(Object.hasOwn(by['acme/b2'], 'context'), false);
  assert.equal(by['acme/m:free'].input, 0); assert.equal(by['acme/m:free'].output, 0);
  assert.deepEqual(by['acme/plain'], { id: 'acme/plain' }, 'an entry with no price and no tool field is kept as it is');
  for (const m of models) assert.deepEqual(Object.keys(m).filter((k) => !['id', 'input', 'output', 'context'].includes(k)), [], `${m.id}: no other field is stored`);
  const { readModelLists } = await load('provider-models.mjs');
  assert.deepEqual(readModelLists(s.file), saved);
});

test('AC-65.10 a keyed list is asked with the Bearer key when its address shares the origin of the sealed address; a provider with no key is not asked', T, async (t) => {
  const { PRESETS } = await load('provider-presets.mjs');
  const keyed = Object.keys(PRESETS).filter((n) => PRESETS[n].listNeedsKey);
  assert.deepEqual(keyed.sort(), ['deepseek', 'kimi', 'minimax', 'qwen', 'zai']);
  const s = await listSetup(t, { deepseek: [PRESETS.deepseek.url, KEY] });
  const out = await s.run({ deepseek: () => reply(200, { data: [{ id: 'deepseek-chat' }, { id: 'deepseek-reasoner' }] }), openrouter: () => reply(500, 'down') });
  const ask = out.calls.filter((c) => c.url === LIST_URLS.deepseek);
  assert.equal(ask.length, 1);
  assert.equal(ask[0].headers.authorization, `Bearer ${KEY}`);
  assert.equal(ask[0].init.redirect, 'error');
  assert.ok(ask[0].init.signal instanceof AbortSignal);
  assert.deepEqual(out.results.deepseek.ok, true);
  assert.equal(out.results.deepseek.count, 2);
  for (const name of ['kimi', 'minimax', 'qwen', 'zai']) {
    assert.equal(out.results[name].ok, false, name);
    assert.equal(out.results[name].code, 'noKey', name);
    assert.equal(out.calls.some((c) => c.url === LIST_URLS[name]), false, `${name}: no request without a sealed key`);
  }
  assert.equal(out.calls.filter((c) => c.headers.authorization !== undefined).length, 1, 'the key went out once');
  assert.equal(out.results.openrouter.ok, false, 'one failing provider does not stop the others');
  assert.deepEqual(Object.keys(JSON.parse(fs.readFileSync(s.file, 'utf8'))), ['deepseek']);
});

test('AC-65.10 ATTACK: a sealed address on another host or port gets no request and no key: otherHost', T, async (t) => {
  const { PRESETS } = await load('provider-presets.mjs');
  const host = new URL(PRESETS.deepseek.url).host;
  for (const sealedUrl of ['https://api.evil.example/anthropic', `https://${host}:8443/anthropic`, `https://${host}.evil.example/anthropic`, `https://evil.example/${host}`]) {
    const s = await listSetup(t, { deepseek: [sealedUrl, KEY] });
    const out = await s.run({ deepseek: () => reply(200, { data: [{ id: 'deepseek-chat' }] }) });
    assert.equal(out.results.deepseek.ok, false, sealedUrl);
    assert.equal(out.results.deepseek.code, 'otherHost', sealedUrl);
    assert.equal(out.calls.some((c) => c.url === LIST_URLS.deepseek), false, `${sealedUrl}: nothing asked`);
    assert.equal(out.calls.some((c) => c.headers.authorization !== undefined || leaks(JSON.stringify(c.headers))), false, `${sealedUrl}: no key out`);
    assert.equal(fs.existsSync(s.file) ? Object.hasOwn(JSON.parse(fs.readFileSync(s.file, 'utf8')), 'deepseek') : false, false);
  }
  // control: the same address as the preset passes, with a different path
  const s = await listSetup(t, { deepseek: [`https://${host}/another/path`, KEY] });
  const out = await s.run({ deepseek: () => reply(200, { data: [{ id: 'deepseek-chat' }] }) });
  assert.equal(out.results.deepseek.ok, true);
});

test('AC-65.10 a keyed preset that has prices keeps them for a model with the same id, and a new id has none', T, async (t) => {
  const { PRESETS } = await load('provider-presets.mjs');
  const name = Object.keys(PRESETS).find((n) => PRESETS[n].listNeedsKey && PRESETS[n].models.some((m) => m.input !== undefined));
  assert.ok(name, 'at least one keyed preset has a priced model');
  const priced = PRESETS[name].models.find((m) => m.input !== undefined);
  const s = await listSetup(t, { [name]: [PRESETS[name].url, KEY] });
  const out = await s.run({ [name]: () => reply(200, { data: [{ id: priced.id }, { id: 'zz-new-model' }] }) });
  assert.equal(out.results[name].ok, true);
  const models = Object.fromEntries(JSON.parse(fs.readFileSync(s.file, 'utf8'))[name].models.map((m) => [m.id, m]));
  assert.equal(models[priced.id].input, priced.input);
  assert.equal(models[priced.id].output, priced.output);
  assert.equal(models['zz-new-model'].input, undefined);
  assert.equal(models['zz-new-model'].output, undefined);
});

test('AC-65.10 added counts the ids that were not in the saved list; the list is replaced by the new one', T, async (t) => {
  const s = await listSetup(t);
  const list = (...ids) => () => reply(200, { data: ids.map((id) => ({ id, supported_parameters: ['tools'] })) });
  let out = await s.run({ openrouter: list('acme/a', 'acme/b') });
  assert.deepEqual([out.results.openrouter.count, out.results.openrouter.added], [2, 2]);
  out = await s.run({ openrouter: list('acme/b', 'acme/c', 'acme/d') });
  assert.deepEqual([out.results.openrouter.count, out.results.openrouter.added], [3, 2]);
  assert.deepEqual(reasonable(JSON.parse(fs.readFileSync(s.file, 'utf8')).openrouter.models).map((m) => m.id), ['acme/b', 'acme/c', 'acme/d']);
  out = await s.run({ openrouter: list('acme/b', 'acme/c', 'acme/d') });
  assert.deepEqual([out.results.openrouter.count, out.results.openrouter.added], [3, 0]);
});

test('AC-65.10 a failed provider keeps its old list untouched: 401, 403, 429, 500, a reply that is not JSON, has no data array, is empty, is over 8 MB, or a thrown fetch', T, async (t) => {
  const s = await listSetup(t);
  await s.run({ openrouter: () => reply(200, { data: [{ id: 'acme/a', supported_parameters: ['tools'] }, { id: 'acme/b', supported_parameters: ['tools'] }] }) });
  const before = fs.readFileSync(s.file, 'utf8');
  const big = JSON.stringify({ data: [{ id: 'acme/huge', supported_parameters: ['tools'] }], pad: 'x'.repeat(8 * 1024 * 1024 + 64) });
  assert.ok(big.length > 8 * 1024 * 1024);
  const cases = [
    ['auth', () => reply(401, '{"error":"no"}')], ['auth', () => reply(403, '{"error":"no"}')], ['rate', () => reply(429, '{"error":"slow"}')], ['other', () => reply(500, 'down')],
    ['other', () => reply(200, 'not json')], ['other', () => reply(200, '')], ['other', () => reply(200, { object: 'list' })], ['other', () => reply(200, { data: 'nope' })],
    ['other', () => reply(200, { data: [] })], ['other', () => reply(200, { data: [{ id: 'bad id' }, 'junk', null] })], ['other', () => reply(200, big)],
    ['other', () => reply(200, { error: { message: 'auth error in a 200 body' } })], ['network', () => { throw new TypeError('fetch failed'); }],
  ];
  for (const [code, handler] of cases) {
    const out = await s.run({ openrouter: handler });
    assert.equal(out.results.openrouter.ok, false, code);
    assert.equal(out.results.openrouter.code, code);
    assert.equal(fs.readFileSync(s.file, 'utf8'), before, `${code}: the saved file is as it was`);
  }
});

test('AC-65.10 a 200 reply whose JSON has no data array fails with other and keeps the old list (keyed provider too)', T, async (t) => {
  const { PRESETS } = await load('provider-presets.mjs');
  const s = await listSetup(t, { zai: [PRESETS.zai.url, KEY] });
  await s.run({ zai: () => reply(200, { data: [{ id: 'glm-x' }] }) });
  const before = fs.readFileSync(s.file, 'utf8');
  assert.deepEqual(Object.keys(JSON.parse(before)), ['zai']);
  for (const body of [{ code: 401, msg: 'token expired or incorrect', success: false }, { error: { message: 'unauthorized' } }, { data: null }, { data: {} }, []]) {
    const out = await s.run({ zai: () => reply(200, body) });
    assert.equal(out.results.zai.ok, false, JSON.stringify(body));
    assert.equal(out.results.zai.code, 'other', JSON.stringify(body));
    assert.equal(fs.readFileSync(s.file, 'utf8'), before, 'the old list stays');
  }
});

test('AC-65.10 ATTACK: the key is in no result, no saved file and no thrown error, even when the provider echoes it as a model id, in an error body or in an error message', T, async (t) => {
  const { PRESETS } = await load('provider-presets.mjs');
  const s = await listSetup(t, { deepseek: [PRESETS.deepseek.url, KEY], kimi: [PRESETS.kimi.url, KEY], minimax: [PRESETS.minimax.url, KEY], qwen: [PRESETS.qwen.url, KEY_SPECIAL] });
  const out = await s.run({
    deepseek: () => reply(200, { data: [{ id: KEY }, { id: 'ok/model' }] }),
    kimi: () => reply(401, `invalid key ${KEY}`),
    minimax: () => { throw Object.assign(new TypeError(`connect failed ${KEY}`), { cause: new Error(KEY) }); },
    qwen: () => reply(403, JSON.stringify({ error: { message: `bad ${KEY_SPECIAL}` } })),
  });
  // out.calls is the fake fetch's own record of the outgoing requests (it holds the Bearer header on purpose): only the result is checked
  assert.equal(leaks(JSON.stringify(out.results)), false, 'result');
  assert.equal(leaks(JSON.stringify(out.results), KEY_SPECIAL), false, 'result (special key)');
  assert.equal(out.results.minimax.code, 'network');
  assert.equal(out.results.kimi.code, 'auth');
  assert.equal(out.results.qwen.code, 'auth');
  const dir = path.dirname(s.file);
  assert.deepEqual(holders([dir, path.dirname(s.store)], KEY), [], 'no file holds the key');
  assert.deepEqual(holders([dir, path.dirname(s.store)], KEY_SPECIAL), [], 'no file holds the special key');
});

test('AC-65.10 ATTACK: the list addresses are the preset ones only; nothing the caller passes in builds a request', T, async (t) => {
  const { PRESETS } = await load('provider-presets.mjs');
  const s = await listSetup(t, { deepseek: [PRESETS.deepseek.url, KEY] });
  const out = await s.run({ openrouter: () => reply(200, { data: [{ id: 'acme/a' }] }), deepseek: () => reply(200, { data: [{ id: 'deepseek-chat' }] }) }, {
    url: 'https://evil.example/models', listUrl: 'https://evil.example/models', provider: 'evil', presets: { evil: { listUrl: 'https://evil.example/m', listNeedsKey: false, models: [] } }, headers: { authorization: 'Bearer evil' },
  });
  const allowed = new Set(Object.values(LIST_URLS));
  assert.deepEqual(out.calls.filter((c) => !allowed.has(c.url)).map((c) => c.url), []);
  assert.equal(new Set(out.calls.map((c) => c.url)).size, out.calls.length, 'each address once');
  assert.deepEqual(Object.keys(out.results).sort(), PRESET_NAMES);
});

test('AC-65.10 readModelLists gives an empty object for a missing or broken file and never throws', T, async (t) => {
  const { readModelLists } = await load('provider-models.mjs');
  const dir = tmpDir(t, 'ps-rl-');
  assert.deepEqual(readModelLists(path.join(dir, 'none.json')), {});
  for (const text of ['', 'not json', '[]', 'null', '{"openrouter":']) {
    write(path.join(dir, 'b.json'), text);
    assert.doesNotThrow(() => readModelLists(path.join(dir, 'b.json')), text);
    assert.deepEqual(readModelLists(path.join(dir, 'b.json')), {}, JSON.stringify(text));
  }
});

// ============================================================================================
// Panel server (AC-65.11 .. AC-65.14)
// ============================================================================================

function panelProject(t, { lang = 'en' } = {}) {
  const root = tmpDir(t, 'ps-panel-');
  fs.cpSync(HOOKS, path.join(root, '.claude', 'hooks'), { recursive: true });
  fs.cpSync(path.join(ROOT, '.claude', 'i18n'), path.join(root, '.claude', 'i18n'), { recursive: true });
  write(path.join(root, '.kit.json'), JSON.stringify({ type: 'web-saas', lang }));
  withEnv(t, { CLAUDE_PROJECT_DIR: root, ANTHROPIC_MODEL: undefined, CLAUDE_CODE_EFFORT_LEVEL: undefined, CLAUDE_CODE_SUBAGENT_MODEL: undefined });
  const models = path.join(root, '.claude', 'state', 'models.json');
  return { root, models, saved: () => JSON.parse(fs.readFileSync(models, 'utf8')) };
}
const call = (panel, { method = 'GET', url = '/', secret, headers = {}, body, origin, type } = {}) => new Promise((resolve, reject) => {
  const h = { ...headers };
  if (secret !== undefined) h['x-panel-session'] = secret;
  if (method !== 'GET') {
    if (origin !== null) h.origin = origin ?? `http://127.0.0.1:${panel.port}`;
    if (type !== null) h['content-type'] = type ?? 'application/json';
  }
  const data = body === undefined ? undefined : (Buffer.isBuffer(body) || typeof body === 'string' ? body : JSON.stringify(body));
  if (data !== undefined) h['content-length'] = Buffer.byteLength(data);
  const req = http.request({ host: '127.0.0.1', port: panel.port, method, path: url, headers: h, agent: false }, (res) => {
    const chunks = [];
    res.on('data', (c) => chunks.push(c));
    res.on('end', () => { const raw = Buffer.concat(chunks); resolve({ status: res.statusCode, headers: res.headers, text: raw.toString('utf8'), json: () => JSON.parse(raw.toString('utf8')) }); });
    res.on('error', reject);
  });
  req.on('error', reject);
  req.setTimeout(30000, () => req.destroy(new Error('request timed out')));
  req.end(data);
});
async function session(t, proj, opts = {}) {
  const { createPanel } = await load('models-panel.mjs');
  const panel = await createPanel({ root: proj.root, idleMs: 10 * 60 * 1000, fetchImpl: offline, ...opts });
  t.after(async () => { try { await panel.close(); } catch { /* closed already */ } });
  const login = await call(panel, { url: `/?t=${panel.token}` });
  assert.equal(login.status, 200);
  const secret = login.text.match(/<meta\b[^>]*\bname\s*=\s*["']panel-session["'][^>]*\bcontent\s*=\s*["']([^"']*)["']/i)?.[1];
  assert.match(secret ?? '', /^\S{32,}$/);
  return {
    panel, secret,
    get: (url, extra) => call(panel, { url, secret, ...extra }),
    post: (url, body, extra) => call(panel, { method: 'POST', url, secret, body, ...extra }),
    state: async () => { const r = await call(panel, { url: '/api/state', secret }); assert.equal(r.status, 200, r.text.slice(0, 300)); return r.json(); },
  };
}

test('AC-65.11 POST /api/test answers 200 with the test result, and the call goes to the sealed address with the sealed key', T, async (t) => {
  const home = freshHome(t);
  const { vault } = await sealed(t, { acme: [ACME_URL, KEY] }, storeOf(home));
  const { spentOn, today } = await load('providers.mjs');
  const f = fetchFake(() => reply(200, TOOL_OK));
  const s = await session(t, panelProject(t), { fetchImpl: f.impl });
  vault.calls.read = 0;
  const r = await s.post('/api/test', { provider: 'acme', model: MODEL });
  assert.equal(r.status, 200, r.text);
  const body = r.json();
  assert.deepEqual([body.ok, body.code, body.tools], [true, 'ok', true]);
  assert.equal(typeof body.seconds, 'number');
  assert.equal(typeof body.usd, 'number');
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].url, `${ACME_URL}/v1/messages`);
  assert.equal(f.calls[0].headers.authorization, `Bearer ${KEY}`);
  assert.ok(vault.calls.read >= 1, 'the vault is opened for the test and only for it');
  assert.ok(spentOn('acme', today(), storeOf(home)) > 0, 'the cost is in the daily ledger of the home store');
  assert.equal(leaks(r.text) || leaks(JSON.stringify(r.headers)), false, 'no key in the answer');
  // no key: the answer is the result, nothing is sent
  const none = await s.post('/api/test', { provider: 'nokey', model: MODEL });
  assert.equal(none.status, 200);
  assert.deepEqual([none.json().ok, none.json().code], [false, 'noKey']);
  assert.equal(f.calls.length, 1);
  // a failing provider is a normal answer too
  const bad = fetchFake(() => reply(401, `invalid key ${KEY}`));
  const s2 = await session(t, panelProject(t), { fetchImpl: bad.impl });
  const denied = await s2.post('/api/test', { provider: 'acme', model: MODEL });
  assert.equal(denied.status, 200);
  assert.equal(denied.json().code, 'auth');
  assert.equal(leaks(denied.text), false, 'a key echoed by the provider does not reach the page');
});

test('AC-65.11 ATTACK: POST /api/test ignores every field but provider and model: a url, a key or a header in the body cannot change the target', T, async (t) => {
  const home = freshHome(t);
  await sealed(t, { acme: [ACME_URL, KEY] }, storeOf(home));
  const f = fetchFake(() => reply(200, TOOL_OK));
  const s = await session(t, panelProject(t), { fetchImpl: f.impl });
  const r = await s.post('/api/test', { provider: 'acme', model: MODEL, url: 'https://evil.example', key: 'zk_evil_key_value_123456', headers: { authorization: 'Bearer evil' }, body: { x: 1 }, file: '/tmp/x', fetchImpl: 'x', tools: [{ name: 'rm' }] });
  assert.equal(r.status, 200, r.text);
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].url, `${ACME_URL}/v1/messages`);
  assert.equal(f.calls[0].headers.authorization, `Bearer ${KEY}`);
  assert.equal(JSON.stringify(JSON.parse(f.calls[0].body).tools.map((x) => x.name)), '["ping"]');
});

test('AC-65.11 ATTACK: POST /api/test needs the session secret, the right Origin and a JSON body, refuses a bad model and a body that is no object, and sends nothing then', T, async (t) => {
  const home = freshHome(t);
  await sealed(t, { acme: [ACME_URL, KEY] }, storeOf(home));
  const f = fetchFake(() => reply(200, TOOL_OK));
  const s = await session(t, panelProject(t), { fetchImpl: f.impl });
  const body = { provider: 'acme', model: MODEL };
  assert.equal((await call(s.panel, { method: 'POST', url: '/api/test', body })).status, 401, 'no session secret');
  assert.equal((await call(s.panel, { method: 'POST', url: '/api/test', secret: 'f'.repeat(s.secret.length), body })).status, 401, 'forged secret');
  for (const origin of [null, 'http://evil.example', `http://localhost:${s.panel.port}`, `https://127.0.0.1:${s.panel.port}`, 'null']) assert.equal((await s.post('/api/test', body, { origin })).status, 403, `Origin ${origin}`);
  for (const type of [null, 'text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data; boundary=x']) assert.ok([403, 415].includes((await s.post('/api/test', JSON.stringify(body), { type })).status), `type ${type}`);
  assert.equal((await s.post('/api/test', 'a'.repeat(70 * 1024))).status, 413);
  for (const bad of ['[]', '"x"', '5', 'null', '{"provider":']) assert.ok((await s.post('/api/test', bad)).status >= 400, bad);
  for (const model of ['../x', '', 'a b']) {
    const r = await s.post('/api/test', { provider: 'acme', model });
    assert.ok([200, 400, 422].includes(r.status), `${model}: ${r.status}`);
    if (r.status === 200) assert.equal(r.json().code, 'badRequest');
  }
  assert.equal(f.calls.length, 0, 'none of these reached the provider');
  assert.equal((await s.post('/api/test', body)).status, 200, 'control: the same call with everything right works');
  assert.equal(f.calls.length, 1);
});

test('AC-65.11 a second test while one runs answers 429 busy and sends nothing; once the first ends the next one runs', T, async (t) => {
  const home = freshHome(t);
  await sealed(t, { acme: [ACME_URL, KEY] }, storeOf(home));
  let release;
  const gate = new Promise((r) => { release = r; });
  const f = fetchFake(async () => { await gate; return reply(200, TOOL_OK); });
  const s = await session(t, panelProject(t), { fetchImpl: f.impl });
  const first = s.post('/api/test', { provider: 'acme', model: MODEL });
  await until(() => f.calls.length === 1, 'the first test to reach the provider');
  const second = await s.post('/api/test', { provider: 'acme', model: MODEL });
  assert.equal(second.status, 429);
  assert.equal(second.json().code, 'busy');
  assert.equal(f.calls.length, 1, 'the second sent nothing');
  release();
  assert.equal((await first).status, 200);
  const third = await s.post('/api/test', { provider: 'acme', model: MODEL });
  assert.equal(third.status, 200, 'the lock is released');
  assert.equal(f.calls.length, 2);
});

test('AC-65.11 the live model route is gone: GET /api/live-models is 404 with a session', T, async (t) => {
  freshHome(t);
  const s = await session(t, panelProject(t));
  for (const url of ['/api/live-models', '/api/live-models?provider=openrouter']) assert.equal((await s.get(url)).status, 404, url);
});

test('AC-65.12 POST /api/models-update refreshes every list in one call, answers 200 with the results, and saves them under the home folder', T, async (t) => {
  const home = freshHome(t);
  const { PRESETS } = await load('provider-presets.mjs');
  await sealed(t, { deepseek: [PRESETS.deepseek.url, KEY] }, storeOf(home));
  const f = fetchFake((url) => (url === LIST_URLS.openrouter ? reply(200, { data: [{ id: 'acme/a', supported_parameters: ['tools'] }] })
    : url === LIST_URLS.deepseek ? reply(200, { data: [{ id: 'deepseek-chat' }, { id: 'deepseek-reasoner' }] }) : reply(401, 'no')));
  const s = await session(t, panelProject(t), { fetchImpl: f.impl });
  assert.deepEqual((await s.state()).modelLists, {}, 'nothing saved yet');
  const r = await s.post('/api/models-update', {});
  assert.equal(r.status, 200, r.text);
  const { results } = r.json();
  assert.deepEqual(Object.keys(results).sort(), PRESET_NAMES);
  assert.deepEqual([results.openrouter.ok, results.openrouter.count], [true, 1]);
  assert.deepEqual([results.deepseek.ok, results.deepseek.count], [true, 2]);
  assert.equal(results.kimi.code, 'noKey');
  assert.equal(leaks(r.text), false, 'no key in the answer');
  const saved = JSON.parse(fs.readFileSync(listsOf(home), 'utf8'));
  assert.deepEqual(Object.keys(saved).sort(), ['deepseek', 'openrouter']);
  const st = await s.state();
  assert.deepEqual(st.modelLists, saved, '/api/state carries the saved lists');
  assert.equal(JSON.stringify(st).includes(KEY), false);
});

test('AC-65.12 ATTACK: POST /api/models-update needs the session, the Origin and JSON, and ignores the body: no address or key in it changes a request', T, async (t) => {
  const home = freshHome(t);
  const { PRESETS } = await load('provider-presets.mjs');
  await sealed(t, { deepseek: [PRESETS.deepseek.url, KEY] }, storeOf(home));
  const f = fetchFake(() => reply(401, 'no'));
  const s = await session(t, panelProject(t), { fetchImpl: f.impl });
  assert.equal((await call(s.panel, { method: 'POST', url: '/api/models-update', body: {} })).status, 401);
  for (const origin of [null, 'http://evil.example', 'null']) assert.equal((await s.post('/api/models-update', {}, { origin })).status, 403, `Origin ${origin}`);
  for (const type of [null, 'text/plain']) assert.ok([403, 415].includes((await s.post('/api/models-update', '{}', { type })).status), `type ${type}`);
  assert.equal((await s.post('/api/models-update', 'a'.repeat(70 * 1024))).status, 413);
  assert.equal(f.calls.length, 0, 'refused calls fetched nothing');
  const r = await s.post('/api/models-update', { url: 'https://evil.example', provider: 'evil', listUrl: 'https://evil.example/m', key: 'zk_evil_key_value_123456', presets: { evil: {} } });
  assert.equal(r.status, 200, r.text);
  const allowed = new Set(Object.values(LIST_URLS));
  assert.deepEqual(f.calls.filter((c) => !allowed.has(c.url)).map((c) => c.url), []);
  assert.ok([404, 405].includes((await s.get('/api/models-update')).status), 'a GET is not an update');
});

test('AC-65.12 a second update while one runs answers 429 busy and fetches nothing more; afterwards the next one runs', T, async (t) => {
  freshHome(t);
  let release;
  const gate = new Promise((r) => { release = r; });
  const f = fetchFake(async () => { await gate; return reply(200, { data: [{ id: 'acme/a', supported_parameters: ['tools'] }] }); });
  const s = await session(t, panelProject(t), { fetchImpl: f.impl });
  const first = s.post('/api/models-update', {});
  await until(() => f.calls.length >= 1, 'the first update to start fetching');
  const asked = f.calls.length;
  const second = await s.post('/api/models-update', {});
  assert.equal(second.status, 429);
  assert.equal(second.json().code, 'busy');
  assert.equal(f.calls.length, asked, 'the second fetched nothing');
  release();
  assert.equal((await first).status, 200);
  assert.equal((await s.post('/api/models-update', {})).status, 200, 'the lock is released');
});

test('AC-65.13 /api/state carries presets with no secret in them, levels for every role and job, and modelLists', T, async (t) => {
  const home = freshHome(t);
  const { PRESETS } = await load('provider-presets.mjs');
  const { ROLES, JOBS } = await load('models.mjs');
  const { vault } = await sealed(t, { deepseek: [PRESETS.deepseek.url, KEY] }, storeOf(home));
  const s = await session(t, panelProject(t));
  vault.calls.read = 0;
  const st = await s.state();
  assert.deepEqual(Object.keys(st.presets).sort(), PRESET_NAMES);
  for (const name of PRESET_NAMES) {
    const p = st.presets[name];
    assert.equal(p.label, PRESETS[name].label, name);
    assert.equal(p.url, PRESETS[name].url, name);
    assert.equal(p.keyUrl, PRESETS[name].keyUrl, name);
    assert.deepEqual(p.models, PRESETS[name].models, name);
    assert.equal(Object.hasOwn(p, 'key'), false, `${name}: no key field`);
  }
  const names = [...Object.keys(ROLES), ...Object.keys(JOBS)];
  assert.deepEqual(Object.keys(st.levels).sort(), [...names].sort(), 'a level for every role and job and nothing else');
  for (const n of names) assert.equal(st.levels[n], expectedLevel(n), n);
  assert.deepEqual(st.modelLists, {});
  assert.equal(JSON.stringify(st).includes(KEY), false);
  assert.equal(JSON.stringify(st).includes(KEY.slice(-4)), false);
  assert.equal(vault.calls.read, 0, 'GET /api/state does not open the vault');
});

test('AC-65.14 /api/jobs still needs confirmExternal: true for an outside value, also for a preset provider and model', T, async (t) => {
  const home = freshHome(t);
  const { PRESETS } = await load('provider-presets.mjs');
  await sealed(t, { deepseek: [PRESETS.deepseek.url, KEY] }, storeOf(home));
  const proj = panelProject(t);
  const s = await session(t, proj);
  const value = `deepseek/${PRESETS.deepseek.models[0].id}:high`;
  for (const confirmExternal of [undefined, false, 'true', 1, null]) {
    const r = await s.post('/api/jobs', { changes: { 'docs.report': value }, confirmExternal });
    assert.equal(r.status, 422, JSON.stringify(confirmExternal));
    assert.equal(r.json().code, 'confirm');
  }
  assert.equal(fs.existsSync(proj.models), false, 'nothing saved without the confirmation');
  const ok = await s.post('/api/jobs', { changes: { 'docs.report': value }, confirmExternal: true });
  assert.equal(ok.status, 200, ok.text);
  assert.equal(proj.saved().tasks['docs.report'], value);
  // one confirmation covers a whole save: two outside values in one call
  const two = await s.post('/api/jobs', { changes: { 'docs.scan': value, 'docs.changelog': value }, confirmExternal: true });
  assert.equal(two.status, 200, two.text);
});

// ============================================================================================
// H. Panel text and strings (AC-65.15)
// ============================================================================================

test('AC-65.15 the three tabs are usage, jobs and providers: panel.tab.providers exists, and the four old keys are gone from the code and from tr.json', T, async () => {
  const { MESSAGES } = await load('messages.mjs');
  const tr = JSON.parse(read('.claude/i18n/tr.json'));
  assert.equal(typeof MESSAGES['panel.tab.providers']?.en, 'string');
  assert.equal(typeof tr['panel.tab.providers'], 'string');
  assert.notEqual(tr['panel.tab.providers'].trim(), '');
  for (const key of ['panel.jobs.advice', 'panel.consent.advised', 'panel.tab.models', 'panel.tab.keys']) {
    assert.equal(Object.hasOwn(MESSAGES, key), false, `${key} is removed from messages.mjs`);
    assert.equal(Object.hasOwn(tr, key), false, `${key} is removed from tr.json`);
    for (const file of ['panel.js', 'panel.html']) assert.equal(fs.readFileSync(path.join(PANEL_DIR, file), 'utf8').includes(key), false, `${file} still names ${key}`);
  }
  const page = fs.readFileSync(path.join(PANEL_DIR, 'panel.js'), 'utf8') + fs.readFileSync(path.join(PANEL_DIR, 'panel.html'), 'utf8');
  for (const key of ['panel.tab.usage', 'panel.tab.jobs', 'panel.tab.providers']) assert.ok(page.includes(key), `the page uses ${key}`);
});

test('AC-65.15 the Claude-is-recommended wording is gone from the panel: panel.js holds no tagAdvice, and no panel text says Claude is recommended', T, async () => {
  const { MESSAGES } = await load('messages.mjs');
  const tr = JSON.parse(read('.claude/i18n/tr.json'));
  assert.equal(fs.readFileSync(path.join(PANEL_DIR, 'panel.js'), 'utf8').includes('tagAdvice'), false);
  for (const [key, v] of Object.entries(MESSAGES)) if (key.startsWith('panel.')) assert.doesNotMatch(v.en, /Claude (is )?recommended|recommended for this job/i, key);
  for (const [key, v] of Object.entries(tr)) if (key.startsWith('panel.')) assert.doesNotMatch(v, /Claude önerilir|Claude önerilen|önerilir: Claude/i, key);
});

test('AC-65.15 the difficulty levels have panel texts: Easy, Medium and Hard in English, Kolay, Orta and Zor in Turkish', T, async () => {
  const { MESSAGES } = await load('messages.mjs');
  const tr = JSON.parse(read('.claude/i18n/tr.json'));
  const panelKeys = Object.keys(MESSAGES).filter((k) => k.startsWith('panel.'));
  for (const [en, turkish] of [['easy', 'kolay'], ['medium', 'orta'], ['hard', 'zor']]) {
    const key = panelKeys.find((k) => MESSAGES[k].en.trim().toLowerCase() === en);
    assert.ok(key, `a panel text that is just "${en}"`);
    assert.equal(tr[key].trim().toLowerCase(), turkish, `${key} in Turkish`);
  }
});

test('AC-65.15 panel.js assigns no innerHTML (nor outerHTML, insertAdjacentHTML or document.write): page text goes in as text', T, () => {
  const code = fs.readFileSync(path.join(PANEL_DIR, 'panel.js'), 'utf8').split('\n').filter((l) => !/^\s*(\/\/|\/?\*)/.test(l)).join('\n');
  assert.doesNotMatch(code, /\.innerHTML\s*[+\-|]?=(?!=)/);
  assert.doesNotMatch(code, /\[\s*['"]innerHTML['"]\s*\]/);
  assert.doesNotMatch(code, /\.outerHTML\s*=(?!=)|insertAdjacentHTML|document\.write|createContextualFragment|\bDOMParser\b/);
  assert.doesNotMatch(code, /\beval\s*\(|new Function\s*\(/);
});

test('AC-65.15 every panel.* text the page names is a real key, and every panel.* key has a Turkish text with the same placeholders', T, async () => {
  const { MESSAGES } = await load('messages.mjs');
  const { translationIssue } = await load('lang.mjs');
  const tr = JSON.parse(read('.claude/i18n/tr.json'));
  const named = new Set();
  for (const file of ['panel.js', 'panel.html']) {
    for (const [, key] of fs.readFileSync(path.join(PANEL_DIR, file), 'utf8').matchAll(/['"`](panel\.[A-Za-z0-9]+(?:\.[A-Za-z0-9]+)*)['"`]/g)) named.add(key);
  }
  assert.ok(named.size >= 20, `the page names its texts (${named.size})`);
  // A count text is named without its plural suffix (Tn adds .one or .other)
  const real = (k) => Object.hasOwn(MESSAGES, k) || Object.hasOwn(MESSAGES, `${k}.one`) || Object.hasOwn(MESSAGES, `${k}.other`);
  assert.deepEqual([...named].filter((k) => !real(k)), [], 'a key the page names that messages.mjs does not have');
  const panelKeys = Object.keys(MESSAGES).filter((k) => k.startsWith('panel.'));
  assert.deepEqual(panelKeys.filter((k) => typeof tr[k] !== 'string' || tr[k].trim() === ''), [], 'missing in tr.json');
  assert.deepEqual(panelKeys.filter((k) => translationIssue(tr[k], MESSAGES[k].en) !== null), [], 'a translation lang.mjs would refuse');
  assert.deepEqual(['session.resume', 'session.begin'].filter((k) => typeof tr[k] !== 'string'), []);
});

test('AC-65.15 the panel opens the vault only through provider-test.mjs: models-panel.mjs imports testModel from it and names no vault function itself', T, () => {
  const strip = (s) => s.split('\n').filter((l) => !/^\s*(\/\/|\/?\*)/.test(l)).map((l) => l.replace(/\s\/\/\s.*$/, '')).join('\n');
  const code = strip(fs.readFileSync(path.join(HOOKS, 'models-panel.mjs'), 'utf8'));
  assert.match(code, /import\s*\{[^}]*\btestModel\b[^}]*\}\s*from\s*'\.\/provider-test\.mjs'/);
  assert.match(code, /import\s*\{[^}]*\bupdateModelLists\b[^}]*\}\s*from\s*'\.\/provider-models\.mjs'/);
  for (const name of ['readProvider', 'vaultRead', 'vaultSave', 'vaultDelete', 'setProvider', 'resolveKey']) assert.equal(new RegExp(`\\b${name}\\b`).test(code), false, `models-panel.mjs names ${name}`);
  const test = strip(fs.readFileSync(path.join(HOOKS, 'provider-test.mjs'), 'utf8'));
  assert.match(test, /\breadProvider\b/, 'the one reader of the key in the test path');
  assert.doesNotMatch(test, /\bprocess\.env\b[^;\n]*(API_KEY|TOKEN)/, 'no variable route to a key');
});

// ============================================================================================
// I. Texts (AC-65.16, AC-65.17)
// ============================================================================================

const block = (text, startRe, endRe) => {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => startRe.test(l));
  if (start === -1) return '';
  // A step written as a heading runs to the next heading; a numbered step runs to the next numbered step or heading
  endRe ??= /^#{1,3}\s/.test(lines[start]) ? /^#{1,3}\s/ : /^(#{1,3} |\d+[a-z]?\.\s)/;
  let end = start + 1;
  while (end < lines.length && !endRe.test(lines[end])) end++;
  return lines.slice(start, end).join('\n');
};

test('AC-65.16 design.md has a mandatory Design brief step before the first preview and before impeccable init, naming what it asks, and a question-mode close does not skip it', T, () => {
  const text = read('.claude/commands/design.md');
  const step = block(text, /^(#{1,3}\s.*Design brief|\s*\d+[a-z]?\.\s.*Design brief|\*\*Design brief)/i);
  assert.notEqual(step, '', 'a step called Design brief');
  assert.match(step, /\bmandatory\b/i);
  for (const word of [/landing page/i, /animation/i, /premium/i, /minimal/i, /references?/i, /visual material/i]) assert.match(step, word);
  assert.match(step, /question mode/i);
  assert.match(step, /(does not|do not|never|not)\s+skip|not skipped/i, 'closing the topic in question mode does not skip recording the brief');
  const at = text.indexOf(step.split('\n')[0]);
  const firstPreview = text.search(/\.previews\//);
  const init = text.search(/impeccable:impeccable`?\s*→\s*`?init/);
  assert.ok(init > -1 && firstPreview > -1);
  assert.ok(at > -1 && at < firstPreview, 'the brief comes before the first preview');
  assert.ok(at < init, 'the brief comes before impeccable init');
});

test('AC-65.16 every design-guide template under kit/templates has a "## Design brief" section', T, () => {
  const root = path.join(ROOT, 'kit', 'templates');
  const found = fs.readdirSync(root, { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => path.join(root, e.name, 'docs', 'design', 'design-guide.md')).filter((f) => fs.existsSync(f));
  assert.ok(found.length >= 2, `web-saas and mobile have one (${found.length})`);
  for (const f of found) assert.match(fs.readFileSync(f, 'utf8'), /^## Design brief\s*$/m, path.relative(ROOT, f));
});

test('AC-65.16 start.md Step 7 says doing it light or leaving it for later does not skip the brief, and build.md sends a new screen with no brief through /design first', T, () => {
  const step7 = block(read('.claude/commands/start.md'), /^## Step 7/, /^## Step 8/);
  assert.notEqual(step7, '');
  assert.match(step7, /\bbrief\b/i);
  assert.match(step7, /\blight\b/i);
  assert.match(step7, /\blater\b/i);
  assert.match(step7, /(does not|do not|never|not)\s+skip|not skipped|always/i);
  const line = read('.claude/commands/build.md').split('\n').find((l) => /new screen/i.test(l) && /\bbrief\b/i.test(l));
  assert.ok(line, 'a line about a new screen and the brief');
  assert.match(line, /\/design/);
});

test('AC-65.17 models.md no longer says Claude is recommended for a job, names the difficulty levels, and describes three tabs', T, () => {
  const text = read('.claude/commands/models.md');
  assert.doesNotMatch(text, /Claude is recommended|recommended for (this|the) job|say that Claude is recommended/i);
  for (const level of [/\beasy\b/i, /\bmedium\b/i, /\bhard\b/i]) assert.match(text, level);
  assert.doesNotMatch(text, /four tabs|usage, jobs, models and keys/i);
  assert.match(text, /providers/i);
});

// ============================================================================================
// Hardening: the try cap, the list update under an unsafe environment, a malformed list file (AC-65.19 .. AC-65.21)
// ============================================================================================

test('AC-65.19 ATTACK: POST /api/test allows 30 calls per panel run, successful or not; call 31 is 429 tooMany and fetches nothing', T, async (t) => {
  const home = freshHome(t);
  await sealed(t, { acme: [ACME_URL, KEY] }, storeOf(home));
  // Every other call fails at the provider: a failed call counts the same as a good one
  const f = fetchFake((url, init, n) => (n % 2 ? reply(200, TOOL_OK) : reply(401, '{"error":"no"}')));
  const s = await session(t, panelProject(t), { fetchImpl: f.impl });
  const body = { provider: 'acme', model: MODEL };
  for (let i = 1; i <= 30; i++) {
    const r = await s.post('/api/test', body);
    assert.equal(r.status, 200, `call ${i}: ${r.text}`);
  }
  assert.equal(f.calls.length, 30);
  for (const n of [31, 32]) {
    const r = await s.post('/api/test', body);
    assert.equal(r.status, 429, `call ${n}`);
    assert.equal(r.json().code, 'tooMany', `call ${n}`);
    assert.equal(leaks(r.text), false, 'no key in the answer');
  }
  assert.equal(f.calls.length, 30, 'the calls over the cap sent nothing');
  // The cap belongs to one panel run: a new panel starts again from zero
  const fresh = fetchFake(() => reply(200, TOOL_OK));
  const s2 = await session(t, panelProject(t), { fetchImpl: fresh.impl });
  assert.equal((await s2.post('/api/test', body)).status, 200);
  assert.equal(fresh.calls.length, 1);
});

test('AC-65.20 ATTACK: updateModelLists under an unsafe environment sends no key, answers unsafeEnv for a keyed provider and keeps its old list; openrouter still updates', T, async (t) => {
  const { PRESETS } = await load('provider-presets.mjs');
  const s = await listSetup(t, { deepseek: [PRESETS.deepseek.url, KEY] });
  const list = (...ids) => () => reply(200, { data: ids.map((id) => ({ id })) });
  // control: with a safe environment the keyed list is asked and saved
  const safe = await s.run({ deepseek: list('deepseek-chat', 'deepseek-reasoner'), openrouter: list('acme/a') });
  assert.equal(safe.results.deepseek.ok, true);
  const before = JSON.parse(fs.readFileSync(s.file, 'utf8')).deepseek;
  assert.deepEqual(before.models.map((m) => m.id), ['deepseek-chat', 'deepseek-reasoner']);
  for (const [name, value] of [['NODE_TLS_REJECT_UNAUTHORIZED', '0'], ['SSL_CERT_FILE', path.join(os.tmpdir(), 'ca.pem')]]) {
    withEnv(t, { [name]: value });
    const out = await s.run({ deepseek: list('deepseek-new'), openrouter: list('acme/a', 'acme/b') });
    assert.equal(out.results.deepseek.ok, false, name);
    assert.equal(out.results.deepseek.code, 'unsafeEnv', name);
    assert.equal(out.calls.some((c) => c.headers.authorization !== undefined), false, `${name}: no authorization header went out`);
    assert.equal(out.calls.some((c) => leaks(JSON.stringify(c.headers)) || leaks(String(c.url))), false, `${name}: no key in any request`);
    assert.equal(leaks(JSON.stringify(out.results)), false, `${name}: no key in the result`);
    assert.deepEqual(JSON.parse(fs.readFileSync(s.file, 'utf8')).deepseek, before, `${name}: the old list stays`);
    assert.equal(out.results.openrouter.ok, true, `${name}: a public list sends no key, so it still updates`);
    assert.equal(out.results.openrouter.count, 2);
    assert.equal(out.calls.some((c) => c.url === LIST_URLS.openrouter), true);
    withEnv(t, { [name]: undefined });
  }
  const again = await s.run({ deepseek: list('deepseek-new'), openrouter: list('acme/a') });
  assert.equal(again.results.deepseek.ok, true, 'control: with the variable gone the key list works again');
});

test('AC-65.20 the texts panel.update.unsafeEnv and panel.test.tooMany exist in English and in Turkish', T, async () => {
  const { MESSAGES } = await load('messages.mjs');
  const tr = JSON.parse(read('.claude/i18n/tr.json'));
  for (const key of ['panel.update.unsafeEnv', 'panel.test.tooMany']) {
    assert.equal(typeof MESSAGES[key]?.en, 'string', `${key} in messages.mjs`);
    assert.notEqual(MESSAGES[key].en.trim(), '', key);
    assert.equal(typeof tr[key], 'string', `${key} in tr.json`);
    assert.notEqual(tr[key].trim(), '', key);
  }
});

const BAD_SHAPES = [
  ['models is an object', '{"deepseek":{"models":{}}}', {}],
  ['models holds junk, a bad id and one good id', '{"deepseek":{"models":[null,5,{"id":"../bad id"},{"id":"good-model"}]}}', { deepseek: { models: [{ id: 'good-model' }] } }],
  ['junk in the list of a provider that the update refreshes', '{"openrouter":{"models":[null,5,{"id":"../bad id"},{"id":"good-model"}]}}', { openrouter: { models: [{ id: 'good-model' }] } }],
  ['the provider entry is a number','{"deepseek":5}', {}],
  ['the provider entry is null, an array or a string', '{"deepseek":null,"kimi":[],"zai":"x"}', {}],
  ['models is missing, a string or null', '{"deepseek":{},"kimi":{"models":"abc"},"zai":{"models":null}}', {}],
  ['ids that are no strings', '{"deepseek":{"models":[{"id":5},{"id":["a"]},{"id":null},{},[],"good-model"]}}', { deepseek: { models: [] } }],
];

test('AC-65.21 ATTACK: readModelLists keeps only valid entries of a file that is JSON but the wrong shape', T, async (t) => {
  const { readModelLists } = await load('provider-models.mjs');
  const dir = tmpDir(t, 'ps-rl2-');
  for (const [label, text, want] of BAD_SHAPES) {
    write(path.join(dir, 'm.json'), text);
    let got;
    assert.doesNotThrow(() => { got = readModelLists(path.join(dir, 'm.json')); }, label);
    assert.deepEqual(got, want, label);
  }
  // A good file comes back as it was written
  const good = { deepseek: { at: '2026-11-01T00:00:00.000Z', models: [{ id: 'deepseek-chat', input: 1, output: 2, context: 64000 }, { id: 'deepseek-reasoner' }] } };
  write(path.join(dir, 'g.json'), JSON.stringify(good));
  assert.deepEqual(readModelLists(path.join(dir, 'g.json')), good);
});

test('AC-65.21 ATTACK: updateModelLists works with a wrong-shape list file on disk: no throw, valid old entries still count for added, and the file is written back clean', T, async (t) => {
  const s = await listSetup(t);
  write(s.file, '{"deepseek":{"models":{}},"openrouter":{"models":[null,5,{"id":"../bad id"},{"id":"good-model"}]},"kimi":5}');
  let out;
  await assert.doesNotReject(async () => { out = await s.run({ openrouter: () => reply(200, { data: [{ id: 'good-model' }, { id: 'acme/a' }] }) }); });
  assert.deepEqual([out.results.openrouter.ok, out.results.openrouter.count, out.results.openrouter.added], [true, 2, 1]);
  assert.deepEqual([out.results.deepseek.ok, out.results.deepseek.count], [false, 0]);
  assert.deepEqual([out.results.kimi.ok, out.results.kimi.count], [false, 0]);
  const saved = JSON.parse(fs.readFileSync(s.file, 'utf8'));
  assert.deepEqual(Object.keys(saved), ['openrouter'], 'the broken entries are not written back');
  assert.deepEqual(reasonable(saved.openrouter.models).map((m) => m.id), ['acme/a', 'good-model']);
});

test('AC-65.21 ATTACK: with a wrong-shape list file in the home folder, GET /api/state and POST /api/models-update answer 200, not 500', T, async (t) => {
  const home = freshHome(t);
  const f = fetchFake((url) => (url === LIST_URLS.openrouter ? reply(200, { data: [{ id: 'good-model' }, { id: 'acme/a' }] }) : reply(401, 'no')));
  const s = await session(t, panelProject(t), { fetchImpl: f.impl });
  for (const [label, text] of BAD_SHAPES) {
    write(listsOf(home), text);
    const st = await call(s.panel, { url: '/api/state', secret: s.secret });
    assert.equal(st.status, 200, `${label} (state): ${st.text.slice(0, 200)}`);
    const r = await s.post('/api/models-update', {});
    assert.equal(r.status, 200, `${label}: ${r.text.slice(0, 200)}`);
    assert.equal(r.json().results.openrouter.ok, true, label);
  }
});
