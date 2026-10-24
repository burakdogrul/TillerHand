#!/usr/bin/env node
// Kit evaluation: the same task with the kit (kit) and without it (plain), scored by hidden tests.
//   node kit/eval/run.mjs [--task bug-sort,feature-tags] [--cond kit,plain] [--model sonnet] [--dry] [--keep]
// --dry: prepares the run folders and scores them without running Claude (the hidden tests must fail).
// Each run gets a fresh temp folder with the fixture. Kit runs get init + install web-saas and the state /start would
// leave (stack, AGENTS.md → Komutlar, question mode off, gate approval). Both run `claude -p` with the same model, the
// same allowed tools and only project settings (user plugins and hooks stay out of the plain run).
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const EVAL = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(EVAL, '..', '..');
const FIXTURE = path.join(EVAL, 'fixture');
const TASKS_DIR = path.join(EVAL, 'tasks');
const VERSION = fs.readFileSync(path.join(REPO, 'kit', 'VERSION'), 'utf8').trim();
const TIMEOUT_MS = 30 * 60 * 1000;
const ALLOWED = ['Read', 'Edit', 'Write', 'Glob', 'Grep', 'Bash(node:*)', 'Bash(npm:*)', 'Bash(git:*)', 'Agent', 'Skill', 'TodoWrite'];
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
for (const t of tasks) if (!allTasks.includes(t)) throw new Error(`Bilinmeyen görev: ${t}. Seçenekler: ${allTasks.join(', ')}`);
for (const c of conds) if (c !== 'kit' && c !== 'plain') throw new Error(`Bilinmeyen koşul: ${c} (kit, plain)`);

const run = (cmd, a, cwd, env = {}) => {
  const r = spawnSync(cmd, a, { cwd, encoding: 'utf8', env: { ...process.env, ...env }, timeout: 120000 });
  if (r.status !== 0) throw new Error(`${cmd} ${a.join(' ')} (${cwd}): ${r.stderr || r.stdout}`);
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

function prepare(task, cond) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), `kit-eval-${task}-${cond}-`));
  fs.cpSync(FIXTURE, dir, { recursive: true });
  if (cond === 'kit') setupKit(dir);
  if (!fs.existsSync(path.join(dir, '.git'))) git(dir, 'init', '-q');
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '--no-verify', '-m', 'base');
  return dir;
}

function prompt(task, cond) {
  const text = fs.readFileSync(path.join(TASKS_DIR, task, 'prompt.md'), 'utf8').trim();
  if (cond === 'plain') return `${text}\n\n${HEADLESS}`;
  const { kitCommand } = JSON.parse(fs.readFileSync(path.join(TASKS_DIR, task, 'task.json'), 'utf8'));
  return `${kitCommand} ${text}\n\n${HEADLESS}${KIT_HEADLESS}`;
}

function claude(dir, text) {
  return new Promise((resolve) => {
    const started = Date.now();
    const p = spawn('claude', ['-p', '--model', model, '--output-format', 'json', '--no-session-persistence',
      '--setting-sources', 'project,local', '--allowedTools', ...ALLOWED], { cwd: dir, env: { ...process.env, KIT_NOTIFY: 'off', CLAUDE_PROJECT_DIR: dir } });
    let out = '', err = '';
    p.stdout.on('data', (d) => { out += d; });
    p.stderr.on('data', (d) => { err += d; });
    const timer = setTimeout(() => p.kill(), TIMEOUT_MS);
    p.on('close', (code) => {
      clearTimeout(timer);
      let json = null;
      try { json = JSON.parse(out); } catch { /* reported below */ }
      resolve({ code, json, err: err.slice(-2000), wallMs: Date.now() - started });
    });
    p.stdin.end(text);
  });
}

// node --test summary lines: "ℹ pass 3" / "ℹ fail 0"
export function tally(output) {
  const n = (k) => Number(output.match(new RegExp(`^ℹ ${k} (\\d+)`, 'm'))?.[1] ?? 0);
  return { pass: n('pass'), fail: n('fail') };
}
const nodeTest = (dir, files) => tally(spawnSync(process.execPath, ['--test', ...files], { cwd: dir, encoding: 'utf8', timeout: 120000 }).stdout ?? '');
const countTests = (dir) => {
  const root = path.join(dir, 'tests');
  if (!fs.existsSync(root)) return 0;
  const files = fs.readdirSync(root, { recursive: true }).filter((f) => /\.test\.m?js$/.test(f) && !f.startsWith('__hidden__'));
  return files.reduce((s, f) => s + (fs.readFileSync(path.join(root, f), 'utf8').match(/^\s*test\(/gm) ?? []).length, 0);
};

function score(task, dir) {
  // The agent's own suite first, before the hidden files are in tests/
  const own = nodeTest(dir, ['tests/**/*.test.mjs']); // node expands the glob itself; same as the fixture's npm test
  git(dir, 'add', '-A');
  const changed = git(dir, 'diff', '--cached', '--numstat', 'HEAD').trim().split('\n').filter(Boolean)
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
    codeFiles: code.length,
    codeLines: code.reduce((s, c) => s + c.add + c.del, 0),
    otherFiles: changed.length - code.length,
  };
}

async function one(task, cond) {
  const dir = prepare(task, cond);
  const res = dry ? null : await claude(dir, prompt(task, cond));
  const s = score(task, dir);
  const j = res?.json;
  const u = j?.usage ?? {};
  const row = {
    task, cond, model, dir: keep ? dir : null, ...s,
    error: res && (res.code !== 0 || !j || j.is_error) ? (j?.result ?? res.err ?? `exit ${res.code}`).slice(0, 500) : null,
    costUsd: j?.total_cost_usd ?? null, durationS: j ? Math.round(j.duration_ms / 1000) : res ? Math.round(res.wallMs / 1000) : null,
    turns: j?.num_turns ?? null,
    tokens: j ? (u.input_tokens ?? 0) + (u.output_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0) : null,
    outputTokens: u.output_tokens ?? null,
    summary: j?.result?.slice(0, 1500) ?? null,
  };
  if (!keep) fs.rmSync(dir, { recursive: true, force: true });
  console.log(`${task} · ${cond}${keep ? ` (${dir})` : ''}: gizli ${s.hidden.pass}/${s.hidden.pass + s.hidden.fail} · görünür ${s.visible.pass}/${s.visible.pass + s.visible.fail} · $${row.costUsd ?? '-'} · ${row.durationS ?? '-'} sn${row.error ? ` · HATA: ${row.error.slice(0, 120)}` : ''}`);
  return row;
}

function report(rows) {
  const pct = (t) => (t.pass + t.fail ? `${t.pass}/${t.pass + t.fail}` : '-');
  const lines = [`# Kit değerlendirmesi · ${VERSION} · ${model} · ${new Date().toISOString().slice(0, 10)}`, '',
    '| Görev | Koşul | Gizli test | Görünür test | Kendi testleri | Eklenen test | Kod dosyası / satır | Diğer dosya | Maliyet ($) | Süre (sn) | Tur | Token |',
    '|---|---|---|---|---|---|---|---|---:|---:|---:|---:|',
    ...rows.map((r) => `| ${r.task} | ${r.cond} | ${pct(r.hidden)} | ${pct(r.visible)} | ${pct(r.own)} | ${r.testsAdded} | ${r.codeFiles} / ${r.codeLines} | ${r.otherFiles} | ${r.costUsd?.toFixed(2) ?? '-'} | ${r.durationS ?? '-'} | ${r.turns ?? '-'} | ${r.tokens ?? '-'} |`),
    '', ...rows.filter((r) => r.error).map((r) => `- ${r.task} · ${r.cond} hata: ${r.error}`)];
  return lines.join('\n') + '\n';
}

if (process.argv[1] && import.meta.url === new URL(`file://${path.resolve(process.argv[1]).replaceAll('\\', '/').replace(/^([A-Za-z]:)/, '/$1')}`).href) {
  const rows = [];
  for (const task of tasks) rows.push(...await Promise.all(conds.map((c) => one(task, c)))); // both conditions of a task run side by side
  const md = report(rows);
  if (dry) { console.log(md); process.exit(0); }
  const dir = path.join(EVAL, 'results');
  fs.mkdirSync(dir, { recursive: true });
  const name = `${new Date().toISOString().slice(0, 10)}-v${VERSION}-${model}`;
  // The temp folder path holds the user name: printed above with --keep, not written to the repo
  fs.writeFileSync(path.join(dir, `${name}.json`), JSON.stringify(rows.map(({ dir: _, ...r }) => r), null, 2) + '\n');
  fs.writeFileSync(path.join(dir, `${name}.md`), md);
  console.log(md);
  console.log(`Sonuç: kit/eval/results/${name}.md`);
}
