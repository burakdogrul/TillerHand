// The panel's Try button: one fixed question and one tool call to a model, with the sealed key and address.
// Nothing from the caller reaches the provider but the model id, and the key never leaves this file: the result holds a code, not the reply.
import { MODEL_ID, isProvider, readProvider, readStore, spendAllowed, addSpend, storePath, today, unsafeEnv, validPrice } from './providers.mjs';
import { DEFAULT_PRICE, costOf, scrub } from './run-role.mjs';

const TIMEOUT_MS = 30000;
const DETAIL_MAX = 160;
const PING = { name: 'ping', description: 'Connection check.', input_schema: { type: 'object', properties: {} } };
const QUESTION = 'This is a connection check. Call the ping tool once.';

function failCode(status, text) {
  if (status === 401 || status === 403) return 'auth';
  if (status === 402) return 'balance';
  if (status === 429) return 'rate';
  if (status === 404 || (status === 400 && /model/i.test(text))) return 'model';
  return 'other';
}
function errorText(text) {
  try { return String(JSON.parse(text)?.error?.message ?? text); } catch { return text; }
}

export async function testModel({ provider, model, fetchImpl = fetch, file = storePath() }) {
  const started = Date.now();
  const done = (fields) => ({ ok: false, tools: false, usd: 0, seconds: (Date.now() - started) / 1000, ...fields });
  if (!isProvider(provider) || typeof model !== 'string' || !MODEL_ID.test(model)) return done({ code: 'badRequest' });
  if (unsafeEnv().length) return done({ code: 'unsafeEnv' });
  const sealed = readProvider(provider);
  if (!sealed) return done({ code: 'noKey' });
  const store = readStore(file);
  const saved = Number(store.limits[provider]);
  if (!spendAllowed(provider, saved > 0 ? saved : undefined, today(), file)) return done({ code: 'limit' });

  let res, text;
  try {
    res = await fetchImpl(`${sealed.url}/v1/messages`, {
      method: 'POST',
      redirect: 'error', // the key is never carried to another address
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { authorization: `Bearer ${sealed.key}`, 'content-type': 'application/json', 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: 256, messages: [{ role: 'user', content: QUESTION }], tools: [PING] }),
    });
    text = await res.text();
  } catch {
    return done({ code: 'network' });
  }
  // A reply can echo the key, as it is or encoded
  const forms = [sealed.key, encodeURIComponent(sealed.key), JSON.stringify(sealed.key).slice(1, -1)];
  if (!res.ok) return done({ code: failCode(res.status, text), status: res.status, detail: scrub(errorText(text), forms).slice(0, DETAIL_MAX) });

  let body;
  try { body = JSON.parse(text); } catch { return done({ code: 'other', status: res.status }); }
  const known = store.catalog[provider]?.[model];
  const cost = costOf(body?.usage ?? {}, validPrice(known, model) ? known : DEFAULT_PRICE);
  const usd = Number.isFinite(cost) && cost > 0 ? cost : 0; // the usage comes from outside: it must not shrink the ledger
  addSpend(provider, usd, today(), file);
  const tools = Array.isArray(body?.content) && body.content.some((block) => block?.type === 'tool_use');
  return done({ ok: tools, code: tools ? 'ok' : 'noTools', tools, usd, status: res.status });
}
