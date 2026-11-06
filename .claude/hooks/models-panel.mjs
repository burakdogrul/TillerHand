#!/usr/bin/env node
// The model panel (docs/workflow/models.md): a local page for usage, jobs, models and keys.
//   node .claude/hooks/models-panel.mjs      starts it, opens the browser, closes itself after 30 minutes without use
// Local only: it listens on 127.0.0.1. A one-time token opens the page once and the page gets a session secret; every /api call sends it
// in the x-panel-session header. There is no cookie. The token is never on a command line: the CLI opens a temporary file that redirects to it.
// A key is entered in a terminal, never here. The Try and update buttons use it through provider-test.mjs and provider-models.mjs: no response, log or file holds it.
import fs from 'node:fs';
import os from 'node:os';
import http from 'node:http';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { findRoot, isMain } from './shared.mjs';
import { t, readLang, locale } from './lang.mjs';
import { MESSAGES } from './messages.mjs';
import { ROLES, JOBS, MODELS, levelOf, roleOf, recommendedFor, resolveJob, readSaved, modelsFile, modelsVersion, applyChanges, setDefaults, replaceFile } from './models.mjs';
// This file takes no key and opens no vault itself: keys are entered in a terminal (models.mjs --set-key). A panel session can only start the fixed calls in the two files below.
import { EFFORTS, parseExternal, isProvider, readStore, keyInfo, providerNames, setLimit, addCatalog, removeCatalog, today, purgePlainKeys } from './providers.mjs';
import { systemExe } from './keystore.mjs';
import { PRESETS } from './provider-presets.mjs';
import { testModel } from './provider-test.mjs';
import { updateModelLists, readModelLists } from './provider-models.mjs';
import { rangeOf, claudeUsage, externalFromRuns, externalFromStore } from './panel-data.mjs';
import { readLimits } from './usage.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const MAX_TRIES = 30;
const PANEL_DIR = path.join(HERE, 'panel');
const COST_SCRIPT = path.join(HERE, 'cost.mjs');
const MAX_BODY = 64 * 1024;
const RANGES = ['today', 'thisWeek', 'lastWeek', 'days30'];
const SCOPES = ['project', 'all'];
const OVERRIDES = ['ANTHROPIC_MODEL', 'CLAUDE_CODE_EFFORT_LEVEL', 'CLAUDE_CODE_SUBAGENT_MODEL'];
// No inline script or style, no outside address; fonts and the page's own files come from this server
const CSP = "default-src 'none'; script-src 'self'; style-src 'self'; font-src 'self'; img-src 'self' data:; connect-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'";
const BASE_HEADERS = { 'cache-control': 'no-store', 'x-content-type-options': 'nosniff', 'referrer-policy': 'no-referrer', 'cross-origin-resource-policy': 'same-origin' };
// The only files that are served: a request path is looked up here and never joined to a folder
const STATIC = {
  '/': ['panel.html', 'text/html; charset=utf-8'],
  '/panel.css': ['panel.css', 'text/css; charset=utf-8'],
  '/panel.js': ['panel.js', 'text/javascript; charset=utf-8'],
  '/font/geist-latin.woff2': ['geist-latin-wght-normal.woff2', 'font/woff2'],
  '/font/geist-latin-ext.woff2': ['geist-latin-ext-wght-normal.woff2', 'font/woff2'],
};

const isObject = (x) => Boolean(x) && typeof x === 'object' && !Array.isArray(x);
const same = (a, b) => {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
};
const parentRole = (job) => (job === 'main' ? 'plan' : roleOf(job));

function json(res, status, value) {
  res.writeHead(status, { ...BASE_HEADERS, 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(value));
}

function readJson(req) {
  return new Promise((resolve) => {
    const chunks = [];
    let size = 0, big = false;
    req.on('data', (c) => { size += c.length; if (size > MAX_BODY) big = true; else chunks.push(c); });
    req.on('end', () => {
      if (big) return resolve({ status: 413, key: 'tooLarge' });
      try {
        const value = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        resolve(isObject(value) ? { value } : { status: 400, key: 'badRequest' });
      } catch {
        resolve({ status: 400, key: 'badRequest' });
      }
    });
    req.on('error', () => resolve({ status: 400, key: 'badRequest' }));
    req.on('close', () => resolve({ status: 400, key: 'badRequest' }));
  });
}

function readRuns(root) {
  try {
    return fs.readFileSync(path.join(root, '.claude', 'state', 'role-runs.jsonl'), 'utf8').split('\n').flatMap((line) => { try { return [JSON.parse(line)]; } catch { return []; } });
  } catch {
    return [];
  }
}

// onLogin runs when the one-time token is used (the CLI deletes its temporary file then)
export async function createPanel({ root = findRoot(), idleMs = 30 * 60 * 1000, now = Date.now, onLogin = () => {}, fetchImpl = fetch } = {}) {
  try { purgePlainKeys(); } catch { /* the store is not writable; a plain key in it is never read */ }
  const token = crypto.randomBytes(32).toString('base64url');
  const sessionValue = crypto.randomBytes(32).toString('base64url');
  const stateDir = path.join(root, '.claude', 'state');
  const panelFile = path.join(stateDir, 'panel.json');
  const running = new Map(); // scope → the cost.mjs child that is reading it
  const failed = new Set(); // scopes whose last read failed
  let tokenUsed = false, port = 0, idle = null, closing = null, testing = false, updating = false, tries = 0;
  const text = (key) => t(root, key);
  const fail = (res, status, key, extra = {}) => json(res, status, { ok: false, message: text(`panel.err.${key}`), ...extra });
  // A refused request is answered before its body is read; the body is drained so the client can finish sending it
  const refuse = (req, res, status, key) => { req.resume(); fail(res, status, key); };

  function claudeState(kind, scope) {
    const file = path.join(stateDir, scope === 'all' ? 'cost-all.json' : 'cost.json');
    let daily = [], readAt = null, error = null;
    try {
      const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
      readAt = typeof saved.readAt === 'string' ? saved.readAt : null;
      const data = saved.data ?? {};
      daily = scope === 'all' ? data.daily : Object.values(isObject(data.projects) ? data.projects : {}).flat().concat(Array.isArray(data.daily) ? data.daily : []);
    } catch (e) {
      error = text(e.code === 'ENOENT' ? (scope === 'all' ? 'panel.err.noCostAll' : 'panel.err.noCost') : 'panel.err.costUnreadable');
    }
    if (failed.has(scope)) error = text('panel.err.refreshFailed');
    return { ...claudeUsage(daily, rangeOf(kind, now())), readAt, error };
  }

  function jobsTree(file) {
    const entry = (name) => { const r = resolveJob(name, file); return { name, value: r.value, source: r.source, custom: r.source === name, notes: r.notes }; };
    return Object.keys(ROLES).map((role) => ({ ...entry(role), jobs: Object.keys(JOBS).filter((job) => parentRole(job) === role).map(entry) }));
  }

  function buildState(query) {
    const kind = RANGES.includes(query.get('range')) ? query.get('range') : 'thisWeek';
    const scope = SCOPES.includes(query.get('scope')) ? query.get('scope') : 'project';
    const file = modelsFile(root);
    const { saved, problem } = readSaved(file);
    const store = readStore();
    const day = today(new Date(now()));
    const range = rangeOf(kind, now());
    const lang = readLang(root) ?? 'en';
    const names = [...Object.keys(ROLES), ...Object.keys(JOBS)];
    return {
      lang,
      project: path.basename(root),
      // What the page's model and effort lists hold, and the chain each job follows, so a draft shows what would run
      choices: { models: MODELS, efforts: EFFORTS, links: JOBS },
      locale: locale(lang),
      strings: Object.fromEntries(Object.keys(MESSAGES).filter((k) => k.startsWith('panel.')).map((k) => [k, text(k)])),
      version: modelsVersion(file),
      saved: problem ? { broken: true } : saved,
      jobs: jobsTree(file),
      recommended: Object.fromEntries(names.map((name) => [name, recommendedFor(name)])),
      levels: Object.fromEntries(names.map((name) => [name, levelOf(name)])),
      presets: PRESETS,
      modelLists: readModelLists(),
      main: resolveJob('main', file).value,
      overrides: OVERRIDES.filter((name) => process.env[name]),
      providers: Object.fromEntries(providerNames().map((p) => [p, { keyInfo: keyInfo(p), limit: Number(store.limits[p]) > 0 ? Number(store.limits[p]) : null, spentToday: Number(store.spend[p]?.[day]) || 0 }])),
      catalog: store.catalog,
      limits: readLimits(root, now()),
      claude: claudeState(kind, scope),
      external: scope === 'all' ? externalFromStore(store, range) : externalFromRuns(readRuns(root), range),
      refreshing: running.size > 0,
    };
  }

  function startRefresh(scope) {
    if (running.has(scope)) return;
    const child = execFile(process.execPath, [COST_SCRIPT, ...(scope === 'all' ? ['--all'] : []), root], { timeout: 150000, windowsHide: true, env: process.env }, (err) => {
      running.delete(scope);
      if (err) failed.add(scope); else failed.delete(scope);
    });
    running.set(scope, child);
  }

  // secret: put in the page as a meta tag (the token page only). The script moves it to sessionStorage and removes the tag.
  async function serveStatic(res, [name, type], secret = null) {
    let data;
    try { data = await fs.promises.readFile(path.join(PANEL_DIR, name)); } catch { return fail(res, 404, 'notFound'); }
    if (secret) {
      const page = data.toString('utf8');
      if (!/<head[^>]*>/i.test(page)) return fail(res, 500, 'failed');
      data = page.replace(/<head[^>]*>/i, (open) => `${open}\n<meta name="panel-session" content="${secret}">`);
    }
    res.writeHead(200, { ...BASE_HEADERS, 'content-type': type, ...(type.startsWith('text/html') ? { 'content-security-policy': CSP } : {}) });
    res.end(data);
  }

  // One handler per write route. body is a plain object; each handler reads only the fields it names.
  const writes = {
    'POST /api/jobs': (res, { changes, ifVersion, clearJobsUnder, overwriteBroken, confirmExternal }) => {
      // An outside provider sees the project and costs money: the page asks the user and says so with confirmExternal: true
      if (isObject(changes) && Object.values(changes).some((value) => parseExternal(value)) && confirmExternal !== true) return fail(res, 422, 'confirm', { code: 'confirm' });
      const r = applyChanges({ changes, ifVersion, clearJobsUnder, overwriteBroken }, modelsFile(root));
      if (r.ok) return json(res, 200, { ok: true, version: r.version });
      return fail(res, r.code === 'conflict' ? 409 : r.code === 'failed' ? 500 : 422, r.code, { code: r.code, detail: r.message });
    },
    'POST /api/limit': (res, { provider, usd }) => {
      if (!isProvider(provider)) return fail(res, 422, 'badRequest');
      return setLimit(provider, usd) === null ? json(res, 200, { ok: true }) : fail(res, 422, 'limit');
    },
    'POST /api/catalog': (res, { provider, model, input, output, context }) => (addCatalog(provider, { model, input, output, context }) === null ? json(res, 200, { ok: true }) : fail(res, 422, 'catalog')),
    'DELETE /api/catalog': (res, { provider, model }) => {
      if (!isProvider(provider) || typeof model !== 'string') return fail(res, 422, 'badRequest');
      removeCatalog(provider, model);
      return json(res, 200, { ok: true });
    },
    // One at a time and at most MAX_TRIES per panel: a session can start a paid call, so it cannot start a flood of them
    'POST /api/test': async (res, { provider, model }) => {
      if (testing) return fail(res, 429, 'busy', { code: 'busy' });
      if (tries >= MAX_TRIES) return fail(res, 429, 'busy', { code: 'tooMany' });
      tries += 1;
      testing = true;
      try { return json(res, 200, await testModel({ provider, model, fetchImpl })); } finally { testing = false; }
    },
    'POST /api/models-update': async (res) => {
      if (updating) return fail(res, 429, 'busy', { code: 'busy' });
      updating = true;
      try { return json(res, 200, await updateModelLists({ fetchImpl })); } finally { updating = false; }
    },
    'POST /api/default': (res) => (setDefaults(modelsFile(root)) === null ? json(res, 200, { ok: true }) : fail(res, 500, 'failed')),
    'POST /api/refresh': (res, { scope }) => {
      if (!SCOPES.includes(scope)) return fail(res, 400, 'badRequest');
      startRefresh(scope);
      return json(res, 202, { ok: true, refreshing: true });
    },
    'POST /api/close': (res) => {
      res.once('finish', () => close());
      return json(res, 200, { ok: true, message: text('panel.closed') });
    },
  };

  // The session secret travels in a header the page sets itself, so no other site and no cookie jar can send it
  const authed = (req) => typeof req.headers['x-panel-session'] === 'string' && same(req.headers['x-panel-session'], sessionValue);

  async function handle(req, res) {
    if (req.headers.host !== `127.0.0.1:${port}`) return refuse(req, res, 403, 'forbidden');
    if (!req.url.startsWith('/')) return refuse(req, res, 400, 'badRequest');
    const cut = req.url.indexOf('?');
    const route = cut < 0 ? req.url : req.url.slice(0, cut);
    const query = new URLSearchParams(cut < 0 ? '' : req.url.slice(cut + 1));
    if (req.method === 'GET') {
      if (route === '/health') return json(res, 200, { app: 'vibe-panel', pid: process.pid, root });
      if (route === '/' && query.has('t')) {
        const given = query.getAll('t');
        if (tokenUsed || given.length !== 1 || !same(given[0], token)) return refuse(req, res, 403, 'forbidden');
        tokenUsed = true;
        restartIdle();
        onLogin();
        // The only response that holds the secret: the page itself, once
        return serveStatic(res, STATIC['/'], sessionValue);
      }
      // The page, its style, script and fonts hold no data, so they need no session
      if (Object.hasOwn(STATIC, route)) return serveStatic(res, STATIC[route]);
    }
    if (!authed(req)) return refuse(req, res, 401, 'unauthorized');
    restartIdle();
    if (req.method === 'GET') {
      if (route === '/api/state') return json(res, 200, buildState(query));
      return fail(res, 404, 'notFound');
    }
    if (req.method !== 'POST' && req.method !== 'DELETE') return refuse(req, res, 405, 'forbidden');
    const write = Object.hasOwn(writes, `${req.method} ${route}`) ? writes[`${req.method} ${route}`] : null;
    if (!write) return refuse(req, res, 404, 'notFound');
    if (req.headers.origin !== `http://127.0.0.1:${port}`) return refuse(req, res, 403, 'forbidden');
    if (!/^application\/json\s*(;|$)/i.test(req.headers['content-type'] ?? '')) return refuse(req, res, 415, 'badRequest');
    const body = await readJson(req);
    if (!body.value) return fail(res, body.status, body.key);
    return write(res, body.value);
  }

  const server = http.createServer((req, res) => {
    handle(req, res).catch(() => { if (res.headersSent) res.destroy(); else fail(res, 500, 'failed'); });
  });
  server.requestTimeout = 30000;

  function restartIdle() {
    clearTimeout(idle);
    idle = setTimeout(() => close(), idleMs);
    idle.unref();
  }

  function close() {
    closing ??= (async () => {
      clearTimeout(idle);
      for (const child of running.values()) child.kill();
      try {
        const rec = JSON.parse(fs.readFileSync(panelFile, 'utf8'));
        if (rec.pid === process.pid && rec.port === port) fs.rmSync(panelFile, { force: true });
      } catch { /* none, or not ours */ }
      await new Promise((done) => { server.close(() => done()); server.closeAllConnections(); });
    })();
    return closing;
  }

  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  port = server.address().port;
  // Port and pid only: the token is never written down. Through a temp file and a rename, so a link left at this path is replaced, not written through.
  fs.mkdirSync(stateDir, { recursive: true });
  replaceFile(panelFile, JSON.stringify({ port, pid: process.pid }));
  restartIdle();
  return { port, token, close };
}

// The page a browser opens first. It only redirects to the panel with the token: the token is in this file and on no command line.
export function bootstrapPage(port, token) {
  const url = `http://127.0.0.1:${Number(port) | 0}/?t=${encodeURIComponent(token)}`;
  return `<!doctype html>\n<meta charset="utf-8">\n<meta http-equiv="refresh" content="0;url=${url}">\n`;
}

// The opener gets a file path, never an address or a token, so neither shows in a process list
export function openerArgs(file) {
  if (process.platform === 'win32') {
    const command = systemExe('System32', 'rundll32.exe');
    return command ? { command, args: ['url.dll,FileProtocolHandler', file] } : null;
  }
  return { command: process.platform === 'darwin' ? '/usr/bin/open' : '/usr/bin/xdg-open', args: [file] };
}

function openBrowser(file) {
  const opener = openerArgs(file);
  if (!opener) return;
  const { command, args } = opener;
  try {
    const child = spawn(command, args, { detached: true, stdio: 'ignore', shell: false });
    child.on('error', () => { /* no browser here (SSH, cloud): the address is printed on a terminal */ });
    child.unref();
  } catch { /* same */ }
}

// mkdtemp makes the folder private to this user; the file is removed when the token is used, or when the process ends
function writeBootstrap(port, token) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vibe-panel-'));
  const file = path.join(dir, 'panel-open.html');
  fs.writeFileSync(file, bootstrapPage(port, token), { mode: 0o600 });
  return { file, remove: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

// The panel that panel.json names, if it really is that process: /health answers with this app, this project and the recorded pid. Anything else is not signalled.
async function recordedPanel(root) {
  let rec;
  try { rec = JSON.parse(fs.readFileSync(path.join(root, '.claude', 'state', 'panel.json'), 'utf8')); } catch { return null; }
  if (![rec?.port, rec?.pid].every(Number.isInteger) || rec.port < 1 || rec.port > 65535 || rec.pid < 1) return null;
  try {
    // redirect: error, so a port that sends us elsewhere is not believed
    const answer = await fetch(`http://127.0.0.1:${rec.port}/health`, { signal: AbortSignal.timeout(1500), redirect: 'error' });
    const who = await answer.json();
    return who?.app === 'vibe-panel' && who.pid === rec.pid && who.root === root ? rec : null;
  } catch {
    return null;
  }
}

// A second start replaces the first: two panels would each hold choices the other does not know about
async function stopPanel(root, rec) {
  try { process.kill(rec.pid, 'SIGTERM'); } catch { return; }
  for (let waited = 0; waited < 3000 && await recordedPanel(root); waited += 100) await new Promise((done) => setTimeout(done, 100));
}

if (isMain(import.meta.url)) {
  const root = findRoot();
  const old = await recordedPanel(root);
  if (old) await stopPanel(root, old);
  let boot = null;
  const panel = await createPanel({ root, onLogin: () => boot?.remove() });
  boot = writeBootstrap(panel.port, panel.token);
  process.on('exit', () => boot.remove());
  // The file holds the one-time token: an unused one does not stay
  setTimeout(() => boot.remove(), 60000).unref();
  console.log(t(root, 'panel.cli.opened', { minutes: 30 }));
  // The address with the token only goes to a person at a terminal
  if (process.stdout.isTTY) console.log(t(root, 'panel.cli.link', { url: `http://127.0.0.1:${panel.port}/?t=${panel.token}` }));
  openBrowser(boot.file);
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => panel.close().then(() => process.exit(0)));
}
