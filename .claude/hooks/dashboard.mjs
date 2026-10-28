#!/usr/bin/env node
// The project owner's control panel: dashboard.html (not in git).
//   node .claude/hooks/dashboard.mjs [root] [--quiet]
// The Stop hook runs it after every Claude answer; while open, the page reloads itself every 30 s.
// Sources: docs/*.md, git history, .kit.json, .claude/state/usage.json, .previews/. Costs no tokens.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { readStatus, readText, sections, findSection, tally, tableRows } from './status-read.mjs';
import { verdict, isValue } from './labels.mjs';
import { readLimits, summary, level, THRESHOLDS } from './usage.mjs';
import { packageStatus, commandMode } from './tools.mjs';
import { readModels, modelsFile, modelsNote, roleLabel } from './models.mjs';
import { OLD_SIZES } from './progress.mjs';
import { readLang, t } from './lang.mjs';
import { acceptanceStatus, accounts, flags, unitEconomics, feedback, learning, qaSummary, metrics, githubStatus, readContext, findingReports, FINDING_KINDS, producedAssets, costSummary, councilMinutes, spendAlarms, envWarnings, repeatedBugClasses } from './dashboard-data.mjs';

const args = process.argv.slice(2);
const quiet = args.includes('--quiet');
// Running as a hook (--quiet), an error must not break Claude's flow
if (quiet) process.on('uncaughtException', () => process.exit(0));
const root = path.resolve(args.find((a) => !a.startsWith('--')) ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd());
const file = (f) => path.join(root, f);
// Every visible text comes from messages.mjs in the project language (L = t with this project's root)
const L = (key, vars) => t(root, key, vars);
const dateKind = (k) => (k === 'expiry' ? L('dashboard.dateExpiry') : L('dashboard.dateKeyRotation'));
const kindName = (k) => (Object.hasOwn(FINDING_KINDS, k) ? L(`dashboard.findingKind.${k}`) : k);
// The dashboard is made in the user's language: none before /start or /adopt asks it
const lang = readLang(root);
if (!lang) { if (!quiet) console.log('No language chosen yet: the dashboard is made after /start or /adopt asks it.'); process.exit(0); }
// Dates follow the conversation language (English when the runtime does not know the code)
const loc = (() => { try { return Intl.DateTimeFormat.supportedLocalesOf(lang)[0] ?? 'en'; } catch { return 'en'; } })();

// ---------- data ----------
const d = readStatus(root);
const limit = readLimits(root);
const a = d.fields;

function gitInfo() {
  const g = (...arg) => execFileSync('git', arg, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  try {
    g('rev-parse', '--is-inside-work-tree');
  } catch {
    return null;
  }
  const info = { branch: '', changed: [], commits: [], progressStale: 0 };
  try { info.branch = g('branch', '--show-current'); } catch { /* */ }
  try { info.changed = g('status', '--porcelain').split('\n').filter(Boolean); } catch { /* */ }
  try {
    info.commits = g('log', '-300', '--since=60.days', '--date=iso-strict', '--pretty=format:%h%x1f%ad%x1f%s')
      .split('\n').filter(Boolean).map((s) => {
        const [hash, date, message] = s.split('\x1f');
        return { hash, date, message, kind: (message.match(/^(\w+)(\(.+?\))?!?:/)?.[1] ?? L('dashboard.commitKindOther')).toLowerCase() };
      });
    const latest = g('log', '-1', '--format=%H', '--', 'docs/workflow/progress.md');
    if (latest) info.progressStale = Number(g('rev-list', '--count', `${latest}..HEAD`));
  } catch { /* before the first commit */ }
  return info;
}
const git = gitInfo();

// PRD: problem, value proposition, MVP features
const prd = sections(readText(file('docs/product/prd.md')));
const firstSentence = (b) => (b ?? '').split('\n').map((s) => s.trim()).find((s) => s && !s.startsWith('>') && !s.startsWith('[')) ?? '';
const mvp = findSection(prd, '5. MVP').split(/^### /m).slice(1).map((p) => {
  const [title, ...body] = p.split('\n');
  const text = body.join('\n');
  return { title: title.trim(), priority: text.match(/\*\*Priority:\*\*\s*(.+)/)?.[1]?.trim() ?? '', ...tally(text) };
}).filter((o) => !o.title.includes('[') && o.title !== '...');
const outOfScope = findSection(prd, '6. Out of scope').split('\n').map((s) => s.trim()).filter((s) => /^- \S/.test(s) && !s.includes('[')).map((s) => s.slice(2));

const stack = tableRows(sections(readText(file('docs/architecture/stack.md')))['Chosen technologies'], 2).map(([layer, choice]) => ({ layer, choice }));
const criticalFlows = tableRows(findSection(sections(readText(file('docs/quality/test-plan.md'))), '1. Critical'), 6)
  .map(([no, feed, , kind, fileName, state]) => ({ no, feed, kind, fileName, state }));
const cost = tableRows(readText(file('docs/workflow/cost-log.md')), 6)
  .map(([date, job, size, startPct, endPct, diff]) => ({ date, job, size, diff: parseFloat(String(diff).replace('%', '').replace(',', '.')) }));
const maintenance = tableRows(sections(readText(file('docs/operations/maintenance.md')))['Maintenance log'], 4)
  .map(([date, kind, findings, work]) => ({ date, kind, findings, work }));
const unreleased = findSection(sections(readText(file('CHANGELOG.md'))), '[Unreleased]')
  .split('\n').map((s) => s.trim()).filter((s) => /^- \S/.test(s)).map((s) => s.slice(2));
const lastRetro = Object.keys(sections(readText(file('docs/quality/retros.md')))).filter((b) => /^\d{4}-/.test(b)).pop() ?? '';
const designDirection = tableRows(findSection(sections(readText(file('docs/design/design-guide.md'))), '1. Chosen'), 2)
  .filter(([, choice]) => choice && !choice.startsWith('[')).map(([area, choice]) => ({ area, choice }));

const assets = producedAssets(root);
const councils = councilMinutes(root);
let tokenCost = null;
try { const c = JSON.parse(fs.readFileSync(file('.claude/state/cost.json'), 'utf8')); tokenCost = { ...costSummary(c.data), readAt: c.readAt }; } catch { /* cost.mjs has not run yet */ }
let previews = [];
try {
  previews = fs.readdirSync(file('.previews'), { withFileTypes: true }).filter((e) => e.isDirectory()).map((e) => {
    const html = fs.readdirSync(file(`.previews/${e.name}`)).filter((f) => /\.(html|png)$/.test(f));
    return { name: e.name, files: html };
  }).sort((x, y) => x.name.localeCompare(y.name));
} catch { /* no previews */ }

const acceptance = acceptanceStatus(root);
let qa = null;
try {
  const f = fs.readdirSync(file('docs/quality/qa')).filter((x) => /^\d{4}-.*\.md$/.test(x)).sort().pop();
  const s = f && qaSummary(readText(file(`docs/quality/qa/${f}`)));
  if (s) qa = { file: `docs/quality/qa/${f}`, name: f.slice(0, -3), ...s };
} catch { /* no /qa run yet */ }
const accountList = accounts(readText(file('docs/operations/accounts.md')));
const flagList = flags(readText(file('docs/operations/feature-flags.md')));
const alarmList = spendAlarms(readText(file('docs/operations/spend-alarms.md')));
const economics = unitEconomics(readText(file('docs/product/unit-economics.md')));
const fb = feedback(readText(file('docs/product/feedback.md')));
const learnt = learning(readText(file('docs/workflow/learning.md')));
const metricRecords = metrics(readText(file('docs/quality/metrics.md')));
const github = d.installed ? githubStatus(root) : null;
const context = readContext(root);
const findings = findingReports(readText(file('docs/findings/README.md')));

// Things that need attention
const alerts = [];
const addAlert = (sev, text, action = '') => alerts.push({ sev, text, action });
if (d.kitPending) addAlert('info', L('dashboard.alert.kitPending'), L('dashboard.act.startIdea'));
if (d.handoffPending) addAlert('warn', L('dashboard.alert.handoffPending'), '/handoff take');
const lastReject = [...d.board.meetings].reverse().find((t) => verdict(t.result) === 'reject');
if (lastReject && !lastReject.decision) addAlert('critical', L('dashboard.alert.boardReject', { kind: lastReject.kind, scope: lastReject.scope, critical: lastReject.critical || L('dashboard.criticalFinding') }), L('dashboard.act.askClaudeFix'));
const limitLevel = level(limit);
const limitShort = limit ? [[L('dashboard.limit5h'), limit.five_hour], [L('dashboard.limitWeeklyLower'), limit.seven_day]].filter(([, p]) => p)
  .map(([name, p]) => `${name} %${Math.round(p.percent)}${p.resetsAt ? ` ${L('dashboard.resetsParen', { when: new Date(p.resetsAt * 1000).toLocaleString(loc, { weekday: 'short', hour: '2-digit', minute: '2-digit' }) })}` : ''}`).join(', ') : '';
if (limitLevel === 'red') addAlert('critical', L('dashboard.alert.limitRed', { short: limitShort }), L('dashboard.act.limitRed'));
else if (limitLevel === 'yellow') addAlert('warn', L('dashboard.alert.limitYellow', { short: limitShort }), L('dashboard.act.limitYellow'));
for (const b of d.pending) addAlert('warn', L('dashboard.alert.pendingDecision', { text: b }), L('dashboard.act.claudeWaiting'));
for (const k of d.leftOff) addAlert('warn', L('dashboard.alert.leftOff', { text: k }), L('dashboard.act.buildContinue'));
for (const s of d.issues.slice(0, 5)) addAlert('warn', L('dashboard.alert.openIssue', { text: s }));
for (const r of repeatedBugClasses(root)) addAlert('info', L('dashboard.alert.repeatedBug', { count: r.specs.length, cls: r.cls, specs: r.specs.join(', ') }), '/retro');
if (git?.changed.length > 15) addAlert('info', L('dashboard.alert.uncommitted', { count: git.changed.length }), L('dashboard.act.commitOrWrapUp'));
if (git?.progressStale >= 3) addAlert('info', L('dashboard.alert.progressStale', { count: git.progressStale }), '/wrap-up');
const off = (a['Question mode'] ?? '').match(/(?:kapalı konular|closed topics):\s*(.+)$/i)?.[1];
if (off && !isValue(off, 'none')) addAlert('info', L('dashboard.alert.closedTopics', { topics: off }), L('dashboard.act.askModeOpen'));
if (d.installed && isValue(d.board.state, 'notSetUp') && !isValue(a['Active phase'], 'setup')) addAlert('info', L('dashboard.alert.boardNotSetUp'), '/board setup');
if (github?.liveMonitoring?.length) addAlert('critical', L('dashboard.alert.liveMonitoring', { title: github.liveMonitoring[0].title }), L('dashboard.act.fixLive', { number: github.liveMonitoring[0].number }));
else if (github?.liveRun?.conclusion === 'failure') addAlert('critical', L('dashboard.alert.liveRunFailed'), L('dashboard.act.fixLiveShort'));
const lastMain = github?.runs?.find((c) => /^(main|master)$/.test(c.headBranch) && c.workflowName === 'CI');
if (lastMain?.conclusion === 'failure') addAlert('warn', L('dashboard.alert.ciFailed'), L('dashboard.act.operationsTab'));
for (const h of accountList) for (const t of h.dates) {
  if (t.left < 0) addAlert('critical', L('dashboard.alert.dateOverdue', { service: h.service, kind: dateKind(t.kind), date: t.date }), 'docs/operations/accounts.md');
  else if (t.left <= 30) addAlert('warn', L('dashboard.alert.dateSoon', { service: h.service, kind: dateKind(t.kind), left: t.left, date: t.date }), L('dashboard.act.renew'));
}
for (const h of accountList.filter((x) => x.noTwoFactor)) addAlert('warn', L('dashboard.alert.noTwoFactor', { service: h.service }), 'docs/operations/accounts.md');
for (const o of envWarnings(root)) addAlert(o.sev, o.text, o.action);
for (const alarm of alarmList.filter((x) => x.unset)) addAlert('warn', L('dashboard.alert.spendUnset', { service: alarm.service }), 'docs/operations/spend-alarms.md');
if (economics && economics.margin < 0) addAlert('critical', L('dashboard.alert.negativeEconomics', { amount: Math.abs(economics.margin).toFixed(1), currency: economics.currency }), L('dashboard.act.priceDecision'));
for (const k of acceptance.mismatched.slice(0, 3)) addAlert('warn', L(k.result === 'failed' ? 'dashboard.alert.acceptRed' : k.test ? 'dashboard.alert.acceptNoResult' : 'dashboard.alert.acceptMissing', { id: k.id }), L('dashboard.act.acceptFix'));
const overdue = flagList.filter((b) => b.isOverdue);
if (overdue.length) addAlert('info', L('dashboard.alert.flagsOverdue', { count: overdue.length, names: overdue.map((b) => b.name).join(', ') }), L('dashboard.act.removeFlag'));
if (fb.newCount) addAlert('info', L('dashboard.alert.newFeedback', { count: fb.newCount }), '/user-feedback');
const enabledPackages = (() => { try { return packageStatus(root).filter((p) => p.enabled).map((p) => p.name); } catch { return []; } })();
if (enabledPackages.length) addAlert('info', L('dashboard.alert.packagesOn', { names: enabledPackages.join(', ') }), L('dashboard.act.packagesOff'));
const cmdMode = (() => { try { return commandMode(root).mode; } catch { return 'light'; } })();
if (cmdMode !== 'full' && isValue(a['Profile'], 'full')) addAlert('info', L('dashboard.alert.cmdListLight'), L('dashboard.act.cmdFull'));
else if (cmdMode !== 'light' && !isValue(a['Profile'], 'full')) addAlert('info', L('dashboard.alert.cmdListHeavy', { mode: cmdMode === 'full' ? L('dashboard.cmdModeFull') : L('dashboard.cmdModeMixed') }), L('dashboard.act.cmdLight'));
if (assets.codeMapDays > 30) addAlert('info', L('dashboard.alert.codeMapStale', { days: assets.codeMapDays }), L('dashboard.act.understand'));
if (context?.percent >= 70 && Date.now() - context.readAt < 3600e3) addAlert('warn', L('dashboard.alert.contextFull', { percent: context.percent }), L('dashboard.act.wrapUpClear'));
for (const r of Object.values(findings.latest)) if (r.critical > 0) addAlert('warn', L('dashboard.alert.findingsCritical', { kind: kindName(r.kind), critical: r.critical, health: r.health }), `docs/findings/${r.kind}/latest.md`);
// Severity order: critical > warn > info (same severity keeps insertion order)
const SEVERITY_ORDER = { critical: 0, warn: 1, info: 2 };
alerts.sort((x, y) => SEVERITY_ORDER[x.sev] - SEVERITY_ORDER[y.sev]);
const health = alerts.some((x) => x.sev === 'critical') ? 'critical' : alerts.some((x) => x.sev === 'warn') ? 'warn' : 'good';

// Activity: commit count for the last 14 days and the merged feed
// "2026-10-26" alone is read as UTC midnight (the day before west of UTC): a date-only text is local midnight
const toDate = (t) => new Date(/^\d{4}-\d{2}-\d{2}$/.test(String(t).trim()) ? `${String(t).trim()}T00:00` : t);
const dayKey = (t) => { const z = new Date(t); return `${z.getFullYear()}-${String(z.getMonth() + 1).padStart(2, '0')}-${String(z.getDate()).padStart(2, '0')}`; };
const days = [...Array(14)].map((_, i) => { const z = new Date(); z.setDate(z.getDate() - (13 - i)); return dayKey(z); });
const dayCounts = Object.fromEntries(days.map((g) => [g, 0]));
for (const c of git?.commits ?? []) { const g = dayKey(c.date); if (g in dayCounts) dayCounts[g]++; }
const last7 = days.slice(7).reduce((t, g) => t + dayCounts[g], 0);
const last30 = (git?.commits ?? []).filter((c) => Date.now() - new Date(c.date) < 30 * 864e5);
const kindCounts = last30.reduce((m, c) => ((m[c.kind] = (m[c.kind] ?? 0) + 1), m), Object.create(null)); // a "constructor:" commit is a plain key
const fixRatio = (kindCounts.feat ?? 0) + (kindCounts.fix ?? 0) ? Math.round(((kindCounts.fix ?? 0) / ((kindCounts.feat ?? 0) + (kindCounts.fix ?? 0))) * 100) : null;

const feed = [
  ...(git?.commits ?? []).slice(0, 60).map((c) => ({ time: c.date, kind: 'commit', title: c.message, extra: c.hash })),
  ...d.decisions.map((k) => ({ time: k.date, kind: 'decision', title: `${k.question} → ${k.chosen}`, extra: `${k.topic} · ${k.decidedBy}` })),
  ...d.board.meetings.map((t) => ({ time: t.date, kind: 'board', title: `${t.kind}: ${t.scope} → ${t.result}`, extra: t.attendees })),
  ...maintenance.map((b) => ({ time: b.date, kind: 'maintenance', title: `${b.kind}: ${b.findings}`, extra: b.work })),
].filter((x) => x.time && !Number.isNaN(toDate(x.time).getTime()))
  .sort((x, y) => toDate(y.time) - toDate(x.time)).slice(0, 50);

const autoDecisions = d.decisions.filter((k) => isValue(k.decidedBy, 'automatic')).length;
const rejectCount = d.board.meetings.filter((t) => verdict(t.result) === 'reject').length;
const mvpCriteria = mvp.reduce((t, o) => ({ done: t.done + o.done, total: t.total + o.total }), { done: 0, total: 0 });
const avgCost = Object.entries(cost.reduce((m, r) => {
  if (!Number.isNaN(r.diff)) (m[OLD_SIZES[r.size] ?? r.size] ??= []).push(r.diff);
  return m;
}, Object.create(null))).map(([size, l]) => ({ size, avg: l.reduce((t, x) => t + x, 0) / l.length, n: l.length }));

// ---------- helpers ----------
const e = (s = '') => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const md = (s) => e(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
const percent = (b, t) => (t ? Math.round((b / t) * 100) : 0);
const progressBar = (b, t, cls = '') => `<div class="bar ${cls}" role="img" aria-label="${b}/${t}"><span style="width:${percent(b, t)}%"></span></div>`;
const empty = (text, action = '') => `<p class="empty">${md(text)}${action ? ` <code>${e(action)}</code>` : ''}</p>`;
const SEV = { critical: ['⛔', 'dashboard.sevCritical'], warn: ['⚠', 'dashboard.sevWarn'], info: ['ℹ', 'dashboard.sevInfo'], good: ['✓', 'dashboard.sevGood'] };
const FEED_KEYS = { commit: 'dashboard.feedCommit', decision: 'dashboard.feedDecision', board: 'dashboard.feedBoard', maintenance: 'dashboard.feedMaintenance' };
const feedLabel = (k) => (Object.hasOwn(FEED_KEYS, k) ? L(FEED_KEYS[k]) : k);
const onOff = (v) => (isValue(v, 'on') ? L('dashboard.on') : isValue(v, 'off') ? L('dashboard.off') : v);
// A text for the page's own script: a single-quoted JS string, no tag can end the script block
const jsStr = (key) => `'${L(key).replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/</g, '\\u003c')}'`;
// A board verdict in either language; an option name (decision council) or an unreadable result is neutral
const verdictBadge = (k) => badge({ approve: 'good', conditional: 'warn', reject: 'critical' }[verdict(k)] ?? 'info', k);
const badge = (sev, caption) => `<span class="badge ${sev}"><span class="ic" aria-hidden="true">${SEV[sev][0]}</span> ${e(caption ?? L(SEV[sev][1]))}</span>`;
const fmtDate = (t) => { const z = toDate(t); return Number.isNaN(z.getTime()) ? e(t) : z.toLocaleString(loc, { day: '2-digit', month: 'short', hour: t.length > 10 ? '2-digit' : undefined, minute: t.length > 10 ? '2-digit' : undefined }); };
const limitSeverity = (p, k) => (p == null ? 'info' : p >= THRESHOLDS[k].red ? 'critical' : p >= THRESHOLDS[k].yellow ? 'warn' : 'good');
const TOPICS = ['product', 'tech', 'design', 'content', 'data', 'security', 'cost'];
// Decision log topics before 3.48, in the same order; they count under the English topic
const TOPICS_TR = ['urun', 'teknik', 'tasarim', 'icerik', 'veri', 'guvenlik', 'maliyet'];
const topicKey = (topic = '') => { const k = topic.trim().toLowerCase(); return TOPICS[TOPICS_TR.indexOf(k)] ?? k; };

// The command to paste into Claude: "`/build G-013` …" or "/wrap-up ve /clear" → first command, without its <placeholder> or note
const cmdOf = (s = '') => { const m = String(s).match(/`(\/[^`\n]+)`/) ?? String(s).match(/^(\/.*)$/); return m ? m[1].split(/ ve | ile | and | to |\s*\(/)[0].replace(/\s*[[<].*$/, '').trim() : ''; };
const copyBtn = (s) => { const c = cmdOf(s); return c ? ` <button class="copy-cmd" type="button" data-cmd="${e(c)}" aria-label="${e(L('dashboard.copyAria', { command: c }))}">${e(L('dashboard.copy'))}</button>` : ''; };
const alertRow = (x) => `<li class="${x.sev}"><span class="ic" aria-hidden="true">${SEV[x.sev][0]}</span><span><span class="sr-only">${L(SEV[x.sev][1])}: </span>${md(x.text)}</span>${x.action ? `<span class="action">→ ${md(x.action)}${copyBtn(x.action)}</span>` : ''}</li>`;
const kpi = (label, value, sub = '', bar = '') => `<div class="kpi"><div class="kpi-l">${e(label)}</div><div class="kpi-v">${value}</div>${bar}<div class="kpi-s">${sub}</div></div>`;

// ---------- sections ----------
// A pre-3.48 value says "Faz 1"; the roadmap headings are read as "Phase 1"
const activePhase = (a['Active phase'] ?? '').replace(/^faz\b/i, 'Phase').replace(/^başlangıç(?![\p{L}\p{N}])/iu, 'Setup');
const activeIndex = Math.max(0, [{ name: 'Setup' }, ...d.phases].findIndex((f) => activePhase.toLowerCase().startsWith(f.name.toLowerCase().split(' ').slice(0, 2).join(' '))));
const start = (a['Setup step'] ?? '0/9').split('/').map(Number);
const stageStrip = `<ol class="steps">${[{ name: 'Setup', done: start[0] || 0, total: start[1] || 9 }, ...d.phases].map((f, i) =>
  `<li class="step${i === activeIndex ? ' now' : ''}${f.total && f.done === f.total ? ' done' : ''}"><span class="step-n">${i === 0 ? e(L('dashboard.stageStartLetter')) : i - 1}</span><div class="step-b"><b>${e(i === 0 ? L('dashboard.stageStart') : f.name.replace(/\s*\(.*\)$/, ''))}</b>${progressBar(f.done, f.total)}<span class="muted num">${f.done}/${f.total}</span></div></li>`).join('')}</ol>`;

const overview = `
<div class="grid2">
  <section class="card"><h3>${L('dashboard.statusSummary')}</h3>${d.state ? `<p>${md(d.state)}</p>` : empty(L('dashboard.noSummary'))}
    <h4>${L('dashboard.lastSession')}</h4>${d.lastSession.length ? `<ul>${d.lastSession.map((s) => `<li>${md(s)}</li>`).join('')}</ul>` : empty(L('dashboard.noRecords'))}</section>
  <section class="card"><h3>${L('dashboard.recentActivity')}</h3>${feed.length ? `<ul class="feed compact">${feed.slice(0, 7).map(feedRow).join('')}</ul>` : empty(L('dashboard.noActivity'))}</section>
</div>
<section class="card"><h3>${L('dashboard.stages')}</h3>${stageStrip}</section>`;

function feedRow(x) {
  return `<li class="feed-i t-${x.kind}"><span class="ft">${e(feedLabel(x.kind))}</span><div><div>${md(x.title)}</div><div class="muted small">${fmtDate(x.time)}${x.extra ? ' · ' + e(x.extra) : ''}</div></div></li>`;
}

const roadmapSection = d.phases.length ? d.phases.map((f) => `
<details class="card phase" ${f.name.toLowerCase().startsWith((activePhase || '#').toLowerCase().split(' ').slice(0, 2).join(' ')) ? 'open' : ''}>
  <summary><b>${e(f.name)}</b><span class="phase-bar">${progressBar(f.done, f.total)}<span class="num muted">${f.done}/${f.total}</span></span></summary>
  <ul class="tasks">${f.tasks.map((g) => `<li class="${g.done ? 'ok' : ''}${(a['Active task'] && g.text.startsWith(a['Active task'])) ? ' active' : ''}"><span class="chk" aria-hidden="true">${g.done ? '✓' : ''}</span><span>${md(g.text)}</span></li>`).join('')}</ul>
</details>`).join('') : empty(L('dashboard.noRoadmap'));

const decisionTable = d.decisions.length ? `
<div class="filters" role="group" aria-label="${e(L('dashboard.topicFilter'))}"><button class="chip on" data-k="all">${L('dashboard.all')} (${d.decisions.length})</button>${TOPICS.filter((k) => d.decisions.some((x) => topicKey(x.topic) === k)).map((k) => `<button class="chip" data-k="${k}">${k} (${d.decisions.filter((x) => topicKey(x.topic) === k).length})</button>`).join('')}<button class="chip" data-k="automatic">${L('dashboard.auto')} (${autoDecisions})</button><button class="chip" data-k="one-way">${L('dashboard.oneWay')} (${d.decisions.filter((k) => isValue(k.door, 'oneWay')).length})</button></div>
<div class="tw"><table id="decision-table"><thead><tr><th>#</th><th>${L('dashboard.th.date')}</th><th>${L('dashboard.th.stage')}</th><th>${L('dashboard.th.topic')}</th><th>${L('dashboard.th.question')}</th><th>${L('dashboard.th.chosen')}</th><th>${L('dashboard.th.door')}</th><th>${L('dashboard.th.decidedBy')}</th></tr></thead><tbody>
${[...d.decisions].reverse().map((k) => `<tr data-k="${e(topicKey(k.topic))}" data-v="${isValue(k.decidedBy, 'automatic') ? 'automatic' : ''}" data-door="${isValue(k.door, 'oneWay') ? 'one-way' : ''}"><td class="num">${e(k.no)}</td><td class="num nw">${e(k.date)}</td><td>${e(k.stage)}</td><td><span class="tag">${e(k.topic)}</span></td><td>${md(k.question)}</td><td><b>${md(k.chosen)}</b></td><td>${isValue(k.door, 'oneWay') ? badge('warn', L('dashboard.oneWay')) : k.door ? `<span class="muted small">${e(k.door)}</span>` : ''}</td><td>${isValue(k.decidedBy, 'automatic') ? badge('warn', L('dashboard.auto')) : badge('good', L('dashboard.user'))}</td></tr>`).join('')}
</tbody></table></div>` : empty(L('dashboard.noDecisions'));

const boardSection = `
<div class="grid2">
  <section class="card"><h3>${L('dashboard.members')} · ${e(isValue(d.board.state, 'setUp') ? L('dashboard.boardSetUp') : isValue(d.board.state, 'notSetUp') ? L('dashboard.notSetUp') : d.board.state)}</h3>${d.board.members.length ? `<ul class="members">${d.board.members.map((u) => `<li><b>${e(u.member)}</b><span class="muted small">${e(u.model)} · ${e(u.focus)}</span></li>`).join('')}</ul>` : empty(L('dashboard.boardNotSetUp'), '/board setup')}
    <p class="muted small">${L('dashboard.commitReview', { value: e(onOff(d.board.commitReview)) })}</p></section>
  <section class="card"><h3>${L('dashboard.summary')}</h3><div class="kpis mini">${kpi(L('dashboard.kpiMeetings'), d.board.meetings.length)}${kpi(L('dashboard.kpiRejects'), rejectCount, rejectCount ? badge('critical', L('dashboard.criticalFinding')) : '')}${kpi(L('dashboard.kpiApproval'), d.board.meetings.length ? `%${percent(d.board.meetings.filter((t) => verdict(t.result) === 'approve').length, d.board.meetings.length)}` : '-')}</div></section>
</div>
<section class="card"><h3>${L('dashboard.councilHeading')}</h3>${councils.length ? (() => {
  const latest = councils[0];
  const decisionBadge = (k) => (!k ? badge('info', L('dashboard.noDecision')) : verdictBadge(k));
  return `<h4>${L('dashboard.latestCouncil', { topic: md(latest.topic) })}</h4><div class="kpis mini">${kpi(L('dashboard.th.decision'), decisionBadge(latest.decision))}${kpi(L('dashboard.th.consensus'), latest.consensus == null ? '-' : `%${latest.consensus}`, latest.consensus != null && latest.consensus < 60 ? badge('warn', L('dashboard.low')) : '')}${kpi(L('dashboard.kpiDisputed'), latest.disputed)}${kpi(L('dashboard.kpiEliminated'), latest.eliminated, L('dashboard.byCrossVote'))}</div>
  ${latest.ranking.length ? `<h4>${L('dashboard.overallRanking')}</h4><div class="rows">${latest.ranking.map((r, i) => `<div class="row"><span><b>${i + 1}.</b> ${L('dashboard.opinion', { letter: e(r.opinion) })}${r.who ? ` <span class="muted small">${e(r.who)}</span>` : ''}</span><span class="num muted">${L('dashboard.avg', { average: e(r.average) })}</span></div>`).join('')}</div>` : ''}
  <div class="tw"><table><thead><tr><th>${L('dashboard.th.date')}</th><th>${L('dashboard.th.kind')}</th><th>${L('dashboard.th.topic')}</th><th>${L('dashboard.th.decision')}</th><th>${L('dashboard.th.consensus')}</th><th>${L('dashboard.th.minutes')}</th></tr></thead><tbody>${councils.slice(0, 10).map((k) => `<tr><td class="num nw">${e(k.date)}</td><td>${e(k.kind)}</td><td>${md(k.topic)}</td><td>${decisionBadge(k.decision)}</td><td class="num">${k.consensus == null ? '-' : `%${k.consensus}`}</td><td><a href="${k.file.split('/').map(encodeURIComponent).join('/')}" target="_blank" rel="noopener">${L('dashboard.open')}</a></td></tr>`).join('')}</tbody></table></div>`;
})() : empty(L('dashboard.noCouncil'), '/board council <question>')}</section>
<section class="card"><h3>${L('dashboard.meetingLog')}</h3>${d.board.meetings.length ? `<div class="tw"><table><thead><tr><th>#</th><th>${L('dashboard.th.date')}</th><th>${L('dashboard.th.kind')}</th><th>${L('dashboard.th.scope')}</th><th>${L('dashboard.th.attendees')}</th><th>${L('dashboard.th.result')}</th><th>${L('dashboard.th.critical')}</th><th>${L('dashboard.th.userDecision')}</th></tr></thead><tbody>
${[...d.board.meetings].reverse().map((t) => `<tr><td class="num">${e(t.no)}</td><td class="num nw">${e(t.date)}</td><td>${e(t.kind)}</td><td>${md(t.scope)}</td><td>${e(t.attendees)}</td><td>${verdictBadge(t.result)}</td><td>${md(t.critical)}</td><td>${md(t.decision)}</td></tr>`).join('')}
</tbody></table></div>` : empty(L('dashboard.noMeetings'))}</section>`;

const quality = `
<div class="grid2">
  <section class="card"><h3>${L('dashboard.checklists')}</h3><div class="rows">${d.checklists.map((l) => `<div class="row"><span>${e(l.name)}</span>${progressBar(l.done, l.total)}<span class="num muted">${l.done}/${l.total}</span></div>`).join('')}</div></section>
  <section class="card"><h3>${L('dashboard.codeHealth')}</h3>
    <div class="kpis mini">${kpi(L('dashboard.th.commit'), last30.length)}${kpi(L('dashboard.fixRate'), fixRatio == null ? '-' : `%${fixRatio}`, 'fix / (feat + fix)')}${kpi(L('dashboard.uncommitted'), git ? git.changed.length : '-')}</div>
    ${Object.keys(kindCounts).length ? `<div class="rows">${Object.entries(kindCounts).sort((x, y) => y[1] - x[1]).map(([t, n]) => `<div class="row"><span><code>${e(t)}</code></span>${progressBar(n, last30.length)}<span class="num muted">${n}</span></div>`).join('')}</div>` : ''}
    <p class="muted small">${L('dashboard.fixRateNote')}</p></section>
</div>
${qa ? `<section class="card"><h3>${L('dashboard.lastQa', { name: e(qa.name) })}</h3><div class="kpis mini">${kpi(L('dashboard.passed'), qa.passed)}${kpi(L('dashboard.failed'), qa.failed, qa.failed ? badge('critical', L('dashboard.withEvidence')) : '')}${kpi(L('dashboard.notRun'), qa.notRun)}</div>${qa.failures.length ? `<ul>${qa.failures.slice(0, 5).map((x) => `<li>${md(x.criterion)}${x.note ? ` <span class="muted small">${e(x.note)}</span>` : ''}</li>`).join('')}</ul>` : ''}<p class="muted small"><a href="${e(qa.file)}" target="_blank" rel="noopener">${L('dashboard.openReport')}</a></p></section>` : ''}
<section class="card"><h3>${L('dashboard.acceptanceTests')}</h3>${acceptance.total ? `<div class="kpis mini">${kpi(L('dashboard.th.criterion'), acceptance.total)}${kpi(L('dashboard.kpiTested'), `${acceptance.tested}/${acceptance.total}`, '', progressBar(acceptance.tested, acceptance.total))}${kpi(L('dashboard.kpiPassing'), `${acceptance.passing}/${acceptance.total}`, acceptance.reportTime ? L('dashboard.reportTime', { when: new Date(acceptance.reportTime).toLocaleString(loc, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) }) : L('dashboard.noJunit'), progressBar(acceptance.passing, acceptance.total, 'good'))}</div>` : empty(L('dashboard.noAcceptanceIds'))}</section>
<section class="card"><h3>${L('dashboard.metricsMonthly')}</h3>${metricRecords.length ? `<div class="tw"><table><thead><tr><th>${L('dashboard.th.period')}</th><th>${L('dashboard.th.task')}</th><th>${L('dashboard.th.avgMinutes')}</th><th>${L('dashboard.th.avgLimit')}</th><th>${L('dashboard.th.fixes')}</th><th>${L('dashboard.th.reverts')}</th><th>${L('dashboard.th.duplicateCode')}</th><th>${L('dashboard.th.openCritical')}</th><th>${L('dashboard.th.acceptance')}</th></tr></thead><tbody>${[...metricRecords].reverse().slice(0, 8).map((m) => `<tr><td class="nw">${e(m.period)}</td><td class="num">${e(m.taskCount)}</td><td class="num">${e(m.duration)}</td><td class="num">${e(m.limit)}</td><td class="num">${e(m.fixes)}</td><td class="num">${e(m.reverts)}</td><td class="num">${e(m.duplicates)}</td><td class="num">${e(m.critical)}</td><td class="num">${e(m.acceptance)}</td></tr>`).join('')}</tbody></table></div>` : empty(L('dashboard.noMetrics'))}</section>
<section class="card"><h3>${L('dashboard.criticalFlowTests')}</h3>${criticalFlows.length ? `<div class="tw"><table><thead><tr><th>#</th><th>${L('dashboard.th.flow')}</th><th>${L('dashboard.th.testKind')}</th><th>${L('dashboard.th.file')}</th><th>${L('dashboard.status')}</th></tr></thead><tbody>${criticalFlows.map((k) => `<tr><td class="num">${e(k.no)}</td><td>${md(k.feed)}</td><td>${e(k.kind)}</td><td>${md(k.fileName)}</td><td>${/✅|yeşil|var/i.test(k.state) ? badge('good', L('dashboard.present')) : badge('warn', L('dashboard.missing'))}</td></tr>`).join('')}</tbody></table></div>` : empty(L('dashboard.noTestPlan'))}</section>
<section class="card"><h3>${L('dashboard.maintenanceLog')}</h3>${maintenance.length ? `<ul class="feed compact">${[...maintenance].reverse().slice(0, 8).map((b) => feedRow({ time: b.date, kind: 'maintenance', title: `${b.kind}: ${b.findings}`, extra: b.work })).join('')}</ul>` : empty(L('dashboard.noMaintenance'), '/maintain weekly')}
${lastRetro ? `<p class="muted small">${L('dashboard.lastRetro', { value: e(lastRetro) })}</p>` : ''}</section>`;

const maxDay = Math.max(1, ...Object.values(dayCounts));
const activity = `
<section class="card"><h3>${L('dashboard.commitsLast14')} <span class="muted small">${L('dashboard.totalParen', { total: days.reduce((t, g) => t + dayCounts[g], 0) })}</span></h3>
  <div class="spark" role="img" aria-label="${e(L('dashboard.sparkAria'))}">${days.map((g) => `<div class="sb" data-tip="${e(L('dashboard.commitTip', { date: toDate(g).toLocaleDateString(loc, { day: 'numeric', month: 'short', weekday: 'short' }), count: dayCounts[g] }))}"><span style="height:${dayCounts[g] ? Math.max(6, (dayCounts[g] / maxDay) * 100) : 0}%"></span></div>`).join('')}</div>
  <div class="spark-x muted small"><span>${toDate(days[0]).toLocaleDateString(loc, { day: 'numeric', month: 'short' })}</span><span>${L('dashboard.today')}</span></div>
  <details class="table-view"><summary class="muted small">${L('dashboard.showTable')}</summary><div class="tw"><table><thead><tr><th>${L('dashboard.th.day')}</th><th>${L('dashboard.th.commit')}</th></tr></thead><tbody>${days.map((g) => `<tr><td class="num">${g}</td><td class="num">${dayCounts[g]}</td></tr>`).join('')}</tbody></table></div></details>
</section>
<section class="card"><h3>${L('dashboard.feed')}</h3>${feed.length ? `<ul class="feed">${feed.map(feedRow).join('')}</ul>` : empty(L('dashboard.noActivity'))}</section>`;

const product = `
<div class="grid2">
  <section class="card"><h3>${L('dashboard.product')}</h3>
    <h4>${L('dashboard.problem')}</h4>${firstSentence(findSection(prd, '1. Problem')) ? `<p>${md(firstSentence(findSection(prd, '1. Problem')))}</p>` : empty(L('dashboard.noPrd'), '/start')}
    <h4>${L('dashboard.valueProp')}</h4>${firstSentence(findSection(prd, '3. Value')) ? `<p>${md(firstSentence(findSection(prd, '3. Value')))}</p>` : empty('-')}
    ${outOfScope.length ? `<h4>${L('dashboard.outOfScope')}</h4><ul>${outOfScope.map((k) => `<li>${md(k)}</li>`).join('')}</ul>` : ''}</section>
  <section class="card"><h3>${L('dashboard.mvpFeatures')}</h3>${mvp.length ? `<div class="rows">${mvp.map((o) => `<div class="row"><span>${md(o.title)} ${o.priority ? `<span class="tag">${e(o.priority)}</span>` : ''}</span>${progressBar(o.done, o.total)}<span class="num muted">${o.done}/${o.total}</span></div>`).join('')}</div>` : empty(L('dashboard.noMvp'))}
  ${acceptance.total ? `<h4>${L('dashboard.criteriaResults')}</h4><div class="tw"><table><thead><tr><th>${L('dashboard.th.criterion')}</th><th>PRD</th><th>${L('dashboard.th.test')}</th></tr></thead><tbody>${acceptance.list.map((k) => `<tr><td><code>${e(k.id)}</code> ${md(k.text)}</td><td>${k.checked ? '✓' : ''}</td><td>${k.result === 'passed' ? badge('good', L('dashboard.passedBadge')) : k.result === 'failed' ? badge('critical', L('dashboard.failedBadge')) : k.test ? badge('info', L('dashboard.noResult')) : badge('warn', L('dashboard.noTest'))}</td></tr>`).join('')}</tbody></table></div>` : ''}</section>
</div>
<div class="grid2">
  <section class="card"><h3>${L('dashboard.technology')}</h3>${stack.length && !stack.every((s) => !s.choice) ? `<dl class="dl">${stack.map((s) => `<dt>${e(s.layer)}</dt><dd>${md(s.choice || '-')}</dd>`).join('')}</dl>` : empty(L('dashboard.noStack'))}</section>
  <section class="card"><h3>${L('dashboard.design')}</h3>${designDirection.length ? `<dl class="dl">${designDirection.map((t) => `<dt>${e(t.area)}</dt><dd>${md(t.choice)}</dd>`).join('')}</dl>` : empty(L('dashboard.noDesign'), '/design genel')}
    ${previews.length ? `<h4>${L('dashboard.previews')}</h4><ul class="links">${previews.map((o) => `<li><b>${e(o.name)}</b> ${o.files.map((f) => `<a href=".previews/${encodeURIComponent(o.name)}/${encodeURIComponent(f)}" target="_blank" rel="noopener">${e(f.replace(/\.html$/, ''))}</a>`).join(' ')}</li>`).join('')}</ul>` : ''}</section>
</div>
<div class="grid2">
  <section class="card"><h3>${L('dashboard.unitEconomics')}</h3>${economics ? `<div class="kpis mini">${kpi(L('dashboard.kpiMargin'), `${economics.margin.toFixed(1)} ${e(economics.currency)}`, L('dashboard.perPayingUserMonth'))}${kpi(L('dashboard.kpiBreakEven'), economics.breakEven ?? '—', economics.breakEven ? L('dashboard.payingUsers') : L('dashboard.negativeMargin'))}${kpi(L('dashboard.atTarget', { target: economics.target }), `${economics.profit >= 0 ? '+' : ''}${Math.round(economics.profit)} ${e(economics.currency)}`, L('dashboard.monthlyProfitLoss'))}${economics.variableRatio != null ? kpi(L('dashboard.variableOverPrice'), `%${Math.round(economics.variableRatio)}`, economics.variableRatio > 30 ? badge('warn', L('dashboard.over30')) : '') : ''}</div>` : empty(L('dashboard.noInputs'), 'docs/product/unit-economics.md')}</section>
  <section class="card"><h3>${L('dashboard.userFeedback')}</h3>${fb.records.length ? `<div class="kpis mini">${kpi(L('dashboard.kpiTotal'), fb.records.length)}${kpi(L('dashboard.kpiNew'), fb.newCount)}${kpi(L('dashboard.kpiPlanned'), fb.records.filter((k) => k.state === 'planned').length)}</div>${fb.themes.length ? `<h4>${L('dashboard.topThemes')}</h4><div class="rows">${fb.themes.slice(0, 5).map((t) => `<div class="row"><span>${md(t.theme)}</span>${progressBar(t.count, fb.themes[0].count)}<span class="num muted">${t.count}</span></div>`).join('')}</div>` : ''}` : empty(L('dashboard.noFeedback'), '/user-feedback')}</section>
</div>
${learnt ? `<section class="card"><h3>${L('dashboard.learning')}</h3><div class="kpis mini">${kpi(L('dashboard.kpiRight'), learnt.right)}${kpi(L('dashboard.kpiWrong'), learnt.wrong)}${kpi(L('dashboard.kpiSuccess'), `%${percent(learnt.right, learnt.right + learnt.wrong)}`)}</div>${learnt.missed.length ? `<h4>${L('dashboard.oftenMissed')}</h4><div class="rows">${learnt.missed.slice(0, 5).map((m) => `<div class="row"><span>${md(m.concept)}</span>${progressBar(m.count, learnt.missed[0].count)}<span class="num muted">${m.count}</span></div>`).join('')}</div>` : ''}</section>` : ''}
<div class="grid2">
  <section class="card"><h3>${L('dashboard.brandPack')}</h3>${assets.brand.length ? `<p class="muted small"><code>${e(assets.brandDir)}</code> · ${L('dashboard.filesCount', { count: assets.brand.length })}${assets.brandGuide ? ` · <a href="docs/design/brand.md" target="_blank" rel="noopener">${L('dashboard.usageRules')}</a>` : ''}</p><ul class="links">${assets.brand.map((f) => `<li><a href="${e(assets.brandDir)}/${encodeURIComponent(f)}" target="_blank" rel="noopener">${e(f)}</a></li>`).join('')}</ul>` : empty(L('dashboard.noLogo'), 'logo-design')}</section>
  <section class="card"><h3>${L('dashboard.promoResearch')}</h3><h4>${L('dashboard.videos')}</h4>${assets.videos.length ? `<ul class="links">${assets.videos.map((v) => `<li><b>${e(v.name)}</b> ${v.mp4 ? `<a href="${v.mp4.split('/').map(encodeURIComponent).join('/')}" target="_blank" rel="noopener">mp4</a>` : badge('info', L('dashboard.noRender'))}</li>`).join('')}</ul>` : empty(L('dashboard.noVideos'), 'motion-video')}
    <h4>${L('dashboard.researchNotes')}</h4>${assets.research.length ? `<ul class="links">${assets.research.slice(0, 8).map((r) => `<li><a href="${r.file.split('/').map(encodeURIComponent).join('/')}" target="_blank" rel="noopener">${md(r.title)}</a></li>`).join('')}</ul>` : empty(L('dashboard.noNotes'), '/research')}</section>
</div>
<section class="card"><h3>${L('dashboard.unreleased')}</h3>${unreleased.length ? `<ul>${unreleased.map((s) => `<li>${md(s)}</li>`).join('')}</ul>` : empty(L('dashboard.noUnreleased'))}</section>`;

const limitCard = (name, k) => {
  const p = limit?.[k];
  const sev = limitSeverity(p?.percent, k);
  return `<div class="lim"><div class="lim-h"><b>${name}</b>${badge(sev, p ? `%${Math.round(p.percent)}` : L('dashboard.unknown'))}</div>
  <div class="bar big ${sev}"><span style="width:${p ? Math.min(100, p.percent) : 0}%"></span><i style="left:${THRESHOLDS[k].yellow}%" title="${e(L('dashboard.yellowThreshold'))}"></i><i style="left:${THRESHOLDS[k].red}%" title="${e(L('dashboard.redThreshold'))}"></i></div>
  <div class="muted small">${p?.resetsAt ? L('dashboard.resetsLabel', { when: new Date(p.resetsAt * 1000).toLocaleString(loc, { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) }) : p?.renewed ? L('dashboard.renewed') : '-'} · ${L('dashboard.thresholdsNote', { yellow: THRESHOLDS[k].yellow, red: THRESHOLDS[k].red })}</div></div>`;
};
const limitSection = `
<section class="card"><h3>${L('dashboard.usageLimit')}</h3><div class="grid2 tight">${limitCard(L('dashboard.limit5h'), 'five_hour')}${limitCard(L('dashboard.limitWeekly'), 'seven_day')}</div>
<p class="muted small">${e(summary(limit))}</p>
<h4>${L('dashboard.contextWindow')}</h4>${context ? `<div class="lim"><div class="lim-h"><b>${L('dashboard.lastSessionShort')}</b>${badge(context.percent >= 70 ? 'critical' : context.percent >= 50 ? 'warn' : 'good', `%${context.percent}`)}</div><div class="bar big ${context.percent >= 70 ? 'critical' : context.percent >= 50 ? 'warn' : 'good'}"><span style="width:${Math.min(100, context.percent)}%"></span><i style="left:50%"></i><i style="left:70%"></i></div><div class="muted small">${L('dashboard.contextHint', { time: new Date(context.readAt).toLocaleString(loc, { hour: '2-digit', minute: '2-digit' }) })}</div></div>` : empty(L('dashboard.noContext'))}
<h4>${L('dashboard.modelEffort')}</h4><div class="tw"><table><tbody>${Object.entries(readModels(modelsFile(root))).map(([r, v]) => `<tr><td>${e(roleLabel(root, r))}</td><td class="nw">${e(v.replace(':', ' · '))}</td></tr>`).join('')}</tbody></table></div><p class="muted small">${modelsNote(modelsFile(root), root) ? `${e(modelsNote(modelsFile(root), root))}. ` : ''}${L('dashboard.modelsHint')}</p></section>
<section class="card"><h3>${L('dashboard.tokenCost')}</h3>${tokenCost?.days.length ? (() => {
  const latest = tokenCost.days.slice(-14);
  const maxTokens = Math.max(...latest.map((g) => g.token));
  return `<div class="kpis mini">${kpi(L('dashboard.totalTokens'), `${(tokenCost.total.token / 1e6).toFixed(1)}M`)}${kpi(L('dashboard.apiEquivalent'), `$${tokenCost.total.cost.toFixed(2)}`, L('dashboard.notBilled'))}${kpi(L('dashboard.dailyAvg'), `$${(tokenCost.total.cost / tokenCost.days.length).toFixed(2)}`, L('dashboard.activeDays', { count: tokenCost.days.length }))}</div>
  <div class="rows">${latest.map((g) => `<div class="row"><span class="num nw">${e(g.date.slice(5))}</span>${progressBar(g.token, maxTokens)}<span class="num muted">${(g.token / 1e6).toFixed(1)}M · $${g.cost.toFixed(2)}</span></div>`).join('')}</div>
  <p class="muted small">${L('dashboard.ccusageNote', { when: fmtDate(tokenCost.readAt) })}</p>`;
})() : empty(L('dashboard.noData'), 'node .claude/hooks/cost.mjs')}</section>
<section class="card"><h3>${L('dashboard.costLog')}</h3>${avgCost.length ? `<div class="kpis mini">${avgCost.map((m) => kpi(L('dashboard.avgSize', { size: m.size }), `%${m.avg.toFixed(1)}`, L('dashboard.recordsCount', { count: m.n }))).join('')}</div>
<div class="tw"><table><thead><tr><th>${L('dashboard.th.date')}</th><th>${L('dashboard.th.job')}</th><th>${L('dashboard.th.size')}</th><th>${L('dashboard.th.usage5h')}</th></tr></thead><tbody>${[...cost].reverse().slice(0, 15).map((m) => `<tr><td class="num nw">${e(m.date)}</td><td>${md(m.job)}</td><td>${e(m.size)}</td><td class="num">${Number.isNaN(m.diff) ? '-' : `%${m.diff}`}</td></tr>`).join('')}</tbody></table></div>` : empty(L('dashboard.noCostRecords'))}</section>`;

const daysBadge = (t) => (t.left < 0 ? badge('critical', L('dashboard.daysOverdue', { days: -t.left })) : t.left <= 30 ? badge('warn', L('dashboard.daysLeft', { days: t.left })) : badge('good', L('dashboard.daysLeft', { days: t.left })));
const operations = `
<section class="card"><h3>${L('dashboard.accountsDeadlines')}</h3>${accountList.length ? `<div class="tw"><table><thead><tr><th>${L('dashboard.th.service')}</th><th>${L('dashboard.th.purpose')}</th><th>${L('dashboard.th.owner')}</th><th>2FA</th><th>Plan</th><th>${L('dashboard.th.dates')}</th></tr></thead><tbody>${accountList.map((h) => `<tr><td><b>${e(h.service)}</b></td><td>${e(h.purpose)}</td><td>${e(h.owner)}</td><td>${h.noTwoFactor ? badge('warn', L('dashboard.none')) : e(h.twoFactor)}</td><td>${e(h.plan)}</td><td>${h.dates.map((t) => `<div class="nw">${e(dateKind(t.kind))}: ${e(t.date)} ${daysBadge(t)}</div>`).join('') || '<span class="muted">-</span>'}</td></tr>`).join('')}</tbody></table></div>` : empty(L('dashboard.noAccounts'), 'docs/operations/accounts.md')}</section>
<section class="card"><h3>${L('dashboard.spendAlarms')}</h3>${alarmList.length ? `<div class="tw"><table><thead><tr><th>${L('dashboard.th.service')}</th><th>${L('dashboard.th.kind')}</th><th>${L('dashboard.th.amount')}</th><th>${L('dashboard.th.alertThresholds')}</th><th>${L('dashboard.th.lastCheck')}</th></tr></thead><tbody>${alarmList.map((alarm) => `<tr><td><b>${e(alarm.service)}</b></td><td>${e(alarm.kind)}</td><td>${alarm.unset ? badge('warn', L('dashboard.notSet')) : e(alarm.amount)}</td><td>${e(alarm.thresholds)}</td><td class="nw">${e(alarm.lastCheck || '-')} ${alarm.stale ? badge('info', L('dashboard.checkIt')) : ''}</td></tr>`).join('')}</tbody></table></div>` : empty(L('dashboard.noSpendAlarms'), 'docs/operations/spend-alarms.md')}</section>
<section class="card"><h3>${L('dashboard.flagsHeading')}</h3>${flagList.length ? `<div class="tw"><table><thead><tr><th>${L('dashboard.th.flag')}</th><th>${L('dashboard.th.purpose')}</th><th>${L('dashboard.status')}</th><th>${L('dashboard.th.removal')}</th><th>${L('dashboard.th.killSwitch')}</th></tr></thead><tbody>${flagList.map((b) => `<tr><td><code>${e(b.name)}</code></td><td>${md(b.purpose)}</td><td>${e(b.state)}</td><td class="nw">${e(b.removal)} ${b.isOverdue ? badge('warn', L('dashboard.overdue')) : ''}</td><td>${b.untested ? badge('warn', L('dashboard.untested')) : badge('good', L('dashboard.tested'))}</td></tr>`).join('')}</tbody></table></div>` : empty(L('dashboard.noFlags'), 'docs/operations/feature-flags.md')}</section>
<section class="card"><h3>GitHub</h3>${github ? `
  ${github.liveRun ? `<p><b>${L('dashboard.liveMonitoring')}</b> · ${L('dashboard.liveLastRun')} ${fmtDate(github.liveRun.createdAt)} ${github.liveRun.conclusion === 'skipped' ? `${badge('info', L('dashboard.notSetUp'))} <span class="muted small">${L('dashboard.liveUrlHint')}</span>` : github.liveRun.conclusion === 'success' ? badge('good', L('dashboard.succeeded')) : github.liveRun.conclusion === 'failure' ? `${badge('critical', L('dashboard.failedRun'))} <span class="muted small">/fix-bug</span>` : badge('info', github.liveRun.conclusion || github.liveRun.status)} <a href="${e(github.liveRun.url)}" target="_blank" rel="noopener">${L('dashboard.logLink')}</a></p>` : ''}
  ${github.liveMonitoring?.length ? `<p>${badge('critical', L('dashboard.liveBroken'))} ${github.liveMonitoring.map((i) => `<a href="${e(i.url)}" target="_blank" rel="noopener">#${e(i.number)} ${e(i.title)}</a>`).join(', ')}</p>` : ''}
  <h4>${L('dashboard.recentWorkflows')}</h4>${github.runs?.length ? `<div class="tw"><table><thead><tr><th>${L('dashboard.th.workflow')}</th><th>${L('dashboard.th.branch')}</th><th>${L('dashboard.th.result')}</th><th>${L('dashboard.th.time')}</th></tr></thead><tbody>${github.runs.map((c) => `<tr><td><a href="${e(c.url)}" target="_blank" rel="noopener">${e(c.workflowName)}</a></td><td><code>${e(c.headBranch)}</code></td><td>${c.conclusion === 'success' ? badge('good', L('dashboard.succeeded')) : c.conclusion === 'failure' ? badge('critical', L('dashboard.failedRun')) : badge('info', c.conclusion || c.status)}</td><td class="num nw">${fmtDate(c.createdAt)}</td></tr>`).join('')}</tbody></table></div>` : empty(L('dashboard.noRuns'))}
  <h4>${L('dashboard.openPrs')}</h4>${github.prs?.length ? `<ul>${github.prs.map((r) => `<li><a href="${e(r.url)}" target="_blank" rel="noopener">#${e(r.number)} ${e(r.title)}</a>${r.isDraft ? ` <span class="tag">${L('dashboard.draft')}</span>` : ''}</li>`).join('')}</ul>` : empty(L('dashboard.noPrs'))}
  <p class="muted small">${L('dashboard.ghNote')}</p>` : empty(L('dashboard.noGithub'))}</section>`;

const healthSeverity = (p) => (p >= 85 ? 'good' : p >= 70 ? 'info' : p >= 50 ? 'warn' : 'critical');
const healthLabel = (p) => L(p >= 85 ? 'dashboard.healthHealthy' : p >= 70 ? 'dashboard.healthGood' : p >= 50 ? 'dashboard.sevWarn' : 'dashboard.healthRisky');
const findingsSection = `
<section class="card"><h3>${L('dashboard.areaScores')}</h3>${Object.keys(findings.latest).length ? `<div class="kpis mini">${Object.keys(FINDING_KINDS).filter((t) => findings.latest[t]).map((t) => {
  const r = findings.latest[t];
  const diff = r.previous != null ? r.health - r.previous : null;
  return kpi(kindName(t), `${r.health}/100`, `${badge(healthSeverity(r.health), healthLabel(r.health))} ${diff != null ? `<span class="num">${diff >= 0 ? '+' : ''}${diff}</span>` : ''}<br><a href="docs/findings/${e(t)}/latest.md" target="_blank" rel="noopener">${L('dashboard.findingsLine', { date: e(r.date), findings: r.findings ?? '-' })}${r.critical ? L('dashboard.findingsCritical', { critical: r.critical }) : ''}</a>`, progressBar(r.health, 100, healthSeverity(r.health)));
}).join('')}</div>${Object.keys(FINDING_KINDS).filter((t) => !findings.latest[t]).length ? `<p class="muted small">${L('dashboard.noReportYet')} ${Object.keys(FINDING_KINDS).filter((t) => !findings.latest[t]).map((t) => `<code>/findings-${t}</code>`).join(' ')}</p>` : ''}` : empty(L('dashboard.noFindingReports'), '/findings-tech')}</section>
<section class="card"><h3>${L('dashboard.reportHistory')}</h3>${findings.rows.length ? `<div class="tw"><table><thead><tr><th>${L('dashboard.th.date')}</th><th>${L('dashboard.th.kind')}</th><th>${L('dashboard.th.health')}</th><th>${L('dashboard.th.change')}</th><th>${L('dashboard.th.finding')}</th><th>${L('dashboard.th.critical')}</th><th>${L('dashboard.th.report')}</th></tr></thead><tbody>${[...findings.rows].reverse().slice(0, 30).map((r) => `<tr><td class="num nw">${e(r.date)}</td><td>${e(kindName(r.kind))}</td><td>${badge(healthSeverity(r.health), `${r.health}`)}</td><td class="num">${r.previous != null ? `${r.health - r.previous >= 0 ? '+' : ''}${r.health - r.previous}` : '-'}</td><td class="num">${r.findings ?? '-'}</td><td class="num">${r.critical || '-'}</td><td>${md(r.report)}</td></tr>`).join('')}</tbody></table></div>` : empty(L('dashboard.noReports'))}
<p class="muted small">${L('dashboard.scoringNote')}</p></section>`;

const TABS = [
  ['overview', L('dashboard.tabOverview'), overview], ['roadmap', L('dashboard.tabRoadmap'), roadmapSection], ['decisions', L('dashboard.tabDecisions'), decisionTable],
  ['board', L('dashboard.board'), boardSection], ['findings', L('dashboard.tabFindings'), findingsSection], ['quality', L('dashboard.tabQuality'), quality], ['activity', L('dashboard.tabActivity'), activity],
  ['product', L('dashboard.tabProduct'), product], ['operations', L('dashboard.tabOperations'), operations], ['limit', L('dashboard.tabLimit'), limitSection],
];

const next = d.next[0] ?? (d.kitPending ? L('dashboard.startIdeaCode') : '-');
const html = `<!doctype html>
<html lang="${e(lang)}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${e(d.project)} · ${e(L('dashboard.title'))}</title>
<style>
:root{--bg:#f4f6f9;--surface:#fff;--sunk:#eef1f5;--fg:#141b27;--muted:#5b6577;--line:#dde3eb;--accent:#2a78d6;--accent-soft:#e3eefb;
--good:#0ca30c;--warn:#fab219;--serious:#ec835a;--crit:#d03b3b;--good-bg:#e5f5e5;--warn-bg:#fdf3dc;--crit-bg:#fbe7e7;--info-bg:#e9eef6;
--sans:"Segoe UI Variable Text","Segoe UI",system-ui,-apple-system,"Helvetica Neue",sans-serif;--mono:"Cascadia Code",Consolas,"SF Mono",ui-monospace,monospace;color-scheme:light}
@media (prefers-color-scheme:dark){:root{--bg:#101318;--surface:#171b22;--sunk:#1e232c;--fg:#e6eaf0;--muted:#98a2b3;--line:#2a313c;--accent:#5598e7;--accent-soft:#1b2a40;
--good-bg:#132a17;--warn-bg:#2d2512;--crit-bg:#331618;--info-bg:#1b2230;color-scheme:dark}}
*{box-sizing:border-box}html{scroll-behavior:smooth}
body{margin:0;background:var(--bg);color:var(--fg);font:14.5px/1.55 var(--sans);padding:0 16px 64px}
.wrap{max-width:1180px;margin:0 auto;display:grid;gap:18px}
h1{font-size:1.55rem;margin:0;letter-spacing:-.01em;line-height:1.2}h3{font-size:.95rem;margin:0 0 12px}h4{font-size:.78rem;margin:14px 0 6px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em}
p{margin:0 0 6px}ul{margin:0;padding-left:1.1em;display:grid;gap:4px}a{color:var(--accent)}
code{font:.86em var(--mono);background:var(--sunk);padding:.08em .38em;border-radius:4px;overflow-wrap:anywhere}
.muted{color:var(--muted)}.small{font-size:.82rem}.num{font-variant-numeric:tabular-nums}.nw{white-space:nowrap}
.top{position:sticky;top:0;z-index:5;background:var(--bg);padding:14px 0 10px;border-bottom:1px solid var(--line);display:flex;flex-wrap:wrap;gap:10px 16px;align-items:center;justify-content:space-between}
.top .meta{display:flex;flex-wrap:wrap;gap:6px;align-items:center}
.pill{font:600 .75rem/1 var(--mono);padding:6px 9px;border-radius:999px;background:var(--surface);border:1px solid var(--line);white-space:nowrap}
.refresh{display:flex;align-items:center;gap:6px;font-size:.8rem;color:var(--muted)}
.hero{display:grid;grid-template-columns:minmax(0,1.1fr) minmax(0,1fr);gap:18px}
@media (max-width:860px){.hero{grid-template-columns:1fr}}
.card{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:16px 18px;min-width:0}
.now-l{font:600 .72rem/1 var(--mono);text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}
.now-v{font-size:1.25rem;font-weight:650;margin:4px 0 10px;line-height:1.3}
.now-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px 16px}
.next{margin-top:12px;padding:10px 12px;border-radius:8px;background:var(--accent-soft)}
.next .now-l{color:var(--accent)}
.copy-cmd{font:600 .72rem/1 var(--sans);padding:4px 8px;margin-left:6px;border-radius:6px;border:1px solid var(--line);background:var(--surface);color:var(--fg);cursor:pointer;vertical-align:1px}
.copy-cmd:hover{border-color:var(--accent);color:var(--accent)}
.att{list-style:none;padding:0;gap:8px}.att li{display:grid;grid-template-columns:auto 1fr;gap:4px 10px;align-items:start;padding:8px 10px;border-radius:8px;background:var(--sunk)}
.att li.critical{background:var(--crit-bg)}.att li.warn{background:var(--warn-bg)}.att .action{grid-column:2;font-size:.8rem;color:var(--muted)}
.badge{display:inline-flex;gap:4px;align-items:center;font:600 .74rem/1 var(--sans);padding:4px 8px;border-radius:999px;white-space:nowrap}
.badge.good{background:var(--good-bg);color:var(--fg)}.badge.warn{background:var(--warn-bg);color:var(--fg)}.badge.critical{background:var(--crit-bg);color:var(--fg)}.badge.info{background:var(--info-bg);color:var(--fg)}
.ic{font-weight:700}.good .ic{color:var(--good)}.warn .ic{color:#b07800}.critical .ic{color:var(--crit)}.info .ic{color:var(--muted)}
@media (prefers-color-scheme:dark){.warn .ic{color:var(--warn)}}
.health{font-size:.85rem;padding:6px 12px}
.more{margin-top:8px}.more summary{cursor:pointer;font-size:.84rem;color:var(--accent);font-weight:600;padding:4px 0}.more .att{margin-top:8px}
.kpis{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px}.kpis.mini{grid-template-columns:repeat(auto-fit,minmax(110px,1fr));margin-bottom:12px}
.kpi{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:12px 14px;display:grid;gap:4px;align-content:start;min-width:0}
.kpis.mini .kpi{background:var(--sunk);border:0}
.kpi-l{font:600 .72rem/1.2 var(--mono);text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}
.kpi-v{font-size:1.45rem;font-weight:650;font-variant-numeric:tabular-nums;line-height:1.15}.kpi-s{font-size:.8rem;color:var(--muted)}
.bar{position:relative;height:6px;background:var(--sunk);border-radius:99px;overflow:hidden;min-width:60px}.bar span{display:block;height:100%;background:var(--accent);border-radius:99px}
.bar.big{height:12px;overflow:visible}.bar.big span{border-radius:99px}.bar i{position:absolute;top:-3px;bottom:-3px;width:2px;background:var(--line);border-radius:1px}
.bar.good span{background:var(--good)}.bar.warn span{background:var(--warn)}.bar.critical span{background:var(--crit)}
.tabs{display:flex;gap:4px;flex-wrap:wrap;border-bottom:1px solid var(--line)}
.tab{font:600 .86rem/1 var(--sans);color:var(--muted);background:none;border:0;border-bottom:2px solid transparent;padding:10px 12px;cursor:pointer;margin-bottom:-1px}
.tab[aria-selected=true]{color:var(--fg);border-bottom-color:var(--accent)}.tab:focus-visible,.chip:focus-visible{outline:2px solid var(--accent);outline-offset:2px;border-radius:6px}
.panel{display:grid;gap:18px}.panel[hidden]{display:none}
.grid2{display:grid;grid-template-columns:repeat(auto-fit,minmax(340px,1fr));gap:18px}.grid2.tight{gap:14px}
@media (max-width:420px){.grid2{grid-template-columns:1fr}}
.steps{list-style:none;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}
.step{display:grid;grid-template-columns:auto 1fr;gap:10px;align-items:start;border:1px solid var(--line);border-radius:10px;padding:10px 12px;background:var(--sunk)}
.step.now{border-color:var(--accent);background:var(--accent-soft)}.step-n{width:24px;height:24px;border-radius:50%;display:grid;place-items:center;font:700 .78rem/1 var(--mono);background:var(--surface);border:1px solid var(--line)}
.step.now .step-n{background:var(--accent);color:var(--surface);border-color:var(--accent)}.step.done .step-n{background:var(--good);color:#fff;border-color:var(--good)}
.step-b{display:grid;gap:5px;min-width:0}.step-b b{font-size:.86rem}
.rows{display:grid;gap:10px}.row{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(60px,1fr) auto;gap:10px;align-items:center}
details.phase summary{display:flex;flex-wrap:wrap;gap:10px;justify-content:space-between;align-items:center;cursor:pointer;list-style:none}
details.phase summary::-webkit-details-marker{display:none}.phase-bar{display:flex;gap:8px;align-items:center;min-width:200px}.phase-bar .bar{flex:1}
.tasks{list-style:none;padding:0;margin-top:12px;gap:2px}.tasks li{display:grid;grid-template-columns:20px 1fr;gap:8px;padding:6px 8px;border-radius:6px}
.tasks li.ok{color:var(--muted)}.tasks li.active{background:var(--accent-soft)}
.chk{width:16px;height:16px;border:1.5px solid var(--line);border-radius:4px;display:grid;place-items:center;font-size:.7rem;margin-top:2px}
.tasks li.ok .chk{background:var(--good);border-color:var(--good);color:#fff}
.tw{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:.86rem}
th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line);vertical-align:top}tr:last-child td{border-bottom:0}
th{font:600 .7rem/1.2 var(--mono);text-transform:uppercase;letter-spacing:.06em;color:var(--muted);white-space:nowrap}
.tag{font:600 .72rem/1 var(--mono);padding:3px 6px;border-radius:5px;background:var(--sunk);white-space:nowrap}
.filters{display:flex;flex-wrap:wrap;gap:6px;margin-bottom:10px}
.chip{font:600 .78rem/1 var(--sans);padding:7px 10px;border-radius:999px;border:1px solid var(--line);background:var(--surface);color:var(--fg);cursor:pointer}
.chip.on{background:var(--accent);border-color:var(--accent);color:var(--surface)}
.feed{list-style:none;padding:0;gap:0}.feed-i{display:grid;grid-template-columns:64px 1fr;gap:10px;padding:8px 0;border-bottom:1px solid var(--line)}.feed-i:last-child{border-bottom:0}
.ft{font:600 .68rem/1 var(--mono);text-transform:uppercase;letter-spacing:.05em;padding:4px 6px;border-radius:5px;background:var(--sunk);text-align:center;align-self:start}
.t-decision .ft{background:var(--accent-soft);color:var(--accent)}.t-board .ft{background:var(--warn-bg)}.t-maintenance .ft{background:var(--good-bg)}
.members{list-style:none;padding:0;gap:8px}.members li{display:grid;gap:2px;padding:8px 10px;border-radius:8px;background:var(--sunk)}
.dl{display:grid;grid-template-columns:auto 1fr;gap:6px 14px;margin:0}.dl dt{color:var(--muted);font-size:.84rem}.dl dd{margin:0}
.links a{margin-right:8px}
.spark{display:grid;grid-template-columns:repeat(14,1fr);gap:4px;height:90px;align-items:end;padding-top:8px;border-bottom:1px solid var(--line)}
.sb{height:100%;display:flex;align-items:flex-end;cursor:default;position:relative}.sb span{display:block;width:100%;background:var(--accent);border-radius:4px 4px 0 0}
.sb:hover span{filter:brightness(1.15)}.spark-x{display:flex;justify-content:space-between;margin-top:4px}
#tip{position:fixed;pointer-events:none;background:var(--fg);color:var(--bg);font-size:.78rem;padding:5px 8px;border-radius:6px;opacity:0;transition:opacity .1s;z-index:10}
.table-view{margin-top:10px}.empty{color:var(--muted);font-size:.88rem}
.lim{display:grid;gap:8px;padding:12px;border-radius:10px;background:var(--sunk)}.lim-h{display:flex;justify-content:space-between;align-items:center}
footer{color:var(--muted);font-size:.78rem;padding-top:8px}
@media (prefers-reduced-motion:reduce){*{scroll-behavior:auto!important;transition:none!important}}
</style></head><body><div class="wrap">

<header class="top">
  <div><h1>${e(d.project)}</h1></div>
  <div class="meta">
    ${badge(health, health === 'good' ? L('dashboard.sevGood') : health === 'warn' ? L('dashboard.healthWarn') : L('dashboard.healthCritical')).replace('class="badge', 'class="badge health')}
    ${d.kit?.type ? `<span class="pill">${e(d.kit.type)}${d.kit.addons?.length ? ' + ' + e(d.kit.addons.join(', ')) : ''}</span><span class="pill">${e(L('dashboard.kitVersion', { version: d.kit.version }))}</span>${d.kit.tool?.some((t) => t !== 'claude') ? `<span class="pill">${e(d.kit.tool.join(' + '))}</span>` : ''}` : `<span class="pill">${e(L('dashboard.kitNotInstalled'))}</span>`}
    ${git?.branch ? `<span class="pill">⎇ ${e(git.branch)}</span>` : ''}
    <label class="refresh"><input type="checkbox" id="auto-refresh" checked> ${e(L('dashboard.autoRefresh'))}</label>
  </div>
</header>

<div class="hero">
  <section class="card" aria-labelledby="now">
    <div class="now-l" id="now">${L('dashboard.now')}</div>
    <div class="now-v">${e(a['Active phase'] ?? '-')} · ${md(a['Active task'] ?? '-')}</div>
    <div class="now-grid">
      <div><div class="now-l">${L('dashboard.questionMode')}</div><div>${e(a['Question mode'] ?? '-')}</div></div>
      <div><div class="now-l">${L('dashboard.profile')}</div><div>${e(a['Profile'] ?? '-')}</div></div>
      <div><div class="now-l">${L('dashboard.lastUpdate')}</div><div class="num">${e(a['Last updated'] ?? '-')}</div></div>
      ${isValue(a['Active phase'], 'setup') ? `<div><div class="now-l">${L('dashboard.startStep')}</div><div class="num">${e(a['Setup step'] ?? '-')}</div></div>` : ''}
    </div>
    <div class="next"><div class="now-l">${L('dashboard.nextStep')}</div><div>${md(next)}${copyBtn(next)}</div>${cmdOf(next) ? `<div class="muted small">${e(L('dashboard.pasteHint'))}</div>` : ''}</div>
    ${d.state ? `<div class="now-l" style="margin-top:14px">${L('dashboard.status')}</div><p style="margin-top:4px">${md(d.state)}</p>` : ''}
    ${d.lastSession.length ? `<div class="now-l" style="margin-top:10px">${L('dashboard.lastSession')}</div><ul style="margin-top:4px">${d.lastSession.slice(0, 4).map((x) => `<li>${md(x)}</li>`).join('')}</ul>` : ''}
  </section>
  <section class="card" aria-labelledby="attention">
    <h3 id="attention">${L('dashboard.attention')} <span class="muted small">(${alerts.length})</span></h3>
    ${alerts.length ? `<ul class="att">${alerts.slice(0, 6).map(alertRow).join('')}</ul>${alerts.length > 6 ? `<details class="more"><summary>${L('dashboard.moreItems', { count: alerts.length - 6 })}</summary><ul class="att">${alerts.slice(6).map(alertRow).join('')}</ul></details>` : ''}` : `<p>${badge('good', L('dashboard.allGood'))} ${L('dashboard.allGoodText')}</p>`}
  </section>
</div>

<div class="kpis">
  ${kpi(L('dashboard.kpiTasks'), `${d.taskCount.done}/${d.taskCount.total}`, L('dashboard.donePct', { percent: percent(d.taskCount.done, d.taskCount.total) }), progressBar(d.taskCount.done, d.taskCount.total))}
  ${acceptance.total ? kpi(L('dashboard.acceptanceTests'), `${acceptance.passing}/${acceptance.total}`, L('dashboard.criteriaTested', { count: acceptance.tested }), progressBar(acceptance.passing, acceptance.total, 'good')) : kpi(L('dashboard.kpiMvp'), `${mvpCriteria.done}/${mvpCriteria.total}`, L('dashboard.featuresCount', { count: mvp.length }), progressBar(mvpCriteria.done, mvpCriteria.total))}
  ${kpi(L('dashboard.kpiDecisions'), d.decisions.length, L('dashboard.usersAuto', { user: d.decisions.length - autoDecisions, auto: autoDecisions }))}
  ${kpi(L('dashboard.board'), d.board.meetings.length, rejectCount ? L('dashboard.rejects', { count: rejectCount }) : L('dashboard.membersCount', { count: d.board.members.length }))}
  ${kpi(L('dashboard.kpiCommits7'), git ? last7 : '-', git ? L('dashboard.filesWaiting', { count: git.changed.length }) : L('dashboard.noGit'))}
  ${kpi(L('dashboard.kpiLimit'), limit?.five_hour ? `%${Math.round(limit.five_hour.percent)}` : '-', limit?.seven_day ? L('dashboard.weeklyLevel', { percent: Math.round(limit.seven_day.percent), level: limitLevel }) : L('dashboard.unknown'), limit?.five_hour ? progressBar(Math.round(limit.five_hour.percent), 100, limitSeverity(limit.five_hour.percent, 'five_hour')) : '')}
</div>

<nav class="tabs" role="tablist" aria-label="${e(L('dashboard.tabsLabel'))}">
${TABS.map(([id, name], i) => `<button class="tab" role="tab" id="t-${id}" aria-controls="p-${id}" aria-selected="${i === 0}" data-id="${id}">${name}</button>`).join('')}
</nav>
${TABS.map(([id, , content], i) => `<div class="panel" role="tabpanel" id="p-${id}" aria-labelledby="t-${id}" ${i ? 'hidden' : ''}>${content}</div>`).join('\n')}

<footer>${L('dashboard.footer', { when: new Date().toLocaleString(loc) })}</footer>
</div>
<div id="tip" role="tooltip"></div>
<style>.sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}</style>
<script>
(function () {
  var tabs = document.querySelectorAll('.tab');
  function show(id) {
    tabs.forEach(function (t) {
      var on = t.dataset.id === id;
      t.setAttribute('aria-selected', on);
      document.getElementById('p-' + t.dataset.id).hidden = !on;
    });
  }
  tabs.forEach(function (t, i) {
    t.addEventListener('click', function () { show(t.dataset.id); history.replaceState(null, '', '#' + t.dataset.id); });
    t.addEventListener('keydown', function (ev) {
      var j = ev.key === 'ArrowRight' ? i + 1 : ev.key === 'ArrowLeft' ? i - 1 : -1;
      if (j < 0) return;
      var n = tabs[(j + tabs.length) % tabs.length]; n.focus(); n.click();
    });
  });
  function fromHash() { var h = location.hash.slice(1); if (h && document.getElementById('p-' + h)) show(h); }
  fromHash();
  window.addEventListener('hashchange', fromHash);

  document.querySelectorAll('.filters .chip').forEach(function (c) {
    c.addEventListener('click', function () {
      document.querySelectorAll('.filters .chip').forEach(function (x) { x.classList.toggle('on', x === c); });
      var k = c.dataset.k;
      document.querySelectorAll('#decision-table tbody tr').forEach(function (r) {
        r.hidden = !(k === 'all' || r.dataset.k === k || (k === 'automatic' && r.dataset.v === 'automatic') || (k === 'one-way' && r.dataset.door === 'one-way'));
      });
    });
  });

  // file:// may refuse the clipboard API: fall back to a selected textarea
  document.querySelectorAll('.copy-cmd').forEach(function (b) {
    b.addEventListener('click', function () {
      var c = b.dataset.cmd;
      function done(ok) { b.textContent = ok ? ${jsStr('dashboard.copied')} : ${jsStr('dashboard.copyFailed')}; setTimeout(function () { b.textContent = ${jsStr('dashboard.copy')}; }, 1500); }
      function fallback() { var t = document.createElement('textarea'); t.value = c; document.body.appendChild(t); t.select(); var ok = false; try { ok = document.execCommand('copy'); } catch (er) {} t.remove(); done(ok); }
      if (navigator.clipboard) navigator.clipboard.writeText(c).then(function () { done(true); }, fallback); else fallback();
    });
  });

  var tip = document.getElementById('tip');
  document.querySelectorAll('[data-tip]').forEach(function (el) {
    el.addEventListener('mousemove', function (ev) { tip.textContent = el.dataset.tip; tip.style.opacity = 1; tip.style.left = ev.clientX + 12 + 'px'; tip.style.top = ev.clientY - 30 + 'px'; });
    el.addEventListener('mouseleave', function () { tip.style.opacity = 0; });
  });

  var auto = document.getElementById('auto-refresh'), timer;
  try { auto.checked = localStorage.getItem('durum-oto') !== '0'; } catch (er) {}
  function schedule() { clearTimeout(timer); if (auto.checked) timer = setTimeout(function () { location.reload(); }, 30000); }
  auto.addEventListener('change', function () { try { localStorage.setItem('durum-oto', auto.checked ? '1' : '0'); } catch (er) {} schedule(); });
  schedule();
})();
</script>
</body></html>
`;

// A committed dashboard.html link (to ~/.bashrc, say) must not be written through
try { if (fs.lstatSync(file('dashboard.html')).isSymbolicLink()) fs.unlinkSync(file('dashboard.html')); } catch { /* not there yet */ }
fs.writeFileSync(file('dashboard.html'), html);
if (!quiet) console.log(`dashboard.html updated · ${d.taskCount.done}/${d.taskCount.total} tasks · ${d.decisions.length} decisions · ${alerts.length} alerts`);
