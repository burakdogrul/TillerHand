#!/usr/bin/env node
// Kit evaluation: the same task with the kit (kit) and without it (plain), scored by hidden tests.
//   node kit/eval/run.mjs [--task bug-sort,feature-tags] [--cond kit,plain] [--model sonnet] [--repeat 3] [--dry] [--keep]
// --dry: prepares the run folders and scores them without running Claude (the hidden tests must fail).
// Each run gets a fresh temp folder with the fixture. Kit runs get init + install web-saas and the state /start would
// leave (stack, AGENTS.md → Komutlar, question mode off, gate approval). Both run `claude -p` with the same model, the
// same allowed tools and only project settings (user plugins and hooks stay out of the plain run).
import fs from 'node:fs';
import net from 'node:net';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { approvalPath } from '../../.claude/hooks/gate.mjs';

const EVAL = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(EVAL, '..', '..');
const FIXTURE = path.join(EVAL, 'fixture');
const TASKS_DIR = path.join(EVAL, 'tasks');
const VERSION = fs.readFileSync(path.join(REPO, 'kit', 'VERSION'), 'utf8').trim();
const TIMEOUT_MS = 30 * 60 * 1000;
const BUDGET_USD = '2'; // per run; the most expensive run of the first round cost $0.33
const PORT_BASE = 3100;
// Reads and writes inside the run folder; Bash only for project code, the kit's hooks and read-only git.
// Not a security boundary: the agent's own code runs through npm test. It closes the easy ways out of the folder
// (`node -e`, `..`, `git --output`, `npm --prefix`), so an accidental write elsewhere is unlikely.
// Read rules also cover Glob and Grep.
const ALLOWED = ['Read(./**)', 'Edit(./**)', 'Write(./**)', 'Agent', 'Skill', 'TodoWrite',
  'Bash(npm test *)', 'Bash(npm start *)', 'Bash(node --test *)', 'Bash(node src/*)', 'Bash(node tests/*)', 'Bash(node .claude/hooks/*)',
  'Bash(git status *)', 'Bash(git diff *)', 'Bash(git log *)', 'Bash(git show *)'];
// Deny wins over allow. .git/ and .claude/ are the kit's ask rules (refused headless): the same for both conditions.
const DENIED = ['Bash(node *..*)', 'Bash(git * --output*)', 'Bash(git * --no-index*)', 'Bash(npm * --prefix*)', 'Bash(npm * --script-shell*)',
  'Edit(./.git/**)', 'Edit(./.claude/**)'];
const HEADLESS = 'Bu otomatik bir değerlendirme koşusu: kullanıcı yok, soru soramazsın ve onay bekleyemezsin. ' +
  'Karar gereken yerde en iyi seçeneği seç ve devam et. İş bitince dur. Commit atma.';
const KIT_HEADLESS = ' Soru modu kapalı (hepsi): plan onayı ve karar soruları için önerileni seç ve "otomatik" diye kaydet.';
const STACK = `# Stack

- Node.js 24, ES modülleri, bağımlılık yok: \`node:http\` sunucu, \`node:test\` testler.
- Kod: \`src/app/server.js\` (sunucu), \`src/features/<özellik>/server/\` (iş mantığı ve rotalar), \`src/lib/\` (ortak).
- Kimlik: önündeki katman \`x-user\` başlığını koyar; servis ona güvenir.
- Veri: bellek içi depo (\`createStore\`), sunucu başına bir örnek.

## Doğrulama

- \`npm test\`; API değişikliğinde testte gerçek istek atılır (\`createApp().listen(0)\` + \`fetch\`).
`;

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf(name); return i === -1 ? def : args[i + 1]; };
const allTasks = fs.readdirSync(TASKS_DIR).filter((d) => fs.statSync(path.join(TASKS_DIR, d)).isDirectory());
const tasks = (opt('--task', allTasks.join(','))).split(',');
const conds = (opt('--cond', 'kit,plain')).split(',');
const model = opt('--model', 'sonnet');
const dry = args.includes('--dry');
const keep = args.includes('--keep') || dry;
const repeat = Number(opt('--repeat', '1'));
if (!Number.isInteger(repeat) || repeat < 1 || repeat > 10) throw new Error('--repeat 1-10 arası bir tam sayı olmalı');
for (const t of tasks) if (!allTasks.includes(t)) throw new Error(`Bilinmeyen görev: ${t}. Seçenekler: ${allTasks.join(', ')}`);
for (const c of conds) if (c !== 'kit' && c !== 'plain') throw new Error(`Bilinmeyen koşul: ${c} (kit, plain)`);

// A child of node --test inherits NODE_TEST_CONTEXT and would report to the parent instead of printing its summary
const childEnv = (extra = {}) => { const e = { ...process.env, ...extra }; delete e.NODE_TEST_CONTEXT; return e; };
const run = (cmd, a, cwd, env = {}) => {
  const r = spawnSync(cmd, a, { cwd, encoding: 'utf8', env: childEnv(env), timeout: 120000 });
  if (r.status !== 0) throw new Error(`${cmd} ${a.join(' ')} (${cwd}): ${r.stderr || r.stdout || r.error?.message || `exit ${r.status}`}`);
  return r.stdout;
};
const git = (dir, ...a) => run('git', ['-c', 'user.name=eval', '-c', 'user.email=eval@example.invalid', ...a], dir);

function setupKit(dir) {
  run(process.execPath, [path.join(REPO, 'kit', 'kit.mjs'), 'init', '--project', dir, '--tool', 'claude'], REPO);
  run(process.execPath, [path.join(REPO, 'kit', 'kit.mjs'), 'install', '--type', 'web-saas', '--project', dir], REPO);
  const edit = (rel, fn) => { const p = path.join(dir, rel); fs.writeFileSync(p, fn(fs.readFileSync(p, 'utf8'))); };
  fs.writeFileSync(path.join(dir, 'docs', 'architecture', 'stack.md'), STACK);
  edit('AGENTS.md', (s) => s.replace(/^geliştirme:\s*\[ \]/m, 'geliştirme:  npm start').replace(/^test:\s*\[ \]/m, 'test:        npm test'));
  edit('docs/workflow/progress.md', (s) => s
    .replace(/^\*\*Aktif faz:\*\* .*$/m, '**Aktif faz:** Faz 1')
    .replace(/^\*\*Aktif görev:\*\* .*$/m, '**Aktif görev:** -')
    .replace(/^\*\*Başlangıç adımı:\*\* .*$/m, '**Başlangıç adımı:** 9/9')
    .replace(/^\*\*Soru modu:\*\* .*$/m, '**Soru modu:** kapalı · kapalı konular: hepsi')
    .replace(/^\*\*Profil:\*\* .*$/m, '**Profil:** Hafif · derinlik: Hızlı · araç: claude')
    .replace(/Proje henüz başlamadı\.[^\n]*/, 'Kurulum bitti; not API\'si çalışıyor (npm test yeşil).'));
  run(process.execPath, [path.join(dir, '.claude', 'hooks', 'gate.mjs'), '--approve'], dir, { CLAUDE_PROJECT_DIR: dir });
}

function prepare(dir, cond) {
  fs.cpSync(FIXTURE, dir, { recursive: true });
  if (cond === 'kit') setupKit(dir);
  if (!fs.existsSync(path.join(dir, '.git'))) git(dir, 'init', '-q');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '--no-verify', '-m', 'base');
  return git(dir, 'rev-parse', 'HEAD').trim();
}

function prompt(task, cond) {
  const text = fs.readFileSync(path.join(TASKS_DIR, task, 'prompt.md'), 'utf8').trim();
  if (cond === 'plain') return `${text}\n\n${HEADLESS}`;
  const { kitCommand } = JSON.parse(fs.readFileSync(path.join(TASKS_DIR, task, 'task.json'), 'utf8'));
  return `${kitCommand} ${text}\n\n${HEADLESS}${KIT_HEADLESS}`;
}

// stream-json output: the result event (same fields as --output-format json), the init event and the tool calls in order.
// testFirst: the first write to a test file came before the first write to other code under src/ (null if either is missing).
const isTest = (f) => /\.test\.m?[jt]sx?$|(^|\/)__tests__\//.test(f);
export function parseStream(text, dir) {
  const events = text.split('\n').flatMap((l) => { try { return [JSON.parse(l)]; } catch { return []; } });
  const uses = events.filter((e) => e.type === 'assistant').flatMap((e) => e.message?.content ?? []).filter((c) => c.type === 'tool_use');
  // The agent may write the real path of the temp folder (macOS /private/var, Windows long names)
  const roots = [dir];
  try { roots.push(fs.realpathSync.native(dir)); } catch { /* not on disk (tests) */ }
  const rel = (f) => roots.map((r) => path.relative(r, path.resolve(r, f))).find((r) => !r.startsWith('..') && !path.isAbsolute(r))?.replaceAll('\\', '/') ?? '';
  const writes = uses.filter((u) => ['Write', 'Edit', 'MultiEdit', 'NotebookEdit'].includes(u.name) && u.input?.file_path).map((u) => rel(u.input.file_path));
  const firstTest = writes.findIndex(isTest);
  const firstCode = writes.findIndex((f) => f.startsWith('src/') && !isTest(f));
  return {
    json: events.findLast((e) => e.type === 'result') ?? null,
    init: events.find((e) => e.type === 'system' && e.subtype === 'init') ?? null,
    testFirst: firstTest === -1 || firstCode === -1 ? null : firstTest < firstCode,
    gateRan: uses.some((u) => u.name === 'Bash' && /gate\.mjs\s+--run/.test(u.input?.command ?? '')),
  };
}

function claude(dir, text, port) {
  return new Promise((resolve) => {
    const started = Date.now();
    const p = spawn('claude', ['-p', '--model', model, '--output-format', 'stream-json', '--verbose', '--no-session-persistence',
      '--max-budget-usd', BUDGET_USD, '--setting-sources', 'project,local', '--allowedTools', ...ALLOWED, '--disallowedTools', ...DENIED],
    { cwd: dir, env: childEnv({ KIT_NOTIFY: 'off', CLAUDE_PROJECT_DIR: dir, PORT: String(port) }) });
    let out = '', err = '';
    const done = (code) => { clearTimeout(timer); resolve({ code, ...parseStream(out, dir), stream: out, err: err.slice(-2000), wallMs: Date.now() - started }); };
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { err += d; });
    p.on('error', (e) => { err += e.message; done(null); }); // e.g. claude not on PATH: the row records it, the run goes on
    const timer = setTimeout(() => p.kill(), TIMEOUT_MS);
    p.on('close', done);
    p.stdin.end(text);
  });
}

// A port nobody listens on, so killPort after the run cannot hit a process of the user's
const portFree = (port) => new Promise((resolve) => {
  const s = net.createServer().once('error', () => resolve(false)).once('listening', () => s.close(() => resolve(true)));
  s.listen(port);
});
async function freePort(start) {
  for (let p = start; p < start + 10; p++) if (await portFree(p)) return p;
  throw new Error(`${start}-${start + 9} arası portların hepsi dolu`);
}

// shortcut: only a server on the run's PORT is stopped; one the agent started on a hard-coded port stays up
function killPort(port) {
  if (process.platform === 'win32') {
    // TCP rows of both IPv4 and IPv6; netstat's state column is localized, a listening socket has a :0 foreign address
    const lines = (spawnSync('netstat', ['-ano'], { encoding: 'utf8' }).stdout ?? '').split('\n').map((l) => l.trim().split(/\s+/));
    const pids = new Set(lines.filter((c) => c[0] === 'TCP' && c[1]?.endsWith(`:${port}`) && /:0$/.test(c[2] ?? '')).map((c) => c.at(-1)));
    for (const pid of pids) if (/^\d+$/.test(pid) && pid !== '0') spawnSync('taskkill', ['/PID', pid, '/T', '/F']);
  } else {
    const pids = (spawnSync('lsof', ['-ti', `tcp:${port}`, '-sTCP:LISTEN'], { encoding: 'utf8' }).stdout ?? '').split('\n').filter(Boolean);
    for (const pid of pids) try { process.kill(Number(pid)); } catch { /* already gone */ }
  }
}

// node --test summary lines: "ℹ pass 3" / "ℹ fail 0" (spec reporter; set explicitly, the default differs off a TTY)
export function tally(output) {
  const n = (k) => Number(output.match(new RegExp(`^ℹ ${k} (\\d+)`, 'm'))?.[1] ?? 0);
  return { pass: n('pass'), fail: n('fail') };
}
const nodeTestOut = (dir, files) => spawnSync(process.execPath, ['--test', '--test-reporter=spec', ...files], { cwd: dir, env: childEnv(), encoding: 'utf8', timeout: 120000 }).stdout ?? '';
const nodeTest = (dir, files) => tally(nodeTestOut(dir, files));
// Test names from spec lines "✔ name (1.2ms)"; a file that cannot load shows up as a failed "test" named after the file
const testNames = (output) => {
  const names = { pass: new Set(), fail: new Set() };
  for (const [, mark, name] of output.matchAll(/^\s*(✔|✖) (.+) \([\d.]+m?s\)\s*$/gm)) names[mark === '✔' ? 'pass' : 'fail'].add(name);
  return names;
};
const countTests = (dir) => {
  const root = path.join(dir, 'tests');
  if (!fs.existsSync(root)) return 0;
  const files = fs.readdirSync(root, { recursive: true }).filter((f) => /\.test\.m?js$/.test(f) && !f.startsWith('__hidden__'));
  return files.reduce((s, f) => s + (fs.readFileSync(path.join(root, f), 'utf8').match(/^\s*test\(/gm) ?? []).length, 0);
};

// The agent's tests run against its code and against the unchanged fixture. A test that passes on its code and does not
// pass on the fixture catches the bug (or the missing feature); a test red on both is broken and does not count.
// shortcut: tests are matched by name; two tests with the same name in different files count once.
export function caughtTests(dir, ownOutput = nodeTestOut(dir, ['tests/**/*.test.mjs'])) {
  if (!fs.existsSync(path.join(dir, 'tests'))) return 0;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-eval-caught-'));
  try {
    fs.cpSync(FIXTURE, tmp, { recursive: true });
    fs.cpSync(path.join(dir, 'tests'), path.join(tmp, 'tests'), { recursive: true, filter: (src) => !src.includes('__hidden__') });
    const before = testNames(nodeTestOut(tmp, ['tests/**/*.test.mjs']));
    return [...testNames(ownOutput).pass].filter((n) => !before.pass.has(n)).length;
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

// Test quality: the agent's tests run on the task's reference solution and on each mutant of it (one planted bug). A test
// that passes on the solution and fails on a mutant kills it. Tests that need the agent's own modules cannot load on the
// solution and are left out, so a kill always means a behavior check.
// shortcut: tests are matched by name; a duplicate name or one that changes per run (a timestamp in it), or a test that
// times out only on a mutant, can miscount. Upgrade to per-file runs if that shows up in results.
export function mutantsKilled(dir, task) {
  const mutantsDir = path.join(TASKS_DIR, task, 'mutants');
  const mutants = fs.existsSync(mutantsDir) ? fs.readdirSync(mutantsDir) : [];
  if (!fs.existsSync(path.join(dir, 'tests'))) return { killed: 0, total: mutants.length };
  const passing = (mutant) => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-eval-mutant-'));
    try {
      fs.cpSync(FIXTURE, tmp, { recursive: true });
      fs.cpSync(path.join(TASKS_DIR, task, 'solution'), tmp, { recursive: true });
      if (mutant) fs.cpSync(path.join(mutantsDir, mutant), tmp, { recursive: true });
      fs.cpSync(path.join(dir, 'tests'), path.join(tmp, 'tests'), { recursive: true, filter: (src) => !src.includes('__hidden__') });
      return testNames(nodeTestOut(tmp, ['tests/**/*.test.mjs'])).pass;
    } finally {
      // A test process left running can lock the folder on Windows: a leftover temp folder must not cost the row its score
      try { fs.rmSync(tmp, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch { /* left in the temp folder */ }
    }
  };
  const base = passing(null);
  const killed = mutants.filter((m) => { const p = passing(m); return [...base].some((n) => !p.has(n)); }).length;
  return { killed, total: mutants.length };
}

function score(task, dir, base) {
  // The agent's own suite first, before the hidden files are in tests/
  const ownOutput = nodeTestOut(dir, ['tests/**/*.test.mjs']); // node expands the glob itself; same as the fixture's npm test
  const own = tally(ownOutput);
  const caught = caughtTests(dir, ownOutput);
  let mutants = null; // a failure here must not lose the hidden-test score
  try { mutants = mutantsKilled(dir, task); } catch { /* reported as "-" */ }
  git(dir, 'add', '-A');
  // Against the base commit, so a commit by the agent still counts as a change
  const changed = git(dir, 'diff', '--cached', '--numstat', base).trim().split('\n').filter(Boolean)
    .map((l) => { const [add, del, file] = l.split('\t'); return { file, add: Number(add) || 0, del: Number(del) || 0 }; });
  const code = changed.filter((c) => /^(src|tests)\/|^package\.json$/.test(c.file));
  const hidden = path.join(dir, 'tests', '__hidden__');
  fs.mkdirSync(hidden, { recursive: true });
  fs.copyFileSync(path.join(TASKS_DIR, 'helper.mjs'), path.join(hidden, 'helper.mjs'));
  fs.copyFileSync(path.join(TASKS_DIR, task, 'hidden.test.mjs'), path.join(hidden, 'hidden.test.mjs'));
  // The original visible tests, so a weakened copy in tests/ does not count
  fs.writeFileSync(path.join(hidden, 'visible.test.mjs'), fs.readFileSync(path.join(FIXTURE, 'tests', 'notes.test.mjs'), 'utf8').replaceAll("'../src/", "'../../src/"));
  return {
    hidden: nodeTest(dir, [path.join('tests', '__hidden__', 'hidden.test.mjs')]),
    visible: nodeTest(dir, [path.join('tests', '__hidden__', 'visible.test.mjs')]),
    own,
    testsAdded: countTests(dir) - countTests(FIXTURE),
    testsCaught: caught,
    mutants,
    codeFiles: code.length,
    codeLines: code.reduce((s, c) => s + c.add + c.del, 0),
    otherFiles: changed.length - code.length,
  };
}

// Results are committed: the temp folder and the home folder (user name) are masked in free text
export function scrub(text, dir) {
  if (!text) return text;
  const pairs = [[dir, '<tmp>'], [os.tmpdir(), '<tmp>'], [os.homedir(), '~']].flatMap(([p, to]) => [[p, to], [p.replaceAll('\\', '/'), to]]);
  return pairs.reduce((s, [p, to]) => s.replaceAll(p, to), text);
}

// One task, every condition: all folders are prepared first, the agents run side by side, and scoring (synchronous,
// several test runs) waits until every agent has stopped, so it cannot stall a running agent and stretch its time.
async function pair(task) {
  const runs = conds.map((cond, i) => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), `kit-eval-${task}-${cond}-`));
    // approvalPath is resolved while the folder exists
    return { cond, dir, portStart: PORT_BASE + i * 10, approval: approvalPath(dir), row: { task, cond, model, dir: keep ? dir : null } };
  });
  const fail = (r, e) => { r.row.error = scrub(`düzenek hatası: ${e.message}`, r.dir).slice(0, 500); };
  for (const r of runs) try { r.base = prepare(r.dir, r.cond); } catch (e) { fail(r, e); }
  await Promise.all(runs.map(async (r) => {
    if (dry || r.row.error) return;
    try {
      r.port = await freePort(r.portStart);
      r.res = await claude(r.dir, prompt(task, r.cond), r.port);
    } catch (e) { fail(r, e); }
  }));
  return runs.map((r) => finish(task, r));
}

function scored(task, cond, dir, base, res) {
  const s = score(task, dir, base);
  if (keep && res) fs.writeFileSync(path.join(dir, 'eval-stream.jsonl'), res.stream); // after scoring: not part of the diff
  const j = res?.json;
  const u = j?.usage ?? {};
  const failed = res && (res.code !== 0 || !j || j.is_error);
  return {
    ...s,
    error: failed ? scrub(j?.result || (j?.subtype !== 'success' && j?.subtype) || res.err || `exit ${res.code}`, dir).slice(0, 500)
      : s.hidden.pass + s.hidden.fail === 0 ? 'gizli testler çalışmadı (0/0)' : null,
    costUsd: j?.total_cost_usd ?? null, durationS: j ? Math.round(j.duration_ms / 1000) : res ? Math.round(res.wallMs / 1000) : null,
    turns: j?.num_turns ?? null,
    tokens: j ? (u.input_tokens ?? 0) + (u.output_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) : null,
    outputTokens: u.output_tokens ?? null,
    testFirst: res?.testFirst ?? null, gateRan: res && cond === 'kit' ? res.gateRan : null, // plain has no gate
    claudeVersion: res?.init?.claude_code_version ?? null,
    plugins: res?.init?.plugins?.map((p) => p.name) ?? null,
    summary: scrub(j?.result, dir)?.slice(0, 1500) ?? null,
  };
}

function finish(task, { cond, dir, approval, base, port, res = null, row }) {
  try {
    if (!row.error) Object.assign(row, scored(task, cond, dir, base, res));
  } catch (e) {
    row.error = scrub(`düzenek hatası: ${e.message}`, dir).slice(0, 500);
  } finally {
    // Cleanup must not reject: a locked folder (a server still running in it on Windows) would stop the other tasks
    try {
      if (port) killPort(port);
      fs.rmSync(approval, { force: true });
      if (!keep) fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
    } catch (e) {
      row.cleanup = scrub(`temizlenemedi: ${e.message}`, dir).slice(0, 300);
    }
  }
  const t = (x) => (x ? `${x.pass}/${x.pass + x.fail}` : '-');
  const m = row.mutants ? ` · mutant ${row.mutants.killed}/${row.mutants.total}` : '';
  console.log(`${task} · ${cond}${keep ? ` (${dir})` : ''}: gizli ${t(row.hidden)} · görünür ${t(row.visible)}${m} · $${row.costUsd ?? '-'} · ${row.durationS ?? '-'} sn${row.error ? ` · HATA: ${row.error.slice(0, 120)}` : ''}`);
  return row;
}

// Claude Code's message when the plan's session or weekly limit is reached ("You've hit your session limit · resets ...")
export const limitHit = (row) => /\bhit your \w+ limit\b/i.test(row.error ?? '');

// Repeated runs of the same task and condition: the hidden-test share as mean and range. A run that was scored counts
// with its real share even if Claude reported an error (budget cap); a run with no hidden result counts as 0.
export function summary(rows) {
  const groups = new Map();
  for (const r of rows) {
    const k = `${r.task}\0${r.cond}`;
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(r);
  }
  const avg = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
  return [...groups.values()].map((g) => {
    const share = g.map((r) => (r.hidden?.pass + r.hidden?.fail ? r.hidden.pass / (r.hidden.pass + r.hidden.fail) : 0));
    return {
      task: g[0].task, cond: g[0].cond, runs: g.length,
      hiddenAvg: avg(share), hiddenMin: Math.min(...share), hiddenMax: Math.max(...share),
      killedAvg: avg(g.map((r) => r.mutants?.killed ?? 0)), mutantTotal: g.find((r) => r.mutants)?.mutants.total ?? 0,
      costAvg: avg(g.map((r) => r.costUsd).filter((x) => x != null)), durationAvg: avg(g.map((r) => r.durationS).filter((x) => x != null)),
    };
  });
}

function report(rows, meta) {
  const pct = (t) => (t && t.pass + t.fail ? `${t.pass}/${t.pass + t.fail}` : '-');
  const yn = (v) => (v === true ? 'evet' : v === false ? 'hayır' : '-');
  const share = (x) => `%${Math.round(x * 100)}`;
  const lines = [`# Kit değerlendirmesi · ${VERSION} · ${model} · ${new Date().toISOString().slice(0, 10)}`, '',
    `Claude Code ${meta.claude} · Node ${meta.node} · tekrar: ${repeat}`, '', ...meta.plugins.map(([cond, list]) => `- Eklentiler (${cond}): ${list}`), '',
    '## Özet', '',
    '| Görev | Koşul | Koşu | Gizli test (ort.) | En düşük / en yüksek | Öldürülen mutant (ort.) | Maliyet ($, ort.) | Süre (sn, ort.) |',
    '|---|---|---:|---:|---|---:|---:|---:|',
    ...summary(rows).map((s) => `| ${s.task} | ${s.cond} | ${s.runs} | ${share(s.hiddenAvg)} | ${share(s.hiddenMin)} / ${share(s.hiddenMax)} | ${s.killedAvg.toFixed(1)}/${s.mutantTotal} | ${s.costAvg?.toFixed(2) ?? '-'} | ${s.durationAvg?.toFixed(0) ?? '-'} |`),
    '', '## Koşular', '',
    '| Görev | Koşul | Tekrar | Gizli test | Görünür test | Kendi testleri | Eklenen test | Hatayı yakalayan | Öldürülen mutant | Önce test | Kapı | Kod dosyası / satır | Diğer dosya | Maliyet ($) | Süre (sn) | Tur | Token |',
    '|---|---|---:|---|---|---|---|---|---|---|---|---|---|---:|---:|---:|---:|',
    ...rows.map((r) => `| ${r.task} | ${r.cond} | ${r.rep ?? 1} | ${pct(r.hidden)} | ${pct(r.visible)} | ${pct(r.own)} | ${r.testsAdded ?? '-'} | ${r.testsCaught ?? '-'} | ${r.mutants ? `${r.mutants.killed}/${r.mutants.total}` : '-'} | ${yn(r.testFirst)} | ${yn(r.gateRan)} | ${r.codeFiles ?? '-'} / ${r.codeLines ?? '-'} | ${r.otherFiles ?? '-'} | ${r.costUsd?.toFixed(2) ?? '-'} | ${r.durationS ?? '-'} | ${r.turns ?? '-'} | ${r.tokens ?? '-'} |`),
    '', ...rows.filter((r) => r.error).map((r) => `- ${r.task} · ${r.cond} · ${r.rep ?? 1} hata: ${r.error}`)];
  return lines.join('\n') + '\n';
}

if (process.argv[1] && import.meta.url === new URL(`file://${path.resolve(process.argv[1]).replaceAll('\\', '/').replace(/^([A-Za-z]:)/, '/$1')}`).href) {
  // To the second: runs of separate tasks one after the other finish within the same minute
  const stamp = new Date().toISOString().slice(0, 19).replace('T', '-').replaceAll(':', '');
  const name = `${stamp}-v${VERSION}-${model}`;
  const dir = path.join(EVAL, 'results');
  // The temp folder path holds the user name: printed above with --keep, not written to the repo
  const json = (rows) => JSON.stringify(rows.map(({ dir: _, ...r }) => r), null, 2) + '\n';
  // Outside the repo, so a crash does not leave a file to commit by mistake
  const partial = path.join(os.tmpdir(), `kit-eval-${name}.partial.json`);
  if (!dry) console.log(`Ara sonuç: ${partial}`);
  const rows = [];
  let stopped = null;
  run: for (const task of tasks) {
    for (let rep = 1; rep <= repeat; rep++) {
      const done = (await pair(task)).map((r) => ({ ...r, rep }));
      // The plan limit ends every later run within a second: stop, keep what finished, say what is left
      if (done.some(limitHit)) {
        rows.push(...done.filter((r) => !limitHit(r)));
        stopped = `${task} (tekrar ${rep}'den itibaren)${tasks.slice(tasks.indexOf(task) + 1).map((t) => `, ${t}`).join('')}`;
        break run;
      }
      rows.push(...done);
      if (!dry) fs.writeFileSync(partial, json(rows)); // a crash or Ctrl+C later keeps the finished rows
    }
  }
  if (stopped) {
    console.error(`Limit doldu, koşu durdu. Kalan: ${stopped}. Limit sıfırlanınca kalan görevleri yeniden koş.`);
    if (!rows.length) process.exit(2);
  }
  const versionOut = spawnSync('claude', ['--version'], { encoding: 'utf8' }).stdout?.trim();
  const plugins = conds.map((c) => [c, [...new Set(rows.filter((r) => r.cond === c).flatMap((r) => r.plugins ?? []))].join(', ') || '-']);
  const md = report(rows, { claude: versionOut || '-', node: process.version, plugins });
  if (dry) { console.log(md); process.exit(0); }
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${name}.json`), json(rows));
  fs.writeFileSync(path.join(dir, `${name}.md`), md);
  fs.rmSync(partial, { force: true });
  console.log(md);
  console.log(`Sonuç: kit/eval/results/${name}.md`);
  if (stopped) process.exit(2);
}
