// External model providers (docs/workflow/models.md): the user's own provider names, the sealed key and address, the daily spend ledger.
// The store (~/.vibe-kit/providers.json) holds no key, and the address in it is for display only: the address that counts is sealed with the key in the vault.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { vaultKind, vaultSave, vaultRead, vaultDelete } from './keystore.mjs';
import { renameWithRetry } from './shared.mjs';

export const MODEL_ID = /^[A-Za-z0-9~][\w.~:/-]*$/;
export const EFFORTS = ['low', 'medium', 'high', 'xhigh'];

// A name becomes an object key and, on Windows, a file name
const RESERVED = /^(?:constructor|prototype|tostring|valueof|con|prn|aux|nul|com[1-9]|lpt[1-9])$/;
export const isProvider = (name) => typeof name === 'string' && /^[a-z][a-z0-9-]{0,31}$/.test(name) && !RESERVED.test(name);
// One rule for every provider: it keeps header injection out, and a short key out of the replaceAll that hides it in a reply
export const keyOk = (key) => typeof key === 'string' && /^[\x21-\x7e]{16,512}$/.test(key);
export const storePath = () => path.join(os.homedir(), '.vibe-kit', 'providers.json');

export function parseProviderUrl(text) {
  if (typeof text !== 'string' || text.length > 200 || /[?#]/.test(text)) return null;
  let u;
  try { u = new URL(text.trim()); } catch { return null; }
  if (u.protocol !== 'https:' || u.username || u.password || !u.hostname) return null;
  return { url: `${u.origin}${u.pathname.replace(/\/+$/, '')}`, host: u.host };
}

// These send TLS or the proxy route somewhere else, so a key must not travel under them
const UNSAFE_ENV = ['NODE_TLS_REJECT_UNAUTHORIZED', 'NODE_EXTRA_CA_CERTS', 'SSL_CERT_FILE', 'SSL_CERT_DIR', 'NODE_USE_ENV_PROXY', 'OPENSSL_CONF', 'OPENSSL_MODULES'];
export const unsafeEnv = (env = process.env) => UNSAFE_ENV.filter((name) => Object.keys(env).some((k) => k.toUpperCase() === name && env[k])); // Windows ignores the case of a name

const isObject = (x) => x && typeof x === 'object' && !Array.isArray(x);
export function readStore(file = storePath()) {
  let s = null;
  try { s = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* none yet, or broken */ }
  const part = (name) => (isObject(s?.[name]) ? s[name] : {});
  return { limits: part('limits'), spend: part('spend'), keyMeta: part('keyMeta'), modelSpend: part('modelSpend'), catalog: part('catalog') };
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
    renameWithRetry(tmp, file);
    fs.chmodSync(file, 0o600);
  } finally {
    fs.rmSync(lock, { force: true });
  }
}

// A store from an older kit may hold keys in plain text: rewriting it drops them, because readStore does not carry that field
export function purgePlainKeys(file = storePath()) {
  let raw;
  try { raw = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return; }
  if (!isObject(raw) || !Object.hasOwn(raw, 'keys')) return;
  update(file, () => {});
  console.error('An old key in a plain file was removed. Replace it at the provider: treat it as exposed.');
}

// Address and key travel as one sealed value, so the key only ever goes to the address it was entered with.
// To point it elsewhere, someone must open the vault or type the key again. A file edit is not enough.
const seal = (url, key) => Buffer.from(JSON.stringify({ url, key })).toString('base64url');
function unseal(text) {
  try {
    const { url, key } = JSON.parse(Buffer.from(String(text), 'base64url').toString('utf8'));
    return typeof url === 'string' && parseProviderUrl(url)?.url === url && keyOk(key) ? { url, key } : null;
  } catch {
    return null;
  }
}

// No vault, or one that cannot open, means nothing is saved: there is no plain file to fall back to
export function setProvider(name, url, key, file = storePath()) {
  if (!isProvider(name)) return `Invalid provider name: use lower case letters, digits and "-", starting with a letter.`;
  const parsed = parseProviderUrl(url);
  if (!parsed) return 'The address must be https, at most 200 characters, with no user name, query or fragment. Nothing was saved.';
  if (!keyOk(key)) return 'This does not look like a key. Nothing was saved.';
  if (!vaultKind()) return 'This machine has no key vault, so the key cannot be stored safely. Nothing was saved.';
  try { vaultSave(name, seal(parsed.url, key)); } catch { return 'The key vault could not be opened. Nothing was saved.'; }
  try {
    update(file, (s) => { s.keyMeta[name] = { addedAt: new Date().toISOString(), host: parsed.host }; });
  } catch {
    try { vaultDelete(name); } catch { /* nothing more to undo */ }
    return 'The key store could not be written. Nothing was saved.';
  }
  return null;
}

// The one way to a key. An old entry with no sealed address gives null: it must be entered again.
export function readProvider(name) {
  if (!isProvider(name) || !vaultKind()) return null;
  try { return unseal(vaultRead(name)); } catch { return null; }
}

// Returns an error text when the vault entry could not be removed, else null
// A vault that will not delete leaves the metadata, so the panel still shows that a key exists
export function removeKey(provider, file = storePath()) {
  if (vaultKind()) {
    try { vaultDelete(provider); } catch { return 'The key vault could not be opened; the key was not removed.'; }
  }
  const s = readStore(file);
  if (Object.hasOwn(s.keyMeta, provider)) update(file, (x) => { delete x.keyMeta[provider]; });
  return null;
}

// Metadata only: the vault is never opened, so listing and showing cost nothing and the panel needs no vault
export function hasKey(provider, { file = storePath() } = {}) {
  return isProvider(provider) && Boolean(isObject(readStore(file).keyMeta[provider]));
}

// host is for display: the store can be edited, and only the sealed address is used
export function keyInfo(provider, { file = storePath() } = {}) {
  const meta = isProvider(provider) ? readStore(file).keyMeta[provider] : null;
  if (!isObject(meta)) return { present: false, addedAt: null, host: null };
  return { present: true, addedAt: typeof meta.addedAt === 'string' ? meta.addedAt : null, host: typeof meta.host === 'string' ? meta.host : null };
}

// Every name the user has used, with or without a key
export function providerNames(file = storePath()) {
  const s = readStore(file);
  return [...new Set([...Object.keys(s.keyMeta), ...Object.keys(s.catalog), ...Object.keys(s.limits)])].filter(isProvider).sort();
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
  // Prices are optional; given, both must pass. A run with no price says so and uses the high default.
  const priced = (entry.input ?? entry.output ?? null) !== null;
  if (priced && !validPrice(entry, entry.model)) return 'Each price must be 0 or a number from 0.001 to 1000 dollars per million tokens, and 0 for both only for a model id ending in :free.';
  if ((entry.context ?? null) !== null && !amount(entry.context)) return 'The context size must be a number of zero or more.';
  update(file, (s) => {
    s.catalog[provider] = { ...(isObject(s.catalog[provider]) ? s.catalog[provider] : {}), [entry.model]: { ...(priced ? { input: entry.input, output: entry.output } : {}), ...((entry.context ?? null) !== null ? { context: entry.context } : {}) } };
  });
  return null;
}

export function removeCatalog(provider, model, file = storePath()) {
  const models = readStore(file).catalog[provider];
  if (!isObject(models) || !Object.hasOwn(models, model)) return;
  update(file, (s) => { delete s.catalog[provider][model]; });
}

// The limit is optional: none means no check. With one, an unreadable store is a no, unlike readStore: a ledger that cannot be read must not look like a day with no spend
export function spendAllowed(provider, limit, day = today(), file = storePath()) {
  if (limit === undefined) return true;
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
