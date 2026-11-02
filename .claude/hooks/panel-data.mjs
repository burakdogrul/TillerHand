// What the panel shows: Claude usage (ccusage rows) and external model spend, by date range. Pure functions: no file, no clock of their own.
// Claude USD is an API-equivalent figure on a subscription and external USD is real spend, so the two are never added together.

const pad = (n) => String(n).padStart(2, '0');
const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
// Built from the local calendar parts, so a day that is 23 or 25 hours long (clock change) still counts as one
const shift = (d, days) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + days);

// Local time. A week runs Monday to Sunday.
export function rangeOf(kind, now = Date.now()) {
  const today = new Date(now);
  const monday = shift(today, -((today.getDay() + 6) % 7));
  if (kind === 'thisWeek') return { from: ymd(monday), to: ymd(shift(monday, 6)) };
  if (kind === 'lastWeek') return { from: ymd(shift(monday, -7)), to: ymd(shift(monday, -1)) };
  if (kind === 'days30') return { from: ymd(shift(today, -29)), to: ymd(today) };
  return { from: ymd(today), to: ymd(today) };
}

const isObject = (x) => Boolean(x) && typeof x === 'object' && !Array.isArray(x);
const num = (x) => (typeof x === 'number' && Number.isFinite(x) ? x : 0);
const inRange = (date, { from, to }) => typeof date === 'string' && date >= from && date <= to;
// claude-opus-4-5-20251101 → opus, claude-3-5-sonnet-20241022 → sonnet. Anything else (gpt-5, <synthetic>) is not Claude.
const familyOf = (name) => (typeof name === 'string' && /^claude-/i.test(name) ? name.toLowerCase().split('-').slice(1).find((part) => /^[a-z]+$/.test(part)) ?? null : null);

export function claudeUsage(daily, range) {
  const days = new Map();
  const byModel = {};
  for (const row of Array.isArray(daily) ? daily : []) {
    if (!isObject(row) || !inRange(row.date, range) || !Array.isArray(row.modelBreakdowns)) continue;
    for (const b of row.modelBreakdowns) {
      const family = isObject(b) ? familyOf(b.modelName) : null;
      if (!family) continue;
      const usd = num(b.cost), input = num(b.inputTokens), output = num(b.outputTokens), cache = num(b.cacheCreationTokens) + num(b.cacheReadTokens);
      const day = days.get(row.date) ?? { date: row.date, models: {}, usd: 0, tokens: 0 };
      day.models[family] = (day.models[family] ?? 0) + usd;
      day.usd += usd;
      day.tokens += input + output + cache;
      days.set(row.date, day);
      const m = byModel[family] ?? { usd: 0, input: 0, output: 0, cache: 0 };
      byModel[family] = { usd: m.usd + usd, input: m.input + input, output: m.output + output, cache: m.cache + cache };
    }
  }
  const byDay = [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
  const tokens = Object.values(byModel).reduce((t, m) => ({ input: t.input + m.input, output: t.output + m.output, cache: t.cache + m.cache }), { input: 0, output: 0, cache: 0 });
  return { usd: byDay.reduce((sum, d) => sum + d.usd, 0), tokens: { ...tokens, total: tokens.input + tokens.output + tokens.cache }, byModel, byDay };
}

// One entry per provider/model; rows are { day, usd, input, output, runs, seconds, priceKnown, jobs }
function collect(rows) {
  const models = new Map();
  for (const r of rows) {
    const m = models.get(r.key) ?? { key: r.key, provider: r.key.split('/')[0], usd: 0, input: 0, output: 0, runs: 0, seconds: 0, jobs: [], priceKnown: true, byDay: {} };
    m.usd += r.usd; m.input += r.input; m.output += r.output; m.runs += r.runs; m.seconds += r.seconds;
    m.priceKnown = m.priceKnown && r.priceKnown;
    for (const job of r.jobs) if (!m.jobs.includes(job)) m.jobs.push(job);
    m.byDay[r.day] = (m.byDay[r.day] ?? 0) + r.usd;
    models.set(r.key, m);
  }
  const list = [...models.values()].sort((a, b) => b.usd - a.usd);
  return { usd: list.reduce((sum, m) => sum + m.usd, 0), models: list };
}

// lines: role-runs.jsonl objects. A run counts on its local day.
export function externalFromRuns(lines, range) {
  const rows = [];
  for (const l of Array.isArray(lines) ? lines : []) {
    if (!isObject(l) || typeof l.provider !== 'string' || typeof l.model !== 'string') continue;
    const at = new Date(l.date);
    if (Number.isNaN(at.getTime())) continue;
    const day = ymd(at);
    if (!inRange(day, range)) continue;
    rows.push({ key: `${l.provider}/${l.model}`, day, usd: num(l.usd), input: num(l.input), output: num(l.output), runs: 1, seconds: num(l.seconds), priceKnown: l.priceKnown === true, jobs: typeof l.job === 'string' ? [l.job] : [] });
  }
  return collect(rows);
}

// store: readStore() of providers.mjs. The store keeps no job names.
export function externalFromStore(store, range) {
  const rows = [];
  for (const [key, days] of Object.entries(isObject(store?.modelSpend) ? store.modelSpend : {})) {
    if (!isObject(days)) continue;
    for (const [day, d] of Object.entries(days)) {
      if (!isObject(d) || !inRange(day, range)) continue;
      rows.push({ key, day, usd: num(d.usd), input: num(d.input), output: num(d.output), runs: num(d.runs), seconds: num(d.seconds), priceKnown: d.priceKnown === true, jobs: [] });
    }
  }
  return collect(rows);
}
