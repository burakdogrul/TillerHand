// The panel's update button: reads each ready-made provider's model list and keeps it in ~/.vibe-kit/model-lists.json.
// A list URL comes only from PRESETS. A key goes only to the origin it was sealed with, and a list that fails leaves the saved one as it was.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { renameWithRetry } from './shared.mjs';
import { MODEL_ID, readProvider, unsafeEnv } from './providers.mjs';
import { PRESETS } from './provider-presets.mjs';

const TIMEOUT_MS = 20000;
const MAX_BYTES = 8 * 1024 * 1024;
const isObject = (x) => Boolean(x) && typeof x === 'object' && !Array.isArray(x);
export const listsPath = () => path.join(os.homedir(), '.vibe-kit', 'model-lists.json');

export function readModelLists(file = listsPath()) {
  try {
    const saved = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (!isObject(saved)) return {};
    const valid = (m) => isObject(m) && typeof m.id === 'string' && MODEL_ID.test(m.id);
    return Object.fromEntries(Object.entries(saved).filter(([, v]) => isObject(v) && Array.isArray(v.models)).map(([name, v]) => [name, { ...v, models: v.models.filter(valid) }]));
  } catch {
    return {};
  }
}

const perMillion = (x) => Math.round(Number(x) * 1e6 * 10000) / 10000;

// The list comes from outside: an entry that does not fit is dropped, and the rest still count
function rows(data, known, secret) {
  const out = new Map();
  for (const item of data) {
    if (!isObject(item) || typeof item.id !== 'string' || !MODEL_ID.test(item.id) || item.id.endsWith(':batch')) continue;
    if (secret && (item.id.includes(secret) || item.id.includes(encodeURIComponent(secret)))) continue; // a list that echoes the key must not save it
    if (Array.isArray(item.supported_parameters) && !item.supported_parameters.includes('tools')) continue;
    const preset = known.find((m) => m.id === item.id);
    const row = { id: item.id };
    if (isObject(item.pricing)) {
      const input = perMillion(item.pricing.prompt), output = perMillion(item.pricing.completion);
      if (!(Number.isFinite(input) && Number.isFinite(output) && input >= 0 && output >= 0)) continue;
      Object.assign(row, { input, output });
    } else if (preset?.input !== undefined) {
      Object.assign(row, { input: preset.input, output: preset.output });
    }
    const context = item.context_length ?? preset?.context;
    if (Number.isFinite(context) && context > 0) row.context = context;
    out.set(row.id, row);
  }
  return [...out.values()];
}

async function fetchList(name, preset, fetchImpl) {
  const headers = {};
  let secret = null;
  if (preset.listNeedsKey) {
    if (unsafeEnv().length) return { code: 'unsafeEnv' };
    const sealed = readProvider(name);
    if (!sealed) return { code: 'noKey' };
    if (new URL(preset.listUrl).origin !== new URL(sealed.url).origin) return { code: 'otherHost' };
    secret = sealed.key;
    headers.authorization = `Bearer ${secret}`;
  }
  let res, text;
  try {
    res = await fetchImpl(preset.listUrl, { headers, redirect: 'error', signal: AbortSignal.timeout(TIMEOUT_MS) });
    // shortcut: the whole reply is read before the size check, the host is one fixed in PRESETS; stream it if a list URL ever comes from elsewhere
    text = await res.text();
  } catch {
    return { code: 'network' };
  }
  if (res.status === 401 || res.status === 403) return { code: 'auth' };
  if (res.status === 429) return { code: 'rate' };
  if (!res.ok || text.length > MAX_BYTES) return { code: 'other' };
  let body;
  try { body = JSON.parse(text); } catch { return { code: 'other' }; }
  if (!Array.isArray(body?.data)) return { code: 'other' }; // some hosts answer an auth failure with 200
  const models = rows(body.data, preset.models, secret);
  return models.length ? { code: 'ok', models } : { code: 'other' };
}

export async function updateModelLists({ fetchImpl = fetch, file = listsPath() } = {}) {
  const lists = readModelLists(file);
  const entries = await Promise.all(Object.entries(PRESETS).map(async ([name, preset]) => {
    const r = await fetchList(name, preset, fetchImpl).catch(() => ({ code: 'other' }));
    if (r.code !== 'ok') return [name, { ok: false, code: r.code, count: lists[name]?.models?.length ?? 0, added: 0 }];
    const before = new Set((lists[name]?.models ?? preset.models).map((m) => m.id));
    lists[name] = { at: new Date().toISOString(), models: r.models };
    return [name, { ok: true, code: 'ok', count: r.models.length, added: r.models.filter((m) => !before.has(m.id)).length }];
  }));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(lists), { mode: 0o600 });
  renameWithRetry(tmp, file);
  return { results: Object.fromEntries(entries) };
}
