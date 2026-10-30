// Extra data sources for dashboard.html (testable pure functions + small readers).
// Acceptance tests, account deadlines, flags, unit economics, feedback, metrics, GitHub status.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { readText, sections, findSection, tableRows, labels } from './status-read.mjs';
import { isValue, VALUES } from './labels.mjs';
import { t } from './lang.mjs';

const DAY = 864e5;
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s).trim());
export const daysLeft = (date, now = Date.now()) => Math.ceil((Date.parse(`${date}T00:00:00`) - now) / DAY);

// ---------- acceptance tests ----------
// A criterion id is "AC-01.1" in the PRD and "AC-01.1" or "AC_01_1" in tests.
// Both normalize to the key "AC_01_1". Not after a letter: "ISO-27.1", "DEMO_01_2" or "MAC_01_1" is not a criterion
const CRITERION_ID = /(?<![A-Za-z])AC[-_](\d{2})[._](\d+)/g;
const key = (m1, m2) => `AC_${m1}_${m2}`;

export function prdCriteria(prdText) {
  return [...prdText.matchAll(/^\s*- \[( |x)\]\s*(AC-(\d{2})\.(\d+))\s*:?\s*(.*)$/gim)]
    .filter((m) => !m[5].startsWith('['))
    .map((m) => ({ id: m[2], key: key(m[3], m[4]), text: m[5].trim(), checked: m[1].toLowerCase() === 'x' }));
}

const SKIP_DIRS = new Set(['node_modules', '.git', '.next', '.venv', 'venv', '.expo', '.previews', '__pycache__', '.claude', '.dart_tool', '.gradle', 'Pods']);
// Only at the project root: src/features/build/ or src/kit/ may hold tests (the gate's spec check reads this too)
const ROOT_SKIP_DIRS = new Set(['dist', 'build', 'coverage', 'kit']);
const TEST_FILE = /(\.(test|spec)\.[cm]?[jt]sx?$)|(^test_.*\.py$)|(_test\.(py|go|dart)$)|(Tests?\.(kt|swift)$)|((^|[\\/])__tests__[\\/].*\.[cm]?[jt]sx?$)|(\.maestro[\\/].*\.ya?ml$)/;

export function idsInTests(root) {
  const found = new Set();
  let tally = 0;
  (function walk(dir, depth) {
    if (depth > 6 || tally > 3000) return;
    let dirEntries = [];
    try { dirEntries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of dirEntries) {
      if (SKIP_DIRS.has(e.name) || (depth === 0 && ROOT_SKIP_DIRS.has(e.name))) continue;
      const full = path.join(dir, e.name);
      if (e.isDirectory()) walk(full, depth + 1);
      // tests/e2e/qa/ holds /qa's uncommitted tests: they do not count as a criterion's test
      else if ((TEST_FILE.test(path.relative(root, full)) || TEST_FILE.test(e.name)) && !/(^|[\\/])e2e[\\/]qa[\\/]/.test(path.relative(root, full))) {
        tally++;
        for (const m of readText(full).matchAll(CRITERION_ID)) found.add(key(m[1], m[2]));
      }
    }
  })(root, 0);
  return found;
}

const xmlText = (s) => s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');

// One entry per JUnit testcase that is not skipped: the criterion keys in its name and, if it failed, the reason
export function* junitCases(xml) {
  for (const m of xml.matchAll(/<testcase\b([^>]*?)(?:\/>|>([\s\S]*?)<\/testcase>)/g)) {
    const name = (m[1].match(/\bname="([^"]*)"/)?.[1] ?? '') + ' ' + (m[1].match(/\bclassname="([^"]*)"/)?.[1] ?? '');
    const body = m[2] ?? '';
    // Tags are read outside CDATA and the captured output: a failing test that prints "<skipped" is not skipped
    const tags = body.replace(/<!\[CDATA\[[\s\S]*?\]\]>/g, '').replace(/<system-(out|err)\b[\s\S]*?<\/system-\1>/g, '');
    if (/<skipped\b/.test(tags)) continue;
    // Any failure/error tag fails the case (an unescaped ">" in an attribute or a missing end tag must not turn it green);
    // the stricter match only reads the reason
    const failed = /<(failure|error)\b/.test(tags);
    const f = body.match(/<(failure|error)\b([^>]*?)(?:\/>|>([\s\S]*?)<\/\1>)/);
    const reason = failed ? xmlText((f?.[3] ?? '').trim() || (f?.[2].match(/\bmessage="([^"]*)"/)?.[1] ?? '')) : null;
    yield { keys: [...name.matchAll(CRITERION_ID)].map((k) => key(k[1], k[2])), failed, reason };
  }
}

export function junitResults(xmlTexts) {
  const result = new Map();
  for (const xml of xmlTexts) {
    for (const c of junitCases(xml)) {
      for (const a of c.keys) result.set(a, c.failed || result.get(a) === 'failed' ? 'failed' : 'passed');
    }
  }
  return result;
}

// Latest /qa report (F-18); null without rows so the card is left out
export function qaSummary(text) {
  const rows = tableRows(text, 4).map(([criterion, result, evidence, note]) => ({ criterion, result, evidence, note }));
  if (!rows.length) return null;
  const count = (k) => rows.filter((x) => isValue(x.result, k)).length;
  return { passed: count('passed'), failed: count('failed'), notRun: count('notRun'), failures: rows.filter((x) => isValue(x.result, 'failed')) };
}

function junitFiles(root) {
  const candidates = [];
  for (const dir of ['test-results', 'reports', '.']) {
    try {
      for (const f of fs.readdirSync(path.join(root, dir))) if (/junit.*\.xml$|\.junit\.xml$|^TEST-.*\.xml$/i.test(f)) candidates.push(path.join(root, dir, f));
    } catch { /* no folder */ }
  }
  return candidates.map((f) => ({ text: readText(f), time: fs.statSync(f).mtimeMs }));
}

export function acceptanceStatus(root) {
  const criteria = prdCriteria(readText(path.join(root, 'docs/product/prd.md')));
  const tested = idsInTests(root);
  const reports = junitFiles(root);
  const results = junitResults(reports.map((r) => r.text));
  const list = criteria.map((k) => ({ ...k, test: tested.has(k.key) || results.has(k.key), result: results.get(k.key) ?? null }));
  return {
    list,
    reportTime: reports.length ? Math.max(...reports.map((r) => r.time)) : null,
    total: list.length,
    tested: list.filter((k) => k.test).length,
    passing: list.filter((k) => k.result === 'passed').length,
    mismatched: list.filter((k) => k.checked && k.result !== 'passed'),
  };
}

// "Must not change" lines of the specs (F-23): each AC id, whether a test carries it and its JUnit result.
// since: only reports written at or after this time count (the gate passes its own start: an old red report must not
// stop a commit whose tests pass now). Files starting with "_" (the template) are skipped. unreadable: lines that name
// an id but not in the "- AC-01.1: ..." form, so the check would silently skip them.
export function specInvariants(root, since = 0) {
  const dir = path.join(root, 'docs/product/specs');
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => f.endsWith('.md') && !f.startsWith('_')).sort(); } catch { return { invariants: [], unreadable: [] }; }
  const list = [], unreadable = [];
  for (const f of files) {
    const body = sections(readText(path.join(dir, f)))['Behavior that must not change'] ?? '';
    for (const line of body.split(/\r?\n/)) {
      const m = line.match(/^\s*-\s*(AC-(\d{2})\.(\d+))/);
      if (m) list.push({ spec: f, id: m[1], key: key(m[2], m[3]) });
      else if (/(?<![A-Za-z])AC[-_]\d{2}[._]\d+/.test(line)) unreadable.push({ spec: f, line: line.trim() });
    }
  }
  if (!list.length) return { invariants: [], unreadable };
  const tested = idsInTests(root);
  const results = junitResults(junitFiles(root).filter((r) => r.time >= since).map((r) => r.text));
  return { invariants: list.map((k) => ({ ...k, test: tested.has(k.key) || results.has(k.key), result: results.get(k.key) ?? null })), unreadable };
}

// Bug classes seen in two or more bug specs (F-21): a repeat is the cue to propose a rule. Only the fixed list counts
// ("other" and free text never do). A group closes once every spec has a "**Rule:**" answer (rule added or not needed);
// a new undecided spec in a decided class opens it again (the rule did not prevent the bug).
export const BUG_CLASSES = ['empty-input', 'validation', 'authorization', 'date-time', 'locale', 'sorting', 'concurrency', 'configuration', 'external-service', 'contract', 'ui-state'];
export function repeatedBugClasses(root) {
  const dir = path.join(root, 'docs/product/specs');
  let files = [];
  try { files = fs.readdirSync(dir).filter((f) => f.endsWith('.md') && !f.startsWith('_')).sort(); } catch { return []; }
  const byClass = new Map();
  for (const f of files) {
    const text = readText(path.join(dir, f));
    if (!isValue(text.match(/^\*\*Type:\*\*[ \t]*(.*)$/im)?.[1], 'bug')) continue;
    const raw = text.match(/^\*\*Class:\*\*[ \t]*`?([^\s`,.[\]]+)/im)?.[1] ?? '';
    const cls = BUG_CLASSES.find((c) => c === raw.toLowerCase());
    if (!cls) continue;
    const decided = /^\*\*Rule:\*\*[ \t]*[^\s[]/im.test(text);
    byClass.set(cls, [...(byClass.get(cls) ?? []), { f, decided }]);
  }
  return [...byClass].filter(([, list]) => list.length > 1 && list.some((s) => !s.decided)).map(([cls, list]) => ({ cls, specs: list.map((s) => s.f) }));
}

// ---------- accounts and flags ----------
export function accounts(text, now = Date.now()) {
  return tableRows(sections(text)['Accounts'], 8)
    .filter(([service]) => service && !service.startsWith('['))
    .map(([service, purpose, owner, twoFactor, plan, expiry, keyRotation]) => {
      const dates = [['expiry', expiry], ['keyRotation', keyRotation]].filter(([, t]) => isDate(t))
        .map(([kind, t]) => ({ kind, date: t, left: daysLeft(t, now) }));
      return { service, purpose, owner, twoFactor, plan, dates, noTwoFactor: isValue(twoFactor, 'no') || isValue(twoFactor, 'none') };
    });
}

// Dev/prod split and the RLS attacker test: the prod ref must not be in the AI's MCP config; with Supabase an RLS test must exist
export function envWarnings(root) {
  const u = [];
  const prodRef = tableRows(sections(readText(path.join(root, 'docs/operations/accounts.md')))['Environments (dev / prod)'], 4)
    // A real ref (Supabase: 20 characters); "-", "none", "n/a" would match anywhere in .mcp.json
    .find(([environment, , ref]) => environment === 'prod' && /^[a-z0-9][a-z0-9._:/-]{7,}$/i.test(ref ?? ''))?.[2];
  if (prodRef && readText(path.join(root, '.mcp.json')).includes(prodRef)) {
    u.push({ sev: 'critical', text: t(root, 'dashboardData.prodRefInMcp', { ref: prodRef }), action: t(root, 'dashboardData.prodRefAction') });
  }
  if (fs.existsSync(path.join(root, 'supabase/config.toml')) && !fs.existsSync(path.join(root, 'tests/security/rls.mjs'))) {
    u.push({ sev: 'warn', text: t(root, 'dashboardData.rlsMissing'), action: t(root, 'dashboardData.rlsAction') });
  }
  return u;
}

export function flags(text, now = Date.now()) {
  return tableRows(sections(text)['Flags'], 7).filter(([name]) => name)
    .map(([name, purpose, state, owner, added, removal, killSwitchTested]) => ({
      name, purpose, state, owner, added, removal, killSwitchTested,
      isOverdue: isDate(removal) && daysLeft(removal, now) < 0,
      untested: !(isValue(killSwitchTested, 'yes') || /^✅/.test(killSwitchTested ?? '')),
    }));
}

// ---------- unit economics ----------
export function unitEconomics(text) {
  const e = labels(text);
  const s = (k) => { const v = parseFloat(String(e[k] ?? '').replace(/[^\d.,-]/g, '').replace(',', '.')); return Number.isFinite(v) ? v : 0; };
  const price = s('Price (per user, monthly)');
  const commission = s('Payment fee (%)');
  const fixedCost = s('Fixed monthly cost');
  const variableCost = s('Variable cost per user (monthly)');
  const target = s('Target active users');
  const freeShare = Math.min(99, s('Free user share (%)'));
  if (!price && !fixedCost && !variableCost) return null;
  const margin = price * (1 - commission / 100) - variableCost;
  // Every paying user also carries the variable cost of the free users
  const freeCost = (freeShare / (100 - freeShare)) * variableCost;
  const effectiveMargin = margin - freeCost;
  const paying = target * (1 - freeShare / 100);
  const revenue = paying * price * (1 - commission / 100);
  const cost = fixedCost + target * variableCost;
  return {
    currency: e['Currency'] || '',
    price, margin, effectiveMargin,
    breakEven: effectiveMargin > 0 ? Math.ceil(fixedCost / effectiveMargin) : null,
    target, revenue, cost, profit: revenue - cost,
    variableRatio: price ? (variableCost / price) * 100 : null,
  };
}

// ---------- feedback and metrics ----------
const FEEDBACK_KINDS = ['bug', 'request', 'complaint', 'praise', 'question'];
const FEEDBACK_STATES = ['new', 'planned', 'done', 'rejected', 'merged'];
// A known value becomes its English form; anything else stays as written
const inEnglish = (v, keys) => VALUES[keys.find((k) => isValue(v, k))]?? v;
export function feedback(text) {
  const b = sections(text);
  const records = tableRows(b['Inbox'], 9).map(([no, date, source, user, summary, kind, theme, priority, state]) =>
    ({ no, date, summary, kind: inEnglish(kind, FEEDBACK_KINDS), theme, priority, state: inEnglish(state, FEEDBACK_STATES) }));
  const themes = tableRows(b['Themes'], 3).map(([theme, count, feature, decision]) => ({ theme, count: parseInt(count, 10) || 0, feature, decision }))
    .sort((x, y) => y.count - x.count);
  return { records, themes, newCount: records.filter((k) => k.state === 'new').length };
}

// Comprehension check answers (F-22, narrator mode); null without rows so the card is left out
export function learning(text) {
  // Only right / wrong rows count; a skipped or malformed answer is not a wrong one
  const rows = tableRows(sections(text)['Records'], 4).filter(([, , , result]) => isValue(result, 'right') || isValue(result, 'wrong'))
    .map(([date, task, concept, result]) => ({ concept, right: isValue(result, 'right') }));
  if (!rows.length) return null;
  const missed = new Map();
  for (const r of rows) if (!r.right) missed.set(r.concept, (missed.get(r.concept) ?? 0) + 1);
  return { right: rows.filter((r) => r.right).length, wrong: rows.filter((r) => !r.right).length,
    missed: [...missed].map(([concept, count]) => ({ concept, count })).sort((x, y) => y.count - x.count) };
}

export function metrics(text) {
  return tableRows(sections(text)['Records'], 9)
    .map(([period, taskCount, duration, limit, fixes, reverts, duplicates, critical, acceptance]) => ({ period, taskCount, duration, limit, fixes, reverts, duplicates, critical, acceptance }));
}

// ---------- finding reports ----------
export const FINDING_KINDS = { tech: 'Tech', business: 'Business', security: 'Security', ux: 'UX', perf: 'Performance', legal: 'Legal' };
const findingKind = (v) => {
  const low = v.toLowerCase();
  return Object.keys(FINDING_KINDS).find((k) => k === low || FINDING_KINDS[k].toLowerCase() === low) ?? low;
};
export function findingReports(text) {
  const count = (x) => { const n = parseInt(String(x ?? '').trim().replace(/^[^\d-]+/, ''), 10); return Number.isFinite(n) ? n : null; };
  const rows = tableRows(sections(text)['Reports'], 7)
    .map(([date, kind, health, previous, findings, critical, report]) => ({
      date, kind: findingKind(kind), health: count(health), previous: count(previous), findings: count(findings), critical: count(critical) ?? 0, report,
    }))
    .filter((r) => r.date && r.health != null);
  const latest = {};
  // An area name the kit does not know is listed, but has no card
  for (const r of rows) if (Object.hasOwn(FINDING_KINDS, r.kind) && (!latest[r.kind] || r.date >= latest[r.kind].date)) latest[r.kind] = r;
  return { rows, latest };
}

// ---------- Produced assets: brand kit (logo-design), promo videos (motion-video), research notes (source-research) ----------
export function producedAssets(root) {
  const list = (k) => { try { return fs.readdirSync(path.join(root, k), { withFileTypes: true }); } catch { return []; } };
  const brandDir = ['public/brand', 'assets/brand'].find((k) => list(k).length) ?? null;
  const brand = brandDir ? list(brandDir).filter((f) => f.isFile()).map((f) => f.name).sort() : [];
  const videos = list('marketing/motion').filter((f) => f.isDirectory()).map((f) => {
    const k = `marketing/motion/${f.name}`;
    const mp4 = [`${k}/out`, k].flatMap((d) => list(d).filter((x) => x.isFile() && x.name.endsWith('.mp4')).map((x) => `${d}/${x.name}`))[0] ?? null;
    return { name: f.name, mp4 };
  });
  const research = list('docs/research')
    .filter((f) => f.isFile() && f.name.endsWith('.md') && f.name !== 'README.md')
    .map((f) => {
      const file = `docs/research/${f.name}`;
      const title = readText(path.join(root, file)).match(/^#\s+(.+)$/m)?.[1] ?? f.name.replace(/\.md$/, '');
      return { file, title };
    })
    .sort((x, y) => y.file.localeCompare(x.file));
  let codeMapDays = null;
  try { codeMapDays = Math.floor((Date.now() - fs.statSync(path.join(root, '.ua/knowledge-graph.json')).mtimeMs) / 864e5); } catch {}
  return { brandDir, brand, brandGuide: fs.existsSync(path.join(root, 'docs/design/brand.md')), videos, research, codeMapDays };
}

// ---------- Spend alarms (docs/operations/spend-alarms.md) ----------
export function spendAlarms(text, now = Date.now()) {
  return tableRows(sections(text)['Alarms'], 6).filter(([service]) => service)
    .map(([service, kind, amount, thresholds, where, lastCheck]) => ({
      service, kind, amount, thresholds, where, lastCheck,
      unset: !/\d/.test(amount ?? ''),
      stale: isDate(lastCheck) ? daysLeft(lastCheck, now) < -35 : true,
    }));
}

// ---------- Council minutes (docs/workflow/council/*.md; written by council.mjs and board-chair) ----------
export function councilMinutes(root) {
  const folder = path.join(root, 'docs', 'workflow', 'council');
  let files = [];
  try { files = fs.readdirSync(folder).filter((f) => f.endsWith('.md') && f !== 'README.md'); } catch { return []; }
  return files.map((f) => {
    const text = readText(path.join(folder, f));
    const a = {};
    for (const [, k, v] of text.matchAll(/\*\*([^*:]+):\*\*\s*([^·\n]*)/g)) a[k.trim()] ??= v.trim();
    const b = sections(text);
    const ranking = tableRows(findSection(b, '3.'), 3).filter(([g]) => /^[A-Z]$/.test(g));
    const idsByLetter = Object.fromEntries([...(b['IDs'] ?? '').matchAll(/([A-Z])\s*=\s*([^·\n]+)/g)].map((m) => [m[1], m[2].trim()]));
    const consensus = a['Consensus']?.match(/\d+/)?.[0];
    return {
      file: `docs/workflow/council/${f}`,
      topic: text.match(/^#\s+Council:\s*(.+)$/m)?.[1] ?? f.replace(/\.md$/, ''),
      date: a['Date'] ?? f.slice(0, 10),
      kind: a['Type'] ?? '-',
      decision: a['Decision'] || a['Recommendation'] || null,
      consensus: consensus ? Number(consensus) : null,
      disputed: Number(a['Disputed'] ?? 0) || 0,
      eliminated: Number(a['Eliminated'] ?? 0) || 0,
      ranking: ranking.map(([g, avg]) => ({ opinion: g, who: idsByLetter[g] ?? null, average: avg })),
    };
  }).sort((x, y) => y.date.localeCompare(x.date) || y.file.localeCompare(x.file));
}

// ---------- Tokens and cost (ccusage; written by cost.mjs) ----------
// Claude Code transcript folder name: every non letter/digit character in the project path becomes "-"
export const ccusageProjectName = (root) => path.resolve(root).replace(/[^a-zA-Z0-9]/g, '-');
export function costSummary(data) {
  const days = Object.values(data?.projects ?? {}).flat().concat(data?.daily ?? [])
    .map((g) => ({ date: g.date ?? g.period, token: g.totalTokens ?? 0, cost: g.totalCost ?? 0, output: g.outputTokens ?? 0 }))
    .filter((g) => g.date)
    .sort((a, b) => a.date.localeCompare(b.date));
  const total = days.reduce((t, g) => ({ token: t.token + g.token, cost: t.cost + g.cost }), { token: 0, cost: 0 });
  return { days, total };
}

// ---------- GitHub (if gh exists, 5 min cache) ----------
export function githubStatus(root, now = Date.now()) {
  const file = path.join(root, '.claude', 'state', 'github-cache.json');
  // Links go into href: only https (a hand-written cache must not bring javascript:); a cache time in the future is stale
  const safe = (data) => {
    for (const x of [...(data?.runs ?? []), ...(data?.prs ?? []), ...(data?.liveMonitoring ?? []), data?.liveRun].filter(Boolean))
      if (!/^https:\/\//.test(String(x.url ?? ''))) x.url = '';
    return data;
  };
  try {
    const o = JSON.parse(fs.readFileSync(file, 'utf8'));
    if (now - o.time >= 0 && now - o.time < 5 * 60e3) return safe(o.data);
  } catch { /* no cache */ }
  const gh = (...a) => JSON.parse(execFileSync('gh', a, { cwd: root, encoding: 'utf8', timeout: 8000, stdio: ['ignore', 'pipe', 'ignore'] }));
  let data = null;
  try {
    data = {
      runs: gh('run', 'list', '--limit', '8', '--json', 'workflowName,conclusion,status,headBranch,createdAt,url'),
      prs: gh('pr', 'list', '--limit', '10', '--json', 'number,title,isDraft,url,headRefName'),
      liveMonitoring: gh('issue', 'list', '--label', 'live-monitoring', '--state', 'open', '--json', 'number,title,url'),
    };
  } catch {
    data = null; // no gh, not logged in, or no remote
  }
  // Separate call: the live workflow may be missing (mobile) or older than the last 8 runs; a failure here must not hide the rest
  if (data) try { data.liveRun = gh('run', 'list', '--workflow', 'live-monitoring.yml', '--limit', '1', '--json', 'conclusion,status,createdAt,url')[0] ?? null; } catch { data.liveRun = null; }
  try { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify({ time: now, data })); } catch { /* silent */ }
  return safe(data);
}

export function readContext(root) {
  try {
    const c = JSON.parse(fs.readFileSync(path.join(root, '.claude', 'state', 'context.json'), 'utf8'));
    return typeof c?.percent === 'number' ? { percent: c.percent, readAt: c.readAt } : null;
  } catch { return null; }
}
