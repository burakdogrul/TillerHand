// Run: node --test "kit/tests/*.test.mjs"
// Command arguments, package names, decision topics and the acceptance criterion id are English.
// 3.49.0: the old Turkish forms are rejected or ignored like any unknown value:
//   /tools packages: design, security, release, video (tasarim, guvenlik, yayin are unknown packages)
//   decision topics: product, tech, design, content, data, security, cost (urun ... maliyet get no chip)
//   criterion id: AC-01.1 / AC_01_1 only (Ö-01.1 / O_01_1 are not criterion ids)
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

test('Ö-48.50 tools: setPackage enables and disables an English package', () => {
  for (const name of ENGLISH) {
    const p = toolsProject();
    const ids = setPackage(p, name, true);
    assert.deepEqual(ids, PACKAGES[name].plugins, `${name}: its plugins`);
    for (const id of ids) assert.equal(local(p)[id], true, `${name}: ${id} enabled`);
    assert.deepEqual(packageStatus(p).filter((d) => d.enabled).map((d) => d.name), [name], `only ${name} is on`);
    assert.deepEqual(setPackage(p, name, false), ids);
    assert.deepEqual(local(p), {}, `${name}: back to the project default`);
  }
});

test('AC-49.10 tools: the old Turkish package names tasarim / guvenlik / yayin are unknown packages; nothing is written', () => {
  for (const old of OLD) {
    const p = toolsProject();
    let err = null;
    try { setPackage(p, old, true); } catch (h) { err = h; }
    assert.equal(err instanceof Error, true, `${old}: throws`);
    assert.match(err.message, /Unknown package/, old);
    for (const flag of ['--enable', '--disable', '--required']) {
      const r = tools(p, [flag, old]);
      assert.equal(r.status, 1, `${flag} ${old}: exit 1\n${r.stdout}${r.stderr}`);
      assert.match(r.stderr, new RegExp(`Unknown package: ${old}\\b`), `${flag} ${old}: named as unknown`);
    }
    assert.equal(fs.existsSync(path.join(p, '.claude/settings.local.json')), false, `${old}: nothing written`);
  }
});

test('AC-49.10 tools: the old flag --gerekli is not a flag any more (only --required)', () => {
  const p = toolsProject();
  const r = tools(p, ['--gerekli', 'design']);
  assert.notEqual(r.status, 0, `--gerekli is refused\n${r.stdout}${r.stderr}`);
  assert.doesNotMatch(r.stdout, /Package design is (disabled|enabled)/, '--gerekli does not check the package');
  assert.equal(fs.existsSync(path.join(p, '.claude/settings.local.json')), false);
});

test('Ö-48.51 tools CLI: --enable / --disable / --required print the English package name', () => {
  for (const name of ENGLISH.filter((n) => n !== 'video')) {
    const p = toolsProject();
    const off = tools(p, ['--required', name]);
    assert.equal(off.status, 2, `${name}: disabled is exit 2\n${off.stdout}${off.stderr}`);
    assert.match(off.stdout, new RegExp(`Package ${name} is disabled`));
    assert.match(off.stdout, new RegExp(`--enable ${name}\\b`));
    const on = tools(p, ['--enable', name]);
    assert.equal(on.status, 0, on.stderr);
    assert.match(on.stdout, new RegExp(`Package ${name} enabled`));
    const enabled = tools(p, ['--required', name]);
    assert.equal(enabled.status, 0);
    assert.match(enabled.stdout, new RegExp(`Package ${name} is enabled`));
    const back = tools(p, ['--disable', name]);
    assert.equal(back.status, 0, back.stderr);
    assert.match(back.stdout, new RegExp(`Package ${name} back to the project default`));
    assert.equal(tools(p, ['--required', name]).status, 2, `${name}: off again`);
  }
  // A package whose plugins are not in this project
  const q = toolsProject({ 'taste-skill@taste-skill': false });
  const skip = tools(q, ['--required', 'release']);
  assert.equal(skip.status, 0);
  assert.match(skip.stdout, /Package release is not in this project/);
  const none = tools(q, ['--enable', 'release']);
  assert.equal(none.status, 0);
  assert.match(none.stdout, /package release are not defined/);
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
  for (const name of ['marketing', 'Design', 'tasarim', 'guvenlik', 'yayin', 'TASARIM', 'tasarım', 'toString', 'valueOf', 'hasOwnProperty', 'constructor', '__proto__', '']) {
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

test('AC-49.10 dashboard: a "tasarim" row does not count under design; it gets no chip and is shown as written', () => {
  const v = topicView(dashboardOf(['tasarim', 'design']));
  assert.equal(v.all.text, 'All (2)');
  assert.deepEqual(v.topics.map((c) => c.text), ['design (1)']);
  assert.equal(v.chips.some((c) => /tasarim/.test(c.text) || c.key === 'tasarim'), false, 'no Turkish chip');
  const key = v.topics[0].key;
  assert.equal(v.rows.filter((r) => r.key === key).length, 1, 'only the design row carries the design key');
  const row = v.rows.find((r) => r.html.includes('Question 1?'));
  assert.match(row?.html ?? '', /<span class="tag">tasarim<\/span>/, 'shown as written');
});

test('Ö-48.53 dashboard: every English topic gets its own chip and key; the old Turkish topics get none', () => {
  const en = topicView(dashboardOf(TOPICS_EN));
  assert.deepEqual(en.topics.map((c) => c.text).sort(), TOPICS_EN.map((k) => `${k} (1)`).sort());
  // Each row's key is the key of its topic chip
  const chipKey = Object.fromEntries(en.topics.map((c) => [c.text.replace(/ \(\d+\)$/, ''), c.key]));
  assert.deepEqual(en.rows.map((r) => r.key), [...TOPICS_EN].reverse().map((k) => chipKey[k]), 'newest first, one key per topic');
  assert.equal(new Set(en.rows.map((r) => r.key)).size, 7, 'seven different keys');
  const tr = topicView(dashboardOf(TOPICS_TR));
  assert.equal(tr.all.text, 'All (7)', 'All still counts every decision');
  assert.deepEqual(tr.topics, [], 'urun ... maliyet make no topic chip');
  for (const k of Object.values(chipKey)) assert.equal(tr.rows.some((r) => r.key === k), false, `no Turkish row carries the key "${k}"`);
  // Old and new together: each English topic shows (1)
  const mixed = topicView(dashboardOf([...TOPICS_TR, ...TOPICS_EN]));
  assert.deepEqual(mixed.topics.map((c) => c.text).sort(), TOPICS_EN.map((k) => `${k} (1)`).sort());
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
  fs.writeFileSync(path.join(q.p, 'docs/decisions/log.md'), decisionLog(['tech']).replace('Question 1?', 'design or product?'));
  spawnSync(process.execPath, [path.join(HOOKS, 'dashboard.mjs'), q.p, '--quiet'], { encoding: 'utf8' });
  const w = topicView({ p: q.p, html: fs.readFileSync(path.join(q.p, 'dashboard.html'), 'utf8') });
  assert.deepEqual(w.topics.map((c) => c.text), ['tech (1)']);
});

// ---------- 3. the acceptance criterion id AC-01.1 ----------

const keyOfPrd = (line) => {
  const c = prdCriteria(line);
  assert.equal(c.length, 1, `one criterion: ${line}`);
  return c[0].key;
};

test('Ö-48.54 prdCriteria: "- [ ] AC-01.1: text" is a criterion; "- [ ] Ö-01.1: text" is not', () => {
  const prd = lines('# PRD', '', '- [ ] AC-01.1: Required field is not saved empty', '- [x] AC-01.2: PDF downloads', '- [ ] Ö-02.1: Old form',
    '- [x] O-02.3: Old form without the dots', '- [ ] AC-02.2: [Observable behavior]', '- [ ] no id here', '');
  assert.deepEqual(prdCriteria(prd).map((k) => [k.id, k.text, k.checked]), [
    ['AC-01.1', 'Required field is not saved empty', false], ['AC-01.2', 'PDF downloads', true],
  ]);
  assert.deepEqual(prdCriteria('- [ ] Ö-01.1: a\n'), [], 'Ö-01.1 is not a criterion');
  assert.notEqual(keyOfPrd('- [ ] AC-01.1: a'), keyOfPrd('- [ ] AC-01.2: a'));
  assert.notEqual(keyOfPrd('- [ ] AC-01.1: a'), keyOfPrd('- [ ] AC-11.1: a'));
});

test('Ö-48.55 junitCases: AC-01.1 and AC_01_1 in a test name or classname tie to the criterion; one criterion under two forms is one entry', () => {
  const want = keyOfPrd('- [ ] AC-01.1: a');
  for (const name of ['AC-01.1', 'test_AC_01_1_case']) {
    const [c] = [...junitCases(`<testsuite><testcase name="${name}" classname="x"/></testsuite>`)];
    assert.deepEqual(c?.keys, [want], name);
    // The id may be in the classname only
    const [d] = [...junitCases(`<testsuite><testcase name="no id" classname="tests/${name}.spec.ts"/></testsuite>`)];
    assert.deepEqual(d?.keys, [want], `${name} in the classname`);
  }
  const r = junitResults(['<testsuite><testcase name="AC-01.1 a"/><testcase name="test_AC_01_1_c"/></testsuite>']);
  assert.deepEqual([...r.entries()], [[want, 'passed']]);
});

test('AC-49.9 junitCases / idsInTests: Ö-01.1 and O_01_1 are not criterion ids any more', () => {
  for (const name of ['Ö-01.1', 'test_O_01_1_case', 'O_01_1', 'Ö_01_1']) {
    const [c] = [...junitCases(`<testsuite><testcase name="${name}" classname="x"/></testsuite>`)];
    assert.deepEqual(c?.keys, [], name);
    const [d] = [...junitCases(`<testsuite><testcase name="no id" classname="tests/${name}.spec.ts"/></testsuite>`)];
    assert.deepEqual(d?.keys, [], `${name} in the classname`);
  }
  assert.equal(junitResults(['<testsuite><testcase name="Ö-01.1 a"><failure/></testcase><testcase name="test_O_01_2"/></testsuite>']).size, 0);
  const p = project({ 'tests/old.spec.ts': "test('Ö-01.1 a', () => {});\n", 'tests/test_old.py': 'def test_O_01_2_b():\n    pass\n' }, 'args-oldid-');
  assert.deepEqual([...idsInTests(p)], []);
});

// The same tests as before 3.49: some carry the old Ö / O_ ids, which no longer tie to a criterion
const criteriaProject = () => project({
  'docs/product/prd.md': lines('# PRD', '', '- [x] AC-01.1: Required field', '- [ ] AC-01.2: List', '- [ ] AC-01.3: Export', '- [ ] AC-01.4: Import', ''),
  'tests/form.spec.ts': "test('Ö-01.1 required field', () => {});\ntest('AC-01.3 export', () => {});\n",
  'tests/test_list.py': 'def test_AC_01_2_list():\n    pass\n\ndef test_O_01_3_export():\n    pass\n',
  'test-results/junit.xml': lines('<testsuites><testsuite>', '<testcase name="Ö-01.1 required field" classname="form"/>',
    '<testcase name="test_O_01_2_list" classname="tests.test_list"/>', '<testcase name="AC-01.3 export" classname="form"/>',
    '<testcase name="test_O_01_3_export" classname="tests.test_list"><failure message="boom"/></testcase>', '</testsuite></testsuites>'),
}, 'args-ac-');

test('AC-49.9 acceptanceStatus: only AC ids tie a test or a result to a criterion; a checked criterion with only an Ö test is a mismatch', () => {
  const p = criteriaProject();
  const s = acceptanceStatus(p);
  assert.deepEqual(s.list.map((k) => [k.id, k.test, k.result]), [
    ['AC-01.1', false, null], ['AC-01.2', true, null], ['AC-01.3', true, 'passed'], ['AC-01.4', false, null],
  ]);
  assert.deepEqual([s.total, s.tested, s.passing], [4, 2, 1], 'totals');
  assert.deepEqual(s.mismatched.map((k) => k.id), ['AC-01.1'], 'checked, but its only test carries the old id');
  assert.equal(idsInTests(p).size, 2, 'AC-01.2 and AC-01.3 in the test files');
});

test('Ö-48.57 specInvariants: "- AC-01.1 ..." under "Behavior that must not change" is read; "- Ö-01.2 ..." is not an id line', () => {
  const p = project({
    'docs/product/specs/G-07.md': lines('# Spec: G-07 Note search', '', '**Type:** feature', '', '## Current behavior', '', 'No search.', '',
      '## Expected behavior', '', 'Search in titles.', '', '## Behavior that must not change', '',
      '- AC-01.1: Note is saved', '- Ö-01.2: Another user\'s note is hidden', '- AC-02.1: List newest first', '- [ ] AC-03.1: boxed line',
      'AC-01.9 in prose is not in list form', ''),
    'tests/notes.test.mjs': "test('AC-01.1 note is saved', () => {}); test('Ö-01.2 other user', () => {});",
    'test-results/junit.xml': '<testsuite><testcase name="test_AC_01_1_saved"><failure message="x"/></testcase><testcase name="O_01_2_other"/></testsuite>',
  }, 'args-spec-');
  const { invariants, unreadable } = specInvariants(p);
  assert.deepEqual(invariants.map((k) => [k.spec, k.id, k.test, k.result]), [
    ['G-07.md', 'AC-01.1', true, 'failed'], ['G-07.md', 'AC-02.1', false, null],
  ]);
  assert.deepEqual(unreadable, [{ spec: 'G-07.md', line: '- [ ] AC-03.1: boxed line' }, { spec: 'G-07.md', line: 'AC-01.9 in prose is not in list form' }]);
});

test('Ö-48.58 gate: the unreadable spec line message shows the AC-01.1 form, not Ö-01.1', () => {
  const p = project({
    'AGENTS.md': '# X\n\n## Commands\n\n```bash\ntest:        node ok.mjs\nlint:        [ ]\ntype check: [ ]\n```\n',
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

test('Ö-48.60 qa-report: each row shows the AC id; AC-01.1 and AC_01_1 test forms tie to it; a failure in either form wins', () => {
  const p = qaProject(lines('# PRD', '', '- [ ] AC-01.1: Required field', '- [ ] AC-01.2: List shows the record', '- [ ] AC-01.3: Export', '- [ ] AC-01.4: Import', ''),
    QA_XML(lines('<testcase name="AC-01.1 required" classname="qa"/>',
      '<testcase name="test_AC_01_2_list" classname="qa"><failure message="x">Error: not visible</failure></testcase>',
      '<testcase name="AC-01.3 export" classname="qa"/>', '<testcase name="test_AC_01_3_export" classname="qa"><failure message="y">Error: timeout</failure></testcase>')));
  const r = qaReport(p);
  assert.equal(r.code, 1, r.text);
  assert.match(r.text, /1 passed · 2 failed · 1 not run/);
  const [file] = fs.readdirSync(path.join(p, 'docs/quality/qa'));
  const text = fs.readFileSync(path.join(p, 'docs/quality/qa', file), 'utf8');
  assert.match(text, /^\| AC-01\.1 Required field \| passed \| /m);
  assert.match(text, /^\| AC-01\.2 List shows the record \| failed \| [^|]* \| Error: not visible \|$/m);
  assert.match(text, /^\| AC-01\.3 Export \| failed \| [^|]* \| Error: timeout \|$/m);
  assert.match(text, /^\| AC-01\.4 Import \| not run \| /m);
});

test('AC-49.9 qa-report: a PRD with only Ö- criteria has no criterion; an Ö- test result ties to no AC criterion', () => {
  const old = qaReport(qaProject('# PRD\n\n- [ ] Ö-01.1: Required field\n', QA_XML('<testcase name="Ö-01.1 required"/>')));
  assert.equal(old.code, 2, `no criterion: ${old.text}`);
  const p = qaProject('# PRD\n\n- [ ] AC-01.1: Required field\n- [ ] AC-01.2: List\n',
    QA_XML('<testcase name="AC-01.1 required"/><testcase name="Ö-01.2 list"><failure message="x">Error: red</failure></testcase>'));
  const r = qaReport(p);
  assert.equal(r.code, 0, `the Ö- failure does not fail AC-01.2: ${r.text}`);
  assert.match(r.text, /1 passed · 0 failed · 1 not run/);
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

test('A-48.20 a failure under any AC id form fails the criterion, in any order and across report files', () => {
  const want = keyOfPrd('- [ ] AC-01.1: a');
  const pass = (n) => `<testcase name="${n} ok"/>`;
  const fail = (n) => `<testcase name="${n} red"><failure message="x"/></testcase>`;
  for (const [a, b] of [['AC-01.1', 'AC_01_1'], ['AC_01_1', 'AC-01.1'], ['test_AC_01_1', 'AC-01.1'], ['AC-01.1', 'test_AC_01_1_x']]) {
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

// An old Turkish argument word anywhere in the text (as a whole word)
const mentions = (md, words) => words.filter((w) => new RegExp(`(?<![\\p{L}\\d_-])${w}(?![\\p{L}\\d_-])`, 'u').test(md));

test('Ö-48.61 tools.md: on <package>, off <package>, measure, commands light|full; the old ac|kapat|olc|komutlar and hafif|tam are gone', () => {
  const md = read('.claude/commands/tools.md');
  const hint = hintOf(md);
  for (const s of ['on <package>', 'off <package>', 'measure', 'commands light|full']) assert.equal(hint.includes(s), true, `argument-hint has "${s}": ${hint}`);
  const body = bodyOf(md);
  for (const s of ['on <package>', 'off <package>', 'measure', 'commands light', 'commands full']) assert.equal(body.includes(s), true, `steps use "${s}"`);
  assert.doesNotMatch(md, /<paket>/, 'the placeholder is <package>');
  assert.equal(stillWorks(md, ['ac', 'kapat', 'olc', 'komutlar']), false, 'no line says ac, kapat, olc, komutlar still work');
  assert.equal(stillWorks(md, ['hafif', 'tam']), false, 'no line says hafif and tam still work');
  assert.deepEqual(mentions(md, ['kapat', 'olc', 'komutlar', 'hafif', 'tasarim', 'guvenlik', 'yayin']), [], 'no old argument or package word');
  assert.equal(unknownArgument(md), true, 'says what an unknown argument does');
});

test('Ö-48.62 ask-mode.md: topics and "all" in English; the old topic names and "hepsi" are gone', () => {
  const md = read('.claude/commands/ask-mode.md');
  const hint = hintOf(md);
  assert.match(hint, /(?<![\p{L}])all(?![\p{L}])/u, `argument-hint has all: ${hint}`);
  assert.doesNotMatch(hint, /hepsi|konu/, 'argument-hint has no Turkish word');
  const topicsLine = md.split('\n').find((l) => /^Topics:/.test(l)) ?? '';
  for (const k of TOPICS_EN) assert.equal(topicsLine.includes(`\`${k}\``), true, `Topics line lists ${k}`);
  assert.deepEqual(mentions(md, [...TOPICS_TR, 'hepsi']), [], 'no old topic word, no hepsi');
  assert.equal(unknownArgument(md), true, 'says what an unknown argument does');
});

test('Ö-48.63 handoff.md: the take-over argument is "take"; the old "devral" is gone', () => {
  const md = read('.claude/commands/handoff.md');
  const hint = hintOf(md);
  assert.match(hint, /(?<![\p{L}])take(?![\p{L}])/u, `argument-hint has take: ${hint}`);
  assert.equal(md.includes('/handoff take'), true, 'the receiver is told /handoff take');
  assert.deepEqual(mentions(md, ['devral']), [], 'devral is not mentioned');
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

test('Ö-48.66 test-plan.md and security-auditor.md: adversarial tests start with ATTACK:; SALDIRI: no longer counts and is not offered', () => {
  for (const f of ['docs/quality/test-plan.md', '.claude/agents/security-auditor.md']) {
    const md = read(f);
    assert.equal(md.includes('`ATTACK:`'), true, `${f}: names the ATTACK: prefix`);
    assert.equal(md.includes('SALDIRI'), false, `${f}: no SALDIRI prefix`);
  }
});
