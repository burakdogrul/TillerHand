// External model providers (docs/workflow/models.md): fixed addresses, the key store and the daily spend ledger.
// The store is outside the project (~/.vibe-kit/providers.json) so a project file can never name another address or hold a key.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

// In code on purpose: an address in a file could be edited to send the key elsewhere
export const PROVIDERS = {
  openrouter: { url: 'https://openrouter.ai/api', env: 'OPENROUTER_API_KEY', key: /^sk-or-[\w-]+$/ },
  deepseek: { url: 'https://api.deepseek.com/anthropic', env: 'DEEPSEEK_API_KEY', key: /^sk-(?!or-)[\w-]+$/ },
  kimi: { url: 'https://api.moonshot.ai/anthropic', env: 'MOONSHOT_API_KEY', key: /^sk-(?!or-)[\w-]+$/ },
};

// Planning stays in the main session, and the review role (board, security-auditor) stays on the user's plan: who checks the work is not outsourced
export const EXTERNAL_ROLES = ['code', 'test', 'docs'];
export const MODEL_ID = /^[A-Za-z0-9~][\w.~:/-]*$/;
export const EFFORTS = ['low', 'medium', 'high', 'xhigh'];

export const isProvider = (provider) => Object.hasOwn(PROVIDERS, String(provider));
export const keyFormatOk = (provider, key) => isProvider(provider) && typeof key === 'string' && PROVIDERS[provider].key.test(key);
export const storePath = () => path.join(os.homedir(), '.vibe-kit', 'providers.json');

const isObject = (x) => x && typeof x === 'object' && !Array.isArray(x);
export function readStore(file = storePath()) {
  let s = null;
  try { s = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* none yet, or broken */ }
  return { keys: isObject(s?.keys) ? s.keys : {}, limits: isObject(s?.limits) ? s.limits : {}, spend: isObject(s?.spend) ? s.spend : {} };
}

const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
const LOCK_STALE_MS = 10000;

// Several runs can spend at once: a read-change-write without a lock loses some of the spend.
function update(file, change) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const lock = `${file}.lock`;
  for (let held = false; !held;) {
    try {
      fs.closeSync(fs.openSync(lock, 'wx'));
      held = true;
    } catch (e) {
      if (e.code !== 'EEXIST' && e.code !== 'EPERM') throw e;
      // A run that died holding the lock must not block every later run
      try { if (Date.now() - fs.statSync(lock).mtimeMs > LOCK_STALE_MS) fs.rmSync(lock, { force: true }); } catch { /* gone already */ }
      sleep(10);
    }
  }
  try {
    const store = readStore(file);
    change(store);
    const tmp = `${file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(store, null, 2), { mode: 0o600 });
    // Windows refuses a rename while another process has the file open for a moment
    for (let tries = 0; ; tries++) {
      try { fs.renameSync(tmp, file); break; } catch (e) { if (tries >= 50 || e.code !== 'EPERM') throw e; sleep(10); }
    }
    fs.chmodSync(file, 0o600);
  } finally {
    fs.rmSync(lock, { force: true });
  }
}

export function setKey(provider, key, file = storePath()) {
  if (!isProvider(provider)) return `Unknown provider: ${provider}. Use one of: ${Object.keys(PROVIDERS).join(', ')}`;
  if (!keyFormatOk(provider, key)) return `This does not look like a ${provider} key. Nothing was saved.`;
  update(file, (s) => { s.keys[provider] = key; });
  return null;
}

export function removeKey(provider, file = storePath()) {
  if (!Object.hasOwn(readStore(file).keys, provider)) return;
  update(file, (s) => { delete s.keys[provider]; });
}

export function setLimit(provider, usdPerDay, file = storePath()) {
  if (!isProvider(provider)) return `Unknown provider: ${provider}`;
  if (!(typeof usdPerDay === 'number' && Number.isFinite(usdPerDay) && usdPerDay > 0)) return 'The daily limit must be a positive number of dollars.';
  update(file, (s) => { s.limits[provider] = usdPerDay; });
  return null;
}

export const today = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const spentOn = (provider, day = today(), file = storePath()) => Number(readStore(file).spend[provider]?.[day]) || 0;

export function addSpend(provider, usd, day = today(), file = storePath()) {
  update(file, (s) => {
    const days = isObject(s.spend[provider]) ? s.spend[provider] : {};
    s.spend[provider] = { ...days, [day]: (Number(days[day]) || 0) + usd };
  });
}

// Unlike readStore, an unreadable store is a no: a ledger that cannot be read must not look like a day with no spend
export function spendAllowed(provider, limit, day = today(), file = storePath()) {
  if (!(typeof limit === 'number' && Number.isFinite(limit) && limit > 0)) return false;
  try {
    const s = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!isObject(s)) return false;
    return (Number(s.spend?.[provider]?.[day]) || 0) < limit;
  } catch {
    return false;
  }
}

// The one reading of provider/model:effort. A model id may hold ":", so the effort is what follows the last one.
export function parseExternal(value) {
  if (typeof value !== 'string') return null;
  const colon = value.lastIndexOf(':');
  const slash = value.indexOf('/');
  if (slash < 1 || colon < slash) return null;
  const provider = value.slice(0, slash), model = value.slice(slash + 1, colon), effort = value.slice(colon + 1);
  return isProvider(provider) && MODEL_ID.test(model) && EFFORTS.includes(effort) ? { provider, model, effort } : null;
}

// The store first, then the provider's own variable. A key that does not match the provider is never returned, so it cannot be sent to the wrong one.
export function resolveKey(provider, { file = storePath(), env = process.env } = {}) {
  if (!isProvider(provider)) return null;
  const stored = readStore(file).keys[provider];
  if (keyFormatOk(provider, stored)) return stored;
  const fromEnv = env[PROVIDERS[provider].env];
  return keyFormatOk(provider, fromEnv) ? fromEnv : null;
}
