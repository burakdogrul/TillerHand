// Run: node --test "kit/tests/*.test.mjs"
// 3.48.0 step 4c: command arguments, package names, decision topics and the acceptance criterion id move to English.
// Hooks and commands accept both languages for the whole 3.x line; what they write or print is English.
//   /tools packages: design, security, release, video (old tasarim, guvenlik, yayin still work as input)
//   decision topics: product, tech, design, content, data, security, cost (old urun ... maliyet count under them)
//   criterion id: AC-01.1 / AC_01_1 next to the old Ö-01.1 / O_01_1, all four tie to the same criterion
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PACKAGES, setPackage, packageStatus } from '../../.claude/hooks/tools.mjs';
import { prdCriteria, junitCases, junitResults, idsInTests, acceptanceStatus, specInvariants } from '../../.claude/hooks/dashboard-data.mjs';
import { qaReport } from '../../.claude/hooks/qa-report.mjs';
import { approvalPath } from '../../.claude/hooks/gate.mjs';
import { t } from '../../.claude/hooks/lang.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const HOOKS = path.join(REPO, '.claude', 'hooks');
const lines = (...a) => a.join('\n');
const made = [];
const approvals = [];
after(() => {
  for (const f of approvals) fs.rmSync(f, { force: true });
  for (const p of made) fs.rmSync(p, { recursive: true, force: true });
});

function project(files = {}, prefix = 'args-lang-') {
  const p = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  made.push(p);
  for (const [f, s] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(p, f)), { recursive: true });
    fs.writeFileSync(path.join(p, f), typeof s === 'string' ? s : JSON.stringify(s));
  }
  return p;
}

// ---------- 1. /tools packages ----------

const PAIRS = [['tasarim', 'design'], ['guvenlik', 'security'], ['yayin', 'release'], ['video', 'video']];
const ENGLISH = ['design', 'security', 'release', 'video'];
const OLD = ['tasarim', 'guvenlik', 'yayin'];

// Every package plugin is defined in the project and off by default
function toolsProject(enabledPlugins) {
  const all = Object.fromEntries(Object.values(PACKAGES).flatMap((k) => k.plugins).map((id) => [id, false]));
  return project({ '.claude/settings.json': { enabledPlugins: enabledPlugins ?? { ...all, 'ponytail@ponytail': true } } }, 'args-tools-');
}
const emptyConfig = () => project({}, 'args-cfg-');
const tools = (p, args, cfg = emptyConfig()) => spawnSync(process.execPath, [path.join(HOOKS, 'tools.mjs'), ...args], {
  encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: p, CLAUDE_CONFIG_DIR: cfg }, timeout: 15000,
});
const local = (p) => JSON.parse(fs.readFileSync(path.join(p, '.claude/settings.local.json'), 'utf8')).enabledPlugins;

test('Ö-48.49 tools: the package names are English, in PACKAGES and in packageStatus()', () => {
  assert.deepEqual(Object.keys(PACKAGES), ENGLISH);
  const p = toolsProject();
  assert.deepEqual(packageStatus(p).map((d) => d.name), ENGLISH);
  // The packages keep their plugins under the new name
  assert.equal(PACKAGES.design.plugins.includes('taste-skill@taste-skill'), true);
  assert.equal(PACKAGES.security.plugins.includes('claude-security@claude-plugins-official'), true);
  assert.equal(PACKAGES.release.plugins.includes('session-report@claude-plugins-official'), true);
  assert.equal(PACKAGES.video.plugins.includes('remotion@remotion'), true);
});

test('Ö-48.50 tools: setPackage takes the old Turkish name and acts on the same English package', () => {
  for (const [old, name] of PAIRS) {
    const p = toolsProject();
    const ids = setPackage(p, old, true);
    assert.deepEqual(ids, PACKAGES[name].plugins, `${old}: the plugins of ${name}`);
    for (const id of ids) assert.equal(local(p)[id], true, `${old}: ${id} enabled`);
    assert.equal(packageStatus(p).find((d) => d.name === name)?.enabled, true, `${old}: ${name} shows enabled`);
    assert.deepEqual(packageStatus(p).filter((d) => d.enabled).map((d) => d.name), [name], `${old}: only ${name} is on`);
    // Disabling with the English name undoes what the old name did, and the other way round
    assert.deepEqual(setPackage(p, name, false), ids);
    assert.deepEqual(local(p), {}, `${name}: back to the project default`);
    setPackage(p, name, true);
    setPackage(p, old, false);
    assert.deepEqual(local(p), {}, `${old}: disables what ${name} enabled`);
  }
});

test('Ö-48.51 tools CLI: --enable / --disable / --required with an old name print the English package name', () => {
  for (const [old, name] of PAIRS.filter(([o, n]) => o !== n)) {
    const p = toolsProject();
    const off = tools(p, ['--required', old]);
    assert.equal(off.status, 2, `${old}: disabled is exit 2\n${off.stdout}${off.stderr}`);
    assert.match(off.stdout, new RegExp(`Package ${name} is disabled`));
    assert.match(off.stdout, new RegExp(`--enable ${name}\\b`));
    assert.doesNotMatch(off.stdout, new RegExp(old), `${old}: the old name is not printed`);

    const on = tools(p, ['--enable', old]);
    assert.equal(on.status, 0, on.stderr);
    assert.match(on.stdout, new RegExp(`Package ${name} enabled`));
    assert.doesNotMatch(on.stdout, new RegExp(old));
    const enabled = tools(p, ['--required', old]);
    assert.equal(enabled.status, 0);
    assert.match(enabled.stdout, new RegExp(`Package ${name} is enabled`));
    assert.doesNotMatch(enabled.stdout, new RegExp(old));
    assert.equal(tools(p, ['--required', name]).status, 0, `${name}: the same package is on`);

    const back = tools(p, ['--disable', old]);
    assert.equal(back.status, 0, back.stderr);
    assert.match(back.stdout, new RegExp(`Package ${name} back to the project default`));
    assert.doesNotMatch(back.stdout, new RegExp(old));
    assert.equal(tools(p, ['--required', name]).status, 2, `${name}: off again`);
  }
  // A package whose plugins are not in this project is named in English too
  const q = toolsProject({ 'taste-skill@taste-skill': false });
  const skip = tools(q, ['--required', 'yayin']);
  assert.equal(skip.status, 0);
  assert.match(skip.stdout, /Package release is not in this project/);
  const none = tools(q, ['--enable', 'yayin']);
  assert.equal(none.status, 0);
  assert.match(none.stdout, /package release are not defined/);
  assert.doesNotMatch(`${skip.stdout}${none.stdout}`, /yayin/);
});

test('Ö-48.51 tools CLI: the status table and --measure name the English packages only', () => {
  const p = toolsProject();
  const cfg = project({}, 'args-cfg-');
  const dir = path.join(cfg, 'plugins/cache/x/taste-skill');
  fs.mkdirSync(path.join(dir, 'skills/a'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'skills/a/SKILL.md'), `---\nname: a\ndescription: ${'x'.repeat(40)}\n---\nbody`);
  fs.writeFileSync(path.join(cfg, 'plugins/installed_plugins.json'), JSON.stringify({ plugins: { 'taste-skill@taste-skill': [{ scope: 'user', installPath: dir }] } }));
  const status = tools(p, [], cfg);
  assert.equal(status.status, 0, status.stderr);
  for (const name of ENGLISH) assert.match(status.stdout, new RegExp(`^\\s+${name}\\s+off\\b`, 'm'), `${name} row`);
  const measured = tools(p, ['--measure'], cfg);
  assert.equal(measured.status, 0, measured.stderr);
  assert.match(measured.stdout, /'design'/, 'taste-skill belongs to design');
  for (const old of OLD) assert.doesNotMatch(`${status.stdout}${measured.stdout}`, new RegExp(old), old);
});

test('A-48.17 tools: an unknown package fails and lists the English names only; prototype names are unknown too', () => {
  const p = toolsProject();
  for (const name of ['marketing', 'Design', 'TASARIM', 'tasarım', 'toString', 'valueOf', 'hasOwnProperty', 'constructor', '__proto__', '']) {
    let err = null;
    try { setPackage(p, name, true); } catch (h) { err = h; }
    assert.equal(err instanceof Error, true, `${JSON.stringify(name)}: throws`);
    assert.match(err.message, /Unknown package/, name);
  }
  assert.equal(fs.existsSync(path.join(p, '.claude/settings.local.json')), false, 'nothing is written');
  let msg = '';
  try { setPackage(p, 'marketing', true); } catch (h) { msg = h.message; }
  for (const name of ENGLISH) assert.match(msg, new RegExp(`\\b${name}\\b`), `lists ${name}`);
  for (const old of OLD) assert.doesNotMatch(msg, new RegExp(old), `does not list ${old}`);
  for (const flag of ['--enable', '--disable', '--required']) {
    const r = tools(p, [flag, 'marketing']);
    assert.equal(r.status, 1, `${flag}: exit 1`);
    for (const name of ENGLISH) assert.match(r.stderr, new RegExp(`\\b${name}\\b`), `${flag}: lists ${name}`);
    for (const old of OLD) assert.doesNotMatch(`${r.stdout}${r.stderr}`, new RegExp(old), `${flag}: does not list ${old}`);
  }
  assert.equal(fs.existsSync(path.join(p, '.claude/settings.local.json')), false, 'the CLI writes nothing either');
});

// ---------- 2. decision topics on the dashboard ----------

const TOPICS_EN = ['product', 'tech', 'design', 'content', 'data', 'security', 'cost'];
const TOPICS_TR = ['urun', 'teknik', 'tasarim', 'icerik', 'veri', 'guvenlik', 'maliyet'];
const KIT = { version: '3.48.0', type: 'web-saas', addons: [], tool: null, lang: 'en', created: '2026-10-01', updated: '2026-10-01', files: {} };
const CACHE = () => ({ time: Date.now(), data: { runs: [], prs: [], liveMonitoring: [] } });
const decisionLog = (topics) => lines('# Decisions', '', '## Decision log', '',
  '| # | Date | Stage | Topic | Question | Chosen | Door | Decided by |', '|---|---|---|---|---|---|---|---|',
  ...topics.map((topic, i) => `| ${i + 1} | 2026-10-${String(10 + i).padStart(2, '0')} | Phase 1 | ${topic} | Question ${i + 1}? | Option ${i + 1} | two-way | user |`), '');
const dashboardOf = (topics) => {
  const p = project({ '.kit.json': KIT, '.claude/state/github-cache.json': CACHE(), 'AGENTS.md': '# Topics\n', 'docs/decisions/log.md': decisionLog(topics) }, 'args-dash-');
  const r = spawnSync(process.execPath, [path.join(HOOKS, 'dashboard.mjs'), p, '--quiet'], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stderr);
  return { p, html: fs.readFileSync(path.join(p, 'dashboard.html'), 'utf8') };
};
const between = (html, marker, end) => {
  const i = html.indexOf(marker);
  assert.notEqual(i, -1, `marker not found: ${marker}`);
  return html.slice(i, html.indexOf(end, i + marker.length));
};
const keyOf = (attrs) => attrs.match(/\sdata-k="([^"]*)"/)?.[1] ?? null;
// The topic chips (All, the automatic and one-way chips left out) and the topic key of every decision row
function topicView({ p, html }) {
  const filters = between(html, `aria-label="${t(p, 'dashboard.topicFilter')}"`, '</div>');
  const chips = [...filters.matchAll(/<button\b([^>]*)>([^<]*)<\/button>/g)].map((m) => ({ key: keyOf(m[1]), text: m[2] }));
  const script = html.match(/<script>([\s\S]*?)<\/script>/)?.[1] ?? '';
  const tableId = script.match(/querySelectorAll\('#([\w-]+) tbody tr'\)/)?.[1];
  assert.equal(typeof tableId, 'string', 'the script filters the decision table by id');
  const body = between(between(html, `<table id="${tableId}">`, '</table>'), '<tbody>', '</tbody>');
  const rows = [...body.matchAll(/<tr\b([^>]*)>([\s\S]*?)<\/tr>/g)].map((m) => ({ key: keyOf(m[1]), html: m[2] }));
  return { all: chips[0], topics: chips.slice(1, -2), chips, rows };
}

test('Ö-48.52 dashboard: a "tasarim" row and a "design" row are one design chip with (2), both rows carry its key', () => {
  const v = topicView(dashboardOf(['tasarim', 'design']));
  assert.equal(v.all.text, 'All (2)');
  assert.deepEqual(v.topics.map((c) => c.text), ['design (2)']);
  assert.equal(v.chips.some((c) => /tasarim/.test(c.text) || c.key === 'tasarim'), false, 'no Turkish chip');
  const key = v.topics[0].key;
  assert.equal(typeof key, 'string');
  assert.deepEqual(v.rows.map((r) => r.key), [key, key], 'both rows are filtered by the design chip');
});

test('Ö-48.53 dashboard: every old topic counts under its English topic; a Turkish log and its English twin give the same chips and keys', () => {
  const en = topicView(dashboardOf(TOPICS_EN));
  const tr = topicView(dashboardOf(TOPICS_TR));
  assert.deepEqual(en.topics.map((c) => c.text).sort(), TOPICS_EN.map((k) => `${k} (1)`).sort());
  assert.deepEqual(tr.chips, en.chips, 'the same chips: labels, counts, keys, order');
  assert.deepEqual(tr.rows.map((r) => r.key), en.rows.map((r) => r.key), 'the same row keys');
  // Each row's key is the key of its topic chip
  const chipKey = Object.fromEntries(en.topics.map((c) => [c.text.replace(/ \(\d+\)$/, ''), c.key]));
  assert.deepEqual(en.rows.map((r) => r.key), [...TOPICS_EN].reverse().map((k) => chipKey[k]), 'newest first, one key per topic');
  assert.equal(new Set(en.rows.map((r) => r.key)).size, 7, 'seven different keys');
  // Old and new together: each topic shows (2)
  const mixed = topicView(dashboardOf([...TOPICS_TR, ...TOPICS_EN]));
  assert.deepEqual(mixed.topics.map((c) => c.text).sort(), TOPICS_EN.map((k) => `${k} (2)`).sort());
  assert.equal(mixed.all.text, 'All (14)');
});

test('A-48.18 dashboard: an unknown topic gets no chip and is shown as written; a topic word in the question makes no chip', () => {
  const v = topicView(dashboardOf(['marketing', 'tech']));
  assert.equal(v.all.text, 'All (2)', 'All still counts every decision');
  assert.deepEqual(v.topics.map((c) => c.text), ['tech (1)']);
  assert.equal(v.chips.some((c) => /marketing/.test(c.text) || c.key === 'marketing'), false, 'no chip for marketing');
  const row = v.rows.find((r) => r.html.includes('Question 1?'));
  assert.match(row?.html ?? '', /<span class="tag">marketing<\/span>/, 'shown as written');
  // "design" only in the question text: the row stays a tech decision
  const q = dashboardOf(['tech']);
  fs.writeFileSync(path.join(q.p, 'docs/decisions/log.md'), decisionLog(['tech']).replace('Question 1?', 'design or tasarim?'));
  spawnSync(process.execPath, [path.join(HOOKS, 'dashboard.mjs'), q.p, '--quiet'], { encoding: 'utf8' });
  const w = topicView({ p: q.p, html: fs.readFileSync(path.join(q.p, 'dashboard.html'), 'utf8') });
  assert.deepEqual(w.topics.map((c) => c.text), ['tech (1)']);
});

// ---------- 3. the acceptance criterion id AC-01.1 ----------

const FORMS = (n) => [`AC-01.${n}`, `test_AC_01_${n}_case`, `Ö-01.${n}`, `test_O_01_${n}_case`];
const keyOfPrd = (line) => {
  const c = prdCriteria(line);
  assert.equal(c.length, 1, `one criterion: ${line}`);
  return c[0].key;
};

test('Ö-48.54 prdCriteria: "- [ ] AC-01.1: text" is a criterion like "- [ ] Ö-01.1: text", with the same key', () => {
  const prd = lines('# PRD', '', '- [ ] AC-01.1: Required field is not saved empty', '- [x] AC-01.2: PDF downloads', '- [ ] Ö-02.1: Old form still reads',
    '- [ ] AC-02.2: [Observable behavior]', '- [ ] no id here', '');
  assert.deepEqual(prdCriteria(prd).map((k) => [k.id, k.text, k.checked]), [
    ['AC-01.1', 'Required field is not saved empty', false], ['AC-01.2', 'PDF downloads', true], ['Ö-02.1', 'Old form still reads', false],
  ]);
  assert.equal(keyOfPrd('- [ ] AC-01.1: a'), keyOfPrd('- [ ] Ö-01.1: a'), 'AC-01.1 and Ö-01.1 are the same criterion');
  assert.notEqual(keyOfPrd('- [ ] AC-01.1: a'), keyOfPrd('- [ ] AC-01.2: a'));
  assert.notEqual(keyOfPrd('- [ ] AC-01.1: a'), keyOfPrd('- [ ] AC-11.1: a'));
});

test('Ö-48.55 junitCases: AC-01.1, AC_01_1, Ö-01.1 and O_01_1 in a test name all tie to the same criterion, whichever form the PRD uses', () => {
  const want = keyOfPrd('- [ ] AC-01.1: a');
  assert.equal(keyOfPrd('- [ ] Ö-01.1: a'), want);
  for (const name of FORMS(1)) {
    const [c] = [...junitCases(`<testsuite><testcase name="${name}" classname="x"/></testsuite>`)];
    assert.deepEqual(c?.keys, [want], name);
    // The id may be in the classname only
    const [d] = [...junitCases(`<testsuite><testcase name="no id" classname="tests/${name}.spec.ts"/></testsuite>`)];
    assert.deepEqual(d?.keys, [want], `${name} in the classname`);
  }
  // One criterion tested under two forms is one entry, not two
  const r = junitResults([`<testsuite><testcase name="AC-01.1 a"/><testcase name="Ö-01.1 b"/><testcase name="test_AC_01_1_c"/><testcase name="test_O_01_1_d"/></testsuite>`]);
  assert.deepEqual([...r.entries()], [[want, 'passed']]);
});

// One project per PRD form, the same tests: Ö in one file, AC_ in Python, both forms for the third criterion
const criteriaProject = (form) => project({
  'docs/product/prd.md': lines('# PRD', '', `- [x] ${form}-01.1: Required field`, `- [ ] ${form}-01.2: List`, `- [ ] ${form}-01.3: Export`, `- [ ] ${form}-01.4: Import`, ''),
  'tests/form.spec.ts': "test('Ö-01.1 required field', () => {});\ntest('AC-01.3 export', () => {});\n",
  'tests/test_list.py': 'def test_AC_01_2_list():\n    pass\n\ndef test_O_01_3_export():\n    pass\n',
  'test-results/junit.xml': lines('<testsuites><testsuite>', '<testcase name="Ö-01.1 required field" classname="form"/>',
    '<testcase name="test_O_01_2_list" classname="tests.test_list"/>', '<testcase name="AC-01.3 export" classname="form"/>',
    '<testcase name="test_O_01_3_export" classname="tests.test_list"><failure message="boom"/></testcase>', '</testsuite></testsuites>'),
}, 'args-ac-');

test('Ö-48.56 acceptanceStatus: an AC PRD and an Ö PRD give the same result for the same tests; two forms count once; a failure in any form fails', () => {
  for (const form of ['AC', 'Ö']) {
    const p = criteriaProject(form);
    const s = acceptanceStatus(p);
    assert.deepEqual(s.list.map((k) => [k.id, k.test, k.result]), [
      [`${form}-01.1`, true, 'passed'], [`${form}-01.2`, true, 'passed'], [`${form}-01.3`, true, 'failed'], [`${form}-01.4`, false, null],
    ], form);
    assert.deepEqual([s.total, s.tested, s.passing], [4, 3, 2], `${form}: totals`);
    assert.deepEqual(s.mismatched.map((k) => k.id), [], `${form}: the checked criterion passed`);
    assert.equal(idsInTests(p).size, 3, `${form}: three criteria in the test files, the double-tested one counts once`);
  }
});

test('Ö-48.57 specInvariants: "- AC-01.1 ..." under "Behavior that must not change" reads like "- Ö-01.1 ..."', () => {
  const p = project({
    'docs/product/specs/G-07.md': lines('# Spec: G-07 Note search', '', '**Type:** feature', '', '## Current behavior', '', 'No search.', '',
      '## Expected behavior', '', 'Search in titles.', '', '## Behavior that must not change', '',
      '- AC-01.1: Note is saved', '- Ö-01.2: Another user\'s note is hidden', '- AC-02.1: List newest first', '- [ ] AC-03.1: boxed line',
      'AC-01.9 in prose is not in list form', ''),
    'tests/notes.test.mjs': "test('Ö-01.1 note is saved', () => {}); test('AC-01.2 other user', () => {});",
    'test-results/junit.xml': '<testsuite><testcase name="test_O_01_1_saved"><failure message="x"/></testcase><testcase name="AC_01_2_other"/></testsuite>',
  }, 'args-spec-');
  const { invariants, unreadable } = specInvariants(p);
  assert.deepEqual(invariants.map((k) => [k.spec, k.id, k.test, k.result]), [
    ['G-07.md', 'AC-01.1', true, 'failed'], ['G-07.md', 'Ö-01.2', true, 'passed'], ['G-07.md', 'AC-02.1', false, null],
  ]);
  assert.deepEqual(unreadable, [{ spec: 'G-07.md', line: '- [ ] AC-03.1: boxed line' }, { spec: 'G-07.md', line: 'AC-01.9 in prose is not in list form' }]);
});

test('Ö-48.58 gate: the unreadable spec line message shows the AC-01.1 form, not Ö-01.1', () => {
  const p = project({
    'AGENTS.md': '# X\n\n## Komutlar\n\n```bash\ntest:        node ok.mjs\nlint:        [ ]\ntip kontrol: [ ]\n```\n',
    'ok.mjs': '',
    'docs/product/specs/G-07.md': lines('# Spec: G-07', '', '## Behavior that must not change', '', '- [ ] AC-03.1: boxed line', ''),
  }, 'args-gate-');
  approvals.push(approvalPath(p));
  const env = { ...process.env, CLAUDE_PROJECT_DIR: p, SEMGREP: 'missing-semgrep-command' };
  const gate = (arg) => spawnSync(process.execPath, [path.join(HOOKS, 'gate.mjs'), arg], { cwd: p, encoding: 'utf8', env, timeout: 60000 });
  assert.equal(gate('--approve').status, 0);
  const r = gate('--run');
  const note = r.stdout.split(/\r?\n/).find((l) => /could not be read/.test(l)) ?? '';
  assert.match(note, /AC-03\.1: boxed line/, `the unreadable line is reported\n${r.stdout}`);
  assert.match(note, /"- AC-01\.1: \.\.\."/, 'the format to write is the AC form');
  assert.doesNotMatch(r.stdout, /Ö-01\.1/);
});

const QA_XML = (cases) => `<testsuites><testsuite>${cases}</testsuite></testsuites>`;
const qaProject = (prd, xml) => project({ 'docs/product/prd.md': prd, 'test-results-qa/junit.xml': xml }, 'args-qa-');

test('Ö-48.59 qa-report: the "no criterion" and "no test result" messages show the AC-01.1 form, not Ö-01.1', () => {
  const noCriterion = qaReport(qaProject('# PRD\n\n- [ ] a criterion without an id\n', QA_XML('<testcase name="AC-05.1 a"/>')));
  assert.equal(noCriterion.code, 2);
  assert.match(noCriterion.text, /AC-01\.1/);
  assert.doesNotMatch(noCriterion.text, /Ö-01\.1/);
  const noResult = qaReport(qaProject('# PRD\n\n- [ ] AC-05.1: Export\n', QA_XML('<testcase name="test without an id"/>')));
  assert.equal(noResult.code, 2);
  assert.match(noResult.text, /no test result tied to a PRD criterion/);
  assert.match(noResult.text, /AC-01\.1/);
  assert.doesNotMatch(noResult.text, /Ö-01\.1/);
});

test('Ö-48.60 qa-report: each row shows the criterion id as written in the PRD; any test form ties to it; a failure in any form wins', () => {
  const p = qaProject(lines('# PRD', '', '- [ ] AC-01.1: Required field', '- [ ] Ö-01.2: List shows the record', '- [ ] AC-01.3: Export', '- [ ] AC-01.4: Import', ''),
    QA_XML(lines('<testcase name="Ö-01.1 required" classname="qa"/>',
      '<testcase name="test_AC_01_2_list" classname="qa"><failure message="x">Error: not visible</failure></testcase>',
      '<testcase name="AC-01.3 export" classname="qa"/>', '<testcase name="test_O_01_3_export" classname="qa"><failure message="y">Error: timeout</failure></testcase>')));
  const r = qaReport(p);
  assert.equal(r.code, 1, r.text);
  assert.match(r.text, /1 passed · 2 failed · 1 not run/);
  const [file] = fs.readdirSync(path.join(p, 'docs/quality/qa'));
  const text = fs.readFileSync(path.join(p, 'docs/quality/qa', file), 'utf8');
  assert.match(text, /^\| AC-01\.1 Required field \| passed \| /m);
  assert.match(text, /^\| Ö-01\.2 List shows the record \| failed \| [^|]* \| Error: not visible \|$/m);
  assert.match(text, /^\| AC-01\.3 Export \| failed \| [^|]* \| Error: timeout \|$/m);
  assert.match(text, /^\| AC-01\.4 Import \| not run \| /m);
});

test('A-48.19 ISO-27.1, DEMO_01_2, MAC_01_1, XAC-01.1, BAC-01.1 are not criterion ids (an id never starts after a letter)', () => {
  const NOT_IDS = ['ISO-27.1', 'DEMO_01_2', 'MAC_01_1', 'XAC-01.1', 'BAC-01.1', 'test_MAC_01_1_x', 'ABAC-01.1'];
  for (const name of NOT_IDS) {
    const [c] = [...junitCases(`<testsuite><testcase name="${name} check" classname="x${name}"/></testsuite>`)];
    assert.deepEqual(c?.keys, [], name);
  }
  assert.equal(junitResults([`<testsuite>${NOT_IDS.map((n) => `<testcase name="${n}"><failure/></testcase>`).join('')}</testsuite>`]).size, 0);
  for (const id of ['XAC-01.1', 'BAC-01.1', 'MAC-01.1']) assert.deepEqual(prdCriteria(`- [ ] ${id}: not a criterion\n`), [], id);
  const p = project({
    'tests/ids.test.ts': NOT_IDS.map((n) => `test('${n} x', () => {});`).join('\n'),
    'docs/product/specs/G-08.md': lines('# Spec: G-08', '', '## Behavior that must not change', '', '- XAC-01.1: not an id', '- BAC-01.1: not an id', '- MAC_01_1: not an id', ''),
  }, 'args-notid-');
  assert.deepEqual([...idsInTests(p)], []);
  assert.deepEqual(specInvariants(p), { invariants: [], unreadable: [] }, 'neither an invariant nor an unreadable id line');
  // Uppercase AC right after a separator or at the start is an id
  for (const name of ['AC-01.1', '(AC-01.1)', 'test_AC_01_1', 'x AC_01_1']) {
    const [c] = [...junitCases(`<testsuite><testcase name="${name}"/></testsuite>`)];
    assert.deepEqual(c?.keys, [keyOfPrd('- [ ] AC-01.1: a')], name);
  }
});

test('A-48.20 a failure under any id form fails the criterion, in any order and across report files', () => {
  const want = keyOfPrd('- [ ] AC-01.1: a');
  const pass = (n) => `<testcase name="${n} ok"/>`;
  const fail = (n) => `<testcase name="${n} red"><failure message="x"/></testcase>`;
  for (const [a, b] of [['AC-01.1', 'Ö-01.1'], ['Ö-01.1', 'AC-01.1'], ['test_AC_01_1', 'test_O_01_1'], ['test_O_01_1', 'AC_01_1']]) {
    assert.deepEqual([...junitResults([`<testsuite>${pass(a)}${fail(b)}</testsuite>`]).entries()], [[want, 'failed']], `${a} green, ${b} red`);
    assert.deepEqual([...junitResults([`<testsuite>${fail(a)}${pass(b)}</testsuite>`]).entries()], [[want, 'failed']], `${a} red, ${b} green`);
    assert.deepEqual([...junitResults([`<testsuite>${fail(a)}</testsuite>`, `<testsuite>${pass(b)}</testsuite>`]).entries()], [[want, 'failed']], `${a} red in another file`);
  }
});

// ---------- 4. command text ----------

const read = (f) => fs.readFileSync(path.join(REPO, f), 'utf8').replace(/\r\n/g, '\n');
const hintOf = (md) => md.match(/^---\n[\s\S]*?^argument-hint:\s*(.*)$[\s\S]*?^---/m)?.[1] ?? '';
const bodyOf = (md) => md.replace(/^---\n[\s\S]*?\n---\n/, '');
// A line says the old words still work: every word on one line together with "still" ("still work", "still mean") or "both count"
const OLD_OK = /\bstill\b|\bboth count\b|\bcounts? too\b/i;
const stillWorks = (md, words) => md.split('\n').some((l) => OLD_OK.test(l) && words.every((w) => new RegExp(`(?<![\\p{L}\\d_-])${w}(?![\\p{L}\\d_-])`, 'u').test(l)));
// A line says what an unknown argument does: change nothing and show the usage / options
const unknownArgument = (md) => md.split('\n').some((l) => /\b(unknown|any other|other) argument/i.test(l) && /\b(do|change) nothing\b|\bno change\b/i.test(l) && /\bshow\b/i.test(l));

test('Ö-48.61 tools.md: on <package>, off <package>, measure, commands light|full; the old ac|kapat|olc|komutlar and hafif|tam still work', () => {
  const md = read('.claude/commands/tools.md');
  const hint = hintOf(md);
  for (const s of ['on <package>', 'off <package>', 'measure', 'commands light|full']) assert.equal(hint.includes(s), true, `argument-hint has "${s}": ${hint}`);
  for (const old of ['ac <paket>', 'kapat <paket>', 'olc', 'komutlar', 'hafif']) assert.equal(hint.includes(old), false, `argument-hint drops "${old}"`);
  const body = bodyOf(md);
  for (const s of ['on <package>', 'off <package>', 'measure', 'commands light', 'commands full']) assert.equal(body.includes(s), true, `steps use "${s}"`);
  assert.doesNotMatch(md, /<paket>/, 'the placeholder is <package>');
  assert.equal(stillWorks(md, ['ac', 'kapat', 'olc', 'komutlar']), true, 'one line says ac, kapat, olc, komutlar still work');
  assert.equal(stillWorks(md, ['hafif', 'tam']), true, 'one line says hafif and tam still work');
  assert.equal(unknownArgument(md), true, 'says what an unknown argument does');
});

test('Ö-48.62 ask-mode.md: topics in English, "all" with the old "hepsi" still working', () => {
  const md = read('.claude/commands/ask-mode.md');
  const hint = hintOf(md);
  assert.match(hint, /(?<![\p{L}])all(?![\p{L}])/u, `argument-hint has all: ${hint}`);
  assert.doesNotMatch(hint, /hepsi|konu/, 'argument-hint has no Turkish word');
  // The topic list itself (before any note in brackets) is English; the old names may follow as a note
  const topicsLine = (md.split('\n').find((l) => /^Topics:/.test(l)) ?? '').split('(')[0];
  for (const k of TOPICS_EN) assert.equal(topicsLine.includes(`\`${k}\``), true, `Topics line lists ${k}`);
  for (const k of TOPICS_TR) assert.equal(topicsLine.includes(k), false, `Topics list has no ${k}`);
  assert.equal(stillWorks(md, TOPICS_TR), true, 'says the old topic names still work');
  assert.equal(stillWorks(md, ['hepsi']), true, 'says hepsi still works');
  assert.equal(unknownArgument(md), true, 'says what an unknown argument does');
});

test('Ö-48.63 handoff.md: the take-over argument is "take", the old "devral" still works', () => {
  const md = read('.claude/commands/handoff.md');
  const hint = hintOf(md);
  assert.match(hint, /(?<![\p{L}])take(?![\p{L}])/u, `argument-hint has take: ${hint}`);
  assert.doesNotMatch(hint, /devral/);
  assert.equal(md.includes('/handoff take'), true, 'the receiver is told /handoff take');
  const old = md.split('\n').filter((l) => /devral(?![\p{L}])/u.test(l));
  assert.equal(old.length >= 1, true, 'devral is still mentioned');
  for (const l of old) assert.match(l, OLD_OK, `devral appears only as the old form: ${l}`);
  assert.equal(unknownArgument(md), true, 'says what an unknown argument does');
});

test('Ö-48.64 commands: package checks use --required design / security / release; no Turkish package name is left', () => {
  assert.match(read('.claude/commands/design.md'), /--required design\b/);
  for (const f of ['findings-security.md', 'findings-all.md', 'release.md']) assert.match(read(`.claude/commands/${f}`), /--required security\b/, f);
  for (const f of ['adopt.md', 'handoff.md']) assert.match(read(`.claude/commands/${f}`), /--required release\b/, f);
  const dir = path.join(REPO, '.claude/commands');
  const left = fs.readdirSync(dir).filter((f) => f.endsWith('.md'))
    .flatMap((f) => read(`.claude/commands/${f}`).split('\n').filter((l) => /--required (tasarim|guvenlik|yayin)\b/.test(l)).map((l) => `${f}: ${l.trim().slice(0, 100)}`));
  assert.deepEqual(left, []);
});

test('Ö-48.65 decision-protocol.md: the topic table keys are the English topics', () => {
  const md = read('docs/workflow/decision-protocol.md');
  const table = between(md, '| Topic (code) |', '\n\n');
  const keys = [...table.matchAll(/^\| `([^`]+)` \|/gm)].map((m) => m[1]);
  assert.deepEqual([...keys].sort(), [...TOPICS_EN].sort());
});

test('Ö-48.66 test-plan.md and security-auditor.md: adversarial tests start with ATTACK:, the old SALDIRI: still counts', () => {
  for (const f of ['docs/quality/test-plan.md', '.claude/agents/security-auditor.md']) {
    const md = read(f);
    assert.equal(md.includes('`ATTACK:`'), true, `${f}: names the ATTACK: prefix`);
    assert.equal(md.split('\n').some((l) => l.includes('SALDIRI:') && OLD_OK.test(l)), true, `${f}: says SALDIRI: still counts`);
  }
});
