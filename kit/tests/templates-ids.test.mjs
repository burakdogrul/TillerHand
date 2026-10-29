// Run: node --test "kit/tests/*.test.mjs"
// 3.48.1: the internal ids left in ASCII Turkish inside the project templates are English. Templates hold no code that reads the
// old names, so nothing has to keep reading them; the old names must be gone.
//   1. CI job ids: check, structure, complexity, rls (web/mobile), semgrep, duplicate-code, secret-scan
//   2. CI repair workflow: job fix, step failed-jobs, output security, skip list semgrep|secret-scan|rls, ci-error.log, PR_BRANCH
//   3. maintenance job maintenance, live monitoring job monitor, pre-commit hook secret-scan
//   4. no old Turkish id left in any template workflow or pre-commit config
//   5. AI eval cases: keys id/feature/kind/input/expected, kinds typical/hard/malicious, input.text, the six check keys
//   6. AI eval README and AI guide name the new fields, the run script evals/run.(ts|py) and evals/summary.jsonl, none of the old names
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8').replace(/\r\n/g, '\n');
const STACKS = ['web-saas', 'mobile', 'backend'];
const wf = (t, f) => read(`kit/templates/${t}/.github/workflows/${f}`);

// Job ids are the two-space keys under the top-level "jobs:" key.
function jobs(yml) {
  const body = (yml.split(/^jobs:\n/m)[1] ?? '').split(/^\S/m)[0];
  return [...body.matchAll(/^ {2}([\w-]+):/gm)].map((m) => m[1]);
}

const templateFiles = (re) => fs.readdirSync(path.join(ROOT, 'kit/templates'), { recursive: true })
  .map((f) => `kit/templates/${f.replaceAll('\\', '/')}`).filter((f) => re.test(f));

const OLD_IDS = ['kontrol', 'karmasiklik', 'kopya-kod', 'sir-taramasi', 'tamir', 'bakim', 'izle', 'kayit', 'guvenlik', 'ci-hata', 'PR_DALI'];
const OLD_ID_RE = new RegExp(`(?<![\\w-])(${OLD_IDS.join('|')})(?![\\w-])`, 'g');

test('Ö-48.91 CI job ids are English in all three templates: check, complexity, duplicate-code, secret-scan', () => {
  const want = {
    'web-saas': ['check', 'complexity', 'duplicate-code', 'rls', 'secret-scan', 'semgrep', 'structure'],
    mobile: ['check', 'complexity', 'duplicate-code', 'rls', 'secret-scan', 'semgrep', 'structure'],
    backend: ['check', 'complexity', 'duplicate-code', 'secret-scan', 'semgrep', 'structure'],
  };
  for (const t of STACKS) assert.deepEqual(jobs(wf(t, 'ci.yml')).sort(), want[t], t);
});

test('Ö-48.92 CI repair workflow: job fix, step failed-jobs, output security, skip list semgrep|secret-scan|rls', () => {
  for (const t of STACKS) {
    const y = wf(t, 'claude-ci-fix.yml');
    assert.deepEqual(jobs(y), ['fix'], t);
    assert.deepEqual([...y.matchAll(/^\s+id: ([\w-]+)\s*$/gm)].map((m) => m[1]), ['failed-jobs'], `${t}: the only step id`);
    assert.ok(y.includes(`grep -qiE 'semgrep|secret-scan|rls'; then echo "security=1" >> "$GITHUB_OUTPUT"; fi`), `${t}: skip grep and output`);
    const gates = [...y.matchAll(/steps\.([\w-]+)\.outputs\.([\w-]+)/g)].map((m) => `${m[1]}.${m[2]}`);
    assert.deepEqual(gates, ['failed-jobs.security', 'failed-jobs.security', 'failed-jobs.security'], `${t}: checkout, log and agent steps are gated`);
    assert.equal((y.match(/if: steps\.failed-jobs\.outputs\.security != '1'$/gm) ?? []).length, 3, t);
  }
});

test('Ö-48.93 CI repair workflow: the log file is ci-error.log and the branch env is PR_BRANCH, in the run line and the prompt', () => {
  for (const t of STACKS) {
    const y = wf(t, 'claude-ci-fix.yml');
    assert.ok(y.includes('run: gh run view "$RUN_ID" --log-failed > ci-error.log || true'), `${t}: run line writes ci-error.log`);
    assert.ok(y.includes('Error log: ci-error.log (do not commit it).'), `${t}: prompt names ci-error.log`);
    assert.match(y, /^ {10}PR_BRANCH: \$\{\{ github\.event\.workflow_run\.head_branch \}\}$/m, `${t}: env PR_BRANCH`);
    assert.ok(y.includes('`git push origin "HEAD:refs/heads/$PR_BRANCH"`'), `${t}: prompt pushes to $PR_BRANCH`);
  }
});

test('Ö-48.94 maintenance job is maintenance, live monitoring job is monitor, backend pre-commit hook is secret-scan', () => {
  for (const t of STACKS) assert.deepEqual(jobs(wf(t, 'claude-maintenance.yml')), ['maintenance'], t);
  for (const t of ['web-saas', 'backend']) assert.deepEqual(jobs(wf(t, 'live-monitoring.yml')), ['monitor'], t);
  const hooks = [...read('kit/templates/backend/.pre-commit-config.yaml').matchAll(/^\s+- id: ([\w-]+)/gm)].map((m) => m[1]);
  assert.deepEqual(hooks, ['ruff', 'ruff-format', 'secret-scan']);
});

test('Ö-48.95 no old Turkish id is left in any template workflow or pre-commit config', () => {
  const files = templateFiles(/(\.github\/workflows\/.+\.ya?ml|\.pre-commit-config\.ya?ml)$/);
  assert.ok(files.length >= 12, `expected all template workflows, found ${files.length}`);
  const found = [];
  for (const f of files) read(f).split('\n').forEach((line, i) => {
    for (const m of line.matchAll(OLD_ID_RE)) found.push(`${f}:${i + 1} ${m[1]}`);
  });
  assert.deepEqual(found, []);
});

test('Ö-48.96 AI eval cases: every line parses and uses only id, feature, kind, input.text, expected with the new check keys', () => {
  const lines = read('kit/templates/addons/ai/ai/evals/cases.jsonl').split('\n').filter((l) => l.trim());
  assert.ok(lines.length >= 3, `expected at least one case per kind, found ${lines.length}`);
  const CHECKS = new Set(['contains', 'not_contains', 'equals', 'schema', 'error', 'rubric']);
  const kinds = new Set();
  const ids = new Set();
  lines.forEach((line, i) => {
    let c;
    assert.doesNotThrow(() => { c = JSON.parse(line); }, `line ${i + 1} is not JSON`);
    assert.deepEqual(Object.keys(c).sort(), ['expected', 'feature', 'id', 'input', 'kind'], `line ${i + 1} keys`);
    assert.equal(typeof c.id, 'string', `line ${i + 1} id`);
    assert.ok(!ids.has(c.id), `line ${i + 1}: duplicate id ${c.id}`);
    ids.add(c.id);
    assert.equal(typeof c.feature, 'string', `line ${i + 1} feature`);
    assert.ok(['typical', 'hard', 'malicious'].includes(c.kind), `line ${i + 1}: kind ${c.kind}`);
    kinds.add(c.kind);
    assert.deepEqual(Object.keys(c.input), ['text'], `line ${i + 1} input keys`);
    assert.equal(typeof c.input.text, 'string', `line ${i + 1} input.text`);
    const checks = Object.keys(c.expected);
    assert.notEqual(checks.length, 0, `line ${i + 1}: expected has no check`);
    for (const k of checks) assert.ok(CHECKS.has(k), `line ${i + 1}: unknown check key ${k}`);
  });
  assert.deepEqual([...kinds].sort(), ['hard', 'malicious', 'typical'], 'the example shows every kind');
});

const OLD_WORDS = ['ozellik', 'tur', 'girdi', 'beklenen', 'icerir', 'icermez', 'esit', 'sema', 'hata', 'puanlama', 'calistir', 'ozet',
  'tipik', 'zor', 'kotu-niyetli', 'metin'];
const oldWordsIn = (text) => [...text.matchAll(new RegExp(`(?<![\\w-])(${OLD_WORDS.join('|')})(?![\\w-])`, 'gi'))].map((m) => m[1]);

test('Ö-48.97 AI eval README documents the new fields, kinds, check keys and runner evals/run.ts | evals/run.py, no old name', () => {
  const md = read('kit/templates/addons/ai/ai/evals/README.md');
  for (const w of ['id', 'feature', 'kind', 'input', 'expected', 'typical', 'hard', 'malicious',
    'contains', 'not_contains', 'equals', 'schema', 'error', 'rubric', 'evals/run.ts', 'evals/run.py'])
    assert.ok(md.includes(`\`${w}\``), `README names \`${w}\``);
  assert.deepEqual(oldWordsIn(md), []);
});

test('Ö-48.98 AI guide: the example eval path is evals/summary.jsonl, no old name', () => {
  const md = read('kit/templates/addons/ai/docs/ai/guide.md');
  assert.ok(md.includes('`evals/summary.jsonl`'), 'guide names evals/summary.jsonl');
  assert.deepEqual(oldWordsIn(md), []);
});
