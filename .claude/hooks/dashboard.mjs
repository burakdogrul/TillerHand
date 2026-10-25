#!/usr/bin/env node
// The project owner's control panel: dashboard.html (not in git).
//   node .claude/hooks/dashboard.mjs [root] [--quiet]
// The Stop hook runs it after every Claude answer; while open, the page reloads itself every 30 s.
// Sources: docs/*.md, git history, .kit.json, .claude/state/usage.json, .previews/. Costs no tokens.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { readStatus, readText, sections, findSection, tally, tableRows } from './status-read.mjs';
import { readLimits, summary, level, THRESHOLDS } from './usage.mjs';
import { packageStatus, commandMode } from './tools.mjs';
import { acceptanceStatus, accounts, flags, unitEconomics, feedback, learning, qaSummary, metrics, githubStatus, readContext, findingReports, FINDING_KINDS, producedAssets, costSummary, councilMinutes, spendAlarms, envWarnings } from './dashboard-data.mjs';

const args = process.argv.slice(2);
const quiet = args.includes('--quiet');
// Running as a hook (--quiet), an error must not break Claude's flow
if (quiet) process.on('uncaughtException', () => process.exit(0));
const root = path.resolve(args.find((a) => !a.startsWith('--')) ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd());
const file = (f) => path.join(root, f);

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
        return { hash, date, message, kind: (message.match(/^(\w+)(\(.+?\))?!?:/)?.[1] ?? 'diğer').toLowerCase() };
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
  return { title: title.trim(), priority: text.match(/\*\*Öncelik:\*\*\s*(.+)/)?.[1]?.trim() ?? '', ...tally(text) };
}).filter((o) => !o.title.includes('[') && o.title !== '...');
const outOfScope = findSection(prd, '6. Kapsam dışı').split('\n').map((s) => s.trim()).filter((s) => /^- \S/.test(s) && !s.includes('[')).map((s) => s.slice(2));

const stack = tableRows(sections(readText(file('docs/architecture/stack.md')))['Seçilen teknolojiler'], 2).map(([layer, choice]) => ({ layer, choice }));
const criticalFlows = tableRows(findSection(sections(readText(file('docs/quality/test-plan.md'))), '1. Kritik'), 6)
  .map(([no, feed, , kind, fileName, state]) => ({ no, feed, kind, fileName, state }));
const cost = tableRows(readText(file('docs/workflow/cost-log.md')), 6)
  .map(([date, job, size, startPct, endPct, diff]) => ({ date, job, size, diff: parseFloat(String(diff).replace('%', '').replace(',', '.')) }));
const maintenance = tableRows(sections(readText(file('docs/operations/maintenance.md')))['Bakım kaydı'], 4)
  .map(([date, kind, findings, work]) => ({ date, kind, findings, work }));
const unreleased = findSection(sections(readText(file('CHANGELOG.md'))), '[Yayınlanmamış]')
  .split('\n').map((s) => s.trim()).filter((s) => /^- \S/.test(s)).map((s) => s.slice(2));
const lastRetro = Object.keys(sections(readText(file('docs/quality/retros.md')))).filter((b) => /^\d{4}-/.test(b)).pop() ?? '';
const designDirection = tableRows(findSection(sections(readText(file('docs/design/design-guide.md'))), '1. Seçilen'), 2)
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
if (d.kitPending) addAlert('info', 'Proje henüz kurulmadı. Var olan kodu kite almak için /adopt.', '/start [fikrin]');
if (d.handoffPending) addAlert('warn', 'Devir notu bekliyor: proje başka kişiden veya hesaptan devralınıyor (docs/workflow/handoff.md).', '/handoff devral');
const lastReject = [...d.board.meetings].reverse().find((t) => /RET/i.test(t.result) && !/KOŞULLU/i.test(t.result));
if (lastReject && !lastReject.decision) addAlert('critical', `Kurul RET verdi (${lastReject.kind}, ${lastReject.scope}): ${lastReject.critical || 'kritik bulgu'}`, 'Claude\'a sor: düzelt / riski kabul et');
const limitLevel = level(limit);
const limitShort = limit ? [['5 saatlik', limit.five_hour], ['haftalık', limit.seven_day]].filter(([, p]) => p)
  .map(([name, p]) => `${name} %${Math.round(p.percent)}${p.resetsAt ? ` (yenilenme ${new Date(p.resetsAt * 1000).toLocaleString('tr-TR', { weekday: 'short', hour: '2-digit', minute: '2-digit' })})` : ''}`).join(', ') : '';
if (limitLevel === 'red') addAlert('critical', `Kullanım limiti kırmızı: ${limitShort}`, 'Yeni işten önce seçenekleri değerlendir (Limit sekmesi)');
else if (limitLevel === 'yellow') addAlert('warn', `Kullanım limiti sarı: ${limitShort}`, 'Büyük işleri limite göre planla');
for (const b of d.pending) addAlert('warn', `Bekleyen karar: ${b}`, 'Claude seni bekliyor');
for (const k of d.leftOff) addAlert('warn', `Yarıda kalan iş: ${k}`, '/build ile devam');
for (const s of d.issues.slice(0, 5)) addAlert('warn', `Açık sorun: ${s}`);
if (git?.changed.length > 15) addAlert('info', `${git.changed.length} dosya commit edilmemiş.`, 'Commit veya /wrap-up');
if (git?.progressStale >= 3) addAlert('info', `docs/workflow/progress.md ${git.progressStale} commit'tir güncellenmedi.`, '/wrap-up');
const off = (a['Soru modu'] ?? '').match(/kapalı konular:\s*(.+)$/i)?.[1];
if (off && !/^yok$/i.test(off)) addAlert('info', `Soru modu kapalı konular: ${off}. Bu konulardaki kararlar otomatik veriliyor.`, '/ask-mode ac <konu>');
if (d.installed && d.board.state === 'kurulmadı' && !/başlangıç/i.test(a['Aktif faz'] ?? '')) addAlert('info', 'Uzman kurulu kurulmadı.', '/board setup');
if (github?.liveMonitoring?.length) addAlert('critical', `Canlı izleme: ${github.liveMonitoring[0].title}`, `/fix-bug canlı izleme #${github.liveMonitoring[0].number}`);
else if (github?.liveRun?.conclusion === 'failure') addAlert('critical', 'Canlı izlemenin son çalışması başarısız.', '/fix-bug canlı izleme');
const lastMain = github?.runs?.find((c) => /^(main|master)$/.test(c.headBranch) && c.workflowName === 'CI');
if (lastMain?.conclusion === 'failure') addAlert('warn', 'main dalında son CI çalışması başarısız.', 'Operasyon sekmesi');
for (const h of accountList) for (const t of h.dates) {
  if (t.left < 0) addAlert('critical', `${h.service}: ${t.kind} tarihi geçti (${t.date}).`, 'docs/operations/accounts.md');
  else if (t.left <= 30) addAlert('warn', `${h.service}: ${t.kind} ${t.left} gün sonra (${t.date}).`, 'Yenile veya otomatik yenilemeyi aç');
}
for (const h of accountList.filter((x) => x.noTwoFactor)) addAlert('warn', `${h.service} hesabında 2FA yok.`, 'docs/operations/accounts.md');
for (const o of envWarnings(root)) addAlert(o.sev, o.text, o.action);
for (const alarm of alarmList.filter((x) => x.unset)) addAlert('warn', `${alarm.service}: harcama tavanı veya uyarısı ayarlanmadı.`, 'docs/operations/spend-alarms.md');
if (economics && economics.margin < 0) addAlert('critical', `Birim ekonomisi negatif: her ödeyen kullanıcı ${Math.abs(economics.margin).toFixed(1)} ${economics.currency} zarar ettiriyor.`, 'Fiyat veya maliyet kararı (/plan-task)');
for (const k of acceptance.mismatched.slice(0, 3)) addAlert('warn', `${k.id} PRD'de tamam işaretli ama kabul testi ${k.result === 'failed' ? 'kırmızı' : k.test ? 'sonuçsuz' : 'yok'}.`, 'Testi çalıştır veya işareti kaldır');
const overdue = flagList.filter((b) => b.isOverdue);
if (overdue.length) addAlert('info', `Kaldırma tarihi geçen ${overdue.length} bayrak: ${overdue.map((b) => b.name).join(', ')}.`, 'Bayrağı ve eski kod yolunu kaldır');
if (fb.newCount) addAlert('info', `${fb.newCount} işlenmemiş kullanıcı geri bildirimi var.`, '/user-feedback');
const enabledPackages = (() => { try { return packageStatus(root).filter((p) => p.enabled).map((p) => p.name); } catch { return []; } })();
if (enabledPackages.length) addAlert('info', `Açık bağlam paketleri: ${enabledPackages.join(', ')}. Her oturumda skill listesine yük ekler.`, 'Kullanmıyorsan /tools kapat <paket>');
const cmdMode = (() => { try { return commandMode(root).mode; } catch { return 'light'; } })();
if (cmdMode !== 'full' && /^Tam\b/.test(a['Profil'] ?? '')) addAlert('info', 'Profil Tam ama komut listesi hafif: seyrek komutların açıklaması bağlamda yok.', '/tools komutlar tam');
else if (cmdMode !== 'light' && !/^Tam\b/.test(a['Profil'] ?? '')) addAlert('info', `Komut listesi ${cmdMode === 'full' ? 'tam' : 'karışık'}: seyrek komutların açıklaması her oturumda bağlama giriyor (~1.100 token).`, 'Profil Tam değilse /tools komutlar hafif');
if (assets.codeMapDays > 30) addAlert('info', `İnsan için kod haritası (Understand-Anything) ${assets.codeMapDays} gündür güncellenmedi.`, '/understand (sadece değişenleri okur; yayin paketi)');
if (context?.percent >= 70 && Date.now() - context.readAt < 3600e3) addAlert('warn', `Bağlam %${context.percent} dolu; yanıt kalitesi düşebilir.`, '/wrap-up ve /clear');
for (const r of Object.values(findings.latest)) if (r.critical > 0) addAlert('warn', `${FINDING_KINDS[r.kind] ?? r.kind} bulgu raporunda ${r.critical} kritik bulgu var (sağlık ${r.health}/100).`, `docs/findings/${r.kind}/latest.md`);
// Severity order: critical > warn > info (same severity keeps insertion order)
const SEVERITY_ORDER = { critical: 0, warn: 1, info: 2 };
alerts.sort((x, y) => SEVERITY_ORDER[x.sev] - SEVERITY_ORDER[y.sev]);
const health = alerts.some((x) => x.sev === 'critical') ? 'critical' : alerts.some((x) => x.sev === 'warn') ? 'warn' : 'good';

// Activity: commit count for the last 14 days and the merged feed
const dayKey = (t) => { const z = new Date(t); return `${z.getFullYear()}-${String(z.getMonth() + 1).padStart(2, '0')}-${String(z.getDate()).padStart(2, '0')}`; };
const days = [...Array(14)].map((_, i) => { const z = new Date(); z.setDate(z.getDate() - (13 - i)); return dayKey(z); });
const dayCounts = Object.fromEntries(days.map((g) => [g, 0]));
for (const c of git?.commits ?? []) { const g = dayKey(c.date); if (g in dayCounts) dayCounts[g]++; }
const last7 = days.slice(7).reduce((t, g) => t + dayCounts[g], 0);
const last30 = (git?.commits ?? []).filter((c) => Date.now() - new Date(c.date) < 30 * 864e5);
const kindCounts = last30.reduce((m, c) => ((m[c.kind] = (m[c.kind] ?? 0) + 1), m), {});
const fixRatio = (kindCounts.feat ?? 0) + (kindCounts.fix ?? 0) ? Math.round(((kindCounts.fix ?? 0) / ((kindCounts.feat ?? 0) + (kindCounts.fix ?? 0))) * 100) : null;

const feed = [
  ...(git?.commits ?? []).slice(0, 60).map((c) => ({ time: c.date, kind: 'commit', title: c.message, extra: c.hash })),
  ...d.decisions.map((k) => ({ time: k.date, kind: 'karar', title: `${k.question} → ${k.chosen}`, extra: `${k.topic} · ${k.decidedBy}` })),
  ...d.board.meetings.map((t) => ({ time: t.date, kind: 'kurul', title: `${t.kind}: ${t.scope} → ${t.result}`, extra: t.attendees })),
  ...maintenance.map((b) => ({ time: b.date, kind: 'bakım', title: `${b.kind}: ${b.findings}`, extra: b.work })),
].filter((x) => x.time && !Number.isNaN(new Date(x.time).getTime()))
  .sort((x, y) => new Date(y.time) - new Date(x.time)).slice(0, 50);

const autoDecisions = d.decisions.filter((k) => /otomatik/i.test(k.decidedBy)).length;
const rejectCount = d.board.meetings.filter((t) => /RET/.test(t.result) && !/KOŞULLU/.test(t.result)).length;
const mvpCriteria = mvp.reduce((t, o) => ({ done: t.done + o.done, total: t.total + o.total }), { done: 0, total: 0 });
const avgCost = Object.entries(cost.reduce((m, r) => {
  if (!Number.isNaN(r.diff)) (m[r.size] ??= []).push(r.diff);
  return m;
}, {})).map(([size, l]) => ({ size, avg: l.reduce((t, x) => t + x, 0) / l.length, n: l.length }));

// ---------- helpers ----------
const e = (s = '') => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const md = (s) => e(s).replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
const percent = (b, t) => (t ? Math.round((b / t) * 100) : 0);
const progressBar = (b, t, cls = '') => `<div class="bar ${cls}" role="img" aria-label="${b}/${t}"><span style="width:${percent(b, t)}%"></span></div>`;
const empty = (text, action = '') => `<p class="empty">${md(text)}${action ? ` <code>${e(action)}</code>` : ''}</p>`;
const SEV = { critical: ['⛔', 'Kritik'], warn: ['⚠', 'Dikkat'], info: ['ℹ', 'Bilgi'], good: ['✓', 'Yolunda'] };
const badge = (sev, caption) => `<span class="badge ${sev}"><span class="ic" aria-hidden="true">${SEV[sev][0]}</span> ${e(caption ?? SEV[sev][1])}</span>`;
const fmtDate = (t) => { const z = new Date(t); return Number.isNaN(z.getTime()) ? e(t) : z.toLocaleString('tr-TR', { day: '2-digit', month: 'short', hour: t.length > 10 ? '2-digit' : undefined, minute: t.length > 10 ? '2-digit' : undefined }); };
const limitSeverity = (p, k) => (p == null ? 'info' : p >= THRESHOLDS[k].red ? 'critical' : p >= THRESHOLDS[k].yellow ? 'warn' : 'good');
const TOPICS = ['urun', 'teknik', 'tasarim', 'icerik', 'veri', 'guvenlik', 'maliyet'];

const alertRow = (x) => `<li class="${x.sev}"><span class="ic" aria-hidden="true">${SEV[x.sev][0]}</span><span><span class="sr-only">${SEV[x.sev][1]}: </span>${md(x.text)}</span>${x.action ? `<span class="eylem">→ ${md(x.action)}</span>` : ''}</li>`;
const kpi = (label, value, sub = '', bar = '') => `<div class="kpi"><div class="kpi-l">${e(label)}</div><div class="kpi-v">${value}</div>${bar}<div class="kpi-s">${sub}</div></div>`;

// ---------- sections ----------
const activeIndex = Math.max(0, [{ name: 'Başlangıç' }, ...d.phases].findIndex((f) => (a['Aktif faz'] ?? '').toLowerCase().startsWith(f.name.toLowerCase().split(' ').slice(0, 2).join(' '))));
const start = (a['Başlangıç adımı'] ?? '0/9').split('/').map(Number);
const stageStrip = `<ol class="steps">${[{ name: 'Başlangıç', done: start[0] || 0, total: start[1] || 9 }, ...d.phases].map((f, i) =>
  `<li class="step${i === activeIndex ? ' now' : ''}${f.total && f.done === f.total ? ' done' : ''}"><span class="step-n">${i === 0 ? 'B' : i - 1}</span><div class="step-b"><b>${e(f.name.replace(/\s*\(.*\)$/, ''))}</b>${progressBar(f.done, f.total)}<span class="muted num">${f.done}/${f.total}</span></div></li>`).join('')}</ol>`;

const overview = `
<div class="grid2">
  <section class="card"><h3>Durum özeti</h3>${d.state ? `<p>${md(d.state)}</p>` : empty('Henüz özet yok.')}
    <h4>Son oturumda</h4>${d.lastSession.length ? `<ul>${d.lastSession.map((s) => `<li>${md(s)}</li>`).join('')}</ul>` : empty('Kayıt yok.')}</section>
  <section class="card"><h3>Son hareketler</h3>${feed.length ? `<ul class="feed compact">${feed.slice(0, 7).map(feedRow).join('')}</ul>` : empty('Henüz hareket yok.')}</section>
</div>
<section class="card"><h3>Aşamalar</h3>${stageStrip}</section>`;

function feedRow(x) {
  return `<li class="feed-i t-${x.kind.replace('ı', 'i')}"><span class="ft">${e(x.kind)}</span><div><div>${md(x.title)}</div><div class="muted small">${fmtDate(x.time)}${x.extra ? ' · ' + e(x.extra) : ''}</div></div></li>`;
}

const roadmapSection = d.phases.length ? d.phases.map((f) => `
<details class="card faz" ${f.name.toLowerCase().startsWith((a['Aktif faz'] ?? '#').toLowerCase().split(' ').slice(0, 2).join(' ')) ? 'open' : ''}>
  <summary><b>${e(f.name)}</b><span class="faz-bar">${progressBar(f.done, f.total)}<span class="num muted">${f.done}/${f.total}</span></span></summary>
  <ul class="tasks">${f.tasks.map((g) => `<li class="${g.done ? 'ok' : ''}${(a['Aktif görev'] && g.text.startsWith(a['Aktif görev'])) ? ' active' : ''}"><span class="chk" aria-hidden="true">${g.done ? '✓' : ''}</span><span>${md(g.text)}</span></li>`).join('')}</ul>
</details>`).join('') : empty('Yol haritası henüz yok. `/start` Adım 8\'de oluşur.');

const decisionTable = d.decisions.length ? `
<div class="filters" role="group" aria-label="Konu filtresi"><button class="chip on" data-k="hepsi">Hepsi (${d.decisions.length})</button>${TOPICS.filter((k) => d.decisions.some((x) => x.topic === k)).map((k) => `<button class="chip" data-k="${k}">${k} (${d.decisions.filter((x) => x.topic === k).length})</button>`).join('')}<button class="chip" data-k="otomatik">otomatik (${autoDecisions})</button><button class="chip" data-k="tek">tek yönlü (${d.decisions.filter((k) => /^tek/i.test(k.door)).length})</button></div>
<div class="tw"><table id="kararlar"><thead><tr><th>#</th><th>Tarih</th><th>Aşama</th><th>Konu</th><th>Soru</th><th>Seçilen</th><th>Kapı</th><th>Veren</th></tr></thead><tbody>
${[...d.decisions].reverse().map((k) => `<tr data-k="${e(k.topic)}" data-v="${/otomatik/i.test(k.decidedBy) ? 'otomatik' : ''}" data-kapi="${/^tek/i.test(k.door) ? 'tek' : ''}"><td class="num">${e(k.no)}</td><td class="num nw">${e(k.date)}</td><td>${e(k.stage)}</td><td><span class="tag">${e(k.topic)}</span></td><td>${md(k.question)}</td><td><b>${md(k.chosen)}</b></td><td>${/^tek/i.test(k.door) ? badge('warn', 'tek yönlü') : k.door ? `<span class="muted small">${e(k.door)}</span>` : ''}</td><td>${/otomatik/i.test(k.decidedBy) ? badge('warn', 'otomatik') : badge('good', 'kullanıcı')}</td></tr>`).join('')}
</tbody></table></div>` : empty('Henüz karar verilmedi. Kararlar `/start` ile başlar.');

const boardSection = `
<div class="grid2">
  <section class="card"><h3>Üyeler · ${e(d.board.state)}</h3>${d.board.members.length ? `<ul class="members">${d.board.members.map((u) => `<li><b>${e(u.member)}</b><span class="muted small">${e(u.model)} · ${e(u.focus)}</span></li>`).join('')}</ul>` : empty('Kurul kurulmadı.', '/board setup')}
    <p class="muted small">Commit denetimi: ${e(d.board.commitReview)}</p></section>
  <section class="card"><h3>Özet</h3><div class="kpis mini">${kpi('Toplantı', d.board.meetings.length)}${kpi('RET', rejectCount, rejectCount ? badge('critical', 'kritik bulgu') : '')}${kpi('Onay oranı', d.board.meetings.length ? `%${percent(d.board.meetings.filter((t) => /^ONAY/i.test(t.result)).length, d.board.meetings.length)}` : '-')}</div></section>
</div>
<section class="card"><h3>Konsey · ilk görüş → anonim çapraz oy → başkan</h3>${councils.length ? (() => {
  const latest = councils[0];
  const decisionBadge = (k) => (!k ? badge('info', 'karar yok') : /KOŞULLU/i.test(k) ? badge('warn', k) : /RET/i.test(k) ? badge('critical', k) : badge('good', k));
  return `<h4>Son: ${md(latest.topic)}</h4><div class="kpis mini">${kpi('Karar', decisionBadge(latest.decision))}${kpi('Uzlaşma', latest.consensus == null ? '-' : `%${latest.consensus}`, latest.consensus != null && latest.consensus < 60 ? badge('warn', 'düşük') : '')}${kpi('Tartışmalı', latest.disputed)}${kpi('Elenen', latest.eliminated, 'çapraz oyla')}</div>
  ${latest.ranking.length ? `<h4>Toplu sıralama</h4><div class="rows">${latest.ranking.map((r, i) => `<div class="row"><span><b>${i + 1}.</b> Görüş ${e(r.opinion)}${r.who ? ` <span class="muted small">${e(r.who)}</span>` : ''}</span><span class="num muted">ort. ${e(r.average)}</span></div>`).join('')}</div>` : ''}
  <div class="tw"><table><thead><tr><th>Tarih</th><th>Tür</th><th>Konu</th><th>Karar</th><th>Uzlaşma</th><th>Tutanak</th></tr></thead><tbody>${councils.slice(0, 10).map((k) => `<tr><td class="num nw">${e(k.date)}</td><td>${e(k.kind)}</td><td>${md(k.topic)}</td><td>${decisionBadge(k.decision)}</td><td class="num">${k.consensus == null ? '-' : `%${k.consensus}`}</td><td><a href="${k.file.split('/').map(encodeURIComponent).join('/')}" target="_blank" rel="noopener">aç</a></td></tr>`).join('')}</tbody></table></div>`;
})() : empty('Henüz konsey toplanmadı. Plan, faz sonu, canlıya alma ve tek yönlü kararlarda otomatik toplanır.', '/board council <soru>')}</section>
<section class="card"><h3>Toplantı günlüğü</h3>${d.board.meetings.length ? `<div class="tw"><table><thead><tr><th>#</th><th>Tarih</th><th>Tür</th><th>Kapsam</th><th>Katılan</th><th>Sonuç</th><th>Kritik</th><th>Kullanıcı kararı</th></tr></thead><tbody>
${[...d.board.meetings].reverse().map((t) => `<tr><td class="num">${e(t.no)}</td><td class="num nw">${e(t.date)}</td><td>${e(t.kind)}</td><td>${md(t.scope)}</td><td>${e(t.attendees)}</td><td>${/KOŞULLU/i.test(t.result) ? badge('warn', t.result) : /RET/i.test(t.result) ? badge('critical', t.result) : badge('good', t.result)}</td><td>${md(t.critical)}</td><td>${md(t.decision)}</td></tr>`).join('')}
</tbody></table></div>` : empty('Henüz toplantı yapılmadı.')}</section>`;

const quality = `
<div class="grid2">
  <section class="card"><h3>Kontrol listeleri</h3><div class="rows">${d.checklists.map((l) => `<div class="row"><span>${e(l.name)}</span>${progressBar(l.done, l.total)}<span class="num muted">${l.done}/${l.total}</span></div>`).join('')}</div></section>
  <section class="card"><h3>Kod sağlığı · son 30 gün</h3>
    <div class="kpis mini">${kpi('Commit', last30.length)}${kpi('Düzeltme oranı', fixRatio == null ? '-' : `%${fixRatio}`, 'fix / (feat + fix)')}${kpi('Commit edilmemiş', git ? git.changed.length : '-')}</div>
    ${Object.keys(kindCounts).length ? `<div class="rows">${Object.entries(kindCounts).sort((x, y) => y[1] - x[1]).map(([t, n]) => `<div class="row"><span><code>${e(t)}</code></span>${progressBar(n, last30.length)}<span class="num muted">${n}</span></div>`).join('')}</div>` : ''}
    <p class="muted small">Yüksek düzeltme oranı, yeni özelliklerin sık bozulduğunu gösterebilir; retroda konuşulmalı.</p></section>
</div>
${qa ? `<section class="card"><h3>Son QA · ${e(qa.name)}</h3><div class="kpis mini">${kpi('Geçti', qa.passed)}${kpi('Kaldı', qa.failed, qa.failed ? badge('critical', 'kanıtıyla') : '')}${kpi('Koşulmadı', qa.notRun)}</div>${qa.failures.length ? `<ul>${qa.failures.slice(0, 5).map((x) => `<li>${md(x.criterion)}${x.note ? ` <span class="muted small">${e(x.note)}</span>` : ''}</li>`).join('')}</ul>` : ''}<p class="muted small"><a href="${e(qa.file)}" target="_blank" rel="noopener">raporu aç</a></p></section>` : ''}
<section class="card"><h3>Kabul testleri</h3>${acceptance.total ? `<div class="kpis mini">${kpi('Kriter', acceptance.total)}${kpi('Testi olan', `${acceptance.tested}/${acceptance.total}`, '', progressBar(acceptance.tested, acceptance.total))}${kpi('Geçen', `${acceptance.passing}/${acceptance.total}`, acceptance.reportTime ? `rapor: ${new Date(acceptance.reportTime).toLocaleString('tr-TR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}` : 'JUnit raporu yok', progressBar(acceptance.passing, acceptance.total, 'good'))}</div>` : empty('PRD\'de kimlikli kabul kriteri yok (`Ö-01.1` biçimi).')}</section>
<section class="card"><h3>Metrikler · aylık</h3>${metricRecords.length ? `<div class="tw"><table><thead><tr><th>Dönem</th><th>Görev</th><th>Ort. süre (dk)</th><th>Ort. limit</th><th>Düzeltme</th><th>Geri alma</th><th>Kopya kod</th><th>Açık kritik</th><th>Kabul</th></tr></thead><tbody>${[...metricRecords].reverse().slice(0, 8).map((m) => `<tr><td class="nw">${e(m.period)}</td><td class="num">${e(m.taskCount)}</td><td class="num">${e(m.duration)}</td><td class="num">${e(m.limit)}</td><td class="num">${e(m.fixes)}</td><td class="num">${e(m.reverts)}</td><td class="num">${e(m.duplicates)}</td><td class="num">${e(m.critical)}</td><td class="num">${e(m.acceptance)}</td></tr>`).join('')}</tbody></table></div>` : empty('Henüz metrik kaydı yok. `/maintain monthly` ve `/retro` ekler.')}</section>
<section class="card"><h3>Kritik akış testleri</h3>${criticalFlows.length ? `<div class="tw"><table><thead><tr><th>#</th><th>Akış</th><th>Test türü</th><th>Dosya</th><th>Durum</th></tr></thead><tbody>${criticalFlows.map((k) => `<tr><td class="num">${e(k.no)}</td><td>${md(k.feed)}</td><td>${e(k.kind)}</td><td>${md(k.fileName)}</td><td>${/✅|yeşil|var/i.test(k.state) ? badge('good', 'var') : badge('warn', 'yok')}</td></tr>`).join('')}</tbody></table></div>` : empty('Test planı yok.')}</section>
<section class="card"><h3>Bakım kaydı</h3>${maintenance.length ? `<ul class="feed compact">${[...maintenance].reverse().slice(0, 8).map((b) => feedRow({ time: b.date, kind: 'bakım', title: `${b.kind}: ${b.findings}`, extra: b.work })).join('')}</ul>` : empty('Henüz bakım yapılmadı.', '/maintain weekly')}
${lastRetro ? `<p class="muted small">Son retro: ${e(lastRetro)}</p>` : ''}</section>`;

const maxDay = Math.max(1, ...Object.values(dayCounts));
const activity = `
<section class="card"><h3>Commit · son 14 gün <span class="muted small">(toplam ${days.reduce((t, g) => t + dayCounts[g], 0)})</span></h3>
  <div class="spark" role="img" aria-label="Son 14 günde günlük commit sayısı">${days.map((g) => `<div class="sb" data-tip="${new Date(g).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short', weekday: 'short' })}: ${dayCounts[g]} commit"><span style="height:${dayCounts[g] ? Math.max(6, (dayCounts[g] / maxDay) * 100) : 0}%"></span></div>`).join('')}</div>
  <div class="spark-x muted small"><span>${new Date(days[0]).toLocaleDateString('tr-TR', { day: 'numeric', month: 'short' })}</span><span>bugün</span></div>
  <details class="tablo-gor"><summary class="muted small">Tablo olarak göster</summary><div class="tw"><table><thead><tr><th>Gün</th><th>Commit</th></tr></thead><tbody>${days.map((g) => `<tr><td class="num">${g}</td><td class="num">${dayCounts[g]}</td></tr>`).join('')}</tbody></table></div></details>
</section>
<section class="card"><h3>Akış</h3>${feed.length ? `<ul class="feed">${feed.map(feedRow).join('')}</ul>` : empty('Henüz hareket yok.')}</section>`;

const product = `
<div class="grid2">
  <section class="card"><h3>Ürün</h3>
    <h4>Problem</h4>${firstSentence(findSection(prd, '1. Problem')) ? `<p>${md(firstSentence(findSection(prd, '1. Problem')))}</p>` : empty('PRD henüz yazılmadı.', '/start')}
    <h4>Değer önerisi</h4>${firstSentence(findSection(prd, '3. Değer')) ? `<p>${md(firstSentence(findSection(prd, '3. Değer')))}</p>` : empty('-')}
    ${outOfScope.length ? `<h4>Kapsam dışı</h4><ul>${outOfScope.map((k) => `<li>${md(k)}</li>`).join('')}</ul>` : ''}</section>
  <section class="card"><h3>MVP özellikleri</h3>${mvp.length ? `<div class="rows">${mvp.map((o) => `<div class="row"><span>${md(o.title)} ${o.priority ? `<span class="tag">${e(o.priority)}</span>` : ''}</span>${progressBar(o.done, o.total)}<span class="num muted">${o.done}/${o.total}</span></div>`).join('')}</div>` : empty('MVP henüz tanımlanmadı.')}
  ${acceptance.total ? `<h4>Kabul kriterleri · test sonucu</h4><div class="tw"><table><thead><tr><th>Kriter</th><th>PRD</th><th>Test</th></tr></thead><tbody>${acceptance.list.map((k) => `<tr><td><code>${e(k.id)}</code> ${md(k.text)}</td><td>${k.checked ? '✓' : ''}</td><td>${k.result === 'passed' ? badge('good', 'geçti') : k.result === 'failed' ? badge('critical', 'kaldı') : k.test ? badge('info', 'sonuç yok') : badge('warn', 'test yok')}</td></tr>`).join('')}</tbody></table></div>` : ''}</section>
</div>
<div class="grid2">
  <section class="card"><h3>Teknoloji</h3>${stack.length && !stack.every((s) => !s.choice) ? `<dl class="dl">${stack.map((s) => `<dt>${e(s.layer)}</dt><dd>${md(s.choice || '-')}</dd>`).join('')}</dl>` : empty('Stack seçilmedi.')}</section>
  <section class="card"><h3>Tasarım</h3>${designDirection.length ? `<dl class="dl">${designDirection.map((t) => `<dt>${e(t.area)}</dt><dd>${md(t.choice)}</dd>`).join('')}</dl>` : empty('Tasarım yönü seçilmedi.', '/design genel')}
    ${previews.length ? `<h4>Önizlemeler</h4><ul class="links">${previews.map((o) => `<li><b>${e(o.name)}</b> ${o.files.map((f) => `<a href=".previews/${encodeURIComponent(o.name)}/${encodeURIComponent(f)}" target="_blank" rel="noopener">${e(f.replace(/\.html$/, ''))}</a>`).join(' ')}</li>`).join('')}</ul>` : ''}</section>
</div>
<div class="grid2">
  <section class="card"><h3>Birim ekonomisi</h3>${economics ? `<div class="kpis mini">${kpi('Katkı payı', `${economics.margin.toFixed(1)} ${e(economics.currency)}`, 'ödeyen kullanıcı başı / ay')}${kpi('Başa baş', economics.breakEven ?? '—', economics.breakEven ? 'ödeyen kullanıcı' : 'katkı negatif')}${kpi(`Hedefte (${economics.target} kullanıcı)`, `${economics.profit >= 0 ? '+' : ''}${Math.round(economics.profit)} ${e(economics.currency)}`, 'aylık kâr / zarar')}${economics.variableRatio != null ? kpi('Değişken / fiyat', `%${Math.round(economics.variableRatio)}`, economics.variableRatio > 30 ? badge('warn', '%30 üstü') : '') : ''}</div>` : empty('Girdiler boş.', 'docs/product/unit-economics.md')}</section>
  <section class="card"><h3>Kullanıcı geri bildirimi</h3>${fb.records.length ? `<div class="kpis mini">${kpi('Toplam', fb.records.length)}${kpi('Yeni', fb.newCount)}${kpi('Planlandı', fb.records.filter((k) => /planland/i.test(k.state)).length)}</div>${fb.themes.length ? `<h4>Öne çıkan temalar</h4><div class="rows">${fb.themes.slice(0, 5).map((t) => `<div class="row"><span>${md(t.theme)}</span>${progressBar(t.count, fb.themes[0].count)}<span class="num muted">${t.count}</span></div>`).join('')}</div>` : ''}` : empty('Henüz geri bildirim yok.', '/user-feedback')}</section>
</div>
${learnt ? `<section class="card"><h3>Öğrenme · anlama kontrolü</h3><div class="kpis mini">${kpi('Doğru', learnt.right)}${kpi('Yanlış', learnt.wrong)}${kpi('Başarı', `%${percent(learnt.right, learnt.right + learnt.wrong)}`)}</div>${learnt.missed.length ? `<h4>Sık yanılan kavramlar</h4><div class="rows">${learnt.missed.slice(0, 5).map((m) => `<div class="row"><span>${md(m.concept)}</span>${progressBar(m.count, learnt.missed[0].count)}<span class="num muted">${m.count}</span></div>`).join('')}</div>` : ''}</section>` : ''}
<div class="grid2">
  <section class="card"><h3>Marka paketi</h3>${assets.brand.length ? `<p class="muted small"><code>${e(assets.brandDir)}</code> · ${assets.brand.length} dosya${assets.brandGuide ? ' · <a href="docs/design/brand.md" target="_blank" rel="noopener">kullanım kuralları</a>' : ''}</p><ul class="links">${assets.brand.map((f) => `<li><a href="${e(assets.brandDir)}/${encodeURIComponent(f)}" target="_blank" rel="noopener">${e(f)}</a></li>`).join('')}</ul>` : empty('Logo henüz yok.', 'logo-design')}</section>
  <section class="card"><h3>Tanıtım ve araştırma</h3><h4>Videolar</h4>${assets.videos.length ? `<ul class="links">${assets.videos.map((v) => `<li><b>${e(v.name)}</b> ${v.mp4 ? `<a href="${v.mp4.split('/').map(encodeURIComponent).join('/')}" target="_blank" rel="noopener">mp4</a>` : badge('info', 'render yok')}</li>`).join('')}</ul>` : empty('Video yok.', 'motion-video')}
    <h4>Araştırma notları</h4>${assets.research.length ? `<ul class="links">${assets.research.slice(0, 8).map((r) => `<li><a href="${r.file.split('/').map(encodeURIComponent).join('/')}" target="_blank" rel="noopener">${md(r.title)}</a></li>`).join('')}</ul>` : empty('Not yok.', '/research')}</section>
</div>
<section class="card"><h3>Yayınlanmamış değişiklikler (CHANGELOG)</h3>${unreleased.length ? `<ul>${unreleased.map((s) => `<li>${md(s)}</li>`).join('')}</ul>` : empty('Yayınlanmamış değişiklik yok.')}</section>`;

const limitCard = (name, k) => {
  const p = limit?.[k];
  const sev = limitSeverity(p?.percent, k);
  return `<div class="lim"><div class="lim-h"><b>${name}</b>${badge(sev, p ? `%${Math.round(p.percent)}` : 'bilinmiyor')}</div>
  <div class="bar big ${sev}"><span style="width:${p ? Math.min(100, p.percent) : 0}%"></span><i style="left:${THRESHOLDS[k].yellow}%" title="sarı eşik"></i><i style="left:${THRESHOLDS[k].red}%" title="kırmızı eşik"></i></div>
  <div class="muted small">${p?.resetsAt ? `Sıfırlanma: ${new Date(p.resetsAt * 1000).toLocaleString('tr-TR', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}` : p?.renewed ? 'Yenilendi' : '-'} · eşikler %${THRESHOLDS[k].yellow} / %${THRESHOLDS[k].red}</div></div>`;
};
const limitSection = `
<section class="card"><h3>Kullanım limiti</h3><div class="grid2 tight">${limitCard('5 saatlik', 'five_hour')}${limitCard('Haftalık', 'seven_day')}</div>
<p class="muted small">${e(summary(limit))}</p>
<h4>Bağlam penceresi</h4>${context ? `<div class="lim"><div class="lim-h"><b>Son oturum</b>${badge(context.percent >= 70 ? 'critical' : context.percent >= 50 ? 'warn' : 'good', `%${context.percent}`)}</div><div class="bar big ${context.percent >= 70 ? 'critical' : context.percent >= 50 ? 'warn' : 'good'}"><span style="width:${Math.min(100, context.percent)}%"></span><i style="left:50%"></i><i style="left:70%"></i></div><div class="muted small">%50'de /wrap-up + /clear önerilir · ${new Date(context.readAt).toLocaleString('tr-TR', { hour: '2-digit', minute: '2-digit' })} itibarıyla</div></div>` : empty('Bağlam bilgisi yok (durum çubuğu yazar).')}</section>
<section class="card"><h3>Token ve maliyet · son 30 gün</h3>${tokenCost?.days.length ? (() => {
  const latest = tokenCost.days.slice(-14);
  const maxTokens = Math.max(...latest.map((g) => g.token));
  return `<div class="kpis mini">${kpi('Toplam token', `${(tokenCost.total.token / 1e6).toFixed(1)}M`)}${kpi('API karşılığı', `$${tokenCost.total.cost.toFixed(2)}`, 'abonelikte fatura değildir')}${kpi('Günlük ortalama', `$${(tokenCost.total.cost / tokenCost.days.length).toFixed(2)}`, `${tokenCost.days.length} aktif gün`)}</div>
  <div class="rows">${latest.map((g) => `<div class="row"><span class="num nw">${e(g.date.slice(5))}</span>${progressBar(g.token, maxTokens)}<span class="num muted">${(g.token / 1e6).toFixed(1)}M · $${g.cost.toFixed(2)}</span></div>`).join('')}</div>
  <p class="muted small">ccusage · ${fmtDate(tokenCost.readAt)} itibarıyla · ayrıntı için <code>/session-report</code></p>`;
})() : empty('Veri yok.', 'node .claude/hooks/cost.mjs')}</section>
<section class="card"><h3>Maliyet günlüğü</h3>${avgCost.length ? `<div class="kpis mini">${avgCost.map((m) => kpi(`Ortalama · ${m.size}`, `%${m.avg.toFixed(1)}`, `${m.n} kayıt`)).join('')}</div>
<div class="tw"><table><thead><tr><th>Tarih</th><th>İş</th><th>Boyut</th><th>5s kullanım</th></tr></thead><tbody>${[...cost].reverse().slice(0, 15).map((m) => `<tr><td class="num nw">${e(m.date)}</td><td>${md(m.job)}</td><td>${e(m.size)}</td><td class="num">${Number.isNaN(m.diff) ? '-' : `%${m.diff}`}</td></tr>`).join('')}</tbody></table></div>` : empty('Henüz kayıt yok. `/build` her görevin limit maliyetini buraya yazar.')}</section>`;

const daysBadge = (t) => (t.left < 0 ? badge('critical', `${-t.left} gün geçti`) : t.left <= 30 ? badge('warn', `${t.left} gün`) : badge('good', `${t.left} gün`));
const operations = `
<section class="card"><h3>Hesaplar ve son tarihler</h3>${accountList.length ? `<div class="tw"><table><thead><tr><th>Servis</th><th>Amaç</th><th>Sahip</th><th>2FA</th><th>Plan</th><th>Tarihler</th></tr></thead><tbody>${accountList.map((h) => `<tr><td><b>${e(h.service)}</b></td><td>${e(h.purpose)}</td><td>${e(h.owner)}</td><td>${h.noTwoFactor ? badge('warn', 'yok') : e(h.twoFactor)}</td><td>${e(h.plan)}</td><td>${h.dates.map((t) => `<div class="nw">${e(t.kind)}: ${e(t.date)} ${daysBadge(t)}</div>`).join('') || '<span class="muted">-</span>'}</td></tr>`).join('')}</tbody></table></div>` : empty('Hesap envanteri boş.', 'docs/operations/accounts.md')}</section>
<section class="card"><h3>Harcama alarmları</h3>${alarmList.length ? `<div class="tw"><table><thead><tr><th>Servis</th><th>Tür</th><th>Tutar</th><th>Uyarı eşikleri</th><th>Son kontrol</th></tr></thead><tbody>${alarmList.map((alarm) => `<tr><td><b>${e(alarm.service)}</b></td><td>${e(alarm.kind)}</td><td>${alarm.unset ? badge('warn', 'ayarlanmadı') : e(alarm.amount)}</td><td>${e(alarm.thresholds)}</td><td class="nw">${e(alarm.lastCheck || '-')} ${alarm.stale ? badge('info', 'kontrol et') : ''}</td></tr>`).join('')}</tbody></table></div>` : empty('Ücretli servis için alarm kaydı yok.', 'docs/operations/spend-alarms.md')}</section>
<section class="card"><h3>Özellik bayrakları</h3>${flagList.length ? `<div class="tw"><table><thead><tr><th>Bayrak</th><th>Amaç</th><th>Durum</th><th>Kaldırma</th><th>Acil kapatma</th></tr></thead><tbody>${flagList.map((b) => `<tr><td><code>${e(b.name)}</code></td><td>${md(b.purpose)}</td><td>${e(b.state)}</td><td class="nw">${e(b.removal)} ${b.isOverdue ? badge('warn', 'gecikti') : ''}</td><td>${b.untested ? badge('warn', 'denenmedi') : badge('good', 'denendi')}</td></tr>`).join('')}</tbody></table></div>` : empty('Bayrak yok.', 'docs/operations/feature-flags.md')}</section>
<section class="card"><h3>GitHub</h3>${github ? `
  ${github.liveRun ? `<p><b>Canlı izleme</b> · son çalışma ${fmtDate(github.liveRun.createdAt)} ${github.liveRun.conclusion === 'skipped' ? `${badge('info', 'kurulmadı')} <span class="muted small">GitHub → Settings → Variables'a LIVE_URL ekle</span>` : github.liveRun.conclusion === 'success' ? badge('good', 'başarılı') : github.liveRun.conclusion === 'failure' ? `${badge('critical', 'başarısız')} <span class="muted small">/fix-bug</span>` : badge('info', github.liveRun.conclusion || github.liveRun.status)} <a href="${e(github.liveRun.url)}" target="_blank" rel="noopener">kayıt</a></p>` : ''}
  ${github.liveMonitoring?.length ? `<p>${badge('critical', 'Canlı izleme bozuk')} ${github.liveMonitoring.map((i) => `<a href="${e(i.url)}" target="_blank" rel="noopener">#${e(i.number)} ${e(i.title)}</a>`).join(', ')}</p>` : ''}
  <h4>Son iş akışları</h4>${github.runs?.length ? `<div class="tw"><table><thead><tr><th>İş akışı</th><th>Dal</th><th>Sonuç</th><th>Zaman</th></tr></thead><tbody>${github.runs.map((c) => `<tr><td><a href="${e(c.url)}" target="_blank" rel="noopener">${e(c.workflowName)}</a></td><td><code>${e(c.headBranch)}</code></td><td>${c.conclusion === 'success' ? badge('good', 'başarılı') : c.conclusion === 'failure' ? badge('critical', 'başarısız') : badge('info', c.conclusion || c.status)}</td><td class="num nw">${fmtDate(c.createdAt)}</td></tr>`).join('')}</tbody></table></div>` : empty('Henüz çalışma yok.')}
  <h4>Açık PR'lar</h4>${github.prs?.length ? `<ul>${github.prs.map((r) => `<li><a href="${e(r.url)}" target="_blank" rel="noopener">#${e(r.number)} ${e(r.title)}</a>${r.isDraft ? ' <span class="tag">taslak</span>' : ''}</li>`).join('')}</ul>` : empty('Açık PR yok.')}
  <p class="muted small">gh CLI ile okunur, 5 dakikada bir yenilenir.</p>` : empty('GitHub bilgisi yok: gh CLI kurulu ve giriş yapılmış olmalı, depo GitHub\'a bağlı olmalı.')}</section>`;

const healthSeverity = (p) => (p >= 85 ? 'good' : p >= 70 ? 'info' : p >= 50 ? 'warn' : 'critical');
const healthLabel = (p) => (p >= 85 ? 'Sağlıklı' : p >= 70 ? 'İyi' : p >= 50 ? 'Dikkat' : 'Riskli');
const findingsSection = `
<section class="card"><h3>Alan sağlık puanları</h3>${Object.keys(findings.latest).length ? `<div class="kpis mini">${Object.keys(FINDING_KINDS).filter((t) => findings.latest[t]).map((t) => {
  const r = findings.latest[t];
  const diff = r.previous != null ? r.health - r.previous : null;
  return kpi(FINDING_KINDS[t], `${r.health}/100`, `${badge(healthSeverity(r.health), healthLabel(r.health))} ${diff != null ? `<span class="num">${diff >= 0 ? '+' : ''}${diff}</span>` : ''}<br><a href="docs/findings/${e(t)}/latest.md" target="_blank" rel="noopener">${e(r.date)} · ${r.findings ?? '-'} bulgu${r.critical ? ` · ${r.critical} kritik` : ''}</a>`, progressBar(r.health, 100, healthSeverity(r.health)));
}).join('')}</div>${Object.keys(FINDING_KINDS).filter((t) => !findings.latest[t]).length ? `<p class="muted small">Henüz raporu olmayanlar: ${Object.keys(FINDING_KINDS).filter((t) => !findings.latest[t]).map((t) => `<code>/findings-${t}</code>`).join(' ')}</p>` : ''}` : empty('Henüz bulgu raporu yok. Başlamak için:', '/findings-tech')}</section>
<section class="card"><h3>Rapor geçmişi</h3>${findings.rows.length ? `<div class="tw"><table><thead><tr><th>Tarih</th><th>Tür</th><th>Sağlık</th><th>Değişim</th><th>Bulgu</th><th>Kritik</th><th>Rapor</th></tr></thead><tbody>${[...findings.rows].reverse().slice(0, 30).map((r) => `<tr><td class="num nw">${e(r.date)}</td><td>${e(FINDING_KINDS[r.kind] ?? r.kind)}</td><td>${badge(healthSeverity(r.health), `${r.health}`)}</td><td class="num">${r.previous != null ? `${r.health - r.previous >= 0 ? '+' : ''}${r.health - r.previous}` : '-'}</td><td class="num">${r.findings ?? '-'}</td><td class="num">${r.critical || '-'}</td><td>${md(r.report)}</td></tr>`).join('')}</tbody></table></div>` : empty('Rapor yok.')}
<p class="muted small">Puanlama: bulgu önemi = etki (40) + olasılık (25) + yayılım (20) + aciliyet (15); sağlık = 100 − ceza (kritik 15, yüksek 8, orta 4, düşük 1). Yöntem: <code>.claude/findings/protocol.md</code></p></section>`;

const TABS = [
  ['genel', 'Genel', overview], ['yol', 'Yol haritası', roadmapSection], ['kararlar', `Kararlar`, decisionTable],
  ['kurul', 'Kurul', boardSection], ['bulgular', 'Bulgular', findingsSection], ['kalite', 'Kalite', quality], ['aktivite', 'Aktivite', activity],
  ['urun', 'Ürün ve teknik', product], ['operasyon', 'Operasyon', operations], ['limit', 'Limit ve maliyet', limitSection],
];

const next = d.next[0] ?? (d.kitPending ? '`/start [fikrin]`' : '-');
const html = `<!doctype html>
<html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${e(d.project)} · Kontrol paneli</title>
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
.att{list-style:none;padding:0;gap:8px}.att li{display:grid;grid-template-columns:auto 1fr;gap:4px 10px;align-items:start;padding:8px 10px;border-radius:8px;background:var(--sunk)}
.att li.critical{background:var(--crit-bg)}.att li.warn{background:var(--warn-bg)}.att .eylem{grid-column:2;font-size:.8rem;color:var(--muted)}
.badge{display:inline-flex;gap:4px;align-items:center;font:600 .74rem/1 var(--sans);padding:4px 8px;border-radius:999px;white-space:nowrap}
.badge.good{background:var(--good-bg);color:var(--fg)}.badge.warn{background:var(--warn-bg);color:var(--fg)}.badge.critical{background:var(--crit-bg);color:var(--fg)}.badge.info{background:var(--info-bg);color:var(--fg)}
.ic{font-weight:700}.good .ic{color:var(--good)}.warn .ic{color:#b07800}.critical .ic{color:var(--crit)}.info .ic{color:var(--muted)}
@media (prefers-color-scheme:dark){.warn .ic{color:var(--warn)}}
.health{font-size:.85rem;padding:6px 12px}
.daha{margin-top:8px}.daha summary{cursor:pointer;font-size:.84rem;color:var(--accent);font-weight:600;padding:4px 0}.daha .att{margin-top:8px}
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
details.faz summary{display:flex;flex-wrap:wrap;gap:10px;justify-content:space-between;align-items:center;cursor:pointer;list-style:none}
details.faz summary::-webkit-details-marker{display:none}.faz-bar{display:flex;gap:8px;align-items:center;min-width:200px}.faz-bar .bar{flex:1}
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
.t-karar .ft{background:var(--accent-soft);color:var(--accent)}.t-kurul .ft{background:var(--warn-bg)}.t-bakim .ft{background:var(--good-bg)}
.members{list-style:none;padding:0;gap:8px}.members li{display:grid;gap:2px;padding:8px 10px;border-radius:8px;background:var(--sunk)}
.dl{display:grid;grid-template-columns:auto 1fr;gap:6px 14px;margin:0}.dl dt{color:var(--muted);font-size:.84rem}.dl dd{margin:0}
.links a{margin-right:8px}
.spark{display:grid;grid-template-columns:repeat(14,1fr);gap:4px;height:90px;align-items:end;padding-top:8px;border-bottom:1px solid var(--line)}
.sb{height:100%;display:flex;align-items:flex-end;cursor:default;position:relative}.sb span{display:block;width:100%;background:var(--accent);border-radius:4px 4px 0 0}
.sb:hover span{filter:brightness(1.15)}.spark-x{display:flex;justify-content:space-between;margin-top:4px}
#tip{position:fixed;pointer-events:none;background:var(--fg);color:var(--bg);font-size:.78rem;padding:5px 8px;border-radius:6px;opacity:0;transition:opacity .1s;z-index:10}
.tablo-gor{margin-top:10px}.empty{color:var(--muted);font-size:.88rem}
.lim{display:grid;gap:8px;padding:12px;border-radius:10px;background:var(--sunk)}.lim-h{display:flex;justify-content:space-between;align-items:center}
footer{color:var(--muted);font-size:.78rem;padding-top:8px}
@media (prefers-reduced-motion:reduce){*{scroll-behavior:auto!important;transition:none!important}}
</style></head><body><div class="wrap">

<header class="top">
  <div><h1>${e(d.project)}</h1></div>
  <div class="meta">
    ${badge(health, health === 'good' ? 'Yolunda' : health === 'warn' ? 'Dikkat gerekiyor' : 'Engel var').replace('class="badge', 'class="badge health')}
    ${d.kit?.type ? `<span class="pill">${e(d.kit.type)}${d.kit.addons?.length ? ' + ' + e(d.kit.addons.join(', ')) : ''}</span><span class="pill">kit ${e(d.kit.version)}</span>${d.kit.tool?.some((t) => t !== 'claude') ? `<span class="pill">${e(d.kit.tool.join(' + '))}</span>` : ''}` : '<span class="pill">kit kurulmadı</span>'}
    ${git?.branch ? `<span class="pill">⎇ ${e(git.branch)}</span>` : ''}
    <label class="refresh"><input type="checkbox" id="oto" checked> 30 sn'de yenile</label>
  </div>
</header>

<div class="hero">
  <section class="card" aria-labelledby="simdi">
    <div class="now-l" id="simdi">Şimdi</div>
    <div class="now-v">${e(a['Aktif faz'] ?? '-')} · ${md(a['Aktif görev'] ?? '-')}</div>
    <div class="now-grid">
      <div><div class="now-l">Soru modu</div><div>${e(a['Soru modu'] ?? '-')}</div></div>
      <div><div class="now-l">Profil</div><div>${e(a['Profil'] ?? '-')}</div></div>
      <div><div class="now-l">Son güncelleme</div><div class="num">${e(a['Son güncelleme'] ?? '-')}</div></div>
      ${/başlangıç/i.test(a['Aktif faz'] ?? '') ? `<div><div class="now-l">Başlangıç adımı</div><div class="num">${e(a['Başlangıç adımı'] ?? '-')}</div></div>` : ''}
    </div>
    <div class="next"><div class="now-l">Sıradaki adım</div><div>${md(next)}</div></div>
    ${d.state ? `<div class="now-l" style="margin-top:14px">Durum</div><p style="margin-top:4px">${md(d.state)}</p>` : ''}
    ${d.lastSession.length ? `<div class="now-l" style="margin-top:10px">Son oturumda</div><ul style="margin-top:4px">${d.lastSession.slice(0, 4).map((x) => `<li>${md(x)}</li>`).join('')}</ul>` : ''}
  </section>
  <section class="card" aria-labelledby="dikkat">
    <h3 id="dikkat">Dikkat gerektirenler <span class="muted small">(${alerts.length})</span></h3>
    ${alerts.length ? `<ul class="att">${alerts.slice(0, 6).map(alertRow).join('')}</ul>${alerts.length > 6 ? `<details class="daha"><summary>${alerts.length - 6} madde daha</summary><ul class="att">${alerts.slice(6).map(alertRow).join('')}</ul></details>` : ''}` : `<p>${badge('good', 'Her şey yolunda')} Bekleyen karar, kritik bulgu veya açık sorun yok.</p>`}
  </section>
</div>

<div class="kpis">
  ${kpi('Görevler', `${d.taskCount.done}/${d.taskCount.total}`, `%${percent(d.taskCount.done, d.taskCount.total)} tamam`, progressBar(d.taskCount.done, d.taskCount.total))}
  ${acceptance.total ? kpi('Kabul testleri', `${acceptance.passing}/${acceptance.total}`, `${acceptance.tested} kriterin testi var`, progressBar(acceptance.passing, acceptance.total, 'good')) : kpi('MVP kriterleri', `${mvpCriteria.done}/${mvpCriteria.total}`, `${mvp.length} özellik`, progressBar(mvpCriteria.done, mvpCriteria.total))}
  ${kpi('Kararlar', d.decisions.length, `${d.decisions.length - autoDecisions} kullanıcı · ${autoDecisions} otomatik`)}
  ${kpi('Kurul', d.board.meetings.length, rejectCount ? `${rejectCount} RET` : `${d.board.members.length} üye`)}
  ${kpi('Commit · 7 gün', git ? last7 : '-', git ? `${git.changed.length} dosya bekliyor` : 'git yok')}
  ${kpi('Limit', limit?.five_hour ? `%${Math.round(limit.five_hour.percent)}` : '-', limit?.seven_day ? `haftalık %${Math.round(limit.seven_day.percent)} · ${limitLevel}` : 'bilinmiyor', limit?.five_hour ? progressBar(Math.round(limit.five_hour.percent), 100, limitSeverity(limit.five_hour.percent, 'five_hour')) : '')}
</div>

<nav class="tabs" role="tablist" aria-label="Bölümler">
${TABS.map(([id, name], i) => `<button class="tab" role="tab" id="t-${id}" aria-controls="p-${id}" aria-selected="${i === 0}" data-id="${id}">${name}</button>`).join('')}
</nav>
${TABS.map(([id, , content], i) => `<div class="panel" role="tabpanel" id="p-${id}" aria-labelledby="t-${id}" ${i ? 'hidden' : ''}>${content}</div>`).join('\n')}

<footer>Üretildi: ${new Date().toLocaleString('tr-TR')} · Kaynak: docs/*.md, git, .claude/state/usage.json · Her Claude cevabından sonra otomatik güncellenir (<code>node .claude/hooks/dashboard.mjs</code>)</footer>
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
      document.querySelectorAll('#kararlar tbody tr').forEach(function (r) {
        r.hidden = !(k === 'hepsi' || r.dataset.k === k || (k === 'otomatik' && r.dataset.v === 'otomatik') || (k === 'tek' && r.dataset.kapi === 'tek'));
      });
    });
  });

  var tip = document.getElementById('tip');
  document.querySelectorAll('[data-tip]').forEach(function (el) {
    el.addEventListener('mousemove', function (ev) { tip.textContent = el.dataset.tip; tip.style.opacity = 1; tip.style.left = ev.clientX + 12 + 'px'; tip.style.top = ev.clientY - 30 + 'px'; });
    el.addEventListener('mouseleave', function () { tip.style.opacity = 0; });
  });

  var auto = document.getElementById('oto'), timer;
  try { auto.checked = localStorage.getItem('durum-oto') !== '0'; } catch (er) {}
  function schedule() { clearTimeout(timer); if (auto.checked) timer = setTimeout(function () { location.reload(); }, 30000); }
  auto.addEventListener('change', function () { try { localStorage.setItem('durum-oto', auto.checked ? '1' : '0'); } catch (er) {} schedule(); });
  schedule();
})();
</script>
</body></html>
`;

fs.writeFileSync(file('dashboard.html'), html);
if (!quiet) console.log(`dashboard.html güncellendi · ${d.taskCount.done}/${d.taskCount.total} görev · ${d.decisions.length} karar · ${alerts.length} dikkat`);
