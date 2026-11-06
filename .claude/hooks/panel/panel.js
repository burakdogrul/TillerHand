// The model panel page. Every text comes from state.strings and every value goes in as text, never as markup: files and outside lists are untrusted.
// Claude USD (API equivalent) and external USD (real spend) are shown apart and never added together.
'use strict';
(() => {
  const THEME_KEY = 'vk-panel-theme', FOLD_KEY = 'vk-panel-folded';
  const COMMAND = 'node .claude/hooks/models-panel.mjs';
  const SVG = 'http://www.w3.org/2000/svg';
  const MODEL_ID = /^[A-Za-z0-9~][\w.~:/-]*$/;
  const STALE_DATA = 24 * 3600e3, STALE_LIMIT = 3600e3, AUTO_REFRESH = 15 * 60e3;

  const store = {
    get(k) { try { return localStorage.getItem(k); } catch { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch { /* blocked storage: the choice lasts until the page closes */ } },
  };
  function applyTheme(v) {
    if (v === 'light' || v === 'dark') document.documentElement.dataset.theme = v;
    else delete document.documentElement.dataset.theme;
  }
  applyTheme(store.get(THEME_KEY)); // before the first paint, so a saved theme does not flash

  // The session secret: the token page carries it once in a meta tag. It moves to sessionStorage (this tab only), the tag goes,
  // and the address goes back to /. It is sent as a header on every /api call; it is never a cookie and never in an address.
  const SESSION_KEY = 'vk-panel-session';
  let secret = null;
  try {
    const tag = document.querySelector('meta[name="panel-session"]');
    if (tag) {
      secret = tag.content || null;
      tag.remove();
      history.replaceState(null, '', '/');
    }
  } catch { /* no history API: the secret still works for this page */ }
  try {
    if (secret) sessionStorage.setItem(SESSION_KEY, secret);
    else secret = sessionStorage.getItem(SESSION_KEY);
  } catch { /* blocked storage: a reload ends the session, and the server says how to open it again */ }

  let S = null; // the last /api/state
  let side = { today: null, lastWeek: null };
  let draft = {}; // { job: value | null } not saved yet
  let consented = false; // the box in the save bar: one answer per save
  let saving = false, pollTimer = null, toastTimer = null, keyWatch = null, stopped = false;
  const refreshTried = new Set();
  const extColors = new Map();
  const ui = { tab: 'usage', range: 'thisWeek', scope: 'project', source: 'claude', unit: 'usd', q: '', level: 'all', wiz: { step: 1, pick: null, name: '', q: '' }, tests: {}, updating: false, listResult: null };
  let folded = new Set();
  try { folded = new Set(JSON.parse(store.get(FOLD_KEY) ?? '[]')); } catch { /* unreadable: nothing folded */ }
  let observers = [], rows = new Map(), els = {};

  // ---- small helpers
  function fill(text, vars) { return vars ? text.replace(/\{(\w+)\}/g, (m, k) => (Object.hasOwn(vars, k) ? String(vars[k]) : m)) : text; }
  const T = (key, vars) => fill(S?.strings?.[key] ?? key, vars);
  const Tn = (key, count) => { const cat = new Intl.PluralRules(S.locale).select(count); return T(S.strings[`${key}.${cat}`] !== undefined ? `${key}.${cat}` : `${key}.other`, { count: fmt.num(count) }); };

  function h(tag, props, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(props ?? {})) {
      if (v === undefined || v === null || v === false) continue;
      if (k === 'class') el.className = v;
      else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
      else if (['value', 'disabled', 'hidden', 'checked', 'selected', 'required'].includes(k)) el[k] = v;
      else el.setAttribute(k, v === true ? '' : v);
    }
    el.append(...kids.flat(Infinity).filter((x) => x !== null && x !== undefined && x !== false));
    return el;
  }
  function s(tag, attrs, ...kids) {
    const el = document.createElementNS(SVG, tag);
    for (const [k, v] of Object.entries(attrs ?? {})) if (v !== undefined && v !== null) el.setAttribute(k, v);
    el.append(...kids);
    return el;
  }
  const clip = (x) => { const t = String(x).replace(/[\p{Cc}\p{Zl}\p{Zp}]/gu, ' '); return t.length > 40 ? `${t.slice(0, 40)}...` : t; };
  const cap = (x) => x.charAt(0).toUpperCase() + x.slice(1);
  const lower = (x) => String(x).toLocaleLowerCase(S.locale);
  const pretty = (v) => { const p = splitValue(v); return p.effort ? `${p.model} · ${p.effort}` : T('panel.jobs.mainOption'); };
  const providerName = (p) => p;

  const fmt = {
    num: (n) => new Intl.NumberFormat(S.locale).format(n),
    usd(n) {
      const small = n !== 0 && Math.abs(n) < 1;
      return new Intl.NumberFormat(S.locale, { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: small ? 4 : 2 }).format(n);
    },
    // Claude USD is an API equivalent, never a bill: the sign and its place come from the language file
    approx: (n) => T('panel.usage.approx', { amount: fmt.usd(n) }),
    usdTick: (n) => new Intl.NumberFormat(S.locale, { style: 'currency', currency: 'USD', notation: 'compact', maximumFractionDigits: 2 }).format(n),
    short: (n) => new Intl.NumberFormat(S.locale, { notation: 'compact', maximumFractionDigits: 1 }).format(n),
    pct: (n) => new Intl.NumberFormat(S.locale, { style: 'percent', maximumFractionDigits: 0 }).format(n / 100),
    day(ymd, opts = { day: 'numeric', month: 'short' }) { const [y, m, d] = ymd.split('-').map(Number); return new Date(y, m - 1, d).toLocaleDateString(S.locale, opts); },
    when: (ms) => new Date(ms).toLocaleString(S.locale, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }),
    date(x) { const d = new Date(x); return Number.isNaN(d.getTime()) ? clip(x) : d.toLocaleDateString(S.locale, { day: 'numeric', month: 'long', year: 'numeric' }); },
    ago(ms) {
      const rtf = new Intl.RelativeTimeFormat(S.locale, { numeric: 'auto' });
      const mins = Math.round((Date.now() - ms) / 60000);
      if (mins < 60) return rtf.format(-mins, 'minute');
      if (mins < 48 * 60) return rtf.format(-Math.round(mins / 60), 'hour');
      return rtf.format(-Math.round(mins / 1440), 'day');
    },
    span(seconds) {
      const unit = (v, u) => new Intl.NumberFormat(S.locale, { style: 'unit', unit: u, unitDisplay: 'short' }).format(v);
      const total = Math.round(seconds);
      if (total < 60) return unit(total, 'second');
      const hours = Math.floor(total / 3600), mins = Math.round((total % 3600) / 60);
      return hours ? `${unit(hours, 'hour')} ${unit(mins, 'minute')}` : unit(mins, 'minute');
    },
  };

  // Local calendar, a week runs Monday to Sunday: same as rangeOf in panel-data.mjs
  const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const shift = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  function daysOfRange(kind) {
    const today = new Date(), monday = shift(today, -((today.getDay() + 6) % 7));
    const [from, count] = kind === 'thisWeek' ? [monday, 7] : kind === 'lastWeek' ? [shift(monday, -7), 7] : kind === 'days30' ? [shift(today, -29), 30] : [today, 1];
    return Array.from({ length: count }, (_, i) => ymd(shift(from, i)));
  }

  // ---- server
  async function api(method, url, body) {
    let r;
    try {
      // With no secret the request still goes out: the server answers 401 with the text that says the session ended
      r = await fetch(url, { method, headers: { ...(secret ? { 'x-panel-session': secret } : {}), ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    } catch {
      gone();
      return { ok: false, status: 0, data: {} };
    }
    let data = {};
    try { data = await r.json(); } catch { /* no JSON body */ }
    if (r.status === 401) { gone(data.message); return { ok: false, status: 401, data }; }
    return { ok: r.ok, status: r.status, data };
  }
  const stateUrl = (range = ui.range) => `/api/state?range=${range}&scope=${ui.scope}`;

  // Today and last week are read only when the scope changes: each state costs the server a moment, and a range click should feel instant
  async function load({ rebase = false, withSide = false } = {}) {
    const [a, b, c] = await Promise.all([api('GET', stateUrl()), withSide ? api('GET', stateUrl('today')) : null, withSide ? api('GET', stateUrl('lastWeek')) : null]);
    if (stopped) return false;
    if (!a.ok) { if (!S) gone(a.data.message ?? (a.status ? `HTTP ${a.status}` : undefined)); return false; }
    const prev = S;
    S = a.data;
    // Unsaved choices stay measured against the file they were started from, so a change elsewhere is still caught on save
    if (prev && !rebase && dirty()) { S.version = prev.version; S.saved = prev.saved; }
    pruneDraft();
    if (withSide) side = { today: b.ok ? b.data.external : null, lastWeek: c.ok ? c.data.external : null };
    return true;
  }

  function startPoll() {
    if (pollTimer) return;
    pollTimer = setInterval(async () => {
      const r = await api('GET', stateUrl());
      if (stopped || !r.ok) { clearInterval(pollTimer); pollTimer = null; return; }
      Object.assign(S, { claude: r.data.claude, limits: r.data.limits, refreshing: r.data.refreshing });
      if (!S.refreshing) { clearInterval(pollTimer); pollTimer = null; }
      if (ui.tab === 'usage') renderTab();
    }, 3000);
  }
  async function refresh() {
    refreshTried.add(ui.scope);
    const r = await api('POST', '/api/refresh', { scope: ui.scope });
    if (!r.ok) return;
    S.refreshing = true;
    if (ui.tab === 'usage') renderTab();
    startPoll();
  }
  // The page opens on saved data at once and reads ccusage behind it
  function refreshIfOld() {
    if (refreshTried.has(ui.scope)) return;
    const read = Date.parse(S.claude.readAt ?? '');
    if (S.refreshing) startPoll();
    else if (Number.isNaN(read) || Date.now() - read > AUTO_REFRESH) refresh();
  }

  // ---- jobs: the same chain models.mjs walks
  const isRole = (name) => S.jobs.some((r) => r.name === name);
  const roleOf = (name) => { const head = name.split('.')[0]; return head === 'findings' || head === 'board' ? 'review' : head; };
  const savedOwn = (name) => (isRole(name) ? S.saved[name] : S.saved.tasks?.[name]);
  const own = (name) => (Object.hasOwn(draft, name) ? draft[name] ?? undefined : savedOwn(name));
  const hasKey = (p) => S.providers[p]?.keyInfo?.present === true;
  function parseExt(v) {
    if (typeof v !== 'string') return null;
    const colon = v.lastIndexOf(':'), slash = v.indexOf('/');
    if (slash < 1 || colon < slash) return null;
    const provider = v.slice(0, slash), model = v.slice(slash + 1, colon), effort = v.slice(colon + 1);
    return Object.hasOwn(S.providers, provider) && MODEL_ID.test(model) && S.choices.efforts.includes(effort) ? { provider, model, effort } : null;
  }
  function valid(job, v) {
    if (typeof v !== 'string') return false;
    if (v === 'main') return job === 'code.simple';
    const [model, effort, extra] = v.split(':');
    if (S.choices.models.includes(model) && extra === undefined && (S.choices.efforts.includes(effort) || (effort === 'max' && job !== 'main'))) return true;
    const e = parseExt(v);
    return Boolean(e) && hasKey(e.provider);
  }
  function resolve(job) {
    for (const link of [job, ...(S.choices.links[job] ?? [])]) {
      const c = own(link);
      if (c !== undefined && valid(job, c) && valid(link, c)) return { value: c, source: link };
    }
    return { value: S.recommended[job], source: 'recommended' };
  }
  function splitValue(v) {
    if (v === 'main') return { model: 'main', effort: null };
    const i = v.lastIndexOf(':');
    return { model: v.slice(0, i), effort: v.slice(i + 1) };
  }
  const dirty = () => Object.keys(draft).length > 0;
  const outsideDraft = () => Object.keys(draft).filter((n) => parseExt(own(n)));
  const blocked = () => outsideDraft().length > 0 && !consented;
  function pruneDraft() {
    for (const name of Object.keys(draft)) if ((draft[name] ?? undefined) === savedOwn(name)) delete draft[name];
  }
  function setOwn(name, value) {
    if ((value ?? undefined) === savedOwn(name)) delete draft[name];
    else draft[name] = value ?? null;
    els.saveErr?.replaceChildren();
    sync();
  }

  function externalKeys() {
    const keys = [];
    for (const [p, models] of Object.entries(S.catalog ?? {})) for (const m of Object.keys(models ?? {})) keys.push(`${p}/${m}`);
    const add = (v) => { const e = parseExt(v); if (e && !keys.includes(`${e.provider}/${e.model}`)) keys.push(`${e.provider}/${e.model}`); };
    for (const r of S.jobs) { add(savedOwn(r.name)); r.jobs.forEach((j) => add(savedOwn(j.name))); }
    return keys.sort();
  }
  const members = (head) => (head === 'findings.default' ? 'findings.' : 'board.');
  const groupOf = (role, prefix) => role.jobs.filter((j) => j.name.startsWith(prefix) && j.name !== `${prefix}default` && j.name !== 'board.commit').map((j) => j.name);
  const countable = (role) => role.jobs.map((j) => j.name).filter((n) => n !== 'main' && n !== 'board.commit');

  // ---- shell
  function gone(message) {
    stopped = true;
    clearInterval(pollTimer);
    draft = {};
    observers.forEach((o) => o.disconnect());
    const app = document.getElementById('app');
    app.removeAttribute('aria-busy');
    app.replaceChildren(h('main', { class: 'gone' },
      h('h1', {}, S ? T('panel.title') : ''),
      h('p', { role: 'alert' }, message ?? (S ? T('panel.goneNote', { minutes: 30 }) : '')),
      h('p', {}, h('code', {}, COMMAND))));
  }
  function toast(text) {
    const el = els.toast;
    if (!el) return;
    el.textContent = text;
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.remove('show'), 3200);
  }
  function ask({ title, body, items, ok, danger }) {
    return new Promise((resolve) => {
      const done = (v) => { d.close(); d.remove(); resolve(v); };
      const d = h('dialog', { 'aria-labelledby': 'dlgTitle' },
        h('h2', { id: 'dlgTitle' }, title), body && h('p', {}, body),
        items?.length ? h('ul', {}, items.map(([a, b]) => h('li', {}, h('span', {}, a), h('span', {}, b)))) : null,
        h('div', { class: 'dlgB' },
          h('button', { class: 'btn', type: 'button', onclick: () => done(false) }, T('panel.cancel')),
          h('button', { class: danger ? 'btn danger' : 'prim', type: 'button', onclick: () => done(true) }, ok)));
      d.addEventListener('cancel', (e) => { e.preventDefault(); done(false); });
      document.body.append(d);
      d.showModal();
    });
  }
  const notice = (kind, lead, text, ...extra) => h('div', { class: `notice ${kind}` }, h('span', {}, lead && h('b', {}, `${lead} `), text), extra);
  // The open tab lives in the address hash, always on the bare path: the address never holds the token or the session secret
  const setHash = (tab) => { try { history.replaceState(null, '', tab === 'usage' ? '/' : `/#${tab}`); } catch { /* no history API: the tab is just not remembered */ } };
  const goTo = (tab) => { ui.tab = tab; setHash(tab); renderTab(); window.scrollTo(0, 0); };
  const linkTo = (tab, key) => h('button', { class: 'btn', type: 'button', onclick: () => goTo(tab) }, T(key));

  function shell() {
    const app = document.getElementById('app');
    app.removeAttribute('aria-busy');
    document.documentElement.lang = S.lang;
    document.title = T('panel.title');
    els.tabs = {};
    const tabs = ['usage', 'jobs', 'providers'].map((id) => (els.tabs[id] = h('button', { class: 'tab', type: 'button', onclick: () => goTo(id) }, T(`panel.tab.${id}`))));
    const themeBtns = ['system', 'light', 'dark'].map((v) => h('button', { type: 'button', 'data-v': v, onclick: () => { store.set(THEME_KEY, v); applyTheme(v); markTheme(); } }, T(`panel.theme.${v}`)));
    function markTheme() {
      const now = document.documentElement.dataset.theme ?? 'system';
      themeBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === now)));
    }
    markTheme();
    els.view = h('main', { id: 'view' });
    els.count = h('b');
    els.saveNote = h('span', { class: 'saveNote' });
    els.saveErr = h('div', { class: 'saveErr', role: 'alert' });
    els.save = h('button', { class: 'prim', type: 'button', onclick: save }, T('panel.jobs.save'));
    els.discard = h('button', { class: 'sec', type: 'button', onclick: discard }, T('panel.jobs.discard'));
    els.consent = h('div', { class: 'saveConsent' });
    els.bar = h('div', { class: 'saveBar', role: 'region', 'aria-label': T('panel.jobs.saveBar') }, els.count, els.saveNote, h('span', { class: 'grow' }), els.discard, els.save, els.consent, els.saveErr);
    els.toast = h('div', { class: 'toast', role: 'status' });
    els.overrides = h('div');
    app.replaceChildren(
      h('header', { class: 'top' },
        h('div', { class: 'brand' }, h('i', { 'aria-hidden': 'true' }), T('panel.title')),
        h('nav', { 'aria-label': T('panel.title') }, tabs),
        h('div', { class: 'topR' },
          S.project ? h('span', { class: 'who', title: S.project }, S.project) : null,
          h('div', { class: 'themeSw', role: 'group', 'aria-label': T('panel.theme.label') }, themeBtns),
          h('button', { class: 'closeBtn', type: 'button', onclick: closePanel }, T('panel.close')))),
      els.view, els.bar, els.toast);
    window.addEventListener('beforeunload', (e) => { if (dirty()) { e.preventDefault(); e.returnValue = ''; } });
  }
  async function closePanel() {
    if (dirty() && !(await ask({ title: T('panel.closeDirtyTitle'), body: T('panel.closeDirtyBody'), ok: T('panel.closeDirtyOk'), danger: true }))) return;
    const r = await api('POST', '/api/close', {});
    if (r.ok) gone(r.data.message);
  }
  function overridesBanner() {
    return S.overrides.length ? h('div', { class: 'banner' }, notice('warn', null, T('panel.overrides', { names: S.overrides.join(', ') }))) : null;
  }
  function renderTab() {
    if (stopped) return;
    const focus = document.activeElement?.id;
    stopKeyWatch();
    observers.forEach((o) => o.disconnect());
    observers = [];
    rows = new Map();
    for (const [id, b] of Object.entries(els.tabs)) {
      if (id === ui.tab) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    }
    els.view.replaceChildren();
    const banner = overridesBanner();
    if (banner) els.view.append(banner);
    ({ usage: viewUsage, jobs: viewJobs, providers: viewProviders })[ui.tab](els.view);
    syncBar();
    if (focus) document.getElementById(focus)?.focus({ preventScroll: true });
  }

  // ---- Usage
  function seg(label, options, current, onPick, idPrefix) {
    return h('div', { class: 'seg', role: 'group', 'aria-label': label }, options.map(([v, text]) => h('button', { type: 'button', id: `${idPrefix}-${v}`, 'aria-pressed': String(v === current), onclick: () => onPick(v) }, text)));
  }
  async function changeRange(patch) {
    Object.assign(ui, patch);
    if (await load({ withSide: Boolean(patch.scope) })) { renderTab(); refreshIfOld(); }
  }
  function table(cols, body, { stack } = {}) {
    return h('table', { class: `data${stack ? ' stack' : ''}` },
      h('thead', {}, h('tr', {}, cols.map((c) => h('th', { scope: 'col', class: c.left ? 'left' : null }, c.label)))),
      h('tbody', {}, body.map((row) => h('tr', {}, row.map((cell, i) => (i === 0
        ? h('th', { scope: 'row' }, cell)
        : h('td', { 'data-label': cols[i].label, class: [cols[i].left && 'left', cols[i].strong && 'strong'].filter(Boolean).join(' ') || null }, cell)))))));
  }
  const nameCell = (cls, text) => h('span', { class: 'cellName' }, h('i', { class: `sw ${cls}`, 'aria-hidden': 'true' }), h('span', {}, text));
  const FAMILY_ORDER = ['opus', 'sonnet', 'haiku'];
  const familyClass = (f) => (FAMILY_ORDER.includes(f) ? `c-${f}` : 'c-other');
  const families = (usage) => [...new Set([...FAMILY_ORDER.filter((f) => usage.byModel[f]), ...Object.keys(usage.byModel).sort()])];
  // shortcut: past four external models the colours repeat, the legend and the readout still name each one; add hues if that becomes common
  function extClass(key) {
    if (!extColors.has(key)) extColors.set(key, extColors.size);
    return `e-${extColors.get(key) % 4}`;
  }
  const rangeLabel = () => T(`panel.range.${ui.range}`);
  const legend = (series) => (series.length > 1 ? h('span', { class: 'legend' }, series.map((x) => h('span', {}, h('i', { class: `sw ${x.cls}`, 'aria-hidden': 'true' }), x.name))) : h('span'));

  // On a narrow page the detail sits under the list: take the reader there, with focus on its heading
  function pickSource(id) {
    ui.source = id;
    renderTab();
    if (!window.matchMedia('(max-width:860px)').matches) return;
    const heading = els.view.querySelector('.detail .card h2');
    if (!heading) return;
    heading.setAttribute('tabindex', '-1');
    heading.closest('.card').scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion:reduce)').matches ? 'auto' : 'smooth' });
    heading.focus({ preventScroll: true });
  }

  function viewUsage(v) {
    const c = S.claude;
    const read = Date.parse(c.readAt ?? '');
    v.append(h('div', { class: 'bar' },
      h('h1', {}, T('panel.tab.usage')), h('span', { class: 'grow' }),
      seg(T('panel.usage.range'), ['today', 'thisWeek', 'lastWeek', 'days30'].map((r) => [r, T(`panel.range.${r}`)]), ui.range, (r) => changeRange({ range: r }), 'range'),
      h('select', { id: 'scope', 'aria-label': T('panel.usage.scope'), onchange: (e) => changeRange({ scope: e.target.value }) }, ['project', 'all'].map((x) => h('option', { value: x, selected: x === ui.scope }, T(`panel.scope.${x}`)))),
      h('span', { class: 'age' }, Number.isNaN(read) ? T('panel.usage.neverRead') : T('panel.usage.read', { age: fmt.ago(read) })),
      h('button', { class: 'btn', type: 'button', id: 'refresh', disabled: S.refreshing, onclick: refresh }, S.refreshing ? [h('i', { class: 'spin', 'aria-hidden': 'true' }), T('panel.refreshing')] : T('panel.refresh'))));
    if (c.error && !(S.refreshing && Number.isNaN(read))) v.append(notice('bad', null, c.error)); // the first read is running: the detail says so
    else if (!S.refreshing && !Number.isNaN(read) && Date.now() - read > STALE_DATA) v.append(notice('warn', null, T('panel.usage.stale', { age: fmt.ago(read) })));

    if (ui.source !== 'claude' && ui.source !== 'all' && !S.external.models.some((m) => m.key === ui.source)) ui.source = 'all';
    S.external.models.map((m) => m.key).sort().forEach(extClass);
    const srcBtn = (id, title, amount, small, approx) => h('button', { class: 'srcBtn', type: 'button', id: `src-${id}`, 'aria-current': ui.source === id ? 'true' : null, onclick: () => pickSource(id) }, h('b', {}, title), h('span', { class: approx ? 'amt approx' : 'amt' }, amount), h('small', {}, small));
    const todayAll = side.today?.usd ?? 0;
    const sources = h('nav', { class: 'sources', 'aria-label': T('panel.usage.sources') },
      h('div', { class: 'sh' }, T('panel.usage.mainPlan')),
      srcBtn('claude', 'Claude', fmt.approx(c.usd), T('panel.claude.apiEquivalent'), true),
      h('div', { class: 'sh' }, T('panel.external.title')),
      srcBtn('all', T('panel.usage.all'), fmt.usd(S.external.usd), T('panel.usage.allSmall', { count: fmt.num(S.external.models.length), today: fmt.usd(todayAll) })),
      S.external.models.map((m) => srcBtn(m.key, m.key.slice(m.key.indexOf('/') + 1), fmt.usd(m.usd), T('panel.usage.modelSmall', { provider: providerName(m.provider), runs: fmt.num(m.runs) }))));
    const detail = h('div', { class: 'detail' }, ui.source === 'claude' ? claudeDetail() : ui.source === 'all' ? allDetail() : modelDetail(S.external.models.find((m) => m.key === ui.source)));
    v.append(h('div', { class: 'md' }, sources, detail));
  }

  function gauge(name, w, limits) {
    if (!w) return null;
    const read = limits.readAt;
    const lines = w.renewed
      ? T('panel.usage.renewed')
      : [w.resetsAt ? T('panel.usage.resets', { when: fmt.when(w.resetsAt * 1000) }) : null, Date.now() - read > STALE_LIMIT ? T('panel.usage.limitStale', { age: fmt.ago(read) }) : T('panel.usage.limitRead', { age: fmt.ago(read) })].filter(Boolean).join(' · ');
    const full = w.percent >= 100;
    const fillEl = h('i');
    fillEl.style.width = `${Math.min(100, Math.max(0, w.percent))}%`;
    return h('div', { class: 'gauge' },
      h('div', { class: 'gh' }, h('span', { class: 'gn' }, name), h('span', { class: 'gv' }, fmt.pct(w.percent))),
      h('div', { class: `track${full ? ' full' : ''}`, role: 'img', 'aria-label': `${name}: ${fmt.pct(w.percent)}` }, fillEl),
      h('div', { class: 'gr' }, full ? [h('b', {}, T('panel.usage.limitReached')), ' · '] : null, lines));
  }

  function claudeDetail() {
    const c = S.claude;
    const hasData = c.byDay.length > 0;
    const fams = families(c);
    const days = daysOfRange(ui.range);
    const series = ui.unit === 'usd'
      ? fams.map((f) => ({ name: cap(f), cls: familyClass(f), values: Object.fromEntries(c.byDay.map((d) => [d.date, d.models[f] ?? 0])) }))
      : [{ name: T('panel.usage.allModels'), cls: 'c-all', values: Object.fromEntries(c.byDay.map((d) => [d.date, d.tokens])) }];
    const limits = S.limits;
    const gauges = limits && (limits.five_hour || limits.seven_day)
      ? h('div', { class: 'gs' }, gauge(T('panel.usage.fiveHour'), limits.five_hour, limits), gauge(T('panel.usage.week'), limits.seven_day, limits))
      : notice('', null, T('panel.usage.noLimits'));
    const main = h('section', { class: 'card' },
      h('h2', {}, `${T('panel.usage.mainPlan')} · Claude`),
      h('div', { class: 'big' }, fmt.approx(c.usd)),
      h('div', { class: 'sub2' }, `${rangeLabel()}. ${T('panel.claude.apiEquivalent')} · ${T('panel.usage.tokens', { count: fmt.short(c.tokens.total) })}`),
      gauges,
      hasData
        ? [h('div', { class: 'sp' }, h('h3', {}, T('panel.usage.daily')), h('span', { class: 'grow' }), legend(series),
            seg(T('panel.usage.unit'), [['usd', T('panel.usage.unitUsd')], ['token', T('panel.usage.unitToken')]], ui.unit, (u) => { ui.unit = u; renderTab(); }, 'unit')),
          barChart({ days, series, format: ui.unit === 'usd' ? fmt.usd : fmt.short, tick: ui.unit === 'usd' ? fmt.usdTick : fmt.short, label: T('panel.chart.aria', { title: `Claude, ${T('panel.claude.apiEquivalent')}`, range: rangeLabel(), total: ui.unit === 'usd' ? fmt.usd(c.usd) : fmt.short(c.tokens.total) }) })]
        : notice('', null, S.refreshing ? T('panel.usage.loading') : T('panel.usage.emptyClaude')));
    if (!hasData) return main;
    return [main, h('section', { class: 'card' },
      h('h2', {}, T('panel.usage.byModel')),
      table(
        [{ label: T('panel.col.model') }, { label: T('panel.col.input') }, { label: T('panel.col.output') }, { label: T('panel.col.cache') }, { label: T('panel.usage.apiEq'), strong: true }],
        fams.map((f) => { const m = c.byModel[f]; return [nameCell(familyClass(f), cap(f)), fmt.short(m.input), fmt.short(m.output), fmt.short(m.cache), fmt.usd(m.usd)]; })))];
  }

  function providerLimit(p) {
    const info = S.providers[p];
    if (!info) return null;
    const name = providerName(p);
    if (!info.limit) return h('div', { class: 'pl' }, notice('', null, T('panel.usage.noLimit', { provider: name }), linkTo('providers', 'panel.usage.toKeys')));
    const full = info.spentToday >= info.limit;
    const fillEl = h('i');
    fillEl.style.width = `${Math.min(100, (info.spentToday / info.limit) * 100)}%`;
    return h('div', { class: 'pl' },
      h('div', { class: 'plh' }, h('span', {}, T('panel.usage.dailyLimit', { provider: name })), h('span', {}, T('panel.usage.limitOf', { spent: fmt.usd(info.spentToday), limit: fmt.usd(info.limit) }))),
      h('div', { class: `track${full ? ' full' : ''}` }, fillEl),
      full ? h('div', { class: 'gr' }, h('b', {}, T('panel.usage.limitReached')), ' · ', T('panel.usage.limitFull')) : null);
  }

  function allDetail() {
    const e = S.external;
    if (!e.models.length) {
      return h('section', { class: 'card' },
        h('h2', {}, `${T('panel.external.title')}, ${lower(T('panel.usage.all'))}`),
        h('div', { class: 'big' }, fmt.usd(0)),
        h('div', { class: 'sub2' }, `${rangeLabel()}. ${T('panel.external.spent')}`),
        notice('', null, T('panel.usage.emptyExternal'), linkTo('jobs', 'panel.usage.toJobs')));
    }
    const series = [...e.models].sort((a, b) => a.key.localeCompare(b.key)).map((m) => ({ name: m.key.slice(m.key.indexOf('/') + 1), cls: extClass(m.key), values: m.byDay }));
    const providers = [...new Set(e.models.map((m) => m.provider))];
    return [
      h('section', { class: 'card' },
        h('h2', {}, `${T('panel.external.title')}, ${lower(T('panel.usage.all'))}`),
        h('div', { class: 'big' }, fmt.usd(e.usd)),
        h('div', { class: 'sub2' }, `${rangeLabel()}. ${T('panel.usage.externalNote')}`),
        h('dl', { class: 'facts' }, fact(T('panel.range.today'), fmt.usd(side.today?.usd ?? 0)), fact(T('panel.range.lastWeek'), fmt.usd(side.lastWeek?.usd ?? 0))),
        h('div', { class: 'sp' }, h('h3', {}, T('panel.usage.daily')), legend(series)),
        barChart({ days: daysOfRange(ui.range), series, format: fmt.usd, tick: fmt.usdTick, label: T('panel.chart.aria', { title: T('panel.external.title'), range: rangeLabel(), total: fmt.usd(e.usd) }) }),
        providers.map(providerLimit)),
      h('section', { class: 'card' },
        h('h2', {}, T('panel.usage.byModel')),
        table(
          [{ label: T('panel.col.model') }, { label: T('panel.col.usd'), strong: true }, { label: T('panel.col.input') }, { label: T('panel.col.output') }, { label: T('panel.col.runs') }, { label: T('panel.col.time') }],
          e.models.map((m) => [nameCell(extClass(m.key), m.key.slice(m.key.indexOf('/') + 1)), m.priceKnown ? fmt.usd(m.usd) : `~${fmt.usd(m.usd)}`, fmt.short(m.input), fmt.short(m.output), fmt.num(m.runs), fmt.span(m.seconds)]),
          { stack: true }),
        e.models.some((m) => !m.priceKnown) ? h('p', { class: 'tableNote' }, T('panel.usage.estimateMark')) : null)];
  }
  const fact = (dt, dd, plain) => h('div', {}, h('dt', {}, dt), h('dd', { class: plain ? 'plain' : null }, dd));

  function modelDetail(m) {
    const of = (ext) => ext?.models?.find((x) => x.key === m.key)?.usd ?? 0;
    const info = S.providers[m.provider];
    const series = [{ name: m.key, cls: extClass(m.key), values: m.byDay }];
    return h('section', { class: 'card' },
      h('h2', {}, m.key.slice(m.key.indexOf('/') + 1)),
      h('div', { class: 'big' }, m.priceKnown ? fmt.usd(m.usd) : `~${fmt.usd(m.usd)}`),
      h('div', { class: 'sub2' }, `${rangeLabel()}. ${T('panel.usage.externalNote')} · `, h('code', {}, m.key)),
      m.priceKnown ? null : notice('warn', T('panel.usage.estimate'), T('panel.usage.estimateNote'), linkTo('models', 'panel.usage.toModels')),
      h('dl', { class: 'facts' },
        fact(T('panel.range.today'), fmt.usd(of(side.today))),
        fact(T('panel.range.lastWeek'), fmt.usd(of(side.lastWeek))),
        fact(T('panel.col.runs'), fmt.num(m.runs)),
        fact(T('panel.col.time'), fmt.span(m.seconds)),
        fact(T('panel.col.input'), fmt.short(m.input)),
        fact(T('panel.col.output'), fmt.short(m.output)),
        fact(T('panel.usage.limitFact'), info?.limit ? fmt.usd(info.limit) : T('panel.usage.noneSet')),
        fact(T('panel.col.jobs'), m.jobs.length ? m.jobs.map(clip).join(', ') : ui.scope === 'all' ? T('panel.usage.noJobNames') : T('panel.usage.noJobs'), true)),
      h('h3', {}, T('panel.usage.daily')),
      barChart({ days: daysOfRange(ui.range), series, format: fmt.usd, tick: fmt.usdTick, label: T('panel.chart.aria', { title: m.key, range: rangeLabel(), total: fmt.usd(m.usd) }) }),
      providerLimit(m.provider));
  }

  function niceTicks(max) {
    if (max <= 0) return [1];
    const raw = max / 3, mag = 10 ** Math.floor(Math.log10(raw)), norm = raw / mag;
    const step = (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
    const ticks = [];
    for (let i = 1; ; i++) { const t = +(step * i).toPrecision(6); ticks.push(t); if (t >= max) break; }
    return ticks;
  }
  // A stacked daily bar chart drawn at the width it really has, so its text stays readable at every width
  function barChart({ days, series, format, tick, label }) {
    const totals = days.map((d) => series.reduce((a, x) => a + (x.values[d] ?? 0), 0));
    const hint = T('panel.chart.hint');
    const readout = h('div', { class: 'readout', 'aria-live': 'polite' }, hint);
    const plot = h('div', { class: 'plot' });
    let active = -1, hits = [], lastWidth = 0;
    function setActive(i) {
      active = i;
      hits.forEach((r, n) => r.classList.toggle('on', n === i));
      if (i < 0) { readout.replaceChildren(hint); return; }
      const d = days[i];
      readout.replaceChildren(h('b', {}, fmt.day(d, { weekday: 'short', day: 'numeric', month: 'short' })),
        ...series.filter((x) => (x.values[d] ?? 0) > 0).map((x) => h('span', {}, h('i', { class: `sw ${x.cls}`, 'aria-hidden': 'true' }), `${x.name} ${format(x.values[d])}`)),
        series.length > 1 ? h('span', {}, `${T('panel.chart.total')} ${format(totals[i])}`) : totals[i] === 0 ? h('span', {}, format(0)) : null);
    }
    function draw(width) {
      const H = width < 480 ? 180 : 230;
      const ticks = niceTicks(Math.max(...totals, 0));
      const max = ticks[ticks.length - 1];
      const left = Math.max(30, Math.max(...ticks.map((t) => tick(t).length)) * 6.6 + 8);
      const pad = { l: left, r: 2, t: 8, b: 24 };
      const iw = width - pad.l - pad.r, ih = H - pad.t - pad.b, step = iw / days.length;
      const bw = Math.min(Math.max(step - (step > 12 ? 4 : 2), 2), 56);
      const y = (v) => pad.t + ih - (v / max) * ih;
      const svg = s('svg', { viewBox: `0 0 ${width} ${H}`, width, height: H, role: 'img', tabindex: 0, 'aria-label': label });
      for (const t of ticks) {
        svg.append(s('line', { class: 'grid', x1: pad.l, x2: width - pad.r, y1: y(t), y2: y(t) }));
        const text = s('text', { class: 'tick', x: pad.l - 8, y: y(t) + 4, 'text-anchor': 'end' });
        text.textContent = tick(t);
        svg.append(text);
      }
      svg.append(s('line', { class: 'axis', x1: pad.l, x2: width - pad.r, y1: y(0), y2: y(0) }));
      const dayLabel = days.length > 7 ? { day: 'numeric', month: 'short' } : width < 420 && days.length > 1 ? { day: 'numeric' } : { day: 'numeric', month: 'short' };
      days.forEach((d, i) => {
        const x = pad.l + i * step + (step - bw) / 2;
        let stacked = 0;
        for (const ser of series) {
          const v = ser.values[d] ?? 0;
          if (v <= 0) continue;
          const barH = Math.max((v / max) * ih, 1.5);
          svg.append(s('rect', { class: `seriesRect ${ser.cls}`, x: x.toFixed(1), y: (y(stacked) - barH).toFixed(1), width: bw.toFixed(1), height: barH.toFixed(1), rx: 2 }));
          stacked += v;
        }
        const [yy, mm, dd] = d.split('-').map(Number);
        if (days.length <= 7 || new Date(yy, mm - 1, dd).getDay() === 1) {
          const tx = pad.l + i * step + step / 2;
          const atEnd = days.length > 7 && tx > width - 22; // a label at the right edge must not be cut
          const text = s('text', { class: 'tick', x: (atEnd ? width - pad.r : tx).toFixed(1), y: H - 7, 'text-anchor': atEnd ? 'end' : 'middle' });
          text.textContent = fmt.day(d, dayLabel);
          svg.append(text);
        }
      });
      hits = days.map((d, i) => {
        const r = s('rect', { class: 'hit', x: (pad.l + i * step).toFixed(1), y: pad.t, width: step.toFixed(1), height: ih });
        r.addEventListener('pointerenter', () => setActive(i));
        r.addEventListener('click', () => setActive(i));
        svg.append(r);
        return r;
      });
      svg.addEventListener('pointerleave', () => { if (document.activeElement !== svg) setActive(-1); });
      svg.addEventListener('blur', () => setActive(-1));
      svg.addEventListener('focus', () => { if (active < 0) { const last = totals.findLastIndex((t) => t > 0); setActive(last < 0 ? days.length - 1 : last); } });
      svg.addEventListener('keydown', (e) => {
        const next = { ArrowLeft: active - 1, ArrowRight: active + 1, Home: 0, End: days.length - 1 }[e.key];
        if (next === undefined) return;
        e.preventDefault();
        setActive(Math.max(0, Math.min(days.length - 1, next)));
      });
      plot.replaceChildren(svg);
      if (active >= 0) setActive(active);
    }
    const ro = new ResizeObserver(([entry]) => {
      const w = Math.round(entry.contentRect.width);
      if (w > 0 && w !== lastWidth) { lastWidth = w; draw(w); }
    });
    ro.observe(plot);
    observers.push(ro);
    return h('div', { class: 'chart' }, readout, plot);
  }

  // ---- Jobs
  function modelSelect(name) {
    const sel = h('select', { id: `m-${name}`, 'aria-label': T('panel.jobs.modelFor', { job: labelOf(name) }), onchange: () => onModel(name) });
    if (!isRole(name)) sel.append(h('option', { value: '' }));
    if (name === 'code.simple') sel.append(h('option', { value: 'main' }, T('panel.jobs.mainOption')));
    sel.append(h('optgroup', { label: T('panel.jobs.claudeModels') }, S.choices.models.map((m) => h('option', { value: m }, m))));
    const keys = externalKeys();
    sel.append(h('optgroup', { label: T('panel.jobs.externalModels') },
      keys.length
        ? keys.map((k) => { const p = k.slice(0, k.indexOf('/')); const m = S.catalog?.[p]?.[k.slice(k.indexOf('/') + 1)]; const price = typeof m?.input === 'number' ? ` · ${fmt.usd(m.input)} / ${fmt.usd(m.output)}` : ''; return h('option', { value: k, disabled: !hasKey(p) }, hasKey(p) ? `${k}${price}` : `${k} ${T('panel.jobs.noKeyTag')}`); })
        : h('option', { disabled: true, value: '-' }, T('panel.jobs.noneYet'))));
    return sel;
  }
  function effortSelect(name) {
    return h('select', { id: `e-${name}`, 'aria-label': T('panel.jobs.effortFor', { job: labelOf(name) }), onchange: () => onEffort(name) },
      [...S.choices.efforts, 'max'].map((x) => h('option', { value: x }, x)));
  }
  const labelOf = (name) => T(isRole(name) ? `panel.role.${name}` : `panel.job.${name}`);
  const levelTag = (name) => h('span', { class: `lvl ${S.levels[name]}` }, T(`panel.level.${S.levels[name]}`));
  const RUN_SESSION = 'node .claude/hooks/run-session.mjs';
  function onModel(name) {
    const r = rows.get(name);
    const model = r.model.value;
    if (model === '') return setOwn(name, null);
    if (model === 'main') return setOwn(name, 'main');
    const external = model.includes('/');
    let effort = r.effort.value;
    if (effort === 'max' && (external || name === 'main')) effort = 'xhigh';
    setOwn(name, `${model}:${effort}`);
  }
  function onEffort(name) {
    const r = rows.get(name);
    const model = r.model.value || splitValue(resolve(name).value).model;
    setOwn(name, `${model}:${r.effort.value}`);
  }

  function makeRow(name, kind, role, parentLabel) {
    const r = { name, kind, role, model: modelSelect(name), effort: effortSelect(name) };
    r.tagCustom = h('span', { class: 'tagC' }, T('panel.jobs.custom'));
    r.tagExt = h('span', { class: 'flag' }, T('panel.jobs.external'));
    r.tagUnsaved = h('span', { class: 'tagU' }, T('panel.jobs.unsaved'));
    r.note = h('span', { class: 'note' });
    r.note2 = h('span', { class: 'note' });
    r.bad = h('span', { class: 'note bad', role: 'status' });
    // The main job has no heading above it: it follows the planning role, so the text names it
    const backText = name === 'main' ? T('panel.jobs.backToRole', { role: labelOf('plan') }) : T(name === 'board.commit' ? 'panel.jobs.backRecommended' : 'panel.jobs.back');
    const applyLabel = T('panel.jobs.applyFor', { action: T('panel.jobs.applyAll'), job: labelOf(name) });
    r.back = h('button', { class: 'btn', type: 'button', id: `b-${name}`, 'aria-label': T('panel.jobs.backFor', { action: backText, job: labelOf(name) }), onclick: () => { document.getElementById(`m-${name}`)?.focus(); setOwn(name, null); } }, backText);
    r.tagsWrap = [r.tagCustom, r.tagExt, r.tagUnsaved];
    if (kind === 'role') {
      r.apply = h('button', { class: 'btn', type: 'button', id: `a-${name}`, 'aria-label': applyLabel, onclick: () => applyToAll(name, countable(role)) }, T('panel.jobs.applyAll'));
      r.fold = h('button', { class: 'fold', type: 'button', id: `f-${name}`, onclick: () => toggleFold(name) }, h('b', {}, labelOf(name)));
      r.counts = h('small');
      r.bad.className = 'roleNote bad';
      r.el = h('header', { class: 'roleHead' }, h('h2', { class: 'roleTitle' }, r.fold, levelTag(name), r.counts), r.model, r.effort, h('div', { class: 'acts' }, r.apply), r.bad);
      return r;
    }
    const cls = { main: 'job mainRow', head: 'job head', mem: 'job mem', free: 'job free', job: 'job' }[kind];
    let title;
    if (kind === 'head') {
      r.fold = h('button', { class: 'fold', type: 'button', id: `f-${name}`, onclick: () => toggleFold(name) }, h('b', {}, labelOf(name)));
      title = r.fold;
    } else {
      title = h('span', { class: 'nm' }, labelOf(name));
    }
    r.acts = h('div', { class: 'acts' }, r.back);
    if (kind === 'head') {
      r.apply = h('button', { class: 'btn', type: 'button', id: `a-${name}`, 'aria-label': applyLabel, onclick: () => applyToAll(name, groupOf(role, members(name))) }, T('panel.jobs.applyAll'));
      r.acts.append(r.apply);
    }
    r.el = h('div', { class: cls }, h('span', { class: 'route' }), h('span', { class: 'tap' }),
      h('span', { class: 'name' }, levelTag(name), title, h('code', {}, name), r.tagsWrap, r.note, r.note2, r.bad), r.model, r.effort, r.acts);
    r.searchText = lower(`${labelOf(name)} ${name} ${parentLabel}`);
    return r;
  }

  function syncRow(r) {
    const { name, kind } = r;
    const o = own(name), res = resolve(name);
    const ext = parseExt(o);
    const ok = o !== undefined && valid(name, o);
    const shownOwn = ok || ext;
    const shown = shownOwn ? o : res.value;
    const { model, effort } = splitValue(shown);
    const { model: followModel } = splitValue(res.value);
    const followText = name === 'board.commit' ? T('panel.jobs.recommendedOpt', { model: followModel }) : name === 'main' ? T('panel.jobs.followsRole', { role: labelOf('plan'), model: followModel }) : T('panel.jobs.follows', { model: followModel });
    if (!isRole(name)) r.model.options[0].textContent = followText;
    r.model.value = shownOwn || kind === 'role' ? model : '';
    r.effort.value = effort ?? 'high';
    r.effort.classList.toggle('invisible', !effort);
    r.effort.querySelector('option[value="max"]').disabled = name === 'main' || model.includes('/');
    r.model.title = shown === 'main' ? T('panel.jobs.mainOption') : model;
    const custom = Boolean(shownOwn);
    const badText = o === undefined || ok ? '' : ext
      ? T('panel.jobs.noKey', { provider: providerName(ext.provider), used: pretty(res.value) })
      : T('panel.jobs.invalid', { value: clip(o), used: pretty(res.value) });
    r.bad.textContent = badText;
    r.bad.hidden = !badText;
    if (kind === 'role') {
      const names = countable(r.role);
      const customs = names.filter((n) => own(n) !== undefined);
      r.counts.textContent = T('panel.jobs.counts', { jobs: fmt.num(names.length), custom: fmt.num(customs.length) });
      r.apply.hidden = customs.length === 0;
      r.fold.setAttribute('aria-expanded', String(!isFolded(name)));
      return;
    }
    r.el.classList.toggle('custom', custom);
    r.el.classList.toggle('follows', !custom);
    r.el.classList.toggle('bad', Boolean(badText));
    r.tagCustom.hidden = !custom;
    r.tagExt.hidden = !parseExt(shown);
    r.tagUnsaved.hidden = !Object.hasOwn(draft, name);
    r.back.hidden = o === undefined;
    let note = '', note2 = '';
    if (name === 'main') {
      note = parseExt(shown) ? T('panel.jobs.mainExternal') : T('panel.jobs.mainNext', { model, effort: effort ?? '' });
      note2 = parseExt(shown) ? '' : `${T('panel.jobs.mainWins')} ${T('panel.jobs.mainNoMax')}`;
    } else if (name === 'board.commit') {
      note = T('panel.jobs.commitReason');
      if (model !== 'haiku') note2 = T('panel.jobs.commitCost');
    } else if (name === 'code.simple') {
      note = shown === 'main' || res.value === resolve('main').value ? T('panel.jobs.simpleMain') : T('panel.jobs.simpleSub');
    } else if (kind === 'head') {
      const names = groupOf(r.role, members(name));
      const customs = names.filter((n) => own(n) !== undefined);
      note = T('panel.jobs.counts', { jobs: fmt.num(names.length), custom: fmt.num(customs.length) });
      r.apply.hidden = customs.length === 0;
      r.fold.setAttribute('aria-expanded', String(!isFolded(name)));
    }
    r.note.textContent = note; r.note.hidden = !note;
    if (name === 'main' && parseExt(shown)) r.note.append(' ', h('code', {}, RUN_SESSION));
    r.note2.textContent = note2; r.note2.hidden = !note2;
  }
  function sync() {
    for (const r of rows.values()) syncRow(r);
    syncBar();
    applyFolds();
  }
  // One answer per save, whatever the number of jobs: what goes where, as facts
  function fillConsent() {
    const names = outsideDraft();
    const providers = [...new Set(names.map((n) => S.presets[parseExt(own(n)).provider]?.label ?? parseExt(own(n)).provider))].join(', ');
    const notes = [T('panel.consent.goes', { count: fmt.num(names.length), providers }), T('panel.consent.sees'), T('panel.consent.final'),
      names.some((n) => ['code', 'test'].includes(roleOf(n))) && T('panel.consent.secrets'), names.includes('main') && T('panel.consent.main')].filter(Boolean).join(' ');
    if (els.consent.dataset.notes === notes) return; // the box the keyboard is on stays
    els.consent.dataset.notes = notes;
    els.consent.replaceChildren(...(names.length ? [h('p', {}, notes), h('label', {}, h('input', { type: 'checkbox', id: 'consentSave', checked: consented, onchange: (e) => { consented = e.target.checked; syncBar(); } }), T('panel.consent.ok'))] : []));
  }
  function syncBar() {
    const count = Object.keys(draft).length;
    els.tabs.jobs.replaceChildren(T('panel.tab.jobs'), ...(count ? [h('b', { 'aria-label': Tn('panel.jobs.changes', count) }, fmt.num(count))] : []));
    els.bar.classList.toggle('show', count > 0 && ui.tab === 'jobs');
    if (els.defaultBtn) els.defaultBtn.disabled = count > 0;
    if (!count) return;
    els.count.textContent = Tn('panel.jobs.changes', count);
    const mainChanged = Object.hasOwn(draft, 'main');
    els.saveNote.textContent = blocked() ? T('panel.jobs.needConsent') : mainChanged ? T('panel.jobs.nextJobMain') : T('panel.jobs.nextJob');
    els.save.disabled = saving || blocked();
    els.save.textContent = saving ? T('panel.jobs.saving') : T('panel.jobs.save');
    fillConsent();
  }

  const isFolded = (name) => folded.has(name);
  function toggleFold(name) {
    if (folded.has(name)) folded.delete(name); else folded.add(name);
    store.set(FOLD_KEY, JSON.stringify([...folded]));
    rows.get(name).fold.setAttribute('aria-expanded', String(!folded.has(name)));
    applyFolds();
  }
  function applyFolds() {
    const q = ui.q.trim() ? lower(ui.q.trim()) : '';
    const filtering = Boolean(q) || ui.level !== 'all';
    const matches = (name, r) => (!q || r.searchText.includes(q)) && (ui.level === 'all' || S.levels[name] === ui.level);
    let shown = 0, total = 0;
    for (const sec of els.sections ?? []) {
      let any = false;
      for (const part of sec.parts) {
        const head = part.head ? rows.get(part.head) : null;
        let partAny = false;
        for (const name of part.members) {
          const r = rows.get(name);
          total++;
          const hit = matches(name, r);
          r.el.hidden = !hit;
          if (hit) { shown++; partAny = true; }
        }
        if (head) {
          total++;
          const hit = matches(part.head, head);
          if (hit) shown++;
          head.el.hidden = !(hit || partAny);
          partAny = partAny || hit;
          part.body.hidden = (!filtering && isFolded(part.head)) || (filtering && !part.members.some((n) => !rows.get(n).el.hidden));
        }
        any = any || partAny;
      }
      if (sec.council) sec.council.hidden = filtering;
      if (sec.el) sec.el.hidden = filtering && !any;
      if (sec.body) sec.body.hidden = !filtering && isFolded(sec.role);
    }
    if (els.found) {
      els.found.textContent = filtering ? T('panel.jobs.found', { count: fmt.num(shown), total: fmt.num(total) }) : '';
      els.noMatch.hidden = !(filtering && shown === 0);
      els.colHead.hidden = filtering && shown === 0;
    }
  }
  async function applyToAll(name, names) {
    const customs = names.filter((n) => own(n) !== undefined);
    if (!customs.length) return;
    const yes = await ask({
      title: T('panel.jobs.applyTitle', { role: labelOf(name) }),
      body: T('panel.jobs.applyBody'),
      items: customs.map((n) => [labelOf(n), typeof own(n) === 'string' ? clip(pretty(own(n))) : '']),
      ok: T('panel.jobs.applyAll'),
    });
    if (!yes) return;
    for (const n of customs) { if (savedOwn(n) === undefined) delete draft[n]; else draft[n] = null; }
    sync();
    document.getElementById(`m-${name}`)?.focus();
  }

  function viewJobs(v) {
    els.defaultBtn = h('button', { class: 'btn', type: 'button', id: 'makeDefault', disabled: dirty(), title: T('panel.jobs.defaultNote'), onclick: makeDefault }, T('panel.jobs.makeDefault'));
    els.found = h('span', { class: 'age', role: 'status' });
    v.append(h('div', { class: 'bar' },
      h('h1', {}, T('panel.tab.jobs')), h('span', { class: 'intro' }, T('panel.jobs.intro')), h('span', { class: 'grow' }), els.found,
      h('input', { type: 'search', id: 'jobSearch', value: ui.q, placeholder: T('panel.jobs.search'), 'aria-label': T('panel.jobs.search'), autocomplete: 'off', oninput: (e) => { ui.q = e.target.value; applyFolds(); } }),
      seg(T('panel.level.label'), [['all', T('panel.level.all')], ...['easy', 'medium', 'hard'].map((x) => [x, T(`panel.level.${x}`)])], ui.level, (x) => { ui.level = x; renderTab(); }, 'level'),
      els.defaultBtn));
    v.append(h('div', { class: 'legend3' }, ['easy', 'medium', 'hard'].map((x) => h('div', {}, h('span', { class: `lvl ${x}` }, T(`panel.level.${x}`)), h('p', {}, T(`panel.level.${x}Why`)), h('small', {}, T(`panel.level.${x}Pick`))))));
    if (S.saved.broken) v.append(notice('bad', null, T('panel.jobs.broken')));
    else if (!Object.keys(S.saved).some((k) => k !== 'acknowledged')) v.append(notice('', null, T('panel.jobs.noChoice')));
    const known = new Set(S.jobs.flatMap((r) => r.jobs.map((j) => j.name)));
    const unknown = Object.keys(S.saved.tasks ?? {}).filter((k) => !known.has(k));
    if (unknown.length) v.append(notice('', null, T('panel.jobs.unknown', { names: unknown.map(clip).join(', ') })));
    const keyless = Object.keys(S.catalog ?? {}).filter((p) => !hasKey(p) && Object.keys(S.catalog[p] ?? {}).length);
    if (keyless.length) v.append(notice('', null, T('panel.jobs.noKeyNote', { providers: keyless.join(', ') }), linkTo('providers', 'panel.usage.toKeys')));
    els.colHead = h('div', { class: 'colHead', 'aria-hidden': 'true' }, h('span', {}, T('panel.jobs.colJob')), h('span', {}, T('panel.jobs.colModel')), h('span', {}, T('panel.jobs.colEffort')), h('span'));
    els.noMatch = h('div', { hidden: true }, notice('', null, T('panel.jobs.noMatch'), h('button', { class: 'btn', type: 'button', onclick: () => { ui.q = ''; document.getElementById('jobSearch').value = ''; applyFolds(); document.getElementById('jobSearch').focus(); } }, T('panel.jobs.clearSearch'))));
    v.append(els.colHead, els.noMatch);
    els.sections = [];

    const planRole = S.jobs.find((r) => r.name === 'plan');
    const mainRow = makeRow('main', 'main', planRole, '');
    rows.set('main', mainRow);
    const mainSec = h('section', { class: 'role' }, mainRow.el);
    v.append(mainSec);
    els.sections.push({ el: mainSec, parts: [{ members: ['main'] }] });

    for (const role of S.jobs) {
      const head = makeRow(role.name, 'role', role);
      rows.set(role.name, head);
      const body = h('div', { class: 'roleBody' });
      const sec = { role: role.name, body, parts: [] };
      const plain = [];
      const addJob = (name, kind) => { const r = makeRow(name, kind, role, labelOf(role.name)); rows.set(name, r); return r; };
      const names = role.jobs.map((j) => j.name).filter((n) => n !== 'main');
      for (const name of names) {
        if (name.startsWith('findings.') || name.startsWith('board.')) continue;
        body.append(addJob(name, 'job').el);
        plain.push(name);
      }
      sec.parts.push({ members: plain });
      for (const headName of ['findings.default', 'board.default']) {
        if (!names.includes(headName)) continue;
        const groupHead = addJob(headName, 'head');
        const prefix = members(headName);
        const groupBody = h('div', { class: 'group' });
        const list = groupOf(role, prefix);
        for (const n of list) groupBody.append(addJob(n, 'mem').el);
        body.append(groupHead.el, groupBody);
        sec.parts.push({ head: headName, members: list, body: groupBody });
      }
      if (names.includes('board.commit')) {
        body.append(addJob('board.commit', 'free').el);
        sec.parts.push({ members: ['board.commit'] });
        sec.council = h('div', { class: 'council' }, h('b', {}, T('panel.jobs.councilName')), h('span', {}, T('panel.jobs.councilReason')));
        body.append(sec.council);
      }
      sec.el = h('section', { class: 'role' }, head.el, body);
      v.append(sec.el);
      els.sections.push(sec);
    }
    sync();
  }

  async function makeDefault() {
    const r = await api('POST', '/api/default', {});
    if (r.ok) toast(T('panel.jobs.defaultSaved'));
    else if (r.status) toast(r.data.message ?? T('panel.err.failed'));
  }
  function discard() {
    draft = {};
    consented = false;
    els.saveErr.replaceChildren();
    if (ui.tab === 'jobs') renderTab(); else syncBar();
    document.getElementById('jobSearch')?.focus();
  }
  async function save({ overwriteBroken } = {}) {
    if (saving || blocked() || !dirty()) return;
    saving = true;
    els.saveErr.replaceChildren();
    syncBar();
    const had = Object.hasOwn(draft, 'main');
    const confirmed = outsideDraft().length > 0 && consented;
    const r = await api('POST', '/api/jobs', { changes: draft, ifVersion: S.version, ...(overwriteBroken === true ? { overwriteBroken: true } : {}), ...(confirmed ? { confirmExternal: true } : {}) });
    saving = false;
    if (stopped) return;
    if (r.ok) {
      draft = {};
      consented = false;
      await load({ rebase: true });
      renderTab();
      const mainValue = resolve('main').value;
      const main = splitValue(mainValue);
      // /model cannot reach an outside model: it runs through run-session.mjs
      if (!had) toast(T('panel.saved'));
      else if (parseExt(mainValue)) toast(`${T('panel.saved')}. ${T('panel.jobs.mainExternal')} ${RUN_SESSION}`);
      else toast(T('panel.jobs.savedMain', { model: main.model, effort: main.effort ?? '' }));
      document.getElementById('jobSearch')?.focus();
      return;
    }
    syncBar();
    if (r.data.code === 'broken') {
      if (await ask({ title: T('panel.jobs.overwriteTitle'), body: T('panel.jobs.overwriteBody'), ok: T('panel.jobs.overwriteOk'), danger: true })) return save({ overwriteBroken: true });
      return;
    }
    if (r.data.code === 'conflict') {
      els.saveErr.replaceChildren(h('span', {}, r.data.message), h('button', { class: 'sec', type: 'button', onclick: reloadBase }, T('panel.jobs.reload')));
      return;
    }
    const detail = r.data.code === 'invalid' && r.data.detail ? ` ${clip(r.data.detail)}` : '';
    els.saveErr.replaceChildren(h('span', {}, `${r.data.message ?? T('panel.err.failed')}${detail}`));
  }
  async function reloadBase() {
    els.saveErr.replaceChildren();
    if (await load({ rebase: true })) renderTab();
  }

  // ---- Providers: one guided way to add an outside model. There is no key field here on purpose: a key is entered in the user's own terminal.
  const SET_KEY = 'node .claude/hooks/models.mjs --set-key', REMOVE_KEY = 'node .claude/hooks/models.mjs --remove-key';
  const ALIAS_NOTE = { opus: 'panel.models.aliasOpus', sonnet: 'panel.models.aliasSonnet', haiku: 'panel.models.aliasHaiku', fable: 'panel.models.aliasFable' };
  const NAME_RULE = /^[a-z][a-z0-9-]{0,31}$/;
  const MAX_ROWS = 120; // a long list stays quick; the search reaches the rest
  const KEY_WATCH_MS = 10 * 60e3;
  const wizName = () => (ui.wiz.pick === 'custom' ? ui.wiz.name.trim() : ui.wiz.pick);
  const listOf = (p) => S.modelLists?.[p]?.models ?? S.presets?.[p]?.models ?? [];
  const listDate = (p) => S.modelLists?.[p]?.at ?? S.presets?.[p]?.checkedAt;
  const money = (x) => (typeof x === 'number' ? fmt.usd(x) : '-');
  const link = (href) => h('a', { href, target: '_blank', rel: 'noreferrer' }, href.replace(/^https:\/\//, ''));
  const textOr = (key) => (S.strings[key] === undefined ? null : T(key));

  function commandRow(label, text) {
    const copy = async () => {
      try { await navigator.clipboard.writeText(text); toast(T('panel.keys.copied')); } catch { /* the command is on screen to copy by hand */ }
    };
    return h('div', { class: 'cmdRow' }, label ? h('span', { class: 'help' }, label) : null,
      h('div', { class: 'cmdLine' }, h('code', {}, text), h('button', { class: 'btn', type: 'button', 'aria-label': `${T('panel.keys.copy')}: ${text}`, onclick: copy }, T('panel.keys.copy'))));
  }
  const stopKeyWatch = () => { clearInterval(keyWatch); keyWatch = null; };
  // Waits for the key the user enters in the terminal. It ends by itself: a forgotten page must not keep the panel alive
  function watchKey() {
    if (keyWatch) return;
    const until = Date.now() + KEY_WATCH_MS;
    keyWatch = setInterval(async () => {
      if (stopped || Date.now() > until) return stopKeyWatch();
      if (!(await load()) || !hasKey(wizName())) return;
      stopKeyWatch();
      renderTab();
      updateLists(); // a key opens the provider's own list
    }, 4000);
  }
  const showProviders = () => { if (ui.tab === 'providers') renderTab(); };
  async function updateLists() {
    if (ui.updating) return;
    ui.updating = true;
    showProviders();
    const r = await api('POST', '/api/models-update', {});
    ui.updating = false;
    if (stopped) return;
    if (r.ok) { ui.listResult = r.data.results; await load(); } else if (r.status) toast(r.data.message ?? T('panel.err.failed'));
    showProviders();
  }
  function listSummary() {
    if (!ui.listResult) return null;
    const rows = Object.entries(ui.listResult);
    const label = (p) => S.presets[p]?.label ?? p;
    const noKey = rows.filter(([, r]) => r.code === 'noKey').map(([p]) => label(p));
    return h('section', { class: 'card' }, h('h2', {}, T('panel.update.title')),
      h('div', { class: 'errs' }, rows.filter(([, r]) => r.code !== 'noKey').map(([p, r]) => h('div', {}, h('b', {}, label(p)),
        h('span', { class: r.ok ? 'ok' : null }, r.ok ? T('panel.update.ok', { count: fmt.num(r.count), added: fmt.num(r.added) }) : T(`panel.update.${r.code}`))))),
      noKey.length ? h('p', { class: 'help' }, T('panel.update.noKey', { names: noKey.join(', ') })) : null);
  }
  function viewProviders(v) {
    v.append(h('div', { class: 'bar' }, h('h1', {}, T('panel.tab.providers')), h('span', { class: 'intro' }, T('panel.providers.intro')), h('span', { class: 'grow' }),
      h('button', { class: 'btn', type: 'button', id: 'updateLists', disabled: ui.updating, onclick: updateLists }, ui.updating ? [h('i', { class: 'spin', 'aria-hidden': 'true' }), T('panel.update.running')] : T('panel.update.button'))));
    const summary = listSummary();
    if (summary) v.append(summary);
    v.append(h('nav', { class: 'steps', 'aria-label': T('panel.providers.stepsLabel') }, [1, 2, 3, 4].map((n) => h('button', { class: `step${n < ui.wiz.step && (n !== 2 || hasKey(wizName())) ? ' done' : ''}`, type: 'button', id: `step-${n}`, 'aria-current': n === ui.wiz.step ? 'step' : null, onclick: () => goStep(n) }, h('b', {}, n < ui.wiz.step && (n !== 2 || hasKey(wizName())) ? '✓' : fmt.num(n)), T(`panel.providers.step${n}`)))));
    v.append([stepPick, stepKey, stepModel, stepTry][ui.wiz.step - 1]());
    for (const p of Object.keys(S.providers)) v.append(providerCard(p));
    v.append(h('section', { class: 'card' },
      h('h2', {}, T('panel.models.claudeTitle')),
      h('p', { class: 'intro' }, T('panel.models.claudeIntro')),
      h('table', { class: 'data aliases' }, h('tbody', {}, S.choices.models.map((m) => h('tr', {}, h('th', { scope: 'row' }, h('code', {}, m)), h('td', { class: 'left' }, ALIAS_NOTE[m] ? T(ALIAS_NOTE[m]) : '')))))));
  }
  function goStep(n) { ui.wiz.step = n; renderTab(); window.scrollTo(0, 0); }
  const nextBtn = (n, key) => h('div', { class: 'wizNext' }, h('button', { class: 'prim', type: 'button', onclick: () => goStep(n) }, T(key)));

  function stepPick() {
    const card = (id, title) => h('button', { class: 'pcard', type: 'button', id: `pick-${id}`, 'aria-pressed': String(ui.wiz.pick === id), onclick: () => { ui.wiz.pick = id; ui.wiz.q = ''; renderTab(); } },
      h('b', {}, title), h('span', {}, T(`panel.preset.${id}.tag`)), h('small', {}, T(`panel.preset.${id}.note`)), hasKey(id) ? h('small', { class: 'ok' }, T('panel.keys.has')) : null);
    return h('section', { class: 'card' }, h('h2', {}, T('panel.providers.pickTitle')), h('p', { class: 'help' }, T('panel.providers.pickHelp')),
      h('div', { class: 'pgrid' }, Object.entries(S.presets).map(([id, x]) => card(id, x.label)), card('custom', T('panel.preset.custom.name'))),
      nextBtn(2, 'panel.providers.toKey'));
  }

  function stepKey() {
    const preset = S.presets[ui.wiz.pick];
    const name = wizName();
    const host = preset ? new URL(preset.url).host : T('panel.providers.exampleHost');
    const command = h('div');
    const paint = () => { const n = wizName(); command.replaceChildren(commandRow('', `${SET_KEY} ${NAME_RULE.test(n) ? n : `<${T('panel.keys.namePlaceholder')}>`}`)); };
    paint();
    const custom = preset ? null : h('div', { class: 'two' },
      h('div', {}, h('label', { class: 'field' }, T('panel.providers.nameLabel'), h('input', { type: 'text', id: 'wizName', value: ui.wiz.name, autocomplete: 'off', spellcheck: 'false', oninput: (e) => { ui.wiz.name = e.target.value; paint(); } })),
        h('p', { class: 'rule' }, T('panel.providers.nameRule'))),
      h('div', {}, h('b', {}, T('panel.providers.addressTitle')), h('p', { class: 'rule' }, T('panel.providers.addressRule'))));
    const shownName = preset ? ui.wiz.pick : (NAME_RULE.test(name) ? name : T('panel.keys.namePlaceholder'));
    const ask = preset ? T('panel.cli.addressPreset', { provider: shownName, url: preset.url }) : T('panel.cli.addressAsk', { provider: shownName });
    const term = h('div', { class: 'term' },
      h('div', {}, h('i', {}, ask), h('u', {}, T(preset ? 'panel.providers.termEnter' : 'panel.providers.termAddress'))),
      h('div', {}, h('i', {}, T('panel.cli.confirm', { host })), h('u', {}, T('panel.providers.termYes'))),
      h('div', {}, h('i', {}, T('panel.cli.hidden', { provider: shownName })), h('u', {}, T('panel.providers.termPaste'))),
      h('div', {}, T('panel.providers.termSaved')));
    const ready = hasKey(name);
    if (!ready) watchKey();
    return h('section', { class: 'card' }, h('h2', {}, T('panel.providers.keyTitle', { provider: preset?.label ?? shownName })),
      h('p', { class: 'help' }, T('panel.providers.keyHelp')), custom,
      h('ol', { class: 'ol' },
        h('li', {}, h('b', {}, T('panel.providers.key1')), ' ', preset ? [T('panel.providers.key1Open'), ' ', link(preset.keyUrl), ' ', T('panel.providers.key1Rest')] : T('panel.providers.key1Custom')),
        h('li', {}, h('b', {}, T('panel.providers.key2')), ' ', T('panel.providers.key2Rest')),
        h('li', {}, h('b', {}, T('panel.providers.key3')), ' ', T('panel.providers.key3Rest')),
        h('li', {}, h('b', {}, T('panel.providers.key4')), command),
        h('li', {}, h('b', {}, T('panel.providers.key5')), term),
        h('li', {}, h('b', {}, T('panel.providers.key6')), ' ', T('panel.providers.key6Rest'))),
      ready
        ? notice('good', T('panel.keys.has'), host, h('button', { class: 'btn', type: 'button', onclick: () => goStep(3) }, T('panel.providers.toModel')))
        : notice('', null, h('span', {}, h('i', { class: 'spin', 'aria-hidden': 'true' }), T('panel.providers.waitingKey'))));
  }

  async function addToCatalog(p, row, errEl) {
    const r = await api('POST', '/api/catalog', { provider: p, model: row.id, input: row.input ?? null, output: row.output ?? null, context: row.context ?? null });
    if (r.ok) { await load(); renderTab(); toast(T('panel.saved')); } else if (r.status) errEl.textContent = r.data.message ?? T('panel.err.catalog');
  }
  function stepModel() {
    const p = wizName();
    const preset = S.presets[p];
    const locked = !hasKey(p);
    const err = h('div', { class: 'formErr', role: 'alert' });
    const box = h('div', { class: 'mlist' });
    const paint = () => {
      const q = lower(ui.wiz.q.trim());
      const found = listOf(p).filter((m) => !q || lower(m.id).includes(q));
      box.replaceChildren(...[h('div', { class: 'mrow head' }, h('span', {}, T('panel.col.model')), h('span', {}, T('panel.col.input')), h('span', {}, T('panel.col.output')), h('span', { class: 'ctx' }, T('panel.col.context')), h('span', { class: 'acts' })),
        found.slice(0, MAX_ROWS).map((m) => {
          const added = Boolean(S.catalog?.[p]?.[m.id]);
          return h('div', { class: 'mrow' }, h('code', {}, m.id), h('span', {}, money(m.input)), h('span', {}, money(m.output)), h('span', { class: 'ctx' }, typeof m.context === 'number' ? fmt.short(m.context) : '-'),
            h('span', { class: 'acts' }, h('button', { class: 'btn', type: 'button', disabled: locked || added, onclick: () => addToCatalog(p, m, err) }, T(added ? 'panel.providers.added' : 'panel.models.add'))));
        }),
        found.length > MAX_ROWS ? h('div', { class: 'mrow more' }, T('panel.providers.moreRows', { count: fmt.num(found.length - MAX_ROWS) })) : null].flat().filter(Boolean));
    };
    paint();
    const total = listOf(p).length;
    const dated = listDate(p) ? T('panel.providers.listDate', { date: fmt.date(listDate(p)), count: fmt.num(total) }) : '';
    const num = (id) => h('input', { type: 'number', id, min: '0', step: 'any', inputmode: 'decimal', disabled: locked });
    const typed = h('input', { type: 'text', id: 'addModel', required: true, autocomplete: 'off', spellcheck: 'false', disabled: locked });
    const input = num('addIn'), output = num('addOut');
    const optional = (n) => (Number.isNaN(n) ? null : n);
    return h('section', { class: 'card' }, h('h2', {}, T('panel.providers.modelTitle', { provider: preset?.label ?? p })),
      locked ? notice('warn', null, T('panel.providers.locked'), h('button', { class: 'btn', type: 'button', onclick: () => goStep(2) }, T('panel.providers.toKey'))) : null,
      total ? [h('p', { class: 'help' }, [T('panel.providers.modelHelp'), dated, textOr(`panel.preset.${p}.priceNote`)].filter(Boolean).join(' ')),
        h('div', { class: 'wizSearch' }, h('input', { type: 'search', id: 'wizSearch', value: ui.wiz.q, placeholder: T('panel.providers.search'), 'aria-label': T('panel.providers.search'), autocomplete: 'off', oninput: (e) => { ui.wiz.q = e.target.value; paint(); } })), box] : null,
      h('div', { class: 'divide' }, h('h3', {}, T('panel.providers.typedTitle')),
        h('p', { class: 'rule' }, T('panel.providers.typedRule'), ' ', preset ? [T(`panel.preset.${p}.form`), ' ', T('panel.providers.typedWhere'), ' ', link(preset.modelsUrl)] : T('panel.providers.typedCustom')),
        h('form', { onsubmit: (e) => { e.preventDefault(); err.textContent = ''; addToCatalog(p, { id: typed.value.trim(), input: optional(input.valueAsNumber), output: optional(output.valueAsNumber) }, err); } },
          h('div', { class: 'formRow' },
            h('label', { class: 'field wide' }, T('panel.models.idLabel'), typed),
            h('label', { class: 'field num' }, T('panel.models.inputLabel'), input),
            h('label', { class: 'field num' }, T('panel.models.outputLabel'), output),
            h('button', { class: 'btn', type: 'submit', id: 'addModelBtn', disabled: locked }, T('panel.models.add')))),
        h('p', { class: 'rule' }, T('panel.providers.noPrice'))),
      err, nextBtn(4, 'panel.providers.toTry'));
  }

  // One model's Try button and its result: the result stays on the page while the list is redrawn
  function tryParts(p, id) {
    const key = `${p}/${id}`;
    const res = h('div', { role: 'status', class: 'resWrap' });
    const paint = () => {
      const r = ui.tests[key];
      if (!r) return res.replaceChildren();
      res.replaceChildren(h('div', { class: `res ${r.ok ? 'good' : 'bad'}` }, r.ok ? T('panel.test.ok', { seconds: fmt.num(Math.round(r.seconds * 10) / 10), usd: fmt.usd(r.usd) }) : T(`panel.test.${r.code}`), r.detail ? h('code', {}, ` ${clip(r.detail)}`) : null));
    };
    const btn = h('button', { class: 'btn', type: 'button', id: `t-${key}`, disabled: !hasKey(p), onclick: async () => {
      btn.disabled = true;
      btn.replaceChildren(h('i', { class: 'spin', 'aria-hidden': 'true' }), T('panel.test.running'));
      const r = await api('POST', '/api/test', { provider: p, model: id });
      btn.disabled = false;
      btn.replaceChildren(T('panel.test.try'));
      if (r.ok) ui.tests[key] = r.data; else if (r.status) ui.tests[key] = { code: ['busy', 'tooMany'].includes(r.data.code) ? r.data.code : 'other' };
      paint();
    } }, T('panel.test.try'));
    paint();
    return { btn, res };
  }
  function stepTry() {
    const p = wizName();
    const ids = Object.keys(S.catalog?.[p] ?? {});
    return h('section', { class: 'card' }, h('h2', {}, T('panel.providers.tryTitle')), h('p', { class: 'help' }, T('panel.providers.tryHelp')),
      ids.length
        ? h('div', { class: 'mlist' }, ids.map((id) => { const { btn, res } = tryParts(p, id); return h('div', { class: 'mrow two' }, h('code', {}, id), h('span', { class: 'acts' }, btn), res); }))
        : notice('warn', null, T('panel.providers.tryEmpty'), h('button', { class: 'btn', type: 'button', onclick: () => goStep(3) }, T('panel.providers.step3'))),
      h('div', { class: 'divide' }, h('h3', {}, T('panel.providers.errorsTitle')),
        h('div', { class: 'errs' }, ['auth', 'balance', 'model', 'rate', 'noTools'].map((c) => h('div', {}, h('b', {}, T(`panel.test.name.${c}`)), h('span', {}, T(`panel.test.${c}`)))))),
      h('div', { class: 'wizNext' }, h('button', { class: 'prim', type: 'button', onclick: () => goTo('jobs') }, T('panel.providers.toJobs'))));
  }

  function providerCard(p) {
    const info = S.providers[p], k = info.keyInfo;
    const err = h('div', { class: 'formErr', role: 'alert' });
    const remove = async (id) => {
      const r = await api('DELETE', '/api/catalog', { provider: p, model: id });
      if (r.ok) { await load(); renderTab(); toast(T('panel.saved')); } else if (r.status) err.textContent = r.data.message ?? T('panel.err.failed');
    };
    const models = Object.entries(S.catalog?.[p] ?? {});
    return h('section', { class: 'card' },
      h('div', { class: 'keyHead' }, h('h2', {}, S.presets[p]?.label ?? p), h('span', { class: `status${k.present ? ' on' : ''}` }, T(k.present ? 'panel.keys.has' : 'panel.key.none'))),
      k.present
        ? h('dl', { class: 'kv' },
          h('div', {}, h('dt', {}, T('panel.keys.address')), h('dd', {}, k.host ?? '-')),
          h('div', {}, h('dt', {}, T('panel.keys.added')), h('dd', {}, k.addedAt ? fmt.date(k.addedAt) : '-')))
        : null,
      models.length
        ? [h('div', { class: 'mlist' }, h('div', { class: 'mrow head' }, h('span', {}, T('panel.col.model')), h('span', {}, T('panel.col.input')), h('span', {}, T('panel.col.output')), h('span', { class: 'ctx' }, T('panel.col.context')), h('span', { class: 'acts' })),
          models.map(([id, m]) => {
            const { btn, res } = tryParts(p, id);
            return h('div', { class: 'mrow' }, h('code', {}, id), h('span', {}, money(m?.input)), h('span', {}, money(m?.output)), h('span', { class: 'ctx' }, typeof m?.context === 'number' ? fmt.short(m.context) : '-'),
              h('span', { class: 'acts' }, btn, h('button', { class: 'btn', type: 'button', 'aria-label': T('panel.models.removeLabel', { model: id }), onclick: () => remove(id) }, T('panel.models.remove'))), res);
          })),
        h('p', { class: 'help' }, `${T('panel.models.perMillion')} ${T('panel.models.removeEffect')}`)]
        : null,
      err,
      commandRow(T(k.present ? 'panel.keys.change' : 'panel.keys.add'), `${SET_KEY} ${p}`),
      k.present ? commandRow(T('panel.keys.removeCmd'), `${REMOVE_KEY} ${p}`) : null,
      limitForm(p, info));
  }
  function limitForm(p, info) {
    const err = h('div', { class: 'formErr', role: 'alert' });
    const input = h('input', { type: 'number', id: `limit-${p}`, min: '0.01', step: 'any', inputmode: 'decimal', required: true, value: info.limit ?? '' });
    const full = info.limit && info.spentToday >= info.limit;
    const fillEl = h('i');
    if (info.limit) fillEl.style.width = `${Math.min(100, (info.spentToday / info.limit) * 100)}%`;
    return h('div', { class: 'divide' },
      h('form', { onsubmit: async (e) => {
        e.preventDefault();
        err.textContent = '';
        const r = await api('POST', '/api/limit', { provider: p, usd: input.valueAsNumber });
        if (r.ok) { await load(); renderTab(); toast(T('panel.saved')); } else if (r.status) err.textContent = r.data.message ?? T('panel.err.limit');
      } },
      h('div', { class: 'formRow' },
        h('label', { class: 'field num' }, T('panel.keys.limit'), input),
        h('button', { class: 'btn', type: 'submit', id: `saveLimit-${p}` }, T('panel.keys.saveLimit')))),
      err,
      info.limit
        ? h('div', { class: 'pl' },
          h('div', { class: 'plh' }, h('span', {}, T('panel.usage.limitOf', { spent: fmt.usd(info.spentToday), limit: fmt.usd(info.limit) }))),
          h('div', { class: `track${full ? ' full' : ''}` }, fillEl),
          full ? h('div', { class: 'gr' }, h('b', {}, T('panel.usage.limitReached')), ' · ', T('panel.usage.limitFull')) : null)
        : h('p', { class: 'help' }, T('panel.usage.noLimit', { provider: p })));
  }

  // ---- start
  document.addEventListener('DOMContentLoaded', async () => {
    const fromHash = location.hash.slice(1); // read here: the secret was stripped when this script started
    if (['usage', 'jobs', 'providers'].includes(fromHash)) ui.tab = fromHash;
    if (['models', 'keys'].includes(fromHash)) ui.tab = 'providers'; // addresses from before the two tabs became one
    if (!(await load({ withSide: true }))) return;
    ui.wiz.pick = Object.keys(S.presets)[0];
    shell();
    renderTab();
    refreshIfOld();
  });
})();
