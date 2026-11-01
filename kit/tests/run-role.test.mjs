// Run: node --test kit/tests/run-role.test.mjs
// 3.60.0: /models, code, test and docs roles on an outside provider (providers.mjs, run-role.mjs, models.mjs, guards, docs).
// No real provider and no real claude: upstreams are local http servers. CLI runs get a preload that replaces fetch,
// https.request and spawn('claude'), records every call, and acts as the child. The smoke test with a real provider is separate.
// Modules load inside the tests, so a missing module turns each test red on its own.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const HOOKS = path.join(ROOT, '.claude', 'hooks');
const load = (name) => import(pathToFileURL(path.join(HOOKS, name)).href);
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const T = { timeout: 45000 };

// Nothing in this file may touch the real store
const TMP_HOME = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'rr-top-home-')));
process.env.HOME = TMP_HOME;
process.env.USERPROFILE = TMP_HOME;
process.on('exit', () => { try { fs.rmSync(TMP_HOME, { recursive: true, force: true }); } catch { /* temp */ } });

// Test values are split up so this file itself does not trip the secret scan
const OR_KEY = 'sk-' + 'or-v1-' + 'a1b2c3d4'.repeat(6);
const DS_KEY = 'sk-' + '0123456789abcdef'.repeat(2);
const GH_VALUE = 'ghs_' + 'k'.repeat(36);
const AWS_VALUE = 'aws' + 'secret'.repeat(5);
const TOKEN = 'run-' + 'token-'.repeat(5);
const MODEL = 'deepseek/deepseek-v4.1-flash-1017';
const MODEL_VALUE = `openrouter/${MODEL}:high`;

const tmpDir = (t, prefix) => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  t.after(() => { try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 }); } catch { /* temp */ } });
  return dir;
};
const write = (file, text) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text); };
const close = (a, b, label) => assert.ok(Math.abs(a - b) < 1e-9, `${label ?? 'value'}: ${a} is not ${b}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(check, label, ms = 4000) {
  const end = Date.now() + ms;
  while (!check()) {
    assert.ok(Date.now() < end, `timed out waiting for: ${label}`);
    await wait(10);
  }
}

// ---- Fake upstream and client ----

async function upstream(t, handler) {
  const seen = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      const entry = { method: req.method, url: req.url, headers: req.headers, body: Buffer.concat(chunks).toString() };
      seen.push(entry);
      handler(req, res, entry);
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address();
  const stop = () => { server.closeAllConnections(); return new Promise((r) => server.close(r)); };
  t.after(stop);
  return { url: `http://127.0.0.1:${port}/anthropic`, origin: `http://127.0.0.1:${port}`, port, seen, stop };
}

const CALL_BODY = JSON.stringify({ model: MODEL, stream: true, max_tokens: 16, messages: [{ role: 'user', content: 'merhaba İıŞş' }] });
const call = (port, { method = 'POST', target = '/v1/messages?beta=true', headers = {}, body = CALL_BODY, token = TOKEN } = {}) => new Promise((resolve, reject) => {
  const req = http.request({
    host: '127.0.0.1', port, method, path: target, agent: false,
    headers: { 'content-type': 'application/json', 'anthropic-version': '2023-06-01', ...(token === null ? {} : { authorization: `Bearer ${token}` }), ...headers },
  }, (res) => {
    const chunks = [];
    res.on('data', (c) => chunks.push(c));
    res.on('end', () => {
      const raw = Buffer.concat(chunks);
      const plain = res.headers['content-encoding'] === 'gzip' ? zlib.gunzipSync(raw) : raw;
      resolve({ status: res.statusCode, headers: res.headers, raw: plain, text: plain.toString() });
    });
    res.on('error', reject);
  });
  req.on('error', reject);
  req.setTimeout(10000, () => req.destroy(new Error('call timed out')));
  req.end(method === 'GET' ? undefined : body);
});

// $ per million tokens: one price object { input, output, cache, cacheWrite }
const PRICE = { input: 2, output: 10, cache: 0.5 };
const PRICES = PRICE;

async function proxyFor(t, up, over = {}) {
  const { startProxy } = await load('run-role.mjs');
  const usage = [];
  const proxy = await startProxy({ key: OR_KEY, token: TOKEN, upstream: up.url, model: MODEL, prices: PRICES, canSpend: () => true, onUsage: (...a) => usage.push(a), ...over });
  t.after(() => Promise.race([Promise.resolve().then(() => proxy.close()).catch(() => {}), wait(1500)]));
  return { proxy, port: proxy.port, usage };
}

function findNum(value, names) {
  if (value === null || typeof value !== 'object') return undefined;
  for (const n of names) if (typeof value[n] === 'number') return value[n];
  for (const v of Object.values(value)) {
    const hit = findNum(v, names);
    if (hit !== undefined) return hit;
  }
  return undefined;
}
// onUsage({ usage, cost }), once per upstream response; the field names inside usage are open
const costIn = (args) => args[0].cost;
const inputIn = (args) => findNum(args[0].usage, ['input_tokens', 'input', 'inputTokens']);
const outputIn = (args) => findNum(args[0].usage, ['output_tokens', 'output', 'outputTokens']);
const cacheReadIn = (args) => findNum(args[0].usage, ['cache_read_input_tokens', 'cacheRead', 'cache_read', 'cacheReadTokens', 'cached']);

// ---- Anthropic-style streams ----

const event = (o) => `event: ${o.type}\ndata: ${JSON.stringify(o)}\n\n`;
const DECOY = 'İıŞş "usage":{"input_tokens":999999999,"output_tokens":999999999} data: {"type":"message_delta","usage":{"output_tokens":999999999}}';
function sse({ input = 1_000_000, output = 500_000, cacheRead = 2_000_000, cacheCreate = 0, startInput = input, deltaFull = false } = {}) {
  const nested = { ephemeral_5m_input_tokens: cacheCreate, ephemeral_1h_input_tokens: 0 };
  const startUsage = { input_tokens: startInput, cache_creation_input_tokens: cacheCreate, cache_read_input_tokens: startInput ? cacheRead : 0, output_tokens: startInput ? 1 : 0, cache_creation: nested, service_tier: 'standard' };
  const lastUsage = deltaFull
    ? { input_tokens: input, cache_creation_input_tokens: cacheCreate, cache_read_input_tokens: cacheRead, output_tokens: output, cache_creation: nested }
    : { output_tokens: output };
  return [
    event({ type: 'message_start', message: { id: 'msg_1', type: 'message', role: 'assistant', model: MODEL, content: [], usage: startUsage } }),
    event({ type: 'ping' }),
    event({ type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }),
    event({ type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: DECOY } }),
    event({ type: 'content_block_stop', index: 0 }),
    event({ type: 'message_delta', delta: { stop_reason: null, stop_sequence: null }, usage: { output_tokens: Math.floor(output / 2) } }),
    event({ type: 'message_delta', delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: lastUsage }),
    event({ type: 'message_stop' }),
  ].join('');
}
const STREAM_HEADERS = { 'content-type': 'text/event-stream' };
async function drip(res, buf, size) {
  res.writeHead(200, STREAM_HEADERS);
  for (let i = 0; i < buf.length; i += size) {
    res.write(buf.subarray(i, i + size));
    await new Promise((r) => setImmediate(r));
  }
  res.end();
}
async function cuts(res, buf, points) {
  res.writeHead(200, STREAM_HEADERS);
  let at = 0;
  for (const p of [...points].sort((a, b) => a - b)) {
    res.write(buf.subarray(at, p));
    at = p;
    await wait(3);
  }
  res.end(buf.subarray(at));
}

// ---- CLI runs ----

// A file, not a data: URL: Windows can refuse a command line this long (spawn EPERM)
const PRELOAD_FILE = path.join(TMP_HOME, 'rr-preload.mjs');
const PRELOAD = pathToFileURL(PRELOAD_FILE).href;
fs.writeFileSync(PRELOAD_FILE, String.raw`
import fs from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import tls from 'node:tls';
import cp from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { EventEmitter } from 'node:events';
import { PassThrough, Readable } from 'node:stream';

const SPY = process.env.RR_SPY;
const rec = (o) => fs.appendFileSync(SPY, JSON.stringify(o) + '\n');
const b64 = (name, fallback) => (process.env[name] ? Buffer.from(process.env[name], 'base64').toString() : fallback);
const SSE = b64('RR_SSE', '');
const REPLY = b64('RR_REPLY', 'child says hello');
const REQUESTS = Number(process.env.RR_REQUESTS ?? 1);
const isLoop = (h) => /^(127\.0\.0\.1|localhost|\[::1\])$/.test(h);
const canned = (pathname) => pathname.endsWith('/v1/messages')
  ? { body: SSE, type: 'text/event-stream' } : { body: '{"data":{"usage":0}}', type: 'application/json' };

const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  const u = new URL(typeof input === 'string' ? input : input.url ?? String(input));
  if (isLoop(u.hostname)) return realFetch(input, init);
  rec({ kind: 'net', url: u.href, headers: Object.fromEntries(new Headers(init.headers ?? input.headers ?? {})) });
  const c = canned(u.pathname);
  return new Response(c.body, { status: 200, headers: { 'content-type': c.type } });
};
https.request = (a, b, c) => {
  const cb = [a, b, c].find((x) => typeof x === 'function');
  const isUrl = typeof a === 'string' || a instanceof URL;
  const o = (isUrl ? b : a) && typeof (isUrl ? b : a) === 'object' ? (isUrl ? b : a) : {};
  const u = isUrl ? new URL(a) : new URL('https://' + (o.hostname ?? o.host) + (o.path ?? '/'));
  const headers = Object.fromEntries(Object.entries(o.headers ?? {}).map(([k, v]) => [k.toLowerCase(), v]));
  const req = new PassThrough();
  req.setHeader = (k, v) => { headers[k.toLowerCase()] = v; };
  req.setTimeout = () => req;
  req.resume();
  req.on('finish', () => {
    rec({ kind: 'net', url: u.href, headers });
    const r = canned(u.pathname);
    const res = Readable.from([Buffer.from(r.body)]);
    res.statusCode = 200;
    res.headers = { 'content-type': r.type };
    cb?.(res);
    req.emit('response', res);
  });
  return req;
};
tls.connect = (...args) => { rec({ kind: 'tls', args: String(args[0]?.host ?? args[0]) }); throw new Error('real network is blocked in this test'); };

const realHttpRequest = http.request.bind(http);
const post = (env) => new Promise((resolve, reject) => {
  const u = new URL(env.ANTHROPIC_BASE_URL + '/v1/messages?beta=true');
  const req = realHttpRequest({ host: u.hostname, port: u.port, path: u.pathname + u.search, method: 'POST', agent: false,
    headers: { 'content-type': 'application/json', 'anthropic-version': '2023-06-01', authorization: 'Bearer ' + env.ANTHROPIC_AUTH_TOKEN, ...(env.ANTHROPIC_API_KEY ? { 'x-api-key': env.ANTHROPIC_API_KEY } : {}) } },
    (res) => { res.resume(); res.on('end', () => resolve(res.statusCode)); });
  req.on('error', reject);
  req.end(JSON.stringify({ model: process.env.RR_CHILD_MODEL ?? env.ANTHROPIC_MODEL, stream: true, messages: [{ role: 'user', content: 'x' }] }));
});
const isClaude = (cmd, args) => [cmd, ...(Array.isArray(args) ? args.slice(0, 2) : [])].some((x) => /(^|[\\/\s])claude(\.exe|\.cmd)?(\s|$)/i.test(String(x)));
const realSpawn = cp.spawn, realSpawnSync = cp.spawnSync, realExecFileSync = cp.execFileSync, realExecSync = cp.execSync;
cp.spawn = (cmd, args, opts) => {
  if (!isClaude(cmd, args)) return realSpawn(cmd, args, opts);
  const list = Array.isArray(args) ? args : [];
  const o = (Array.isArray(args) ? opts : args) ?? {};
  const env = o.env ?? process.env;
  rec({ kind: 'spawn', cmd, args: list, cwd: o.cwd, shell: o.shell ?? false, env });
  const child = new EventEmitter();
  Object.assign(child, { stdout: new PassThrough(), stderr: new PassThrough(), stdin: new PassThrough(), pid: 4242, kill: () => true });
  const input = [];
  child.stdin.on('data', (d) => input.push(d));
  setTimeout(async () => {
    let code = 0;
    if (process.env.RR_BREAK_STORE) fs.writeFileSync(process.env.RR_BREAK_STORE, '{"keys":');
    if (process.env.RR_DROP_STORE) fs.rmSync(process.env.RR_DROP_STORE);
    try {
      for (let i = 0; i < REQUESTS; i++) rec({ kind: 'child-call', status: await post(env) });
    } catch (e) { code = 1; rec({ kind: 'child-error', message: String(e) }); }
    rec({ kind: 'stdin', text: Buffer.concat(input).toString() });
    const reply = REPLY.replaceAll('{TOKEN}', env.ANTHROPIC_AUTH_TOKEN ?? '');
    for (const line of [{ type: 'system', subtype: 'init' }, { type: 'assistant', message: { role: 'assistant', content: [{ type: 'text', text: reply }] } }, { type: 'result', subtype: 'success', is_error: false, result: reply, total_cost_usd: 777, num_turns: 1 }])
      child.stdout.write(JSON.stringify(line) + '\n');
    child.stdout.end();
    child.stderr.end();
    setTimeout(() => { child.emit('exit', code, null); child.emit('close', code, null); }, 20);
  }, 30);
  return child;
};
cp.spawnSync = (cmd, args, opts) => (isClaude(cmd, args) ? (rec({ kind: 'claude-sync', cmd }), { status: 0, stdout: '', stderr: '', output: [], pid: 1 }) : realSpawnSync(cmd, args, opts));
cp.execFileSync = (cmd, args, opts) => (isClaude(cmd, args) ? (rec({ kind: 'claude-sync', cmd }), '') : realExecFileSync(cmd, args, opts));
cp.execSync = (cmd, opts) => (isClaude(cmd) ? (rec({ kind: 'claude-sync', cmd }), '') : realExecSync(cmd, opts));
syncBuiltinESMExports();
`);

const storeOf = (home) => path.join(home, '.vibe-kit', 'providers.json');
// The ledger day is the local day
const dayKeys = () => {
  const n = new Date();
  return [`${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`];
};
const AGENTS_FIXTURE = '# Fixture\n\n## Commands\n\n```bash\ntest:        npm test\nlint:        npm run lint\ntype check: npm run typecheck\nbuild:       npm run build\n```\n';

async function project(t, { models = { code: MODEL_VALUE, test: MODEL_VALUE, docs: MODEL_VALUE }, key = true, limit = 5, spent = 0, settings = true, drop = [] } = {}) {
  const { setKey, setLimit, addSpend } = await load('providers.mjs');
  await load('run-role.mjs');
  const root = tmpDir(t, 'rr-proj-');
  const home = tmpDir(t, 'rr-home-');
  fs.cpSync(HOOKS, path.join(root, '.claude', 'hooks'), { recursive: true });
  fs.cpSync(path.join(ROOT, '.claude', 'agents'), path.join(root, '.claude', 'agents'), { recursive: true });
  if (settings) fs.copyFileSync(path.join(ROOT, '.claude', 'settings.json'), path.join(root, '.claude', 'settings.json'));
  write(path.join(root, '.kit.json'), JSON.stringify({ type: 'web-saas', lang: 'en' }));
  write(path.join(root, 'AGENTS.md'), AGENTS_FIXTURE);
  write(path.join(root, 'p.md'), 'PROMPT-MARKER do the task\n');
  if (models) write(path.join(root, '.claude', 'state', 'models.json'), JSON.stringify(models));
  for (const f of drop) fs.rmSync(path.join(root, '.claude', 'hooks', f));
  const file = storeOf(home);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (key) assert.equal(setKey('openrouter', OR_KEY, file), null);
  if (limit !== null) setLimit('openrouter', limit, file);
  if (spent) for (const d of dayKeys()) addSpend('openrouter', spent, d, file);
  return { root, home, file, spy: path.join(home, 'spy.jsonl') };
}

function cleanEnv() {
  const env = { ...process.env };
  // The provider variables too: a key on the machine running the tests must not reach a test
  for (const k of Object.keys(env)) if (/^(ANTHROPIC|CLAUDE)|^(OPENROUTER|DEEPSEEK|MOONSHOT)_API_KEY$/i.test(k)) delete env[k];
  return env;
}
const b64 = (s) => Buffer.from(s).toString('base64');

function cli(proj, args, env = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['--import', PRELOAD, path.join(proj.root, '.claude', 'hooks', 'run-role.mjs'), ...args], {
      cwd: proj.root,
      env: { ...cleanEnv(), HOME: proj.home, USERPROFILE: proj.home, CLAUDE_PROJECT_DIR: proj.root, RR_SPY: proj.spy, RR_SSE: b64(sse()), ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '', stderr = '';
    child.stdout.on('data', (d) => { stdout += d; });
    child.stderr.on('data', (d) => { stderr += d; });
    const timer = setTimeout(() => { child.kill(); reject(new Error(`CLI did not end\n${stdout}\n${stderr}`)); }, 25000);
    child.on('close', (status) => {
      clearTimeout(timer);
      const spy = fs.existsSync(proj.spy) ? fs.readFileSync(proj.spy, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l)) : [];
      fs.rmSync(proj.spy, { force: true });
      resolve({ status, stdout, stderr, spy, spawned: spy.filter((s) => s.kind === 'spawn'), net: spy.filter((s) => s.kind === 'net' || s.kind === 'tls') });
    });
  });
}
const messageCalls = (r) => r.net.filter((n) => /\/v1\/messages/.test(n.url));
function assertRan(r) {
  assert.equal(r.status, 0, `exit ${r.status}\n${r.stderr}`);
  assert.equal(r.spawned.length, 1, `claude spawned once\n${r.stderr}`);
}
function assertRefused(r, reason, { missingFile = false } = {}) {
  assert.notEqual(r.status, 0, 'exits non-zero');
  assert.equal(r.status === null, false, 'exits by itself');
  if (!missingFile) assert.doesNotMatch(r.stderr, /ERR_MODULE_NOT_FOUND/, 'a real refusal, not a crash');
  assert.match(r.stdout + r.stderr, reason);
  assert.deepEqual(r.spy, [], 'no request and no child');
}
const flagList = (args, flag) => {
  const i = args.indexOf(flag);
  assert.notEqual(i, -1, `${flag} missing in ${JSON.stringify(args)}`);
  const list = [];
  for (let k = i + 1; k < args.length && !args[k].startsWith('-'); k++) list.push(...args[k].split(/,(?![^(]*\))|\s+(?![^(]*\))/).filter(Boolean));
  return list;
};
const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]));

// models.mjs from the repository, on a temp project and a temp home; stdin is a pipe, never a TTY
function modelsProject(t) {
  const root = tmpDir(t, 'rr-model-');
  const home = tmpDir(t, 'rr-model-home-');
  write(path.join(root, '.kit.json'), JSON.stringify({ type: 'web-saas', lang: 'en' }));
  const run = (args, input = '') => spawnSync(process.execPath, [path.join(HOOKS, 'models.mjs'), ...args], {
    encoding: 'utf8', input, env: { ...cleanEnv(), HOME: home, USERPROFILE: home, CLAUDE_PROJECT_DIR: root },
  });
  return { root, home, run, file: storeOf(home), modelsFile: path.join(root, '.claude', 'state', 'models.json') };
}
const line = (output, role) => output.split('\n').find((l) => l.startsWith(`${role}: `)) ?? '';

// ---- AC-1 ----

test('3.60.0 AC-1: --set takes rol=provider/model:effort with a key in the store, the model id may hold ":", and the old form still works', T, async (t) => {
  const { setKey } = await load('providers.mjs');
  const m = modelsProject(t);
  assert.equal(setKey('openrouter', OR_KEY, m.file), null);
  const set = m.run(['--set', `code=${MODEL_VALUE}`]);
  assert.equal(set.status, 0, set.stderr);
  assert.equal(JSON.parse(fs.readFileSync(m.modelsFile, 'utf8')).code, MODEL_VALUE);
  const colon = m.run(['--set', 'docs=openrouter/deepseek/deepseek-r1:free:low']);
  assert.equal(colon.status, 0, colon.stderr);
  assert.equal(JSON.parse(fs.readFileSync(m.modelsFile, 'utf8')).docs, 'openrouter/deepseek/deepseek-r1:free:low', 'the effort is the last segment');
  const old = m.run(['--set', 'test=sonnet:high']);
  assert.equal(old.status, 0, old.stderr);
  const saved = JSON.parse(fs.readFileSync(m.modelsFile, 'utf8'));
  assert.equal(saved.test, 'sonnet:high');
  assert.equal(saved.code, MODEL_VALUE, 'the old form leaves the provider role alone');
});

test('3.60.0 AC-1: --show displays a provider role and a plain role side by side', T, async (t) => {
  const { setKey } = await load('providers.mjs');
  const m = modelsProject(t);
  assert.equal(setKey('openrouter', OR_KEY, m.file), null);
  assert.equal(m.run(['--set', `code=${MODEL_VALUE}`, 'test=opus:high', 'docs=openrouter/deepseek/deepseek-r1:free:low']).status, 0);
  const show = m.run(['--show']);
  assert.equal(show.status, 0, show.stderr);
  assert.match(line(show.stdout, 'code'), /openrouter\/deepseek\/deepseek-v4\.1-flash-1017\b.*\bhigh\b/);
  assert.match(line(show.stdout, 'docs'), /openrouter\/deepseek\/deepseek-r1:free\b.*\blow\b/);
  assert.match(line(show.stdout, 'test'), /^test: opus \/ high/);
  assert.match(line(show.stdout, 'plan'), /^plan: opus \/ high/);
});

test('3.60.0 AC-1: a model id keeps its case; only the kit forms are lower-cased', T, async (t) => {
  const { setKey } = await load('providers.mjs');
  const m = modelsProject(t);
  assert.equal(setKey('kimi', DS_KEY, m.file), null);
  const r = m.run(['--set', 'code=kimi/Kimi-K2.5:high']);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(JSON.parse(fs.readFileSync(m.modelsFile, 'utf8')).code, 'kimi/Kimi-K2.5:high', 'provider model ids are case-sensitive');
});

test('3.60.0 AC-1: --set refuses a provider with no key and an unknown provider, and writes nothing; the same value passes once the key is there', T, async (t) => {
  const { setKey } = await load('providers.mjs');
  const m = modelsProject(t);
  const noKey = m.run(['--set', `code=${MODEL_VALUE}`]);
  assert.equal(noKey.status, 1);
  assert.match(noKey.stderr, /key/i);
  for (const value of ['evil/x/y:high', 'https://evil.example/x:high', '__proto__/x/y:high', 'constructor/x/y:high', 'openrouter/x/y:max', 'openrouter/x/y']) {
    const r = m.run(['--set', `code=${value}`]);
    assert.equal(r.status, 1, value);
    assert.equal(fs.existsSync(m.modelsFile), false, `nothing written: ${value}`);
  }
  assert.equal(setKey('openrouter', OR_KEY, m.file), null);
  const ok = m.run(['--set', `code=${MODEL_VALUE}`]);
  assert.equal(ok.status, 0, ok.stderr);
  assert.equal(JSON.parse(fs.readFileSync(m.modelsFile, 'utf8')).code, MODEL_VALUE);
});

test('3.60.0 AC-1: a hand-edited models.json with an unknown provider falls back to the recommended value; a valid provider role stays', T, async (t) => {
  const { setKey } = await load('providers.mjs');
  const m = modelsProject(t);
  assert.equal(setKey('openrouter', OR_KEY, m.file), null);
  write(m.modelsFile, JSON.stringify({ code: MODEL_VALUE, docs: 'evil/x/y:high', test: 'constructor/x/y:high' }));
  const show = m.run(['--show']).stdout;
  assert.match(line(show, 'code'), /openrouter\/deepseek\/deepseek-v4\.1-flash-1017/, 'a valid provider role is kept');
  assert.match(line(show, 'docs'), /^docs: haiku \/ high/);
  assert.match(line(show, 'test'), /^test: opus \/ high/);
  assert.doesNotMatch(show, /evil|constructor/);
});

test('3.60.0 AC-1: the shield asks for a provider --set and leaves a plain --set alone', T, async () => {
  const { evaluate } = await load('destructive-guard.mjs');
  const asked = [
    'node .claude/hooks/models.mjs --set code=openrouter/x/y:high',
    'node .claude/hooks/models.mjs --set code=deepseek/deepseek-chat:high',
    'node .claude/hooks/models.mjs --set docs=kimi/kimi-k2:low',
    'node .claude/hooks/models.mjs --set plan=opus:high code=openrouter/x/y:high',
    'node .claude/hooks/models.mjs --set code=openrouter/deepseek/deepseek-r1:free:high',
  ];
  const free = [
    'node .claude/hooks/models.mjs --set code=sonnet:high',
    'node .claude/hooks/models.mjs --set plan=opus:high code=sonnet:high test=opus:high review=sonnet:high docs=haiku:high',
    'node .claude/hooks/models.mjs --show',
    'git commit -m "docs: explain models.mjs --set code=openrouter/x/y:high"',
  ];
  for (const ctx of [{}, { tool: 'claude', agent: '' }, { tool: 'claude', agent: 'test-writer' }]) {
    assert.deepEqual(asked.filter((c) => evaluate(c, ctx)?.decision !== 'ask'), [], `asked (${JSON.stringify(ctx)})`);
    assert.deepEqual(free.filter((c) => evaluate(c, ctx) !== null), [], `free (${JSON.stringify(ctx)})`);
  }
});

test('3.60.0 AC-1: ATTACK: a provider --set in a tricky spelling is still stopped', T, async () => {
  const { evaluate } = await load('destructive-guard.mjs');
  const tricks = [
    'node .claude/hooks/models.mjs --set "code=openrouter/x/y:high"',
    'node .claude/hooks/models.mjs --set code=open"router"/x/y:high',
    'node .claude/hooks/models.mjs --set code=openrouter\\/x/y:high',
    'node .claude/hooks/models.mjs --se""t code=openrouter/x/y:high',
    'node .claude/hooks/models.mjs --set CODE=OpenRouter/x/y:high',
    'node .claude/hooks/models.mjs "--set" code=openrouter/x/y:high',
    "node .claude/hooks/models.mjs --set $'code=openrouter/x/y:high'",
    'node .claude/hooks/models.mjs --set code=$(cat f):high',
    'node .claude/hooks/models.mjs --set $V',
    'node .claude\\hooks\\models.mjs --set code=openrouter/x/y:high',
    'node ./.claude/hooks/models.mjs --set code=openrouter/x/y:high',
    'node "$CLAUDE_PROJECT_DIR/.claude/hooks/models.mjs" --set code=openrouter/x/y:high',
    'cd .claude/hooks && node models.mjs --set code=openrouter/x/y:high',
    'git status && node .claude/hooks/models.mjs --set code=openrouter/x/y:high',
    'node .claude/hooks/models.mjs --set code=sonnet:high code=openrouter/x/y:high',
  ];
  assert.deepEqual(tricks.filter((c) => !['ask', 'deny'].includes(evaluate(c)?.decision)), []);
});

// ---- AC-2 ----

test('3.60.0 AC-2: ATTACK: after a full run the key is not in a project file, the output, the child env or the child args; the child sees a run token', T, async (t) => {
  const p = await project(t);
  const r = await cli(p, ['code', 'p.md']);
  assertRan(r);
  const child = r.spawned[0];
  assert.match(child.env.ANTHROPIC_AUTH_TOKEN, /\S{16,}/, 'a run token, not an empty value');
  assert.notEqual(child.env.ANTHROPIC_AUTH_TOKEN, OR_KEY);
  assert.equal(child.env.ANTHROPIC_API_KEY, '');
  assert.equal(JSON.stringify(child.env).includes(OR_KEY), false, 'child env');
  assert.equal(JSON.stringify(child.args).includes(OR_KEY), false, 'child args');
  assert.equal((r.stdout + r.stderr).includes(OR_KEY), false, 'CLI output');
  const leaked = walk(p.root).filter((f) => fs.readFileSync(f).includes(OR_KEY));
  assert.deepEqual(leaked, [], 'project files, logs and state');
});

test('3.60.0 AC-2: ATTACK: a reply that holds the key, the run token or a secret pattern is masked; the rest is shown as untrusted', T, async (t) => {
  const p = await project(t);
  const r = await cli(p, ['code', 'p.md'], { RR_REPLY: b64(`child says hello ${OR_KEY} {TOKEN} ${GH_VALUE} goodbye`) });
  assertRan(r);
  const token = r.spawned[0].env.ANTHROPIC_AUTH_TOKEN;
  assert.match(r.stdout, /child says hello/);
  assert.match(r.stdout, /goodbye/);
  assert.match(r.stdout, /untrusted/i);
  assert.equal(r.stdout.includes(OR_KEY), false, 'key');
  assert.equal(r.stdout.includes(token), false, 'run token');
  assert.equal(r.stdout.includes(GH_VALUE), false, 'secret pattern');
  assert.deepEqual(walk(p.root).filter((f) => { const b = fs.readFileSync(f); return b.includes(OR_KEY) || b.includes(GH_VALUE); }), [], 'no log keeps them');
});

test('3.60.0 AC-2: the run token and the port differ per run, and the prompt reaches the child through its args or stdin', T, async (t) => {
  const p = await project(t);
  const a = await cli(p, ['code', 'p.md']);
  const b = await cli(p, ['code', 'p.md']);
  assertRan(a);
  assertRan(b);
  assert.notEqual(a.spawned[0].env.ANTHROPIC_AUTH_TOKEN, b.spawned[0].env.ANTHROPIC_AUTH_TOKEN);
  const stdin = a.spy.find((s) => s.kind === 'stdin').text;
  assert.equal(JSON.stringify(a.spawned[0].args).includes('PROMPT-MARKER') || stdin.includes('PROMPT-MARKER'), true, 'the prompt file content reaches the child');
});

test('3.60.0 AC-2: storePath is under the home folder, the store shape is tolerant of a missing or broken file', T, async (t) => {
  const { storePath, readStore } = await load('providers.mjs');
  assert.equal(storePath(), path.join(TMP_HOME, '.vibe-kit', 'providers.json'));
  const empty = { keys: {}, limits: {}, spend: {} };
  const dir = tmpDir(t, 'rr-store-');
  assert.deepEqual(readStore(path.join(dir, 'none.json')), empty);
  assert.deepEqual(readStore(), empty, 'default path, nothing there yet');
  for (const broken of ['', 'not json', '{"keys":', 'null', '[]', '12']) {
    const f = path.join(dir, 'broken.json');
    fs.writeFileSync(f, broken);
    assert.deepEqual(readStore(f), empty, JSON.stringify(broken));
  }
});

test('3.60.0 AC-2: no key value appears in models.json or in models.mjs output', T, async (t) => {
  const { setKey } = await load('providers.mjs');
  const m = modelsProject(t);
  assert.equal(setKey('openrouter', OR_KEY, m.file), null);
  const set = m.run(['--set', `code=${MODEL_VALUE}`]);
  const show = m.run(['--show']);
  assert.equal(set.status, 0, set.stderr);
  assert.match(fs.readFileSync(m.modelsFile, 'utf8'), /openrouter/);
  assert.equal(fs.readFileSync(m.modelsFile, 'utf8').includes(OR_KEY), false);
  assert.equal([set.stdout, set.stderr, show.stdout, show.stderr].join('').includes(OR_KEY), false);
  assert.deepEqual(walk(m.root).filter((f) => fs.readFileSync(f).includes(OR_KEY)), [], 'nothing in the project holds the key');
});

test('3.60.0 AC-2: settings.json denies Read of ~/.vibe-kit/** and no allow rule covers run-role.mjs', T, () => {
  const { allow, deny } = JSON.parse(read('.claude/settings.json')).permissions;
  assert.equal(deny.includes('Read(~/.vibe-kit/**)'), true, 'Read deny rule');
  const covers = (rule, cmd) => {
    const m = rule.match(/^Bash\((.*)\)$/);
    if (!m) return rule === 'Bash';
    const src = m[1].replace(/:\*$/, '*').replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*');
    return new RegExp(`^${src}$`).test(cmd);
  };
  const covering = allow.filter((r) => /run-role/.test(r) || covers(r, 'node .claude/hooks/run-role.mjs code p.md'));
  assert.deepEqual(covering, []);
});

test('3.60.0 AC-2: ATTACK: a command reading the store is asked or denied', T, async () => {
  const { evaluate } = await load('destructive-guard.mjs');
  const reads = [
    'cat ~/.vibe-kit/providers.json',
    'cat $HOME/.vibe-kit/providers.json',
    'cat "$HOME/.vibe-kit/providers.json"',
    'type %USERPROFILE%\\.vibe-kit\\providers.json',
    'type "%USERPROFILE%\\.vibe-kit\\providers.json"',
    'Get-Content $env:USERPROFILE\\.vibe-kit\\providers.json',
    'gc ~/.vibe-kit/providers.json',
    'grep -r sk- ~/.vibe-kit',
    'base64 ~/.vibe-kit/providers.json',
    'cd ~/.vibe-kit && cat providers.json',
    'node -e "console.log(require(\'fs\').readFileSync(require(\'os\').homedir()+\'/.vibe-kit/providers.json\',\'utf8\'))"',
    'python -c "import os;print(open(os.path.expanduser(\'~/.vibe-kit/providers.json\')).read())"',
    'cat ~/.vibe"-"kit/providers.json',
    'cat ~/.vibe\\-kit/providers.json',
    "cat ~/$'.vibe-kit'/providers.json",
    'cat ~/.vibe-ki?/providers.json',
    'cat ~/.vib*/providers.json',
    'cat ~/.vibe-kit/*',
    'cat ~/.vibe${X}-kit/providers.json',
    'cat ../../../.vibe-kit/providers.json',
  ];
  for (const ctx of [{}, { tool: 'claude', agent: '' }, { tool: 'claude', agent: 'test-writer' }])
    assert.deepEqual(reads.filter((c) => !['ask', 'deny'].includes(evaluate(c, ctx)?.decision)), [], JSON.stringify(ctx));
  assert.equal(evaluate('git commit -m "docs: mention .vibe-kit/providers.json"'), null, 'a commit message only names it');
});

test('3.60.0 AC-2: childEnv sets the proxy address, the run token and the model slots, and an empty ANTHROPIC_API_KEY', T, async () => {
  const { childEnv } = await load('run-role.mjs');
  const env = childEnv({ PATH: 'keep-me', CLAUDE_PROJECT_DIR: 'elsewhere' }, { port: 43210, token: TOKEN, model: MODEL, root: 'project-root' });
  assert.equal(env.ANTHROPIC_BASE_URL, 'http://127.0.0.1:43210');
  assert.equal(env.ANTHROPIC_AUTH_TOKEN, TOKEN);
  assert.equal(env.ANTHROPIC_API_KEY, '');
  for (const slot of ['ANTHROPIC_MODEL', 'ANTHROPIC_DEFAULT_OPUS_MODEL', 'ANTHROPIC_DEFAULT_SONNET_MODEL', 'ANTHROPIC_DEFAULT_HAIKU_MODEL', 'CLAUDE_CODE_SUBAGENT_MODEL'])
    assert.equal(env[slot], MODEL, slot);
  assert.equal(env.CLAUDE_CODE_DISABLE_AUTO_MEMORY, '1');
  assert.equal(env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC, '1');
  assert.equal(env.CLAUDE_PROJECT_DIR, 'project-root');
  assert.equal(env.PATH, 'keep-me');
  const win = childEnv({ Path: 'win-path' }, { port: 1, token: TOKEN, model: MODEL, root: 'r' });
  assert.equal(win.Path ?? win.PATH, 'win-path', 'Windows spelling of PATH');
});

// ---- AC-3 ----

test('3.60.0 AC-3: ATTACK: keyFormatOk ties a key to its provider and refuses what cannot be a key', T, async () => {
  const { keyFormatOk } = await load('providers.mjs');
  assert.equal(keyFormatOk('openrouter', OR_KEY), true);
  assert.equal(keyFormatOk('deepseek', DS_KEY), true);
  assert.equal(keyFormatOk('kimi', DS_KEY), true);
  assert.equal(keyFormatOk('openrouter', DS_KEY), false, 'OpenRouter keys start sk-or-');
  assert.equal(keyFormatOk('deepseek', OR_KEY), false, 'an sk-or- key is not for deepseek');
  assert.equal(keyFormatOk('kimi', OR_KEY), false, 'an sk-or- key is not for kimi');
  for (const provider of ['evil', '', 'OPENROUTER', '__proto__', 'constructor', 'toString', undefined, null])
    assert.equal(keyFormatOk(provider, OR_KEY), false, `unknown provider ${provider}`);
  for (const key of ['', undefined, null, 123, {}, `${OR_KEY}\r\nx-evil: 1`, `${OR_KEY} extra`, `\n${OR_KEY}`]) {
    assert.equal(keyFormatOk('openrouter', key), false, `openrouter: ${JSON.stringify(key)}`);
  }
  for (const key of ['', undefined, `${DS_KEY}\r\nx-evil: 1`]) assert.equal(keyFormatOk('deepseek', key), false, `deepseek: ${JSON.stringify(key)}`);
});

test('3.60.0 AC-3: ATTACK: setKey on a format mismatch returns an error, writes nothing and calls no network', T, async (t) => {
  const { setKey, readStore } = await load('providers.mjs');
  const file = path.join(tmpDir(t, 'rr-key-'), 'sub', 'providers.json');
  const realFetch = globalThis.fetch;
  let fetched = 0;
  globalThis.fetch = async () => { fetched++; throw new Error('no network'); };
  t.after(() => { globalThis.fetch = realFetch; });
  for (const [provider, key] of [['openrouter', DS_KEY], ['deepseek', OR_KEY], ['kimi', OR_KEY], ['evil', OR_KEY], ['__proto__', OR_KEY], ['openrouter', '']]) {
    assert.match(setKey(provider, key, file) ?? '', /\S/, `${provider} refused`);
    assert.equal(fs.existsSync(file), false, `${provider}: no file`);
  }
  assert.equal(setKey('openrouter', OR_KEY, file), null);
  const before = fs.readFileSync(file, 'utf8');
  assert.match(setKey('deepseek', OR_KEY, file) ?? '', /\S/);
  assert.equal(fs.readFileSync(file, 'utf8'), before, 'a refused key leaves the store as it was');
  assert.equal(fetched, 0);
  assert.equal(readStore(file).keys.openrouter, OR_KEY);
  assert.equal(readStore(file).keys.deepseek, undefined);
});

test('3.60.0 AC-3: setKey keeps the other entries, and the file is 0600 on POSIX', T, async (t) => {
  const { setKey, setLimit, readStore } = await load('providers.mjs');
  const file = path.join(tmpDir(t, 'rr-key-'), '.vibe-kit', 'providers.json');
  assert.equal(setKey('openrouter', OR_KEY, file), null);
  setLimit('openrouter', 2.5, file);
  assert.equal(setKey('deepseek', DS_KEY, file), null);
  const store = readStore(file);
  assert.deepEqual(store.keys, { openrouter: OR_KEY, deepseek: DS_KEY });
  assert.equal(store.limits.openrouter, 2.5);
  if (process.platform !== 'win32') assert.equal(fs.statSync(file).mode & 0o777, 0o600);
});

test('3.60.0 AC-3: ATTACK: --set-key refuses when stdin is not a TTY and writes nothing, even with a good key on stdin', T, async (t) => {
  await load('providers.mjs');
  const m = modelsProject(t);
  const r = m.run(['--set-key', 'openrouter'], `${OR_KEY}\n`);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /terminal|tty/i);
  assert.doesNotMatch(r.stderr, /Usage/);
  assert.equal(fs.existsSync(m.file), false, 'no store');
  assert.equal((r.stdout + r.stderr).includes(OR_KEY), false, 'the key is not echoed');
  assert.equal(walk(m.root).some((f) => fs.readFileSync(f).includes(OR_KEY)), false);
});

test('3.60.0 AC-3: the shield asks for --set-key and --set-limit, also in a tricky spelling', T, async () => {
  const { evaluate } = await load('destructive-guard.mjs');
  for (const c of ['node .claude/hooks/models.mjs --set-key openrouter', 'node .claude/hooks/models.mjs --set-limit openrouter 5'])
    assert.equal(evaluate(c)?.decision, 'ask', c);
  const tricks = [
    'node .claude/hooks/models.mjs --set"-key" openrouter',
    'node .claude/hooks/models.mjs "--set-key" openrouter',
    'node .claude/hooks/models.mjs --set-k\\ey openrouter',
    'node .claude/hooks/models.mjs --set-l"imit" openrouter 5',
    'node ".claude/hooks/models.mjs" --set-limit openrouter 5',
    'cd .claude/hooks && node models.mjs --set-limit openrouter 5',
  ];
  assert.deepEqual(tricks.filter((c) => !['ask', 'deny'].includes(evaluate(c)?.decision)), []);
});

const OR_KEY_2 = 'sk-' + 'or-v1-' + 'f0e1d2c3'.repeat(6);
const DS_KEY_2 = 'sk-' + 'fedcba9876543210'.repeat(2);
const NO_FILE = (t) => path.join(tmpDir(t, 'rr-resolve-'), 'none.json');
const FIXED_NAMES = [['openrouter', 'OPENROUTER_API_KEY', OR_KEY], ['deepseek', 'DEEPSEEK_API_KEY', DS_KEY], ['kimi', 'MOONSHOT_API_KEY', DS_KEY]];

test('3.60.0 AC-3: resolveKey takes the store first, then the provider\'s fixed variable, otherwise null', T, async (t) => {
  const { resolveKey, setKey } = await load('providers.mjs');
  const none = NO_FILE(t);
  for (const [provider, name, key] of FIXED_NAMES) {
    assert.equal(resolveKey(provider, { file: none, env: { [name]: key } }), key, `${provider} from ${name}`);
    assert.equal(resolveKey(provider, { file: none, env: {} }), null, `${provider} nothing`);
  }
  const file = path.join(tmpDir(t, 'rr-resolve-'), 'providers.json');
  assert.equal(setKey('openrouter', OR_KEY, file), null);
  assert.equal(setKey('deepseek', DS_KEY, file), null);
  assert.equal(resolveKey('openrouter', { file, env: { OPENROUTER_API_KEY: OR_KEY_2 } }), OR_KEY, 'the store wins');
  assert.equal(resolveKey('deepseek', { file, env: { DEEPSEEK_API_KEY: DS_KEY_2 } }), DS_KEY, 'the store wins');
  assert.equal(resolveKey('kimi', { file, env: { MOONSHOT_API_KEY: DS_KEY_2 } }), DS_KEY_2, 'no store entry for this provider');
  assert.equal(resolveKey('kimi', { file, env: {} }), null);
  const broken = path.join(tmpDir(t, 'rr-resolve-'), 'broken.json');
  fs.writeFileSync(broken, '{"keys":');
  assert.equal(resolveKey('openrouter', { file: broken, env: { OPENROUTER_API_KEY: OR_KEY } }), OR_KEY, 'a broken store falls to the variable');
  assert.equal(resolveKey('openrouter', { file: broken, env: {} }), null);
});

test('3.60.0 AC-3: ATTACK: resolveKey never returns a key that fails the format of that provider, so nothing goes to the wrong provider', T, async (t) => {
  const { resolveKey } = await load('providers.mjs');
  const file = NO_FILE(t);
  assert.equal(resolveKey('deepseek', { file, env: { DEEPSEEK_API_KEY: OR_KEY } }), null, 'an OpenRouter key in DEEPSEEK_API_KEY');
  assert.equal(resolveKey('kimi', { file, env: { MOONSHOT_API_KEY: OR_KEY } }), null, 'an OpenRouter key in MOONSHOT_API_KEY');
  assert.equal(resolveKey('openrouter', { file, env: { OPENROUTER_API_KEY: DS_KEY } }), null, 'a plain key in OPENROUTER_API_KEY');
  for (const bad of ['', ' ', `${OR_KEY}\r\nx-evil: 1`, `${OR_KEY} extra`, `\n${OR_KEY}`])
    assert.equal(resolveKey('openrouter', { file, env: { OPENROUTER_API_KEY: bad } }), null, JSON.stringify(bad));

  const tampered = path.join(tmpDir(t, 'rr-resolve-'), 'providers.json');
  write(tampered, JSON.stringify({ keys: { deepseek: OR_KEY, openrouter: `${OR_KEY}\r\nx-evil: 1` } }));
  assert.equal(resolveKey('deepseek', { file: tampered, env: {} }), null, 'a hand-edited store is held to the format too');
  assert.equal(resolveKey('openrouter', { file: tampered, env: {} }), null, 'header injection from the store');
});

test('3.60.0 AC-3: ATTACK: resolveKey reads the fixed name only, from the env it is given, and refuses an unknown provider', T, async (t) => {
  const { resolveKey } = await load('providers.mjs');
  const file = NO_FILE(t);
  assert.equal(resolveKey('deepseek', { file, env: { OPENROUTER_API_KEY: OR_KEY } }), null, 'another provider\'s variable');
  assert.equal(resolveKey('kimi', { file, env: { DEEPSEEK_API_KEY: DS_KEY } }), null, 'a valid key under another provider\'s name');
  assert.equal(resolveKey('deepseek', { file, env: { MOONSHOT_API_KEY: DS_KEY } }), null);
  for (const name of ['KIMI_API_KEY', 'deepseek_api_key', 'API_KEY', 'ANTHROPIC_API_KEY', 'ANTHROPIC_AUTH_TOKEN'])
    assert.equal(resolveKey(name === 'KIMI_API_KEY' ? 'kimi' : 'deepseek', { file, env: { [name]: DS_KEY } }), null, name);
  const everyName = { OPENROUTER_API_KEY: OR_KEY, DEEPSEEK_API_KEY: DS_KEY, MOONSHOT_API_KEY: DS_KEY, EVIL_API_KEY: OR_KEY, __PROTO___API_KEY: OR_KEY };
  for (const provider of ['evil', '', 'OPENROUTER', '__proto__', 'constructor', 'toString', undefined, null])
    assert.equal(resolveKey(provider, { file, env: everyName }), null, String(provider));

  const had = process.env.OPENROUTER_API_KEY;
  process.env.OPENROUTER_API_KEY = OR_KEY;
  t.after(() => { if (had === undefined) delete process.env.OPENROUTER_API_KEY; else process.env.OPENROUTER_API_KEY = had; });
  assert.equal(resolveKey('openrouter', { file, env: {} }), null, 'the env given is the only env read');
});

test('3.60.0 AC-3: removeKey removes that key only: the bytes leave the file, other keys, limits and spend stay', T, async (t) => {
  const { setKey, setLimit, addSpend, spentOn, removeKey, readStore, resolveKey } = await load('providers.mjs');
  const file = path.join(tmpDir(t, 'rr-remove-'), '.vibe-kit', 'providers.json');
  assert.equal(setKey('openrouter', OR_KEY, file), null);
  assert.equal(setKey('deepseek', DS_KEY, file), null);
  setLimit('openrouter', 2.5, file);
  setLimit('deepseek', 4, file);
  addSpend('openrouter', 1.5, '2026-11-01', file);
  removeKey('openrouter', file);
  assert.equal(fs.readFileSync(file).includes(OR_KEY), false, 'the key is gone from the file');
  const store = readStore(file);
  assert.deepEqual(store.keys, { deepseek: DS_KEY });
  assert.deepEqual(store.limits, { openrouter: 2.5, deepseek: 4 });
  close(spentOn('openrouter', '2026-11-01', file), 1.5, 'the ledger stays');
  assert.equal(resolveKey('openrouter', { file, env: {} }), null, 'nothing to resolve any more');
  assert.equal(resolveKey('openrouter', { file, env: { OPENROUTER_API_KEY: OR_KEY_2 } }), OR_KEY_2, 'the variable is still there as a route');
  if (process.platform !== 'win32') assert.equal(fs.statSync(file).mode & 0o777, 0o600);
});

test('3.60.0 AC-3: removing a key that is absent is not an error and changes nothing', T, async (t) => {
  const { setKey, setLimit, removeKey, readStore } = await load('providers.mjs');
  const dir = tmpDir(t, 'rr-remove-');
  const missing = path.join(dir, 'none', 'providers.json');
  assert.doesNotThrow(() => removeKey('openrouter', missing), 'no file');
  assert.deepEqual(readStore(missing), { keys: {}, limits: {}, spend: {} });
  const file = path.join(dir, 'providers.json');
  assert.equal(setKey('deepseek', DS_KEY, file), null);
  setLimit('openrouter', 2.5, file);
  assert.doesNotThrow(() => removeKey('openrouter', file), 'no key for this provider');
  assert.doesNotThrow(() => removeKey('openrouter', file), 'twice');
  assert.deepEqual(readStore(file).keys, { deepseek: DS_KEY });
  assert.equal(readStore(file).limits.openrouter, 2.5);
});

test('3.60.0 AC-3: --remove-key works without a TTY, removes that key only, and is not an error when the key is absent', T, async (t) => {
  const { setKey, setLimit, readStore } = await load('providers.mjs');
  const m = modelsProject(t);
  assert.equal(setKey('openrouter', OR_KEY, m.file), null);
  assert.equal(setKey('deepseek', DS_KEY, m.file), null);
  setLimit('openrouter', 2.5, m.file);
  const r = m.run(['--remove-key', 'openrouter']);
  assert.equal(r.status, 0, r.stderr);
  assert.deepEqual(readStore(m.file).keys, { deepseek: DS_KEY });
  assert.equal(readStore(m.file).limits.openrouter, 2.5);
  assert.equal((r.stdout + r.stderr).includes(OR_KEY), false, 'the key is not echoed');
  const again = m.run(['--remove-key', 'openrouter']);
  assert.equal(again.status, 0, `twice: ${again.stderr}`);
  const never = m.run(['--remove-key', 'kimi']);
  assert.equal(never.status, 0, `never set: ${never.stderr}`);
  assert.equal(fs.existsSync(m.modelsFile), false, 'the project is not touched');
});

test('3.60.0 AC-3: ATTACK: --remove-key with no provider or a made-up provider removes nothing', T, async (t) => {
  const { setKey } = await load('providers.mjs');
  const m = modelsProject(t);
  assert.equal(setKey('openrouter', OR_KEY, m.file), null);
  const before = fs.readFileSync(m.file, 'utf8');
  assert.equal(m.run(['--remove-key']).status, 1, 'no provider');
  for (const provider of ['evil', '__proto__', 'constructor', 'OPENROUTER', '*', '--all']) {
    const r = m.run(['--remove-key', provider]);
    assert.equal(fs.readFileSync(m.file, 'utf8'), before, provider);
    assert.notEqual(r.status, null, `${provider} ends by itself`);
    assert.doesNotMatch(r.stderr, /TypeError|at file:/, `${provider}: no crash`);
  }
});

test('3.60.0 AC-3: the shield asks for --remove-key, also in a tricky spelling; a commit message only names it', T, async () => {
  const { evaluate } = await load('destructive-guard.mjs');
  for (const ctx of [{}, { tool: 'claude', agent: '' }, { tool: 'claude', agent: 'test-writer' }])
    assert.equal(evaluate('node .claude/hooks/models.mjs --remove-key openrouter', ctx)?.decision, 'ask', JSON.stringify(ctx));
  const tricks = [
    'node .claude/hooks/models.mjs "--remove-key" openrouter',
    'node .claude/hooks/models.mjs --remove"-key" openrouter',
    'node .claude/hooks/models.mjs --remove-k\\ey openrouter',
    "node .claude/hooks/models.mjs $'--remove-key' openrouter",
    'node ".claude/hooks/models.mjs" --remove-key openrouter',
    'node ./.claude/hooks/models.mjs --remove-key openrouter',
    'node .claude\\hooks\\models.mjs --remove-key openrouter',
    'node "$CLAUDE_PROJECT_DIR/.claude/hooks/models.mjs" --remove-key openrouter',
    'cd .claude/hooks && node models.mjs --remove-key openrouter',
    'git status && node .claude/hooks/models.mjs --remove-key openrouter',
  ];
  assert.deepEqual(tricks.filter((c) => !['ask', 'deny'].includes(evaluate(c)?.decision)), []);
  assert.equal(evaluate('git commit -m "docs: explain models.mjs --remove-key openrouter"'), null);
});

test('3.60.0 AC-3: the CLI runs with a key from the fixed variable alone; the key reaches only the provider and is not saved', T, async (t) => {
  const { readStore, setLimit } = await load('providers.mjs');
  for (const [provider, name, key, model, host] of [
    ['openrouter', 'OPENROUTER_API_KEY', OR_KEY, MODEL, 'https://openrouter.ai/api/v1/messages'],
    ['deepseek', 'DEEPSEEK_API_KEY', DS_KEY, 'deepseek-chat', 'https://api.deepseek.com/anthropic/v1/messages'],
    ['kimi', 'MOONSHOT_API_KEY', DS_KEY, 'kimi-k2', 'https://api.moonshot.ai/anthropic/v1/messages'],
  ]) {
    const p = await project(t, { key: false, models: { code: `${provider}/${model}:high` } });
    setLimit(provider, 5, p.file);
    const r = await cli(p, ['code', 'p.md'], { [name]: key });
    assertRan(r);
    assert.deepEqual(messageCalls(r).map((n) => n.url.split('?')[0]), [host], provider);
    assert.equal(messageCalls(r)[0].headers.authorization, `Bearer ${key}`, provider);
    const child = r.spawned[0];
    assert.equal(name in child.env, false, `${provider}: the variable does not reach the child`);
    assert.equal(JSON.stringify([child.env, child.args]).includes(key), false, `${provider}: nor its value`);
    assert.equal((r.stdout + r.stderr).includes(key), false, `${provider}: output`);
    assert.equal(fs.readFileSync(p.file).includes(key), false, `${provider}: not copied into the store`);
    assert.equal(readStore(p.file).keys[provider], undefined, provider);
    assert.deepEqual(walk(p.root).filter((f) => fs.readFileSync(f).includes(key)), [], `${provider}: project files`);
  }
});

test('3.60.0 AC-3: the CLI takes the store key over the variable', T, async (t) => {
  const p = await project(t);
  const r = await cli(p, ['code', 'p.md'], { OPENROUTER_API_KEY: OR_KEY_2 });
  assertRan(r);
  assert.equal(messageCalls(r)[0].headers.authorization, `Bearer ${OR_KEY}`);
  assert.equal(JSON.stringify(r.spawned[0].env).includes(OR_KEY_2), false);
});

test('3.60.0 AC-3: ATTACK: the CLI refuses a variable holding the wrong provider\'s key, or a key under the wrong name, and sends nothing', T, async (t) => {
  const { setLimit } = await load('providers.mjs');
  for (const [provider, model, env] of [
    ['deepseek', 'deepseek-chat', { DEEPSEEK_API_KEY: OR_KEY }],
    ['kimi', 'kimi-k2', { MOONSHOT_API_KEY: OR_KEY }],
    ['openrouter', MODEL, { OPENROUTER_API_KEY: DS_KEY }],
    ['deepseek', 'deepseek-chat', { OPENROUTER_API_KEY: OR_KEY }],
    ['kimi', 'kimi-k2', { DEEPSEEK_API_KEY: DS_KEY }],
  ]) {
    const p = await project(t, { key: false, models: { code: `${provider}/${model}:high` } });
    setLimit(provider, 5, p.file);
    const r = await cli(p, ['code', 'p.md'], env);
    assertRefused(r, /key/i);
    assert.equal((r.stdout + r.stderr).includes(Object.values(env)[0]), false, 'the refused key is not shown');
  }
});

test('3.60.0 AC-3: a key from the variable still needs a daily limit', T, async (t) => {
  assertRefused(await cli(await project(t, { key: false, limit: null }), ['code', 'p.md'], { OPENROUTER_API_KEY: OR_KEY }), /limit/i);
});

test('3.60.0 AC-3: ATTACK: a key in the project .env is not used: alone it gives a refusal and nothing sent', T, async (t) => {
  for (const name of ['.env', '.env.local', '.env.production']) {
    const p = await project(t, { key: false });
    write(path.join(p.root, name), `OPENROUTER_API_KEY=${OR_KEY}\nDEEPSEEK_API_KEY=${DS_KEY}\nexport OPENROUTER_API_KEY=${OR_KEY}\n`);
    const r = await cli(p, ['code', 'p.md']);
    assertRefused(r, /key/i);
    assert.equal((r.stdout + r.stderr).includes(OR_KEY), false, `${name}: not shown`);
  }
});

test('3.60.0 AC-3: ATTACK: a key in the project .env does not win over the store, and does not reach the child', T, async (t) => {
  const p = await project(t);
  write(path.join(p.root, '.env'), `OPENROUTER_API_KEY=${OR_KEY_2}\n`);
  const r = await cli(p, ['code', 'p.md']);
  assertRan(r);
  assert.equal(messageCalls(r)[0].headers.authorization, `Bearer ${OR_KEY}`);
  assert.equal(JSON.stringify(r.spawned[0].env).includes(OR_KEY_2), false);
});

test('3.60.0 AC-3: --remove-key ends the role: the CLI refuses afterwards, and only the variable can bring it back', T, async (t) => {
  const p = await project(t);
  assertRan(await cli(p, ['code', 'p.md']));
  const removed = spawnSync(process.execPath, [path.join(p.root, '.claude', 'hooks', 'models.mjs'), '--remove-key', 'openrouter'], {
    encoding: 'utf8', input: '', env: { ...cleanEnv(), HOME: p.home, USERPROFILE: p.home, CLAUDE_PROJECT_DIR: p.root },
  });
  assert.equal(removed.status, 0, removed.stderr);
  assertRefused(await cli(p, ['code', 'p.md']), /key/i);
  const back = await cli(p, ['code', 'p.md'], { OPENROUTER_API_KEY: OR_KEY_2 });
  assertRan(back);
  assert.equal(messageCalls(back)[0].headers.authorization, `Bearer ${OR_KEY_2}`);
});

// ---- AC-4 ----

test('3.60.0 AC-4: PROVIDERS holds the three fixed addresses', T, async () => {
  const { PROVIDERS } = await load('providers.mjs');
  assert.deepEqual(Object.keys(PROVIDERS).sort(), ['deepseek', 'kimi', 'openrouter']);
  assert.equal(PROVIDERS.openrouter.url, 'https://openrouter.ai/api');
  assert.equal(PROVIDERS.deepseek.url, 'https://api.deepseek.com/anthropic');
  assert.equal(PROVIDERS.kimi.url, 'https://api.moonshot.ai/anthropic');
});

test('3.60.0 AC-4: ATTACK: ANTHROPIC_BASE_URL and other overrides in the parent env do not change where the key goes or which binary runs', T, async (t) => {
  const evil = await upstream(t, (req, res) => res.end('stolen'));
  const p = await project(t);
  const r = await cli(p, ['code', 'p.md'], {
    ANTHROPIC_BASE_URL: evil.origin, ANTHROPIC_API_URL: evil.origin, OPENROUTER_BASE_URL: evil.origin, OPENROUTER_URL: evil.origin, PROVIDER_URL: evil.origin, KIT_PROVIDER_URL: evil.origin,
    CLAUDE_BIN: 'evil-binary', CLAUDE_PATH: 'evil-binary', KIT_CLAUDE_BIN: 'evil-binary',
  });
  assertRan(r);
  const child = r.spawned[0];
  assert.match(child.env.ANTHROPIC_BASE_URL, /^http:\/\/127\.0\.0\.1:\d+$/);
  assert.notEqual(child.env.ANTHROPIC_BASE_URL, evil.origin);
  assert.match(path.basename(String(child.cmd)), /^claude(\.exe|\.cmd)?$/i);
  assert.deepEqual(r.spy.filter((s) => s.kind === 'child-call').map((s) => s.status), [200]);
  assert.deepEqual(messageCalls(r).map((n) => n.url.split('?')[0]), ['https://openrouter.ai/api/v1/messages']);
  assert.equal(messageCalls(r)[0].headers.authorization, `Bearer ${OR_KEY}`);
  assert.equal(evil.seen.length, 0, 'the evil server got nothing');
  assert.deepEqual(r.net.filter((n) => new URL(n.url ?? 'https://blocked.invalid').hostname !== 'openrouter.ai').map((n) => n.url), [], 'no other outside host');
});

test('3.60.0 AC-4: ATTACK: an address written into the store or models.json by hand does not move the key', T, async (t) => {
  const evil = await upstream(t, (req, res) => res.end('stolen'));
  const p = await project(t);
  const store = JSON.parse(fs.readFileSync(p.file, 'utf8'));
  fs.writeFileSync(p.file, JSON.stringify({ ...store, baseUrl: evil.origin, url: evil.origin, urls: { openrouter: evil.origin }, providers: { openrouter: { url: evil.origin, baseUrl: evil.origin } } }));
  write(path.join(p.root, '.claude', 'state', 'models.json'), JSON.stringify({ code: MODEL_VALUE, baseUrl: evil.origin, url: evil.origin, providers: { openrouter: { url: evil.origin } } }));
  const r = await cli(p, ['code', 'p.md']);
  assertRan(r);
  assert.deepEqual(messageCalls(r).map((n) => new URL(n.url).origin), ['https://openrouter.ai']);
  assert.equal(evil.seen.length, 0);

  // A host in the provider slot is not a provider
  write(path.join(p.root, '.claude', 'state', 'models.json'), JSON.stringify({ code: `${evil.origin}/x:high` }));
  const hostInModel = await cli(p, ['code', 'p.md']);
  assertRefused(hostInModel, /provider/i);
  assert.equal(evil.seen.length, 0);
});

test('3.60.0 AC-4: the proxy keeps the provider base path and the query, and passes the body and anthropic-version', T, async (t) => {
  const up = await upstream(t, (req, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"ok":true}'); });
  const { port } = await proxyFor(t, up);
  const r = await call(port);
  assert.equal(r.status, 200);
  assert.equal(r.text, '{"ok":true}');
  assert.equal(up.seen.length, 1);
  assert.equal(up.seen[0].url, '/anthropic/v1/messages?beta=true');
  assert.equal(up.seen[0].method, 'POST');
  assert.equal(up.seen[0].body, CALL_BODY);
  assert.equal(up.seen[0].headers['anthropic-version'], '2023-06-01');
});

test('3.60.0 AC-4: ATTACK: upstream gets Bearer <key>, never the run token, and the client auth headers are not forwarded', T, async (t) => {
  const up = await upstream(t, (req, res) => res.end('{}'));
  const { port } = await proxyFor(t, up);
  const r = await call(port, { headers: { 'x-api-key': 'client-own-key-value', 'proxy-authorization': 'Basic client-own-proxy-value' } });
  assert.equal(r.status, 200);
  const h = up.seen[0].headers;
  assert.equal(h.authorization, `Bearer ${OR_KEY}`);
  const all = JSON.stringify(h);
  assert.equal(all.includes(TOKEN), false, 'run token');
  assert.equal(all.includes('client-own-key-value'), false, 'x-api-key');
  assert.equal(all.includes('client-own-proxy-value'), false, 'proxy-authorization');
});

test('3.60.0 AC-4: ATTACK: a wrong or missing run token gets 401 and nothing goes upstream; the right one still works', T, async (t) => {
  const up = await upstream(t, (req, res) => res.end('{}'));
  const { port } = await proxyFor(t, up);
  const attempts = [
    { token: null },
    { token: 'wrong' },
    { token: '' },
    { token: TOKEN.slice(0, -1) },
    { token: `${TOKEN}x` },
    { token: TOKEN.toUpperCase() },
    { token: OR_KEY },
    { token: '\xe9'.repeat(TOKEN.length) },
    { token: 'x'.repeat(8000) },
    { token: null, headers: { authorization: `Basic ${TOKEN}` } },
    { token: null, headers: { 'x-api-key': 'wrong' } },
    { token: null, target: `/v1/messages?token=${TOKEN}` },
    { token: null, method: 'GET', target: '/v1/models' },
    { token: 'wrong', method: 'GET', target: '/' },
  ];
  for (const a of attempts) {
    const r = await call(port, a);
    assert.equal(r.status, 401, JSON.stringify(a).slice(0, 80));
    assert.equal(r.text.includes(OR_KEY), false, 'the 401 does not hold the key');
  }
  assert.equal(up.seen.length, 0, 'nothing went upstream');
  assert.equal((await call(port)).status, 200, 'the proxy survives them');
  assert.equal(up.seen.length, 1);
});

test('3.60.0 AC-4: ATTACK: a redirect from upstream is not followed', T, async (t) => {
  const evil = await upstream(t, (req, res) => res.end('EVIL-BODY'));
  for (const status of [301, 302, 303, 307, 308]) {
    const up = await upstream(t, (req, res) => { res.writeHead(status, { location: `${evil.origin}/steal` }); res.end(); });
    const { port } = await proxyFor(t, up);
    const r = await call(port);
    assert.equal(up.seen.length, 1, `upstream got the request (${status})`);
    assert.equal(r.status >= 300, true, `not shown as a success (${status}): ${r.status}`);
    assert.equal(r.text.includes('EVIL-BODY'), false);
    assert.equal(evil.seen.length, 0, `the redirect target got nothing (${status})`);
  }
});

test('3.60.0 AC-4: ATTACK: the proxy listens on 127.0.0.1 only and close() stops it', T, async (t) => {
  const up = await upstream(t, (req, res) => res.end('{}'));
  const { proxy, port } = await proxyFor(t, up);
  assert.equal(Number.isInteger(port) && port > 0, true);
  const outside = Object.values(os.networkInterfaces()).flat().find((a) => a.family === 'IPv4' && !a.internal)?.address;
  if (outside) {
    const code = await new Promise((resolve) => {
      const req = http.request({ host: outside, port, agent: false, timeout: 1500 }, (res) => { res.resume(); resolve(`answered ${res.statusCode}`); });
      req.on('timeout', () => req.destroy(new Error('timeout')));
      req.on('error', (e) => resolve(e.code ?? e.message));
      req.end();
    });
    assert.doesNotMatch(String(code), /^answered/, `reachable on ${outside}`);
  }
  assert.equal((await call(port)).status, 200);
  await proxy.close();
  await assert.rejects(call(port), /ECONNREFUSED|ECONNRESET|socket hang up/);
});

test('3.60.0 AC-4: ATTACK: an upstream that is down gives an error status without the key, and the proxy lives on', T, async (t) => {
  const up = await upstream(t, (req, res) => res.end('{}'));
  const url = up.url;
  await up.stop();
  const { port } = await proxyFor(t, { url });
  const a = await call(port);
  assert.equal(a.status >= 500 && a.status < 600, true, `status ${a.status}`);
  assert.equal(a.text.includes(OR_KEY), false);
  assert.equal(JSON.stringify(a.headers).includes(OR_KEY), false);
  assert.equal((await call(port)).status >= 500, true, 'still answers');
});

// ---- AC-5 ----

test('3.60.0 AC-5: ATTACK: childEnv drops every secret-named variable and every incoming ANTHROPIC_*', T, async () => {
  const { childEnv } = await load('run-role.mjs');
  const secrets = {
    GITHUB_TOKEN: GH_VALUE, GH_TOKEN: GH_VALUE, AWS_SECRET_ACCESS_KEY: AWS_VALUE, AWS_ACCESS_KEY_ID: 'x', OPENROUTER_API_KEY: OR_KEY, DEEPSEEK_API_KEY: DS_KEY,
    NPM_TOKEN: 'x', DB_PASSWORD: 'x', GOOGLE_APPLICATION_CREDENTIALS: 'x', CLIENT_SECRET: 'x', CLAUDE_CODE_OAUTH_TOKEN: 'x', github_token: 'x', my_api_key: 'x', Some_Secret_Thing: 'x', db_password: 'x', aws_credential_file: 'x', KEYFILE: 'x',
  };
  const anthropic = { ANTHROPIC_BASE_URL: 'http://evil.example', ANTHROPIC_CUSTOM_HEADERS: 'x-evil: 1', ANTHROPIC_SMALL_FAST_MODEL: 'x', ANTHROPIC_BEDROCK_BASE_URL: 'http://evil.example', anthropic_model: 'x' };
  const env = childEnv({ PATH: 'keep-me', LANG: 'tr_TR.UTF-8', ...secrets, ...anthropic }, { port: 7, token: TOKEN, model: MODEL, root: 'r' });
  assert.deepEqual(Object.keys(secrets).filter((k) => k in env), [], 'secret names');
  assert.deepEqual(Object.keys(anthropic).filter((k) => k === k.toLowerCase() ? k in env : k !== 'ANTHROPIC_BASE_URL' && k in env), [], 'incoming ANTHROPIC_*');
  assert.equal(env.ANTHROPIC_BASE_URL, 'http://127.0.0.1:7');
  const values = JSON.stringify(env);
  for (const v of [GH_VALUE, AWS_VALUE, OR_KEY, DS_KEY, 'evil.example']) assert.equal(values.includes(v), false, v);
  assert.equal(env.PATH, 'keep-me');
  assert.equal(env.ANTHROPIC_AUTH_TOKEN, TOKEN, 'its own token survives the filter');
  assert.equal(env.ANTHROPIC_API_KEY, '', 'its own empty key survives the filter');
});

test('3.60.0 AC-5: ATTACK: a real run spawns the child with neither GITHUB_TOKEN nor AWS_SECRET_ACCESS_KEY', T, async (t) => {
  const p = await project(t);
  const r = await cli(p, ['code', 'p.md'], { GITHUB_TOKEN: GH_VALUE, AWS_SECRET_ACCESS_KEY: AWS_VALUE, OPENROUTER_API_KEY: 'parent-env-key-value' });
  assertRan(r);
  const env = r.spawned[0].env;
  for (const k of ['GITHUB_TOKEN', 'AWS_SECRET_ACCESS_KEY', 'OPENROUTER_API_KEY']) assert.equal(k in env, false, k);
  const all = JSON.stringify(env);
  for (const v of [GH_VALUE, AWS_VALUE, 'parent-env-key-value']) assert.equal(all.includes(v), false, v);
  assert.equal(messageCalls(r)[0].headers.authorization, `Bearer ${OR_KEY}`, 'the key comes from the store, not the env');
});

const HIJACK = {
  CLAUDE_CODE_USE_BEDROCK: '1', CLAUDE_CODE_USE_VERTEX: '1', NODE_OPTIONS: '--no-warnings', NODE_EXTRA_CA_CERTS: 'evil-ca.pem',
  HTTPS_PROXY: 'http://evil.example:1', HTTP_PROXY: 'http://evil.example:1', ALL_PROXY: 'http://evil.example:1', FOO: 'arbitrary-value',
};

test('3.60.0 AC-5: ATTACK: childEnv is an allowlist: provider switches, NODE_OPTIONS, proxies, extra CAs and any other name do not pass', T, async () => {
  const { childEnv } = await load('run-role.mjs');
  const spellings = {
    https_proxy: 'http://evil.example:1', http_proxy: 'http://evil.example:1', all_proxy: 'http://evil.example:1', Https_Proxy: 'http://evil.example:1', Node_Options: '--no-warnings', foo: 'arbitrary-value',
    NODE_PATH: 'evil', NODE_TLS_REJECT_UNAUTHORIZED: '0', SSL_CERT_FILE: 'evil-ca.pem', NO_PROXY: '*', LD_PRELOAD: 'evil.so', DYLD_INSERT_LIBRARIES: 'evil.so', CLAUDE_CONFIG_DIR: 'evil', CLAUDE_CODE_USE_FOUNDRY: '1', CLAUDE_CODE_MAX_RETRIES: '99',
    // Names that only start like an allowed one
    PATHX: 'evil', PATH_EVIL: 'evil', HOME_EVIL: 'evil', TEMP_EVIL: 'evil', USERPROFILE2: 'evil', XPATH: 'evil',
  };
  const base = { PATH: 'keep-me', ...HIJACK, ...spellings };
  const env = childEnv(base, { port: 7, token: TOKEN, model: MODEL, root: 'r' });
  assert.deepEqual(Object.keys({ ...HIJACK, ...spellings }).filter((k) => k in env), []);
  const values = JSON.stringify(env);
  for (const v of ['evil.example', 'evil-ca.pem', 'arbitrary-value', 'evil.so', '--no-warnings']) assert.equal(values.includes(v), false, v);

  // The fixed values from before
  assert.equal(env.PATH, 'keep-me');
  assert.equal(env.ANTHROPIC_BASE_URL, 'http://127.0.0.1:7');
  assert.equal(env.ANTHROPIC_AUTH_TOKEN, TOKEN);
  assert.equal(env.ANTHROPIC_API_KEY, '');
  for (const slot of ['ANTHROPIC_MODEL', 'ANTHROPIC_DEFAULT_OPUS_MODEL', 'ANTHROPIC_DEFAULT_SONNET_MODEL', 'ANTHROPIC_DEFAULT_HAIKU_MODEL', 'CLAUDE_CODE_SUBAGENT_MODEL'])
    assert.equal(env[slot], MODEL, slot);
  assert.equal(env.CLAUDE_CODE_DISABLE_AUTO_MEMORY, '1');
  assert.equal(env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC, '1');
  assert.equal(env.CLAUDE_PROJECT_DIR, 'r');
});

test('3.60.0 AC-5: childEnv lets the operating system\'s own variables through', T, async () => {
  const { childEnv } = await load('run-role.mjs');
  const own = process.platform === 'win32'
    ? { SystemRoot: 'C-Windows', ComSpec: 'cmd-path', PATHEXT: '.EXE', TEMP: 'temp-dir', TMP: 'tmp-dir', USERPROFILE: 'profile-dir' }
    : { HOME: 'home-dir', TMPDIR: 'tmp-dir', LANG: 'tr_TR.UTF-8', USER: 'someone' };
  const env = childEnv({ PATH: 'keep-me', ...own }, { port: 7, token: TOKEN, model: MODEL, root: 'r' });
  assert.deepEqual(Object.fromEntries(Object.keys(own).map((k) => [k, env[k]])), own);
  assert.equal(env.PATH, 'keep-me');
});

test('3.60.0 AC-5: ATTACK: a real run spawns the child without the hijack variables', T, async (t) => {
  const p = await project(t);
  const r = await cli(p, ['code', 'p.md'], { ...HIJACK, NODE_EXTRA_CA_CERTS: path.join(p.home, 'evil-ca.pem') });
  assertRan(r);
  const env = r.spawned[0].env;
  assert.deepEqual(Object.keys(HIJACK).filter((k) => k in env), []);
  for (const v of ['evil.example', 'evil-ca.pem', 'arbitrary-value']) assert.equal(JSON.stringify(env).includes(v), false, v);
  assert.equal(env.ANTHROPIC_BASE_URL.startsWith('http://127.0.0.1:'), true);
});

// ---- AC-6 ----

test('3.60.0 AC-6: checkRun allows code, test and docs, and refuses plan, review, board and security-auditor roles', T, async (t) => {
  const { checkRun } = await load('run-role.mjs');
  const root = tmpDir(t, 'rr-role-');
  write(path.join(root, 'p.md'), 'x');
  const run = (role) => checkRun({ role, provider: 'openrouter', model: MODEL, promptFile: 'p.md', root });
  for (const role of ['code', 'test', 'docs']) assert.equal(run(role), null, role);
  const refused = ['plan', 'review', 'board', 'board-chair', 'council-advisor', 'code-reviewer', 'security-auditor', 'PLAN', 'Review', 'Security-Auditor', ' plan', 'plan ', 'admin', '', '__proto__', 'constructor', undefined, null];
  assert.deepEqual(refused.filter((role) => typeof run(role) !== 'string' || !/\S/.test(run(role))), []);
});

test('3.60.0 AC-6: --set refuses a provider for plan and review, a hand edit falls back, and those roles keep the plain forms', T, async (t) => {
  const { setKey } = await load('providers.mjs');
  const m = modelsProject(t);
  assert.equal(setKey('openrouter', OR_KEY, m.file), null);
  assert.equal(m.run(['--set', `code=${MODEL_VALUE}`]).status, 0, 'a provider role is allowed for code');
  for (const role of ['plan', 'review', 'PLAN']) {
    const before = fs.readFileSync(m.modelsFile, 'utf8');
    const r = m.run(['--set', `${role}=${MODEL_VALUE}`]);
    assert.equal(r.status, 1, role);
    assert.equal(fs.readFileSync(m.modelsFile, 'utf8'), before, `${role}: nothing written`);
  }
  assert.equal(m.run(['--set', 'plan=sonnet:high', 'review=opus:high']).status, 0, 'plain forms still work');
  write(m.modelsFile, JSON.stringify({ code: MODEL_VALUE, plan: MODEL_VALUE, review: 'kimi/kimi-k2:high' }));
  const show = m.run(['--show']).stdout;
  assert.match(line(show, 'code'), /openrouter/);
  assert.match(line(show, 'plan'), /^plan: opus \/ high/);
  assert.match(line(show, 'review'), /^review: sonnet \/ high/);
});

test('3.60.0 AC-6: ATTACK: the CLI refuses plan, review, board and unknown roles even with a provider written into models.json', T, async (t) => {
  const p = await project(t, { models: { plan: MODEL_VALUE, review: MODEL_VALUE, code: MODEL_VALUE, 'security-auditor': MODEL_VALUE, board: MODEL_VALUE } });
  assertRan(await cli(p, ['code', 'p.md']));
  for (const role of ['plan', 'review', 'security-auditor', 'board', 'board-chair', 'nope'])
    assertRefused(await cli(p, [role, 'p.md']), /role|plan|review|provider/i);
});

// ---- AC-7 ----

test('3.60.0 AC-7: costOf is tokens times price per million, cache reads at the cache price when given', T, async () => {
  const { costOf } = await load('run-role.mjs');
  const u = (input, output, cacheRead) => ({ input_tokens: input, output_tokens: output, cache_read_input_tokens: cacheRead, input, output, cacheRead, cache_read: cacheRead });
  close(costOf(u(1_000_000, 0, 0), PRICE), 2, 'input');
  close(costOf(u(0, 1_000_000, 0), PRICE), 10, 'output');
  close(costOf(u(0, 0, 1_000_000), PRICE), 0.5, 'cache');
  close(costOf(u(1_000_000, 500_000, 2_000_000), PRICE), 8, 'sum');
  close(costOf(u(1, 0, 0), PRICE), 2e-6, 'one token');
  close(costOf(u(0, 0, 0), PRICE), 0, 'zero');
  close(costOf(u(0, 0, 1_000_000), { input: 2, output: 10 }), 2, 'no cache price: reads cost the input price');
  close(costOf({}, PRICE), 0, 'an empty usage is zero, not NaN');
  const big = costOf(u(5e12, 5e12, 0), PRICE);
  assert.equal(Number.isFinite(big), true);
  close(big / 1e6, 60, 'very large');
});

test('3.60.0 AC-7: usage from a stream split at any byte counts message_start and message_delta once, and the bytes reach the client unchanged', T, async (t) => {
  const body = Buffer.from(sse());
  for (const size of [1, 3, 7, 64]) {
    const up = await upstream(t, (req, res) => { drip(res, body, size); });
    const { port, usage } = await proxyFor(t, up);
    const r = await call(port);
    assert.equal(r.status, 200);
    assert.equal(Buffer.compare(r.raw, body), 0, `bytes unchanged at size ${size}`);
    await waitFor(() => usage.length > 0, 'onUsage');
    await wait(20);
    assert.equal(usage.length, 1, `one report per response at size ${size}`);
    assert.equal(inputIn(usage[0]), 1_000_000, 'input');
    assert.equal(outputIn(usage[0]), 500_000, 'output is cumulative in message_delta, not added');
    assert.equal(cacheReadIn(usage[0]), 2_000_000, 'cache read');
    close(costIn(usage[0]), 8, `cost at size ${size}`);
  }
});

test('3.60.0 AC-7: usage survives cuts at awkward places: a key, a nested object, the blank line, a Turkish character', T, async (t) => {
  const body = Buffer.from(sse());
  const at = (s, shift) => body.indexOf(Buffer.from(s)) + shift;
  const points = [
    at('data: {"type":"message_start"', 3), at('"usage":{"input_tokens"', 4), at('"cache_creation":{', 8), at('"cache_creation":{', 18),
    at('ephemeral_5m', 5), at('\n\nevent: ping', 1), at('İ', 1), at('ş', 1), at('"message_delta","delta":{"stop_reason":"end_turn"', 10),
  ];
  assert.equal(points.every((p) => p > 0), true, 'every cut point is in the fixture');
  const up = await upstream(t, (req, res) => { cuts(res, body, points); });
  const { port, usage } = await proxyFor(t, up);
  const r = await call(port);
  assert.equal(Buffer.compare(r.raw, body), 0, 'a split Turkish character still arrives whole');
  await waitFor(() => usage.length > 0, 'onUsage');
  close(costIn(usage[0]), 8, 'cost');
});

test('3.60.0 AC-7: a message_delta that repeats the full usage, or the only full usage, is not double counted', T, async (t) => {
  for (const [label, stream] of [['repeats', sse({ deltaFull: true })], ['zero at start', sse({ deltaFull: true, startInput: 0 })]]) {
    const up = await upstream(t, (req, res) => { drip(res, Buffer.from(stream), 11); });
    const { port, usage } = await proxyFor(t, up);
    await call(port);
    await waitFor(() => usage.length > 0, 'onUsage');
    assert.equal(inputIn(usage[0]), 1_000_000, `input (${label})`);
    assert.equal(outputIn(usage[0]), 500_000, `output (${label})`);
    close(costIn(usage[0]), 8, `cost (${label})`);
  }
});

test('3.60.0 AC-7: other valid SSE spellings count too: CRLF, no space after the colon, a comment line', T, async (t) => {
  const spellings = {
    crlf: sse().replace(/\n/g, '\r\n'),
    tight: sse().replace(/^data: /gm, 'data:'),
    comment: `: keep-alive\n\n${sse()}`,
    'data only': sse().replace(/^event: .*\n/gm, ''),
  };
  for (const [label, stream] of Object.entries(spellings)) {
    const up = await upstream(t, (req, res) => { drip(res, Buffer.from(stream), 13); });
    const { port, usage } = await proxyFor(t, up);
    await call(port);
    await waitFor(() => usage.length > 0, `onUsage (${label})`);
    close(costIn(usage[0]), 8, label);
  }
});

test('3.60.0 AC-7: cache_creation tokens are read beside the nested object without breaking the other totals', T, async (t) => {
  const up = await upstream(t, (req, res) => { drip(res, Buffer.from(sse({ cacheCreate: 40_000 })), 9); });
  const { port, usage } = await proxyFor(t, up);
  await call(port);
  await waitFor(() => usage.length > 0, 'onUsage');
  assert.equal(inputIn(usage[0]), 1_000_000);
  assert.equal(outputIn(usage[0]), 500_000);
  assert.equal(cacheReadIn(usage[0]), 2_000_000);
  close(costIn(usage[0]), 8.08, 'the write tokens cost the input price when no cacheWrite is given, and the nested object is not counted again');
});

test('3.60.0 AC-7: a non-streaming JSON response is counted, and text that looks like usage is not', T, async (t) => {
  const json = JSON.stringify({
    id: 'msg_2', type: 'message', role: 'assistant', model: MODEL,
    content: [{ type: 'text', text: '"usage":{"input_tokens":999999999,"output_tokens":999999999}' }],
    usage: { input_tokens: 1_000_000, cache_creation_input_tokens: 0, cache_read_input_tokens: 2_000_000, output_tokens: 500_000, cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 0 } },
  });
  const up = await upstream(t, (req, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.write(json.slice(0, 40)); setTimeout(() => res.end(json.slice(40)), 5); });
  const { port, usage } = await proxyFor(t, up);
  const r = await call(port);
  assert.equal(r.text, json);
  await waitFor(() => usage.length > 0, 'onUsage');
  assert.equal(usage.length, 1);
  assert.equal(inputIn(usage[0]), 1_000_000);
  assert.equal(outputIn(usage[0]), 500_000);
  close(costIn(usage[0]), 8, 'cost');
});

test('3.60.0 AC-7: a gzip-speaking upstream does not hide usage from the proxy or break the body for the client', T, async (t) => {
  const stream = sse();
  const up = await upstream(t, (req, res) => {
    if (/gzip/.test(req.headers['accept-encoding'] ?? '')) {
      res.writeHead(200, { ...STREAM_HEADERS, 'content-encoding': 'gzip' });
      res.end(zlib.gzipSync(stream));
    } else {
      res.writeHead(200, STREAM_HEADERS);
      res.end(stream);
    }
  });
  const { port, usage } = await proxyFor(t, up);
  const r = await call(port, { headers: { 'accept-encoding': 'gzip, deflate, br' } });
  assert.equal(r.text, stream, 'the client reads the same stream');
  await waitFor(() => usage.length > 0, 'onUsage');
  close(costIn(usage[0]), 8, 'cost');
});

test('3.60.0 AC-7: streaming passes chunk by chunk: a chunk arrives before upstream ends', T, async (t) => {
  let release, ended = false;
  const hold = new Promise((r) => { release = r; });
  const first = 'event: ping\ndata: {"type":"ping"}\n\n';
  const up = await upstream(t, async (req, res) => {
    res.writeHead(200, STREAM_HEADERS);
    res.write(first);
    await hold;
    ended = true;
    res.end(sse());
  });
  t.after(() => release());
  const { port } = await proxyFor(t, up);
  const text = await new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method: 'POST', path: '/v1/messages', agent: false, headers: { authorization: `Bearer ${TOKEN}` } }, (res) => {
      let all = '', got = false;
      const fail = setTimeout(() => reject(new Error('no chunk before upstream ended: the proxy buffers')), 4000);
      res.on('data', (d) => {
        all += d;
        if (!got) {
          got = true;
          clearTimeout(fail);
          try { assert.equal(ended, false, 'upstream is still open'); assert.equal(all.startsWith('event: ping'), true); } catch (e) { reject(e); }
          release();
        }
      });
      res.on('end', () => resolve(all));
    });
    req.on('error', reject);
    req.end(CALL_BODY);
  });
  assert.equal(text, first + sse());
});

test('3.60.0 AC-7: concurrent streams do not mix their counts', T, async (t) => {
  const streams = { a: sse({ input: 1_000_000, output: 500_000, cacheRead: 0 }), b: sse({ input: 500_000, output: 1_000_000, cacheRead: 0 }) };
  const up = await upstream(t, (req, res, entry) => { drip(res, Buffer.from(streams[JSON.parse(entry.body).n]), 5); });
  const { port, usage } = await proxyFor(t, up);
  const [a, b] = await Promise.all(['a', 'b'].map((n) => call(port, { body: JSON.stringify({ model: MODEL, stream: true, n }) })));
  assert.equal(a.text, streams.a);
  assert.equal(b.text, streams.b);
  await waitFor(() => usage.length >= 2, 'two reports');
  await wait(30);
  assert.equal(usage.length, 2, 'one report per response');
  const costs = usage.map(costIn).sort((x, y) => x - y);
  close(costs[0], 7, 'the cheap response alone');
  close(costs[1], 11, 'the dear response alone, not a running total');
});

test('3.60.0 AC-7: an error status from upstream passes through and costs nothing', T, async (t) => {
  const up = await upstream(t, (req, res) => { res.writeHead(429, { 'content-type': 'application/json', 'retry-after': '3' }); res.end('{"type":"error","error":{"type":"rate_limit_error"}}'); });
  const { port, usage } = await proxyFor(t, up);
  const r = await call(port);
  assert.equal(r.status, 429);
  assert.match(r.text, /rate_limit_error/);
  await wait(30);
  assert.equal(usage.map(costIn).reduce((x, y) => x + (y ?? 0), 0), 0);
});

test('3.60.0 AC-7: when canSpend() is false the next request gets an error status and nothing goes upstream', T, async (t) => {
  const up = await upstream(t, (req, res) => { res.writeHead(200, STREAM_HEADERS); res.end(sse()); });
  let spent = 0;
  const { port } = await proxyFor(t, up, { canSpend: () => spent < 8, onUsage: (...a) => { spent += costIn(a); } });
  const first = await call(port);
  assert.equal(first.status, 200);
  await waitFor(() => spent > 0, 'the first response is counted');
  close(spent, 8, 'spent');
  for (let i = 0; i < 2; i++) {
    const next = await call(port);
    assert.equal(next.status >= 400, true, `status ${next.status}`);
    assert.equal(next.text.includes(OR_KEY), false);
  }
  assert.equal(up.seen.length, 1, 'nothing more went upstream');
});

test('3.60.0 AC-7: setLimit keeps only a positive finite number', T, async (t) => {
  const { setLimit, readStore } = await load('providers.mjs');
  const file = path.join(tmpDir(t, 'rr-limit-'), 'providers.json');
  const attempt = (v) => { try { setLimit('openrouter', v, file); } catch { /* a refusal either way */ } };
  for (const bad of [0, -1, -0.01, NaN, Infinity, -Infinity, 'abc', '', null, undefined, '1e999']) {
    attempt(bad);
    assert.equal(readStore(file).limits.openrouter, undefined, `refused: ${String(bad)}`);
  }
  attempt(2.5);
  assert.equal(readStore(file).limits.openrouter, 2.5);
  attempt(-1);
  assert.equal(readStore(file).limits.openrouter, 2.5, 'a bad value leaves the old limit');
  attempt(0.001);
  assert.equal(readStore(file).limits.openrouter, 0.001);
});

test('3.60.0 AC-7: addSpend adds up by provider and day, and spentOn reads it back', T, async (t) => {
  const { addSpend, spentOn, setKey, readStore } = await load('providers.mjs');
  const file = path.join(tmpDir(t, 'rr-spend-'), 'providers.json');
  assert.equal(spentOn('openrouter', '2026-11-01', file), 0, 'nothing yet');
  assert.equal(setKey('openrouter', OR_KEY, file), null);
  addSpend('openrouter', 0.25, '2026-11-01', file);
  addSpend('openrouter', 0.5, '2026-11-01', file);
  addSpend('openrouter', 3, '2026-11-02', file);
  addSpend('deepseek', 7, '2026-11-01', file);
  close(spentOn('openrouter', '2026-11-01', file), 0.75, 'same day');
  close(spentOn('openrouter', '2026-11-02', file), 3, 'next day');
  close(spentOn('deepseek', '2026-11-01', file), 7, 'other provider');
  assert.equal(spentOn('kimi', '2026-11-01', file), 0);
  assert.equal(spentOn('openrouter', '2026-10-31', file), 0);
  assert.equal(readStore(file).keys.openrouter, OR_KEY, 'the ledger keeps the key');
});

test('3.60.0 AC-7: --set-limit sets the daily limit and refuses a bad one', T, async (t) => {
  const { readStore } = await load('providers.mjs');
  const m = modelsProject(t);
  for (const bad of [['openrouter', '0'], ['openrouter', '-1'], ['openrouter', 'abc'], ['openrouter', 'Infinity'], ['openrouter']]) {
    const r = m.run(['--set-limit', ...bad]);
    assert.equal(r.status, 1, bad.join(' '));
    assert.equal(readStore(m.file).limits.openrouter, undefined, bad.join(' '));
  }
  const ok = m.run(['--set-limit', 'openrouter', '2.5']);
  assert.equal(ok.status, 0, ok.stderr);
  assert.equal(readStore(m.file).limits.openrouter, 2.5);
  assert.equal(fs.existsSync(path.join(m.root, '.claude', 'state', 'models.json')), false, 'the limit stays out of the project');
});

test('3.60.0 AC-7: the CLI refuses with no daily limit or a spent one, and sends nothing; under the limit it runs', T, async (t) => {
  const under = await project(t, { limit: 5, spent: 1 });
  assertRan(await cli(under, ['code', 'p.md']));
  assertRefused(await cli(await project(t, { limit: null }), ['code', 'p.md']), /limit/i);
  assertRefused(await cli(await project(t, { limit: 5, spent: 5 }), ['code', 'p.md']), /limit|spent/i);
  assertRefused(await cli(await project(t, { limit: 5, spent: 50 }), ['code', 'p.md']), /limit|spent/i);
});

test('3.60.0 AC-7: a run writes its cost to the ledger from the proxy count, not the child figure, and a repeat call stops at the limit', T, async (t) => {
  const { spentOn } = await load('providers.mjs');
  const p = await project(t, { limit: 0.000001 });
  const first = await cli(p, ['code', 'p.md']);
  assertRan(first);
  const spent = Math.max(...dayKeys().map((d) => spentOn('openrouter', d, p.file)));
  assert.equal(spent > 0 && spent < 100, true, `ledger ${spent}: 1.5M tokens are not free, and 777 is the child's own figure`);
  assertRefused(await cli(p, ['code', 'p.md']), /limit|spent/i);
});

test('3.60.0 AC-7: going over the limit in a run cuts the next request, keeps the partial result and tells the user', T, async (t) => {
  const p = await project(t, { limit: 0.000001 });
  const r = await cli(p, ['code', 'p.md'], { RR_REQUESTS: '2', RR_REPLY: b64('partial result here') });
  assert.equal(r.spawned.length, 1, r.stderr);
  const statuses = r.spy.filter((s) => s.kind === 'child-call').map((s) => s.status);
  assert.equal(statuses.length, 2, JSON.stringify(r.spy.filter((s) => s.kind === 'child-error')));
  assert.equal(statuses[0], 200);
  assert.equal(statuses[1] >= 400, true, `second request: ${statuses[1]}`);
  assert.equal(messageCalls(r).length, 1, 'the second request stayed home');
  assert.match(r.stdout, /partial result here/);
  assert.match(r.stdout + r.stderr, /limit/i);
});

test('3.60.0 AC-7: the CLI refuses a role with no provider or a provider with no key, and sends nothing', T, async (t) => {
  assertRan(await cli(await project(t), ['code', 'p.md']));
  assertRefused(await cli(await project(t, { models: { code: 'sonnet:high' } }), ['code', 'p.md']), /provider/i);
  assertRefused(await cli(await project(t, { models: null }), ['code', 'p.md']), /provider/i);
  assertRefused(await cli(await project(t, { key: false }), ['code', 'p.md']), /key/i);
});

test('3.60.0 AC-7: costOf prices cache writes at cacheWrite; cacheWrite and cache each fall back to input', T, async () => {
  const { costOf } = await load('run-role.mjs');
  const u = (write_, read_) => ({ input_tokens: 0, output_tokens: 0, cache_creation_input_tokens: write_, cache_read_input_tokens: read_, input: 0, output: 0, cacheWrite: write_, cache_write: write_, cacheRead: read_, cache_read: read_ });
  close(costOf(u(1_000_000, 0), { input: 2, output: 10, cache: 0.5, cacheWrite: 3 }), 3, 'its own price');
  close(costOf(u(1_000_000, 0), { input: 2, output: 10, cache: 0.5 }), 2, 'write falls to input, not to cache');
  close(costOf(u(0, 1_000_000), { input: 2, output: 10, cacheWrite: 3 }), 2, 'read falls to input, not to cacheWrite');
  close(costOf(u(1_000_000, 1_000_000), { input: 2, output: 10 }), 4, 'both fall to input');
});

test('3.60.0 AC-7: startProxy takes one price object: cacheWrite and cache are used, and each falls back to input', T, async (t) => {
  const stream = Buffer.from(sse({ cacheCreate: 1_000_000 }));
  for (const [prices, expected] of [
    [{ input: 2, output: 10, cache: 0.5, cacheWrite: 3 }, 11],
    [{ input: 2, output: 10, cache: 0.5 }, 10],
    [{ input: 2, output: 10, cacheWrite: 3 }, 14],
    [{ input: 2, output: 10 }, 13],
  ]) {
    const up = await upstream(t, (req, res) => { drip(res, stream, 17); });
    const { port, usage } = await proxyFor(t, up, { prices });
    await call(port);
    await waitFor(() => usage.length > 0, 'onUsage');
    close(costIn(usage[0]), expected, JSON.stringify(prices));
  }
});

test('3.60.0 AC-7: onUsage gets one { usage, cost } per response with that response\'s own numbers, never a running total', T, async (t) => {
  const streams = [sse({ input: 1_000_000, output: 500_000, cacheRead: 0 }), sse({ input: 500_000, output: 1_000_000, cacheRead: 0 }), sse({ input: 1_000_000, output: 500_000, cacheRead: 0 })];
  let served = 0;
  const up = await upstream(t, (req, res) => { drip(res, Buffer.from(streams[served++]), 23); });
  const { port, usage } = await proxyFor(t, up);
  for (let i = 0; i < streams.length; i++) {
    await call(port);
    await waitFor(() => usage.length > i, `report ${i}`);
  }
  await wait(30);
  assert.equal(usage.length, 3, 'one report per response');
  for (const args of usage) {
    assert.equal(args.length, 1, 'one argument');
    assert.equal(typeof args[0].cost, 'number');
    assert.equal(typeof args[0].usage, 'object');
  }
  assert.deepEqual(usage.map(inputIn), [1_000_000, 500_000, 1_000_000]);
  assert.deepEqual(usage.map(outputIn), [500_000, 1_000_000, 500_000]);
  close(costIn(usage[0]), 7, 'first');
  close(costIn(usage[1]), 11, 'second');
  close(costIn(usage[2]), 7, 'third');
});

test('3.60.0 AC-7: ATTACK: a response cut off midway still reports exactly once with what it used', T, async (t) => {
  const stream = sse({ cacheRead: 0 });
  const head = stream.slice(0, stream.indexOf('event: ping'));

  const upCut = await upstream(t, (req, res) => { res.writeHead(200, STREAM_HEADERS); res.write(head); setTimeout(() => res.destroy(), 20); });
  const cut = await proxyFor(t, upCut);
  await call(cut.port).catch(() => null);
  await waitFor(() => cut.usage.length > 0, 'report after upstream dropped');
  await wait(50);
  assert.equal(cut.usage.length, 1, 'upstream dropped: one report');
  assert.equal(inputIn(cut.usage[0]), 1_000_000, 'upstream dropped: the input is counted');

  const upLeft = await upstream(t, (req, res) => { res.writeHead(200, STREAM_HEADERS); res.write(head); setTimeout(() => res.end(stream.slice(head.length)), 60); });
  const left = await proxyFor(t, upLeft);
  await new Promise((resolve) => {
    const req = http.request({ host: '127.0.0.1', port: left.port, method: 'POST', path: '/v1/messages', agent: false, headers: { authorization: `Bearer ${TOKEN}` } }, (res) => {
      res.once('data', () => { req.destroy(); resolve(); });
    });
    req.on('error', () => {});
    req.end(CALL_BODY);
  });
  await waitFor(() => left.usage.length > 0, 'report after the client left');
  await wait(150);
  assert.equal(left.usage.length, 1, 'client left: one report');
  assert.equal(inputIn(left.usage[0]), 1_000_000, 'client left: the input is counted');
  assert.equal(costIn(left.usage[0]) >= 2, true, `client left: cost ${costIn(left.usage[0])}`);
});

const UNPRICED = 'openrouter/vendorx/never-priced-model-1:high';
const UNKNOWN_PRICE = /unknown[^\n]{0,80}price|price[^\n]{0,80}unknown/i;

test('3.60.0 AC-7: DEFAULT_PRICE is the pessimistic price, input 5 and output 25', T, async () => {
  const { DEFAULT_PRICE, costOf } = await load('run-role.mjs');
  assert.deepEqual(DEFAULT_PRICE, { input: 5, output: 25 });
  close(costOf({ input_tokens: 1_000_000, input: 1_000_000 }, DEFAULT_PRICE), 5, 'input');
  close(costOf({ output_tokens: 1_000_000, output: 1_000_000 }, DEFAULT_PRICE), 25, 'output');
});

test('3.60.0 AC-7: a model with no known price is charged at DEFAULT_PRICE and the run reports the price as unknown', T, async (t) => {
  const { spentOn } = await load('providers.mjs');
  const p = await project(t, { limit: 1000, models: { code: UNPRICED } });
  const r = await cli(p, ['code', 'p.md']);
  assertRan(r);
  assert.match(r.stdout + r.stderr, UNKNOWN_PRICE);
  // 1M input at 5, 0.5M output at 25, 2M cache reads at the input price
  close(spentOn('openrouter', dayKeys()[0], p.file), 27.5, 'ledger');
});

test('3.60.0 AC-7: a limit still fires for a model with no known price', T, async (t) => {
  const p = await project(t, { limit: 1, models: { code: UNPRICED } });
  const r = await cli(p, ['code', 'p.md'], { RR_REQUESTS: '2', RR_REPLY: b64('partial result here') });
  assert.equal(r.spawned.length, 1, r.stderr);
  assert.deepEqual(messageCalls(r).length, 1, 'the second request stayed home');
  const statuses = r.spy.filter((s) => s.kind === 'child-call').map((s) => s.status);
  assert.equal(statuses[0], 200);
  assert.equal(statuses[1] >= 400, true, `second request: ${statuses[1]}`);
  assertRefused(await cli(p, ['code', 'p.md']), /limit|spent/i);
});

test('3.60.0 AC-7: the ledger adds up every response of a run, each counted once', T, async (t) => {
  const { spentOn } = await load('providers.mjs');
  const p = await project(t, { limit: 1000, models: { code: UNPRICED } });
  assertRan(await cli(p, ['code', 'p.md'], { RR_REQUESTS: '3' }));
  close(spentOn('openrouter', dayKeys()[0], p.file), 82.5, 'three responses of 27.5');
  assertRan(await cli(p, ['code', 'p.md'], { RR_REQUESTS: '2' }));
  close(spentOn('openrouter', dayKeys()[0], p.file), 137.5, 'the next run adds on top');
});

// A zone whose calendar day is not the UTC one right now. TZ works on every platform when set for a child process.
const zoneOffUtcDay = () => {
  const [TZ, shift] = new Date().getUTCHours() < 11 ? ['Etc/GMT+12', -12] : ['Etc/GMT-14', 14];
  const local = new Date(Date.now() + shift * 3_600_000).toISOString().slice(0, 10);
  const utc = new Date().toISOString().slice(0, 10);
  assert.notEqual(local, utc, 'the fixture needs two different days');
  return { TZ, local, utc };
};

test('3.60.0 AC-7: the ledger day is the local YYYY-MM-DD, not the UTC day', T, async (t) => {
  const { spentOn } = await load('providers.mjs');
  const { TZ, local, utc } = zoneOffUtcDay();
  const p = await project(t, { limit: 1000 });
  assertRan(await cli(p, ['code', 'p.md'], { TZ }));
  assert.equal(spentOn('openrouter', local, p.file) > 0, true, `spend is on the local day ${local}`);
  assert.equal(spentOn('openrouter', utc, p.file), 0, `no spend on the UTC day ${utc}`);
});

test('3.60.0 AC-7: the limit reads the local day: spend on the UTC day does not stop a run, spend on the local day does', T, async (t) => {
  const { addSpend } = await load('providers.mjs');
  const { TZ, local, utc } = zoneOffUtcDay();
  const other = await project(t, { limit: 5 });
  addSpend('openrouter', 5, utc, other.file);
  assertRan(await cli(other, ['code', 'p.md'], { TZ }));
  const same = await project(t, { limit: 5 });
  addSpend('openrouter', 5, local, same.file);
  assertRefused(await cli(same, ['code', 'p.md'], { TZ }), /limit|spent/i);
});

// ---- AC-8 ----

const BAD_RULE = (rule) => {
  if (!/^Bash\b/.test(rule)) return false;
  const m = rule.match(/^Bash\((.*)\)$/s);
  if (!m) return true;
  const c = m[1].trim();
  if (!c || c.includes('*') || /\)\s*,|,\s*Bash\(/.test(c)) return true;
  return c.split(/&&|\|\||[;|&\n`]|\$\(/).map((s) => s.trim()).some((s) => /^(curl|wget|sh|bash)(\s|$)/i.test(s) || /^(node|npx)$/i.test(s) || /^node\s+(-e|--eval|-p|--print)\b/i.test(s));
};
const FILE_TOOLS = ['Edit', 'Glob', 'Grep', 'Read', 'Write'];
const COMMANDS = { test: 'npm test', lint: 'npm run lint', typecheck: 'npm run typecheck', build: 'npm run build' };

test('3.60.0 AC-8: docs has the file tools and no shell, test adds its command only, code adds the commands given, Agent is always disallowed', T, async () => {
  const { roleTools } = await load('run-role.mjs');
  assert.deepEqual([...roleTools('docs', COMMANDS).allowed].sort(), FILE_TOOLS);
  assert.deepEqual([...roleTools('test', COMMANDS).allowed].sort(), ['Bash(npm test)', ...FILE_TOOLS].sort());
  const code = roleTools('code', COMMANDS).allowed;
  for (const f of FILE_TOOLS) assert.equal(code.includes(f), true, f);
  assert.deepEqual(Object.values(COMMANDS).filter((c) => !code.includes(`Bash(${c})`)), [], 'every command has its rule');
  assert.deepEqual(code.filter(BAD_RULE), []);
  for (const role of ['docs', 'test', 'code']) assert.equal(roleTools(role, COMMANDS).disallowed.includes('Agent'), true, role);
});

test('3.60.0 AC-8: with no command given there is no shell rule at all', T, async () => {
  const { roleTools } = await load('run-role.mjs');
  for (const role of ['docs', 'test', 'code']) {
    assert.deepEqual(roleTools(role, {}).allowed.filter((r) => /^Bash/.test(r)), [], `${role} {}`);
    assert.deepEqual(roleTools(role, { test: '' }).allowed.filter((r) => /^Bash/.test(r)), [], `${role} empty test`);
    assert.deepEqual([...roleTools(role, {}).allowed].filter((r) => FILE_TOOLS.includes(r)).sort(), FILE_TOOLS, `${role} keeps the file tools`);
  }
});

test('3.60.0 AC-8: ATTACK: a hostile command never turns into a rule for bare Bash, node, sh, curl, npx or a wildcard', T, async () => {
  const { roleTools } = await load('run-role.mjs');
  const hostile = ['node', 'sh', 'curl', 'npx', 'bash', '*', ':*', 'node:*', 'npm:*', 'npm *', ' ',
    'curl https://x.example/a', 'node -e "1"', 'node --eval "1"', 'sh -c "id"', 'npm test && curl https://x.example', 'npm test; sh evil.sh', 'npm test | sh', 'npm test\ncurl x.example', 'npm test $(curl x.example)', 'npm test),Bash(curl x.example'];
  for (const c of hostile) {
    assert.deepEqual(roleTools('test', { test: c }).allowed.filter(BAD_RULE), [], `test: ${JSON.stringify(c)}`);
    assert.deepEqual(roleTools('docs', { test: c }).allowed.filter((r) => /^Bash/.test(r)), [], `docs: ${JSON.stringify(c)}`);
    const code = roleTools('code', { test: 'npm test', lint: c }).allowed;
    assert.deepEqual(code.filter(BAD_RULE), [], `code: ${JSON.stringify(c)}`);
    assert.equal(code.includes('Bash(npm test)'), true, `a good command stays beside it: ${JSON.stringify(c)}`);
  }
});

test('3.60.0 AC-8: childArgs is a string array with the fixed flags', T, async () => {
  const { childArgs, roleTools } = await load('run-role.mjs');
  const args = childArgs({ model: MODEL, prompt: 'do it', role: 'code', tools: roleTools('code', COMMANDS), maxTurns: 25 });
  assert.equal(Array.isArray(args), true);
  assert.deepEqual(args.filter((a) => typeof a !== 'string'), [], 'spawn takes strings only');
  for (const f of ['-p', '--verbose', '--no-session-persistence', '--strict-mcp-config']) assert.equal(args.includes(f), true, f);
  const value = (f) => { const i = args.indexOf(f); assert.notEqual(i, -1, f); return args[i + 1]; };
  assert.equal(value('--model'), MODEL);
  assert.equal(value('--output-format'), 'stream-json');
  assert.equal(value('--setting-sources'), 'project,local');
  assert.equal(value('--max-turns'), '25');
  assert.deepEqual(JSON.parse(value('--mcp-config')), { mcpServers: {} });
  assert.equal(flagList(args, '--disallowedTools').includes('Agent'), true);
  const allowed = flagList(args, '--allowedTools');
  assert.equal(allowed.includes('Read'), true);
  assert.equal(allowed.includes('Bash(npm test)'), true);
});

test('3.60.0 AC-8: --agent test-writer goes with the test role only; no permission bypass and no budget flag on any role', T, async () => {
  const { childArgs, roleTools } = await load('run-role.mjs');
  const argsOf = (role) => childArgs({ model: MODEL, prompt: 'do it', role, tools: roleTools(role, COMMANDS), maxTurns: 25 });
  const test_ = argsOf('test');
  assert.equal(test_[test_.indexOf('--agent') + 1], 'test-writer');
  assert.notEqual(test_.indexOf('--agent'), -1);
  assert.equal(argsOf('code').includes('--agent'), false);
  assert.equal(argsOf('docs').includes('--agent'), false);
  assert.deepEqual(flagList(argsOf('docs'), '--allowedTools').filter((r) => /^Bash/.test(r)), [], 'docs has no shell rule');
  for (const role of ['code', 'test', 'docs']) {
    const joined = argsOf(role).join('\n');
    assert.doesNotMatch(joined, /dangerously|bypassPermissions/i, role);
    assert.doesNotMatch(joined, /--max-budget-usd/, role);
  }
});

test('3.60.0 AC-8: ATTACK: a prompt that reads like a flag cannot become a flag', T, async () => {
  const { childArgs, roleTools } = await load('run-role.mjs');
  for (const prompt of ['--dangerously-skip-permissions', '--max-budget-usd', '--allowedTools=Bash', '-x']) {
    const args = childArgs({ model: MODEL, prompt, role: 'code', tools: roleTools('code', COMMANDS), maxTurns: 25 });
    const end = args.indexOf('--');
    const flags = end === -1 ? args : args.slice(0, end);
    assert.equal(flags.includes(prompt), false, `${prompt} sits among the flags: ${JSON.stringify(args)}`);
  }
});

test('3.60.0 AC-8: a real run: claude by array without a shell, from the project root, with the model id bare; docs has no shell rule; test runs as test-writer', T, async (t) => {
  const p = await project(t);
  const code = await cli(p, ['code', 'p.md']);
  assertRan(code);
  const c = code.spawned[0];
  assert.equal(c.shell, false);
  assert.equal(fs.realpathSync(c.cwd ?? p.root), fs.realpathSync(p.root));
  assert.equal(fs.realpathSync(c.env.CLAUDE_PROJECT_DIR), fs.realpathSync(p.root));
  assert.equal(c.args[c.args.indexOf('--model') + 1], MODEL, 'no provider prefix and no effort');
  assert.equal(c.env.ANTHROPIC_MODEL, MODEL);
  assert.doesNotMatch(c.args.join('\n'), /dangerously|bypassPermissions|--max-budget-usd/i);
  const docs = await cli(p, ['docs', 'p.md']);
  assertRan(docs);
  assert.deepEqual(flagList(docs.spawned[0].args, '--allowedTools').filter((r) => /^Bash/.test(r)), []);
  const tester = await cli(p, ['test', 'p.md']);
  assertRan(tester);
  const a = tester.spawned[0].args;
  assert.equal(a[a.indexOf('--agent') + 1], 'test-writer');
});

// ---- AC-9 ----

test('3.60.0 AC-9: checkRun refuses an unknown provider and a model id that fails the pattern', T, async (t) => {
  const { checkRun } = await load('run-role.mjs');
  const root = tmpDir(t, 'rr-model-id-');
  write(path.join(root, 'p.md'), 'x');
  const run = (over) => checkRun({ role: 'code', provider: 'openrouter', model: MODEL, promptFile: 'p.md', root, ...over });
  for (const model of [MODEL, 'kimi-k2', 'deepseek/deepseek-r1:free', '~vendor/model', 'Kimi-K2.5', '0model']) assert.equal(run({ model }), null, model);
  for (const provider of ['openrouter', 'deepseek', 'kimi']) assert.equal(run({ provider }), null, provider);
  const badModels = ['', '-x', '--dangerously-skip-permissions', '.x', '/x', ':x', 'a b', 'a;b', 'a$b', 'a`b', 'a\nb', 'a\n', 'modelş', undefined, null];
  assert.deepEqual(badModels.filter((model) => typeof run({ model }) !== 'string'), [], 'model ids');
  const badProviders = ['evil', '', 'OPENROUTER', '__proto__', 'constructor', 'toString', 'https://evil.example', undefined];
  assert.deepEqual(badProviders.filter((provider) => typeof run({ provider }) !== 'string'), [], 'providers');
});

test('3.60.0 AC-9: ATTACK: a prompt file outside the project, named .env* or under secrets/ is refused; inside the project it passes', T, async (t) => {
  const { checkRun } = await load('run-role.mjs');
  const base = tmpDir(t, 'rr-prompt-');
  const root = path.join(base, 'proj');
  const sibling = path.join(base, 'proj-evil');
  const home = tmpDir(t, 'rr-prompt-home-');
  for (const f of ['p.md', 'prompts/task.md', '.env', '.env.local', '.env.example', 'sub/.env.production', '.ENV', 'secrets/x.md', 'sub/secrets/x.md', 'SECRETS/y.md']) write(path.join(root, f), 'x');
  write(path.join(sibling, 'x.md'), 'x');
  write(path.join(home, '.ssh', 'id_rsa'), 'x');
  const run = (promptFile) => checkRun({ role: 'code', provider: 'openrouter', model: MODEL, promptFile, root });
  for (const f of ['p.md', 'prompts/task.md', path.join(root, 'p.md'), './p.md', 'prompts/../p.md']) assert.equal(run(f), null, f);
  const refused = [
    path.join(home, '.ssh', 'id_rsa'), '../proj-evil/x.md', path.join(sibling, 'x.md'), '../../../../../../x.md', 'prompts/../../proj-evil/x.md',
    '.env', '.env.local', '.env.example', 'sub/.env.production', path.join(root, '.env'), '.ENV', 'secrets/x.md', 'sub/secrets/x.md', 'SECRETS/y.md', path.join(root, 'secrets', 'x.md'), 'prompts/../secrets/x.md',
  ];
  assert.deepEqual(refused.filter((f) => typeof run(f) !== 'string'), []);
  if (process.platform === 'win32') assert.equal(typeof run('secrets\\x.md'), 'string', 'backslash path');
});

test('3.60.0 AC-9: ATTACK: a link does not carry the prompt file out of the project or into secrets/', T, async (t) => {
  const { checkRun } = await load('run-role.mjs');
  const root = tmpDir(t, 'rr-link-');
  const outside = tmpDir(t, 'rr-link-out-');
  write(path.join(root, 'p.md'), 'x');
  write(path.join(root, 'secrets', 'a.md'), 'x');
  write(path.join(outside, 'a.md'), 'x');
  // A junction needs no privilege on Windows; the type is ignored elsewhere
  fs.symlinkSync(outside, path.join(root, 'out-link'), 'junction');
  fs.symlinkSync(path.join(root, 'secrets'), path.join(root, 'docs-link'), 'junction');
  const run = (promptFile, r = root) => checkRun({ role: 'code', provider: 'openrouter', model: MODEL, promptFile, root: r });
  assert.equal(run('p.md'), null);
  assert.equal(typeof run('out-link/a.md'), 'string', 'link out of the project');
  assert.equal(typeof run('docs-link/a.md'), 'string', 'link into secrets/');
  // A root reached through a link (a macOS temp folder) is the same project
  const alias = path.join(outside, 'root-alias');
  fs.symlinkSync(root, alias, 'junction');
  assert.equal(run('p.md', alias), null, 'root given through a link');
  assert.equal(run(path.join(root, 'p.md'), alias), null, 'real path with a linked root');
});

test('3.60.0 AC-9: a project path with spaces and Turkish characters works', T, async (t) => {
  const { checkRun } = await load('run-role.mjs');
  const root = path.join(tmpDir(t, 'rr-tr-'), 'proje İşı klasör');
  write(path.join(root, 'görev ı.md'), 'x');
  assert.equal(checkRun({ role: 'code', provider: 'openrouter', model: MODEL, promptFile: 'görev ı.md', root }), null);
});

test('3.60.0 AC-9: ATTACK: the CLI refuses .env, secrets/, an outside file and a flag-shaped model id, and sends nothing', T, async (t) => {
  const p = await project(t);
  write(path.join(p.root, '.env'), 'VALUE-IN-ENV-FILE');
  write(path.join(p.root, 'secrets', 'x.md'), 'VALUE-IN-SECRETS');
  const outside = path.join(p.home, 'id_rsa');
  write(outside, 'VALUE-OUTSIDE');
  assertRan(await cli(p, ['code', 'p.md']));
  for (const prompt of ['.env', 'secrets/x.md', outside, path.relative(p.root, outside)]) {
    const r = await cli(p, ['code', prompt]);
    assertRefused(r, /prompt|outside|\.env|secrets/i);
    assert.doesNotMatch(r.stdout + r.stderr, /VALUE-/, 'the file content is not shown');
  }
  write(path.join(p.root, '.claude', 'state', 'models.json'), JSON.stringify({ code: 'openrouter/--dangerously-skip-permissions:high' }));
  assertRefused(await cli(p, ['code', 'p.md']), /model|provider/i);
  write(path.join(p.root, '.claude', 'state', 'models.json'), JSON.stringify({ code: 'openrouter/-x:high' }));
  assertRefused(await cli(p, ['code', 'p.md']), /model|provider/i);
});

// ---- AC-10: what can be checked without a real provider; the smoke test with a real provider is separate ----

test('3.60.0 AC-10: fail closed: the CLI does not start when .claude/settings.json or a guard hook is absent', T, async (t) => {
  assertRan(await cli(await project(t), ['code', 'p.md']));
  assertRefused(await cli(await project(t, { settings: false }), ['code', 'p.md']), /settings/i);
  for (const hook of ['destructive-guard.mjs', 'test-guard.mjs', 'freeze-guard.mjs', 'guard-secrets.mjs'])
    assertRefused(await cli(await project(t, { drop: [hook] }), ['code', 'p.md']), new RegExp(`hook|${hook.replace('.', '\\.')}`, 'i'), { missingFile: true });
});

test('3.60.0 AC-10: ATTACK: fail closed: a settings.json that is broken JSON or has no PreToolUse hooks stops the CLI like an absent one', T, async (t) => {
  const started = [];
  for (const text of [
    '', '{', 'not json', 'null', '[]', '12', '"hooks"',
    '{}', '{"permissions":{"deny":[]}}', '{"hooks":null}', '{"hooks":{}}', '{"hooks":[]}',
    '{"hooks":{"PostToolUse":[{"matcher":"Bash","hooks":[{"type":"command","command":"node x.mjs"}]}]}}',
    '{"hooks":{"PreToolUse":null}}', '{"hooks":{"PreToolUse":{}}}', '{"hooks":{"PreToolUse":"x"}}', '{"hooks":{"PreToolUse":[]}}',
    '{"hooks":{"PreToolUse":[{"matcher":"Bash","hooks":[]}]}}', '{"hooks":{"PreToolUse":[{"matcher":"Bash"}]}}',
  ]) {
    const p = await project(t);
    write(path.join(p.root, '.claude', 'settings.json'), text);
    const r = await cli(p, ['code', 'p.md']);
    if (r.spawned.length) started.push(text);
    else assertRefused(r, /settings/i);
  }
  assert.deepEqual(started, [], 'the child started under these settings');
});

test('3.60.0 AC-10: the CLI exits with a usage message when an argument is missing or the prompt file does not exist, and sends nothing', T, async (t) => {
  const p = await project(t);
  assertRan(await cli(p, ['code', 'p.md']));
  for (const args of [[], ['code']]) assertRefused(await cli(p, args), /usage|prompt|role/i);
  assertRefused(await cli(p, ['code', 'no-such-file.md']), /prompt|no-such-file|not found|ENOENT/i);
});

test('3.60.0 AC-10: under the child env the guard hooks still decide: force push denied, test edit denied outside test-writer, .env asked', T, async (t) => {
  const { childEnv } = await load('run-role.mjs');
  const root = tmpDir(t, 'rr-child-hook-');
  write(path.join(root, '.kit.json'), JSON.stringify({ type: 'web-saas', lang: 'en' }));
  const env = childEnv(cleanEnv(), { port: 1, token: TOKEN, model: MODEL, root });
  const hook = (command, extra = {}) => {
    const r = spawnSync(process.execPath, [path.join(HOOKS, 'destructive-guard.mjs')], {
      input: JSON.stringify({ tool_name: 'Bash', cwd: root, ...extra, tool_input: { command } }), encoding: 'utf8', env,
    });
    return JSON.parse(r.stdout || '{}').hookSpecificOutput?.permissionDecision ?? null;
  };
  assert.equal(hook('git push --force origin main') !== null, true, 'force push is stopped');
  assert.equal(hook('rm src/a.test.ts'), 'deny', 'test edit from the code role');
  assert.equal(hook('cat .env'), 'ask');
  assert.equal(hook('node .claude/hooks/run-role.mjs code p.md'), 'ask', 'a child cannot start another role unseen');
  const settings = JSON.parse(read('.claude/settings.json')).permissions.deny;
  assert.equal(settings.includes('Read(./.env)'), true, 'the deny rule reaches the child through --setting-sources project');
  assert.equal(settings.includes('Read(~/.vibe-kit/**)'), true, 'the store is denied to the child too');
});

// ---- scrub and wrapResult (AC-2) ----

test('3.60.0 AC-2: scrub masks given secrets anywhere and keeps the rest of the text', T, async () => {
  const { scrub } = await load('run-role.mjs');
  const secret = 'plain-secret-value';
  const masked = scrub(`${secret} önce ${secret}\nİşı ${secret}${secret} sonra ${secret}`, [secret]);
  assert.equal(masked.includes(secret), false);
  assert.match(masked, /önce/);
  assert.match(masked, /İşı/);
  assert.match(masked, /sonra/);
  assert.equal(scrub('a.b+c( and axbbc', ['a.b+c(']).includes('a.b+c('), false, 'special characters are literal');
  assert.match(scrub('a.b+c( and axbbc', ['a.b+c(']), /axbbc/, 'not read as a regex');
  assert.equal(scrub('nothing here', []), 'nothing here');
  assert.equal(scrub('nothing here', ['']), 'nothing here', 'an empty secret changes nothing');
  assert.equal(scrub('', ['x']), '');
  const overlap = scrub('abcdefgh', ['abcd', 'abcdefgh']);
  assert.equal(overlap.includes('efgh'), false, 'the longer secret is not left half shown');
});

test('3.60.0 AC-2: scrub also masks the key patterns exported by guard-secrets, every occurrence', T, async () => {
  const { scrub } = await load('run-role.mjs');
  const { findSecrets, PATTERNS } = await load('guard-secrets.mjs');
  const samples = [
    'sk-' + 'ant-api03-' + 'a'.repeat(40), OR_KEY, 'sk_' + 'live_' + 'b'.repeat(24), 'whsec_' + 'c'.repeat(32), 'AKIA' + 'ABCDEFGHIJKLMNOP', 'ghp_' + 'd'.repeat(36),
    'glpat-' + 'e'.repeat(24), 'AIza' + 'f'.repeat(35), 'hf_' + 'g'.repeat(34), 'npm_' + 'h'.repeat(36), 'SG.' + 'k'.repeat(22) + '.' + 'l'.repeat(43),
    'xoxb-' + '1234567890-abc', '-----BEGIN ' + 'RSA PRIVATE KEY-----', 're_' + 'abcd1234_' + 'i'.repeat(16), 'sb_secret_' + 'j1'.repeat(10),
  ];
  assert.deepEqual(PATTERNS.filter(([, re]) => !samples.some((s) => re.test(s))).map(([n]) => n), [], 'the samples cover every exported pattern');
  for (const s of samples) {
    const out = scrub(`önce ${s} orta ${s} sonra`, []);
    assert.deepEqual(findSecrets(out), [], s.slice(0, 12));
    assert.equal(out.includes(s), false, s.slice(0, 12));
    assert.match(out, /önce .* orta .* sonra/);
  }
});

test('3.60.0 AC-2: wrapResult labels the reply untrusted and truncates to the limit', T, async () => {
  const { wrapResult } = await load('run-role.mjs');
  const short = wrapResult('child reply İşı', 1000);
  assert.match(short, /untrusted/i);
  assert.equal(short.includes('child reply İşı'), true);
  // The reply is a character no label would hold, so the wording of the label cannot change the count
  const big = wrapResult('§'.repeat(100000), 1000);
  assert.match(big, /untrusted/i);
  assert.equal((big.match(/§/g) ?? []).length, 1000, 'exactly the limit');
  assert.equal(big.length < 2000, true, `length ${big.length}`);
  const exact = wrapResult('§'.repeat(50), 50);
  assert.equal((exact.match(/§/g) ?? []).length, 50, 'a reply at the limit is whole');
  assert.equal((wrapResult('ş'.repeat(5000), 10).match(/ş/g) ?? []).length, 10, 'counts characters');
  assert.match(wrapResult('', 100), /untrusted/i, 'an empty reply is still labelled');
  assert.equal((wrapResult('§'.repeat(500), 0).match(/§/g) ?? []).length, 0, 'limit zero');
});

// ---- Shield on run-role (AC-6: a role call cannot go unseen) ----

test('3.60.0 AC-6: the shield asks for run-role.mjs', T, async () => {
  const { evaluate } = await load('destructive-guard.mjs');
  for (const ctx of [{}, { tool: 'claude', agent: '' }, { tool: 'claude', agent: 'test-writer' }, { tool: 'claude', agent: 'general-purpose' }])
    assert.equal(evaluate('node .claude/hooks/run-role.mjs code p.md', ctx)?.decision, 'ask', JSON.stringify(ctx));
  assert.equal(evaluate('git commit -m "docs: explain run-role.mjs code p.md"'), null, 'a commit message only names it');
});

test('3.60.0 AC-6: ATTACK: run-role.mjs in a tricky spelling is still stopped', T, async () => {
  const { evaluate } = await load('destructive-guard.mjs');
  const tricks = [
    'node ./.claude/hooks/run-role.mjs code p.md',
    'node ".claude/hooks/run-role.mjs" code p.md',
    'node "$CLAUDE_PROJECT_DIR/.claude/hooks/run-role.mjs" code p.md',
    'node .claude\\hooks\\run-role.mjs code p.md',
    'node .claude/hooks/run"-"role.mjs code p.md',
    'node .claude/hooks/run\\-role.mjs code p.md',
    "node .claude/hooks/$'run-role.mjs' code p.md",
    'node .claude/hooks/run-ro*.mjs code p.md',
    'node .claude/hooks/run-rol$()e.mjs code p.md',
    'cd .claude/hooks && node run-role.mjs code p.md',
    'git status && node .claude/hooks/run-role.mjs code p.md',
    'FOO=1 node .claude/hooks/run-role.mjs code p.md',
    'node --no-warnings .claude/hooks/run-role.mjs code p.md',
    'node.exe .claude/hooks/run-role.mjs code p.md',
    'bash -c "node .claude/hooks/run-role.mjs code p.md"',
  ];
  assert.deepEqual(tricks.filter((c) => !['ask', 'deny'].includes(evaluate(c)?.decision)), []);
});

// ---- AC-11 ----

test('3.60.0 AC-11: .claude/commands/models.md states the data warning, the key entered in the user\'s own terminal, and the remaining risk', T, () => {
  const doc = read('.claude/commands/models.md');
  const checks = {
    'the provider sees the data': /(provider|model)[^.\n]{0,120}\b(sees?|receives?|reads?|gets?)\b/i.test(doc),
    'it names the code': /\bcode\b/i.test(doc),
    'it names the folder path and user name': /(folder|path)[^.\n]{0,120}user ?name|user ?name[^.\n]{0,120}(folder|path)/i.test(doc),
    'sent data cannot be taken back': /(cannot|can't|can not|never)[^.\n]{0,60}(taken back|undone|undo|recall|retriev|deleted|returned|comes? back)|irreversib|one-way/i.test(doc),
    'the key is entered in the own terminal': /\bown terminal\b/i.test(doc),
    'it gives the key command': doc.includes('models.mjs --set-key'),
    'the limit command': doc.includes('models.mjs --set-limit'),
    'an allowed command runs code': /(allowed|permitted)[^.\n]{0,40}command[^.\n]{0,120}\b(runs?|execut)/i.test(doc),
    'that code can read project files': /\bproject files\b|\.env\b/i.test(doc),
  };
  assert.deepEqual(Object.keys(checks).filter((k) => !checks[k]), []);
});

test('3.60.0 AC-11: the role docs, both guides and both READMEs mention /models and say Antigravity is not supported and Codex is not yet', T, () => {
  // Not docs/workflow/models.md: the path holds "/models" too
  const COMMAND = /(?<![\w/.-])\/models(?![\w.-])/;
  const near = (word, phrase) => new RegExp(`${word}[\\s\\S]{0,160}(${phrase})|(${phrase})[\\s\\S]{0,160}${word}`, 'i');
  const missing = {};
  for (const file of ['docs/workflow/models.md', 'kit/guide.html', 'kit/guide.tr.html', 'README.md', 'README.tr.md']) {
    const text = read(file);
    const gaps = [];
    if (!COMMAND.test(text)) gaps.push('/models');
    if (!near('antigravity', 'not supported|unsupported|desteklenm').test(text)) gaps.push('Antigravity');
    if (!near('codex', 'not yet|henüz').test(text)) gaps.push('Codex');
    if (gaps.length) missing[file] = gaps;
  }
  assert.deepEqual(missing, {});
});

test('3.60.0 AC-11: the changelog has a 3.60.0 entry that names /models', T, () => {
  const log = read('kit/CHANGELOG.md');
  const start = log.indexOf('## [3.60.0]');
  assert.notEqual(start, -1, '3.60.0 heading');
  const end = log.indexOf('\n## [', start + 1);
  assert.match(log.slice(start, end === -1 ? undefined : end), /\/models/);
});

// The section of a README or guide under its external models heading, as plain text: no tags, entities, emphasis or line breaks
function externalSection(file) {
  const text = read(file);
  const headings = [];
  if (file.endsWith('.html')) {
    for (const m of text.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi)) headings.push({ at: m.index, level: Number(m[1]), title: m[2].replace(/<[^>]+>/g, '') });
  } else {
    let at = 0, fenced = false;
    for (const l of text.split('\n')) {
      if (/^\s*```/.test(l)) fenced = !fenced;
      const m = !fenced && l.match(/^(#{1,6})\s+(.*)$/);
      if (m) headings.push({ at, level: m[1].length, title: m[2] });
      at += l.length + 1;
    }
  }
  const i = headings.findIndex((h) => /external (models?|providers?)|outside (models?|providers?)|dış (model|sağlayıcı)/i.test(h.title));
  if (i === -1) return null;
  const next = headings.slice(i + 1).find((h) => h.level <= headings[i].level);
  return text.slice(headings[i].at, next?.at)
    .replace(/<[^>]+>/g, ' ')
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#0?39;|&#x27;|&apos;|&rsquo;/g, "'").replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
    .replace(/[*`]/g, '')
    .replace(/\s+/g, ' ');
}
const within = (a, b, n = 300) => new RegExp(`(${a})[\\s\\S]{0,${n}}(${b})|(${b})[\\s\\S]{0,${n}}(${a})`, 'i');

const COMMANDS_IN_DOCS = {
  'adding with --set-key': /models\.mjs --set-key/,
  'removing with --remove-key': /models\.mjs --remove-key/,
  'adding with setx': /\bsetx (OPENROUTER|DEEPSEEK|MOONSHOT)_API_KEY\b/,
  'removing a wrongly named variable': /\[Environment\]::SetEnvironmentVariable\('DEEPSEEK_API_KEY', \$null, 'User'\)/,
  'the daily limit command': /models\.mjs --set-limit/,
  'the proxy': /\bproxy\b/i,
  '.env named': /\.env\b/,
};
const PROSE_EN = {
  'it is possible': within('external (models?|providers?)|outside (models?|providers?)', '\\b(can|possible|may|lets? you)\\b'),
  'roles that can be given: code, test, docs': /\bcode\b[\s\S]{0,60}\btest\b[\s\S]{0,60}\bdoc(s|umentation)\b/i,
  'plan cannot be given': within('\\bplan(ning)?\\b', "\\b(cannot|can't|not|never|stays?|remains?|keeps?)\\b"),
  'review cannot be given': within('\\breview\\b', "\\b(cannot|can't|not|never|stays?|remains?|keeps?)\\b"),
  'board cannot be given': within('\\bboard\\b|security-auditor', "\\b(cannot|can't|not|never|stays?|remains?|keeps?)\\b"),
  'the daily limit': within('\\bdaily\\b', '\\blimit\\b', 60),
  'the provider sees the data': within('\\b(provider|model)\\b', '\\b(sees?|receives?|reads?|gets?)\\b', 120),
  'the user name in the path': within('\\b(folder|path)\\b', '\\buser ?name\\b', 120),
  'sent data does not come back': /(cannot|can't|can not|never)[^.]{0,60}(taken back|undone|undo|recall|retriev|deleted|returned|comes? back)|irreversib|one-way/i,
  'an allowed command can run code that reads': /\ballowed\b[^.]{0,40}\bcommand[\s\S]{0,300}\bread\b/i,
  'project files at risk': /\bproject files\b/i,
  'the user\'s own files at risk': /\b(your|user's)( own)? files\b|\bown files\b/i,
  '.env is not used': within('\\.env\\b', "\\b(not used|not read|isn't used|isn't read|never (used|read)|does not (use|read)|doesn't (use|read)|not supported|unsupported)\\b"),
  'why not .env': within('\\.env\\b', '\\b(dotenv|loads?|framework)\\b'),
  '.env: take the key out': within('\\.env\\b', '\\b(remove|delete|take)\\b'),
  '.env: replace the key': within('\\.env\\b', '\\b(rotate|revoke|regenerate|replace|renew|new key)\\b'),
};
const PROSE_TR = {
  'mümkün olduğu': within('dış (model|sağlayıcı)', 'mümkün|verilebilir|verebilir|kullanılabilir|kullanabilir|çalıştırılabilir|çalıştırabilir'),
  'verilebilen roller: kod, test, doküman': /\bkod[\s\S]{0,60}\btest[\s\S]{0,60}(doküman|belge)/i,
  'plan verilemez': within('\\bplan', 'verilemez|verilmez|kalır|olmaz'),
  'inceleme verilemez': within('inceleme|\\breview\\b', 'verilemez|verilmez|kalır|olmaz'),
  'kurul verilemez': within('kurul|security-auditor', 'verilemez|verilmez|kalır|olmaz'),
  'günlük sınır': within('günlük', 'sınır|limit', 60),
  'sağlayıcı veriyi görür': within('sağlayıcı', 'görür|görebilir|alır|okur', 120),
  'yoldaki kullanıcı adı': within('klasör|yol', 'kullanıcı ad', 120),
  'gönderilen geri dönmez': /geri (alınamaz|alınmaz|dönmez|gelmez|getirilemez)/i,
  'izinli komutun çalıştırdığı kod okur': /[iİ]zin(li| verilen)[^.]{0,40}komut[\s\S]{0,300}oku/i,
  'proje dosyaları risk altında': /proje dosyalar/i,
  'kullanıcının kendi dosyaları risk altında': /kendi dosyalar/i,
  '.env kullanılmaz': within('\\.env\\b', 'kullanılmaz|okunmaz|desteklenmez|kullanmaz|okumaz'),
  '.env neden yok': within('\\.env\\b', 'dotenv|yükle|framework'),
  '.env: anahtarı çıkar': within('\\.env\\b', 'kaldır|sil|çıkar'),
  '.env: anahtarı yenile': within('\\.env\\b', 'yenile|iptal|değiştir|yeni (bir )?anahtar'),
};

for (const [file, prose] of [['README.md', PROSE_EN], ['kit/guide.html', PROSE_EN], ['README.tr.md', PROSE_TR], ['kit/guide.tr.html', PROSE_TR]]) {
  test(`3.60.0 AC-11: ${file} has an external models section with the commands and every required statement`, T, () => {
    const section = externalSection(file);
    assert.equal(typeof section, 'string', 'no heading on external models');
    const gaps = Object.entries({ ...COMMANDS_IN_DOCS, ...prose }).filter(([, re]) => !re.test(section)).map(([name]) => name);
    assert.deepEqual(gaps, []);
  });
}

test('3.60.0 AC-11: the Turkish sections are written in Turkish around the commands, not copied from English', T, () => {
  for (const file of ['README.tr.md', 'kit/guide.tr.html']) {
    const section = externalSection(file);
    assert.equal(typeof section, 'string', `${file}: no heading on external models`);
    assert.doesNotMatch(section, /\b(cannot|the provider|allowed command|daily limit|project files|your own files)\b/i, file);
  }
});

// ======== Findings from the security audit and the real smoke test ========

// ---- AC-8: --allowedTools only adds, and a trusted project's allow rules reach the child too ----

const ROLES = ['docs', 'test', 'code'];
const ALWAYS_DENIED = ['Agent', 'Bash(git commit:*)', 'Bash(git push:*)', 'Bash(git add:*)', 'Bash(node *.claude/hooks/*)'];
// Mirrors Claude Code's Bash rule matcher, read from version 2.1.314, because a real run would need a model call.
// Bash(x:*) is the space-bounded prefix; otherwise * is .* over the whole command.
// A bare 'Bash' rule is left out on purpose, so the docs role cannot pass on it alone.
const bashRuleMatches = (rule, command) => {
  const body = /^Bash\((.*)\)$/s.exec(rule)?.[1];
  if (body === undefined) return false;
  if (body.endsWith(':*')) {
    const prefix = body.slice(0, -2);
    return command === prefix || command.startsWith(`${prefix} `);
  }
  const pattern = body.split('*').map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*');
  return new RegExp(`^${pattern}$`, 's').test(command);
};
const isDenied = (disallowed, command) => disallowed.some((rule) => bashRuleMatches(rule, command));

test('3.60.0 AC-8: the matcher copy reads rules the way Claude Code does: the old hook rule misses, the prefix stops at a space, a dot is a dot', () => {
  assert.equal(bashRuleMatches('Bash(node .claude/hooks/:*)', 'node .claude/hooks/models.mjs --set x'), false);
  assert.equal(bashRuleMatches('Bash(git add:*)', 'git add'), true);
  assert.equal(bashRuleMatches('Bash(git add:*)', 'git add .'), true);
  assert.equal(bashRuleMatches('Bash(git add:*)', 'git addx'), false);
  assert.equal(bashRuleMatches('Bash(node *.claude/hooks/*)', 'node xclaude/hooks/a.mjs'), false);
});

test('3.60.0 AC-8: ATTACK: every role\'s rules really match the hook scripts, however the path is written, and git commit, push and add', T, async () => {
  const { roleTools } = await load('run-role.mjs');
  const attacks = [
    'node .claude/hooks/commit-gate.mjs --approve x',
    'node .claude/hooks/models.mjs --set code=sonnet:high',
    'node ./.claude/hooks/commit-gate.mjs --approve x',
    'node ".claude/hooks/commit-gate.mjs" --approve x',
    'git commit -m x',
    'git push origin main',
    'git add -f .env',
  ];
  for (const role of ROLES) {
    const { disallowed } = roleTools(role, COMMANDS);
    assert.deepEqual(attacks.filter((command) => !isDenied(disallowed, command)), [], role);
  }
});

test('3.60.0 AC-8: the rules leave ordinary work alone: a test or code role can still run its commands', T, async () => {
  const { roleTools } = await load('run-role.mjs');
  for (const role of ['test', 'code']) {
    const { disallowed } = roleTools(role, COMMANDS);
    assert.deepEqual(['node --test', 'npm test', 'node src/hooks/x.mjs'].filter((command) => isDenied(disallowed, command)), [], role);
  }
});

test('3.60.0 AC-8: ATTACK: the docs role disallows Bash outright; test and code keep it, or their own commands could not run', T, async () => {
  const { roleTools } = await load('run-role.mjs');
  for (const commands of [COMMANDS, {}, undefined]) assert.equal(roleTools('docs', commands).disallowed.includes('Bash'), true, JSON.stringify(commands));
  for (const role of ['test', 'code']) assert.equal(roleTools(role, COMMANDS).disallowed.includes('Bash'), false, role);
});

test('3.60.0 AC-8: ATTACK: every role disallows Agent, git commit, git push and the kit hook scripts', T, async () => {
  const { roleTools } = await load('run-role.mjs');
  for (const role of ROLES) {
    const { disallowed } = roleTools(role, COMMANDS);
    assert.deepEqual(ALWAYS_DENIED.filter((rule) => !disallowed.includes(rule)), [], role);
  }
});

test('3.60.0 AC-8: ATTACK: childArgs passes every disallowed rule after --disallowedTools', T, async () => {
  const { childArgs, roleTools } = await load('run-role.mjs');
  for (const role of ROLES) {
    const tools = roleTools(role, COMMANDS);
    const passed = flagList(childArgs({ model: MODEL, prompt: 'do it', role, tools }), '--disallowedTools');
    assert.deepEqual([...passed].sort(), [...tools.disallowed].sort(), role);
    assert.deepEqual(ALWAYS_DENIED.filter((rule) => !passed.includes(rule)), [], role);
  }
});

test('3.60.0 AC-8: ATTACK: a real run hands the rules to the child: docs cannot use Bash, whatever the project allows', T, async (t) => {
  const p = await project(t);
  for (const role of ROLES) {
    const r = await cli(p, [role, 'p.md']);
    assertRan(r);
    const denied = flagList(r.spawned[0].args, '--disallowedTools');
    assert.deepEqual(ALWAYS_DENIED.filter((rule) => !denied.includes(rule)), [], role);
    assert.equal(denied.includes('Bash'), role === 'docs', role);
  }
});

// ---- AC-12 ----

const agentsWith = (command) => AGENTS_FIXTURE.replace('test:        npm test', `test:        ${command}`);
const shellRules = (r) => flagList(r.spawned[0].args, '--allowedTools').filter((rule) => /^Bash/.test(rule));
// The approval lives in the real user folder and HOME cannot move it (gate.mjs), so the record is made with approve() and removed here
async function approveCommands(t, root) {
  const { approve, approvalPath } = await load('gate.mjs');
  const file = approvalPath(root);
  t.after(() => fs.rmSync(file, { force: true }));
  approve(root);
}

test('3.60.0 AC-12: ATTACK: an AGENTS.md command nobody approved gives the child no Bash rule', T, async (t) => {
  const { isApproved } = await load('gate.mjs');
  const p = await project(t);
  write(path.join(p.root, 'AGENTS.md'), agentsWith('./pwn.sh'));
  assert.equal(isApproved(p.root), false, 'the fixture is unapproved');
  for (const role of ['test', 'code']) {
    const r = await cli(p, [role, 'p.md']);
    assertRan(r);
    assert.deepEqual(shellRules(r), [], role);
  }
});

test('3.60.0 AC-12: ATTACK: a command changed after approval gives the child no Bash rule until it is approved again', T, async (t) => {
  const p = await project(t);
  write(path.join(p.root, 'AGENTS.md'), agentsWith('npm test'));
  await approveCommands(t, p.root);
  write(path.join(p.root, 'AGENTS.md'), agentsWith('./pwn.sh'));
  const r = await cli(p, ['test', 'p.md']);
  assertRan(r);
  assert.deepEqual(shellRules(r), []);
});

test('3.60.0 AC-12: the same command once approved reaches the child as its Bash rule, and docs still has none', T, async (t) => {
  const p = await project(t);
  write(path.join(p.root, 'AGENTS.md'), agentsWith('./pwn.sh'));
  await approveCommands(t, p.root);
  const tester = await cli(p, ['test', 'p.md']);
  assertRan(tester);
  assert.deepEqual(shellRules(tester), ['Bash(./pwn.sh)']);
  const code = await cli(p, ['code', 'p.md']);
  assertRan(code);
  assert.equal(shellRules(code).includes('Bash(./pwn.sh)'), true);
  const docs = await cli(p, ['docs', 'p.md']);
  assertRan(docs);
  assert.deepEqual(shellRules(docs), []);
});

// ---- AC-4: proxy paths, model and error bodies ----

// startProxy in a process of its own: an unhandled error ends that process, as it would in a real run
async function proxyProcess(t, up, { canSpend = 'return true;', onUsage = '' } = {}) {
  const script = path.join(tmpDir(t, 'rr-proxy-proc-'), 'proxy.mjs');
  write(script, [
    `import { startProxy } from ${JSON.stringify(pathToFileURL(path.join(HOOKS, 'run-role.mjs')).href)};`,
    'const cfg = JSON.parse(process.env.RR_CFG);',
    'let spendCalls = 0;',
    `const proxy = await startProxy({ ...cfg, prices: { input: 2, output: 10 }, canSpend: () => { ${canSpend} }, onUsage: () => { ${onUsage} } });`,
    "console.log('PORT ' + proxy.port);",
  ].join('\n'));
  const child = spawn(process.execPath, [script], {
    env: { ...cleanEnv(), RR_CFG: JSON.stringify({ key: OR_KEY, token: TOKEN, upstream: up.url, model: MODEL }) }, stdio: ['ignore', 'pipe', 'pipe'],
  });
  t.after(() => { child.kill(); });
  let err = '';
  child.stderr.on('data', (d) => { err += d; });
  const port = await new Promise((resolve, reject) => {
    let out = '';
    child.stdout.on('data', (d) => { out += d; const m = out.match(/PORT (\d+)/); if (m) resolve(Number(m[1])); });
    child.on('exit', (c) => reject(new Error(`the proxy process ended before it listened (${c})\n${err}`)));
  });
  const assertAlive = () => assert.equal(child.exitCode === null && child.signalCode === null, true, `the proxy process died\n${err}`);
  return { port, assertAlive };
}

const okUpstream = (t) => upstream(t, (req, res) => { res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"ok":true}'); });

test('3.60.0 AC-4: POST /v1/messages and POST /v1/messages/count_tokens go upstream, with or without a query string', T, async (t) => {
  const up = await okUpstream(t);
  const { port } = await proxyFor(t, up);
  const targets = ['/v1/messages', '/v1/messages?beta=true', '/v1/messages?a=1&b=2', '/v1/messages/count_tokens', '/v1/messages/count_tokens?beta=true'];
  for (const target of targets) assert.equal((await call(port, { target })).status, 200, target);
  assert.deepEqual(up.seen.map((s) => `${s.method} ${s.url}`), targets.map((target) => `POST /anthropic${target}`));
});

test('3.60.0 AC-4: ATTACK: any other path or method is 404 and nothing goes upstream', T, async (t) => {
  const up = await okUpstream(t);
  const { port } = await proxyFor(t, up);
  const attempts = [
    ['GET', '/v1/models'], ['POST', '/v1/models'], ['GET', '/v1/credits'], ['POST', '/v1/credits'], ['POST', '/'],
    ['POST', '/../v1/credits'], ['POST', '/%2e%2e/auth/keys'], ['POST', '/v1/messages/../credits'], ['POST', '/v1/messages/%2e%2e/credits'], ['POST', '/v1/messages%2f..%2fcredits'],
    ['POST', '/v1/messages/count_tokens/../../credits'], ['POST', '/v1/messages/../messages'],
    ['POST', '//evil.example/v1/messages'], ['POST', 'http://evil.example/v1/messages'], ['POST', 'https://evil.example/v1/messages?beta=true'], [`POST`, `http://127.0.0.1:${port}/v1/messages`],
    ['POST', '/v1/messages/'], ['POST', '/v1/messagesx'], ['POST', '/V1/MESSAGES'], ['POST', '/v1/messages/count_tokens/x'], ['POST', '/v1/messages/batches'], ['POST', '/anthropic/v1/messages'],
    ['GET', '/v1/messages'], ['DELETE', '/v1/messages'], ['PUT', '/v1/messages'], ['GET', '/v1/messages/count_tokens'],
  ];
  const wrong = [];
  for (const [method, target] of attempts) {
    const before = up.seen.length;
    const r = await call(port, { method, target });
    if (r.status !== 404 || up.seen.length !== before) wrong.push(`${method} ${target}: ${r.status}, upstream got ${up.seen.length - before}`);
  }
  assert.deepEqual(wrong, []);
  assert.equal((await call(port)).status, 200, 'the allowed path still works');
});

test('3.60.0 AC-4: ATTACK: a body with another model, or not JSON, is 400 and nothing goes upstream', T, async (t) => {
  const up = await okUpstream(t);
  const { port } = await proxyFor(t, up);
  const bodies = [
    JSON.stringify({ model: 'anthropic/claude-opus-4', max_tokens: 16, messages: [] }), JSON.stringify({ model: MODEL.toUpperCase() }), JSON.stringify({ model: `${MODEL} ` }), JSON.stringify({ model: `openrouter/${MODEL}` }),
    JSON.stringify({ model: [MODEL] }), JSON.stringify({ model: null }), JSON.stringify({ model: 12 }), JSON.stringify({ messages: [] }),
    '', ' ', 'not json', '{"model":', `{"model":"${MODEL}"`, 'null', '[]', '12', JSON.stringify(MODEL),
  ];
  const wrong = [];
  for (const target of ['/v1/messages', '/v1/messages/count_tokens?beta=true']) {
    for (const body of bodies) {
      const r = await call(port, { target, body });
      if (r.status !== 400) wrong.push(`${target} ${JSON.stringify(body)}: ${r.status}`);
    }
  }
  assert.deepEqual(wrong, []);
  assert.deepEqual(up.seen.map((s) => s.body), [], 'nothing went upstream');
  assert.equal((await call(port)).status, 200, 'the given model passes');
  assert.equal(up.seen[0].body, CALL_BODY, 'and its bytes are unchanged');
});

test('3.60.0 AC-4: ATTACK: a real run gives the proxy its model: a child asking for another model gets 400 and nothing is sent', T, async (t) => {
  const p = await project(t);
  const r = await cli(p, ['code', 'p.md'], { RR_CHILD_MODEL: 'anthropic/claude-opus-4' });
  assert.deepEqual(r.spy.filter((s) => s.kind === 'child-call').map((s) => s.status), [400], r.stderr);
  assert.deepEqual(messageCalls(r), []);
});

test('3.60.0 AC-4: ATTACK: a bad token of non-ASCII characters with the length of the real one is 401 and the proxy keeps serving', T, async (t) => {
  const up = await okUpstream(t);
  const proxy = await proxyProcess(t, up);
  const n = TOKEN.length;
  assert.equal(n % 2, 0, 'the fixture needs an even length for the two-byte spellings');
  // A Buffer body makes the client send the header as latin1. With a string body it goes out as UTF-8, doubles in length and misses the case.
  const attempts = [
    { token: '\xe9'.repeat(n) }, // é
    { token: '\xc4\xb0'.repeat(n / 2) }, // the UTF-8 bytes of İ
    { token: '\xc5\x9f'.repeat(n / 2) }, // the UTF-8 bytes of ş
    { token: `${TOKEN.slice(0, -1)}\xe9` },
    { token: null, headers: { 'x-api-key': '\xe9'.repeat(n) } },
  ];
  for (const a of attempts) {
    const r = await call(proxy.port, { ...a, body: Buffer.from(CALL_BODY) });
    assert.equal(r.status, 401, JSON.stringify(a));
  }
  assert.equal(up.seen.length, 0, 'nothing went upstream');
  proxy.assertAlive();
  assert.equal((await call(proxy.port)).status, 200, 'the proxy keeps serving');
});

test('3.60.0 AC-4: ATTACK: an error inside the request handler gets an error status and does not end the process', T, async (t) => {
  const up = await okUpstream(t);
  const proxy = await proxyProcess(t, up, { canSpend: "if (spendCalls++ === 0) throw new Error('the store went away'); return true;" });
  const r = await call(proxy.port);
  assert.equal(r.status >= 400 && r.status < 600, true, `status ${r.status}`);
  assert.equal(r.text.includes(OR_KEY), false);
  assert.equal(up.seen.length, 0, 'nothing went upstream');
  proxy.assertAlive();
  assert.equal((await call(proxy.port)).status, 200, 'the next request is served');
});

test('3.60.0 AC-4: ATTACK: a client that drops midway through its body does not end the process', T, async (t) => {
  const up = await okUpstream(t);
  const proxy = await proxyProcess(t, up);
  await new Promise((resolve, reject) => {
    const socket = net.connect(proxy.port, '127.0.0.1', () => {
      socket.write(`POST /v1/messages HTTP/1.1\r\nHost: x\r\nAuthorization: Bearer ${TOKEN}\r\nContent-Length: 1000\r\n\r\n{"model":`);
      setTimeout(() => { socket.destroy(); resolve(); }, 50);
    });
    socket.on('error', reject);
  });
  await wait(200);
  proxy.assertAlive();
  assert.equal(up.seen.length, 0);
  assert.equal((await call(proxy.port)).status, 200, 'the next request is served');
});

test('3.60.0 AC-4: ATTACK: an onUsage that throws (the ledger cannot be written) does not end the process', T, async (t) => {
  const up = await upstream(t, (req, res) => { res.writeHead(200, STREAM_HEADERS); res.end(sse()); });
  const proxy = await proxyProcess(t, up, { onUsage: "throw new Error('the ledger is busy');" });
  assert.equal((await call(proxy.port)).status, 200);
  await wait(100);
  proxy.assertAlive();
  assert.equal((await call(proxy.port)).status, 200, 'the next request is served');
});

const sliced = (text, size) => {
  const buf = Buffer.from(text), parts = [];
  for (let i = 0; i < buf.length; i += size) parts.push(buf.subarray(i, i + size));
  return parts;
};
async function sendParts(res, status, parts) {
  res.writeHead(status, { 'content-type': 'application/json' });
  for (const part of parts) {
    res.write(part);
    await wait(2);
  }
  res.end();
}
const LEAKY = `{"type":"error","error":{"type":"authentication_error","message":"İşı bad key ${OR_KEY} and again ${OR_KEY} ğü"}}`;

test('3.60.0 AC-4: ATTACK: an upstream error body that echoes the key does not reach the client with the key, even split across chunks', T, async (t) => {
  const at = LEAKY.indexOf(OR_KEY);
  const midKey = [LEAKY.slice(0, at + 5), LEAKY.slice(at + 5, at + 20), LEAKY.slice(at + 20)];
  const cases = [
    ['whole, 400', 400, [LEAKY]], ['whole, 401', 401, [LEAKY]], ['whole, 403', 403, [LEAKY]], ['whole, 429', 429, [LEAKY]], ['whole, 500', 500, [LEAKY]], ['whole, 503', 503, [LEAKY]],
    ['cut inside the key', 401, midKey], ['one byte at a time', 400, sliced(LEAKY, 1)], ['seven bytes at a time', 500, sliced(LEAKY, 7)],
  ];
  for (const [label, status, parts] of cases) {
    const up = await upstream(t, (req, res) => { sendParts(res, status, parts); });
    const { port } = await proxyFor(t, up);
    const r = await call(port);
    assert.equal(r.status, status, label);
    const fragments = [];
    for (let i = 0; i + 16 <= OR_KEY.length; i++) if (r.text.includes(OR_KEY.slice(i, i + 16))) fragments.push(OR_KEY.slice(i, i + 16));
    assert.deepEqual(fragments, [], `${label}: no part of the key`);
    assert.equal(JSON.stringify(r.headers).includes(OR_KEY), false, `${label}: headers`);
  }
});

test('3.60.0 AC-4: ATTACK: a gzip error body that echoes the key is masked too', T, async (t) => {
  const up = await upstream(t, (req, res) => { res.writeHead(401, { 'content-type': 'application/json', 'content-encoding': 'gzip' }); res.end(zlib.gzipSync(LEAKY)); });
  const { port } = await proxyFor(t, up);
  const r = await call(port);
  assert.equal(r.status, 401);
  assert.equal(r.text.includes(OR_KEY), false);
});

// ---- AC-7: spend ----

const DAY = '2026-11-01';

test('3.60.0 AC-7: spendAllowed is true only when the store reads cleanly and the spend is below the limit', T, async (t) => {
  const { spendAllowed, setLimit, addSpend } = await load('providers.mjs');
  const dir = tmpDir(t, 'rr-allowed-');
  const file = path.join(dir, 'providers.json');
  setLimit('openrouter', 5, file);
  assert.equal(spendAllowed('openrouter', 5, DAY, file), true, 'nothing spent');
  addSpend('openrouter', 4.99, DAY, file);
  assert.equal(spendAllowed('openrouter', 5, DAY, file), true, 'just below');
  addSpend('openrouter', 0.01, DAY, file);
  assert.equal(spendAllowed('openrouter', 5, DAY, file), false, 'at the limit');
  addSpend('openrouter', 1, DAY, file);
  assert.equal(spendAllowed('openrouter', 5, DAY, file), false, 'over the limit');
  assert.equal(spendAllowed('openrouter', 5, '2026-11-02', file), true, 'another day is its own');
  assert.equal(spendAllowed('deepseek', 5, DAY, file), true, 'another provider is its own');
  for (const limit of [0, -1, NaN, undefined]) assert.equal(spendAllowed('deepseek', limit, DAY, file), false, `limit ${limit}`);
});

test('3.60.0 AC-7: ATTACK: spendAllowed is false for a missing or broken store', T, async (t) => {
  const { spendAllowed } = await load('providers.mjs');
  const dir = tmpDir(t, 'rr-allowed-');
  assert.equal(spendAllowed('openrouter', 5, DAY, path.join(dir, 'none.json')), false, 'missing file');
  assert.equal(spendAllowed('openrouter', 5, DAY, path.join(dir, 'none', 'none.json')), false, 'missing folder');
  assert.equal(spendAllowed('openrouter', 5, DAY, dir), false, 'a folder in its place');
  const file = path.join(dir, 'broken.json');
  for (const broken of ['', ' ', 'not json', '{"keys":', '{"spend":{"openrouter":', 'null', '[]', '12']) {
    fs.writeFileSync(file, broken);
    assert.equal(spendAllowed('openrouter', 5, DAY, file), false, JSON.stringify(broken));
  }
});

test('3.60.0 AC-7: ATTACK: a store that turns broken or vanishes during a run stops the next request, and nothing goes upstream', T, async (t) => {
  for (const name of ['RR_BREAK_STORE', 'RR_DROP_STORE']) {
    const p = await project(t);
    const r = await cli(p, ['code', 'p.md'], { [name]: p.file });
    assert.equal(r.spawned.length, 1, r.stderr);
    const statuses = r.spy.filter((s) => s.kind === 'child-call').map((s) => s.status);
    assert.equal(statuses.length, 1, name);
    assert.equal(statuses[0] >= 400, true, `${name}: status ${statuses[0]}`);
    assert.deepEqual(messageCalls(r), [], name);
  }
});

const providersUrl = () => pathToFileURL(path.join(HOOKS, 'providers.mjs')).href;
function spendScript(t) {
  const script = path.join(tmpDir(t, 'rr-spend-proc-'), 'spend.mjs');
  write(script, [
    `import { addSpend } from ${JSON.stringify(providersUrl())};`,
    'const [file, day, usd, times, start] = process.argv.slice(2);',
    'while (Date.now() < Number(start)); // every process starts writing at the same moment',
    "for (let i = 0; i < Number(times); i++) addSpend('openrouter', Number(usd), day, file);",
  ].join('\n'));
  return script;
}

test('3.60.0 AC-7: ATTACK: concurrent addSpend calls from separate processes lose nothing and leave no lock behind', T, async (t) => {
  const { setKey, setLimit, spentOn, readStore } = await load('providers.mjs');
  const dir = tmpDir(t, 'rr-race-');
  const file = path.join(dir, 'providers.json');
  assert.equal(setKey('openrouter', OR_KEY, file), null);
  setLimit('openrouter', 5, file);
  const script = spendScript(t);
  const start = Date.now() + 1500;
  const runs = await Promise.all(Array.from({ length: 8 }, () => new Promise((resolve) => {
    const child = spawn(process.execPath, [script, file, DAY, '0.01', '10', String(start)], { env: cleanEnv(), stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    child.stderr.on('data', (d) => { err += d; });
    const timer = setTimeout(() => child.kill(), 30000);
    child.on('close', (status) => { clearTimeout(timer); resolve({ status, err }); });
  })));
  close(spentOn('openrouter', DAY, file), 0.8, 'the ledger');
  assert.deepEqual(runs.filter((r) => r.status !== 0).map((r) => r.err.split('\n').find((l) => /Error/.test(l))), [], 'every process ends well');
  assert.equal(readStore(file).keys.openrouter, OR_KEY, 'the key stays');
  assert.equal(readStore(file).limits.openrouter, 5, 'the limit stays');
  assert.deepEqual(fs.readdirSync(dir), ['providers.json'], 'no lock or temp file stays behind');
});

test('3.60.0 AC-7: ATTACK: a lock left by a dead run does not block addSpend forever', T, async (t) => {
  const { setLimit, addSpend, spentOn } = await load('providers.mjs');
  const dir = tmpDir(t, 'rr-stale-');
  const file = path.join(dir, 'providers.json');
  setLimit('openrouter', 5, file);
  addSpend('openrouter', 0.5, DAY, file);
  // The run dies at the moment it replaces the store, so whatever lock it holds stays where it is; no lock name is assumed
  const killer = path.join(tmpDir(t, 'rr-stale-kill-'), 'die-on-write.mjs');
  const mark = `${killer}.died`;
  write(killer, [
    "import fs from 'node:fs';",
    "import path from 'node:path';",
    "import { syncBuiltinESMExports } from 'node:module';",
    `const target = path.resolve(${JSON.stringify(file)});`,
    'const trap = (real, at) => (...args) => {',
    '  if (path.resolve(String(args[at])) === target) {',
    `    fs.appendFileSync(${JSON.stringify(mark)}, 'x');`,
    "    process.kill(process.pid, 'SIGKILL');",
    '    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 5000);',
    '  }',
    '  return real(...args);',
    '};',
    'fs.renameSync = trap(fs.renameSync, 1);',
    'fs.writeFileSync = trap(fs.writeFileSync, 0);',
    'syncBuiltinESMExports();',
  ].join('\n'));
  const script = spendScript(t);
  const args = [script, file, DAY, '0.25', '1', '0'];
  spawnSync(process.execPath, ['--import', pathToFileURL(killer).href, ...args], { env: cleanEnv(), encoding: 'utf8', timeout: 20000 });
  assert.equal(fs.existsSync(mark), true, 'the first run died while writing the store');
  close(spentOn('openrouter', DAY, file), 0.5, 'the dead run wrote nothing');
  // An hour passes, whatever the way a lock is judged old
  const old = new Date(Date.now() - 3_600_000);
  for (const name of fs.readdirSync(dir)) if (name !== 'providers.json') fs.utimesSync(path.join(dir, name), old, old);
  const next = spawnSync(process.execPath, [script, file, DAY, '0.1', '1', '0'], { env: cleanEnv(), encoding: 'utf8', timeout: 20000 });
  assert.equal(next.status, 0, `the next run is not blocked: ${next.error?.message ?? next.stderr}`);
  close(spentOn('openrouter', DAY, file), 0.6, 'and its spend is written');
});

// ---- AC-9: prompt content ----

test('3.60.0 AC-9: ATTACK: the CLI refuses a prompt file holding a secret pattern, starts no child and does not show the secret', T, async (t) => {
  const { findSecrets } = await load('guard-secrets.mjs');
  const secrets = [GH_VALUE, 'AKIA' + 'ABCDEFGHIJKLMNOP', '-----BEGIN ' + 'RSA PRIVATE KEY-----', OR_KEY, 'npm_' + 'h'.repeat(36)];
  const p = await project(t);
  for (const secret of secrets) {
    assert.equal(findSecrets(secret).length > 0, true, `the fixture matches PATTERNS: ${secret.slice(0, 6)}`);
    write(path.join(p.root, 'p.md'), `Görevİ yap ı\n${secret}\nthe rest of the prompt\n`);
    const r = await cli(p, ['code', 'p.md']);
    assertRefused(r, /secret|token|key/i);
    assert.equal((r.stdout + r.stderr).includes(secret), false, 'the secret is not shown');
  }
  write(path.join(p.root, 'p.md'), 'Görevİ yap ı: rotate the sk- prefix handling in auth.js\n');
  assertRan(await cli(p, ['code', 'p.md']));
});

// ---- AC-1: one reading of a role's value ----

test('3.60.0 AC-1: parseExternal reads provider, model and effort, the effort being what follows the last colon', T, async () => {
  const { parseExternal } = await load('providers.mjs');
  assert.deepEqual(parseExternal(MODEL_VALUE), { provider: 'openrouter', model: MODEL, effort: 'high' });
  assert.deepEqual(parseExternal('openrouter/a/b:batch:high'), { provider: 'openrouter', model: 'a/b:batch', effort: 'high' });
  assert.deepEqual(parseExternal('kimi/Kimi-K2.5:low'), { provider: 'kimi', model: 'Kimi-K2.5', effort: 'low' });
  for (const effort of ['low', 'medium', 'high', 'xhigh']) assert.deepEqual(parseExternal(`deepseek/deepseek-chat:${effort}`), { provider: 'deepseek', model: 'deepseek-chat', effort });
});

test('3.60.0 AC-1: ATTACK: parseExternal returns null without a known provider, a model matching MODEL_ID and an effort from the list', T, async () => {
  const { parseExternal } = await load('providers.mjs');
  const bad = [
    'openrouter/foo', 'openrouter/foo:bar', 'openrouter/foo:', 'openrouter/foo:HIGH', 'openrouter/foo:high ', 'openrouter/foo:high\n', 'openrouter/foo:max', 'openrouter/a/b:batch',
    'openrouter/:high', 'openrouter:high', 'openrouter', '/foo:high', ':high', '', ' ', 'sonnet:high',
    'evil/x/y:high', 'OPENROUTER/x:high', '__proto__/x:high', 'constructor/x:high', 'toString/x:high', 'https://evil.example/x:high',
    'openrouter/-x:high', 'openrouter/--dangerously-skip-permissions:high', 'openrouter/a b:high', 'openrouter/a;b:high', 'openrouter/modelş:high', 'openrouter/a\nb:high',
    undefined, null, 12, {}, [], ['openrouter/foo:high'],
  ];
  assert.deepEqual(bad.filter((value) => parseExternal(value) !== null), []);
});

test('3.60.0 AC-1: ATTACK: the CLI refuses a hand-edited models.json holding a bad form and passes nothing to CLAUDE_CODE_EFFORT_LEVEL', T, async (t) => {
  for (const value of ['openrouter/foo', 'openrouter/foo:bar', 'openrouter/foo:', 'openrouter/a/b:batch']) {
    const p = await project(t, { models: { code: value } });
    const r = await cli(p, ['code', 'p.md']);
    assert.deepEqual(r.spawned.map((s) => s.env.CLAUDE_CODE_EFFORT_LEVEL), [], value);
    assertRefused(r, /provider|model|effort/i);
  }
});

test('3.60.0 AC-1: the CLI passes the model and effort of a good value, with a colon in the model id', T, async (t) => {
  const p = await project(t, { models: { code: 'openrouter/a/b:batch:high' } });
  const r = await cli(p, ['code', 'p.md']);
  assertRan(r);
  const { args, env } = r.spawned[0];
  assert.equal(args[args.indexOf('--model') + 1], 'a/b:batch');
  assert.equal(env.ANTHROPIC_MODEL, 'a/b:batch');
  assert.equal(env.CLAUDE_CODE_EFFORT_LEVEL, 'high');
});

test('3.60.0 AC-1: models.mjs --set and parseExternal read a value the same way', T, async (t) => {
  const { parseExternal, setKey } = await load('providers.mjs');
  const m = modelsProject(t);
  assert.equal(setKey('openrouter', OR_KEY, m.file), null);
  for (const value of ['openrouter/a/b:batch:high', MODEL_VALUE, 'openrouter/foo', 'openrouter/foo:bar', 'openrouter/foo:', 'evil/x/y:high', 'openrouter/-x:high', 'openrouter/a;b:high'])
    assert.equal(m.run(['--set', `code=${value}`]).status === 0, parseExternal(value) !== null, value);
});

// ---- Guards (AC-2): the store is asked for, ordinary work is not ----

const GUARD_CTX = [{}, { tool: 'claude', agent: '' }, { tool: 'claude', agent: 'test-writer' }];

test('3.60.0 AC-2: the shield does not ask for ordinary work that only looks like the store', T, async () => {
  const { evaluate } = await load('destructive-guard.mjs');
  const ordinary = ['git add providers.json', 'cat src/providers.json', 'echo .vibrant'];
  for (const ctx of GUARD_CTX) assert.deepEqual(ordinary.filter((c) => evaluate(c, ctx) !== null), [], JSON.stringify(ctx));
});

test('3.60.0 AC-2: ATTACK: the shield still asks for the store and its folder', T, async () => {
  const { evaluate } = await load('destructive-guard.mjs');
  const store = ['cat ~/.vibe-kit/providers.json', 'type %USERPROFILE%\\.vibe-kit\\providers.json', 'cd ~/.vibe-kit', 'ls ~/.vib*'];
  for (const ctx of GUARD_CTX) assert.deepEqual(store.filter((c) => evaluate(c, ctx)?.decision !== 'ask'), [], JSON.stringify(ctx));
});
