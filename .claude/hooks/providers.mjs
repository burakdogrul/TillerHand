// External model providers (docs/workflow/models.md): fixed addresses, the key store and the daily spend ledger.
// The store is outside the project (~/.vibe-kit/providers.json) so a project file can never name another address or hold a key.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { vaultKind, vaultSave, vaultRead, vaultDelete } from './keystore.mjs';

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
  const part = (name) => (isObject(s?.[name]) ? s[name] : {});
  return { keys: part('keys'), limits: part('limits'), spend: part('spend'), keyMeta: part('keyMeta'), modelSpend: part('modelSpend'), catalog: part('catalog') };
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

// The key goes to the vault when the machine has one; providers.json then holds only the last four characters and the date.
// A vault that cannot open is an error, not a reason to fall back to a plain file.
export function setKey(provider, key, file = storePath()) {
  if (!isProvider(provider)) return `Unknown provider: ${provider}. Use one of: ${Object.keys(PROVIDERS).join(', ')}`;
  if (!keyFormatOk(provider, key)) return `This does not look like a ${provider} key. Nothing was saved.`;
  const kind = vaultKind();
  if (kind) {
    try { vaultSave(provider, key); } catch { return 'The key vault could not be opened. Nothing was saved.'; }
  }
  try {
    update(file, (s) => {
      if (kind) delete s.keys[provider]; else s.keys[provider] = key;
      s.keyMeta[provider] = { last4: key.slice(-4), addedAt: new Date().toISOString(), source: kind ? 'vault' : 'plain' };
    });
  } catch {
    if (kind) { try { vaultDelete(provider); } catch { /* nothing more to undo */ } }
    return 'The key store could not be written. Nothing was saved.';
  }
  return null;
}

// Returns an error text when the vault entry could not be removed, else null
// A vault that will not delete leaves the metadata, so the panel still shows that a key exists
export function removeKey(provider, file = storePath()) {
  if (vaultKind()) {
    try { vaultDelete(provider); } catch { return 'The key vault could not be opened; the key was not removed.'; }
  }
  const s = readStore(file);
  if (Object.hasOwn(s.keys, provider) || Object.hasOwn(s.keyMeta, provider)) update(file, (x) => { delete x.keys[provider]; delete x.keyMeta[provider]; });
  return null;
}

// Metadata, a plain entry or the provider's variable: the vault is never opened, so listing and checking cost nothing
export function hasKey(provider, { file = storePath(), env = process.env } = {}) {
  if (!isProvider(provider)) return false;
  const s = readStore(file);
  return isObject(s.keyMeta[provider]) || keyFormatOk(provider, s.keys[provider]) || keyFormatOk(provider, env[PROVIDERS[provider].env]);
}

export function keyInfo(provider, { file = storePath(), env = process.env } = {}) {
  const none = { present: false, last4: null, addedAt: null, source: null, protected: false };
  if (!isProvider(provider)) return none;
  const s = readStore(file);
  const meta = s.keyMeta[provider];
  const plain = s.keys[provider], fromEnv = env[PROVIDERS[provider].env];
  if (isObject(meta)) {
    const vault = meta.source === 'vault';
    return { present: true, last4: String(meta.last4 ?? ''), addedAt: typeof meta.addedAt === 'string' ? meta.addedAt : null, source: vault ? 'vault' : 'plain', protected: vault };
  }
  if (keyFormatOk(provider, plain)) return { present: true, last4: plain.slice(-4), addedAt: null, source: 'plain', protected: false };
  if (keyFormatOk(provider, fromEnv)) return { present: true, last4: fromEnv.slice(-4), addedAt: null, source: 'env', protected: false };
  return none;
}

// One address per provider, in code. 200 is valid, 401 and 403 are a refused key, anything else proves nothing. Spends nothing.
const CHECK_URL = { openrouter: 'https://openrouter.ai/api/v1/key', deepseek: 'https://api.deepseek.com/user/balance', kimi: 'https://api.moonshot.ai/v1/models' };
export async function checkKey(provider, { key, fetchImpl = fetch } = {}) {
  if (!keyFormatOk(provider, key)) return 'invalid';
  try {
    const res = await fetchImpl(CHECK_URL[provider], { method: 'GET', headers: { authorization: `Bearer ${key}` }, redirect: 'error', signal: AbortSignal.timeout(10000) });
    try { await res.body?.cancel(); } catch { /* nothing to read */ }
    return res.status === 200 ? 'valid' : res.status === 401 || res.status === 403 ? 'invalid' : 'unverified';
  } catch {
    return 'unverified';
  }
}

export function setLimit(provider, usdPerDay, file = storePath()) {
  if (!isProvider(provider)) return `Unknown provider: ${provider}`;
  if (!(typeof usdPerDay === 'number' && Number.isFinite(usdPerDay) && usdPerDay > 0)) return 'The daily limit must be a positive number of dollars.';
  update(file, (s) => { s.limits[provider] = usdPerDay; });
  return null;
}

export const today = (d = new Date()) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const spentOn = (provider, day = today(), file = storePath()) => Number(readStore(file).spend[provider]?.[day]) || 0;

// A spend that is not a finite, non-negative number is refused: NaN or a negative would hide real spend from the daily limit
const goodUsd = (usd) => typeof usd === 'number' && Number.isFinite(usd) && usd >= 0;
export function addSpend(provider, usd, day = today(), file = storePath()) {
  if (!goodUsd(usd)) return;
  update(file, (s) => {
    const days = isObject(s.spend[provider]) ? s.spend[provider] : {};
    s.spend[provider] = { ...days, [day]: (Number(days[day]) || 0) + usd };
  });
}

// Per model and day, from the proxy's own count: modelKey is provider/model. Runs and the price flag let the panel show a model without the run log.
export function addModelSpend(modelKey, { usd = 0, input = 0, output = 0, seconds = 0, priceKnown = false } = {}, day = today(), file = storePath()) {
  if (!goodUsd(usd)) return;
  update(file, (s) => {
    const days = isObject(s.modelSpend[modelKey]) ? s.modelSpend[modelKey] : {};
    const old = isObject(days[day]) ? days[day] : null;
    const add = (field, n) => (Number(old?.[field]) || 0) + (Number(n) || 0);
    s.modelSpend[modelKey] = { ...days, [day]: { usd: add('usd', usd), input: add('input', input), output: add('output', output), seconds: add('seconds', seconds), runs: add('runs', 1), priceKnown: (old ? old.priceKnown === true : true) && priceKnown === true } };
  });
}

const amount = (x) => typeof x === 'number' && Number.isFinite(x) && x >= 0;
// USD per million tokens: 0 or 0.001 to 1000 (the dearest models cost well under that). A price under 0.001 is not a real one and would hide spend. 0 for both is believable only for a model id that ends in :free.
export function validPrice(price, model) {
  if (!isObject(price)) return false;
  const { input, output } = price;
  const fits = (x) => amount(x) && x <= 1000 && (x === 0 || x >= 0.001);
  if (!fits(input) || !fits(output)) return false;
  return input > 0 || output > 0 || (typeof model === 'string' && model.endsWith(':free'));
}
export function addCatalog(provider, entry, file = storePath()) {
  if (!isProvider(provider)) return 'Unknown provider.';
  if (!isObject(entry) || typeof entry.model !== 'string' || !MODEL_ID.test(entry.model)) return 'This is not a valid model id.';
  if (!validPrice(entry, entry.model)) return 'Each price must be 0 or a number from 0.001 to 1000 dollars per million tokens, and 0 for both only for a model id ending in :free.';
  if (!amount(entry.context)) return 'The context size must be a number of zero or more.';
  update(file, (s) => {
    s.catalog[provider] = { ...(isObject(s.catalog[provider]) ? s.catalog[provider] : {}), [entry.model]: { input: entry.input, output: entry.output, context: entry.context } };
  });
  return null;
}

export function removeCatalog(provider, model, file = storePath()) {
  const models = readStore(file).catalog[provider];
  if (!isObject(models) || !Object.hasOwn(models, model)) return;
  update(file, (s) => { delete s.catalog[provider][model]; });
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

// The vault first, then the provider's own variable. A plain entry counts only on a machine with no vault.
// A vault that cannot open falls through to the variable. A key that does not match the provider is never returned, so it cannot be sent to the wrong one.
export function resolveKey(provider, { file = storePath(), env = process.env } = {}) {
  if (!isProvider(provider)) return null;
  let stored = null;
  if (vaultKind()) { try { stored = vaultRead(provider); } catch { /* falls to the variable */ } } else stored = readStore(file).keys[provider];
  if (keyFormatOk(provider, stored)) return stored;
  const fromEnv = env[PROVIDERS[provider].env];
  return keyFormatOk(provider, fromEnv) ? fromEnv : null;
}
