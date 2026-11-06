// Run: node --test kit/tests/dashboard-language.test.mjs
// 3.65.0 AC-65.18: the dashboard in the project language. A project made the way a user makes it (kit.mjs init, then install, for every project type),
// the language set to Turkish, and the dashboard built: no template text and no fixed value word stays in English on the page. The files of the
// project are never changed by building it. With English the English texts stay (control).
// Hard limits of this file: temp folders only, no real home folder, no real network from the test itself (the dashboard may ask git and gh, as it always does).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const KIT_MJS = path.join(ROOT, 'kit', 'kit.mjs');
const T = { timeout: 300000 };
// The same list kit.mjs reads: every folder under templates except addons
const TYPES = fs.readdirSync(path.join(ROOT, 'kit', 'templates'), { withFileTypes: true }).filter((e) => e.isDirectory() && e.name !== 'addons').map((e) => e.name).sort();

const tmpDir = (t, prefix) => {
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), prefix)));
  t.after(() => { try { fs.rmSync(dir, { recursive: true, force: true, maxRetries: 3 }); } catch { /* temp */ } });
  return dir;
};
const cleanEnv = (home, project) => {
  const env = { ...process.env, HOME: home, USERPROFILE: home, CLAUDE_PROJECT_DIR: project };
  for (const k of Object.keys(env)) if (/^(ANTHROPIC|KIT_)|_API_KEY$/i.test(k)) delete env[k];
  return env;
};
const run = (args, { cwd, env }) => {
  const r = spawnSync(process.execPath, args, { cwd, env, encoding: 'utf8', timeout: 240000 });
  assert.equal(r.status, 0, `${args.join(' ')}\n${r.stdout}\n${r.stderr}`);
  return r;
};

// A project the way a user gets one
function makeProject(t, type) {
  const dir = path.join(tmpDir(t, `dl-${type}-`), 'project');
  const home = tmpDir(t, 'dl-home-');
  const env = cleanEnv(home, dir);
  run([KIT_MJS, 'init', '--project', dir, '--tool', 'claude'], { cwd: ROOT, env });
  run([KIT_MJS, 'install', '--type', type, '--keep-kit', '--project', dir, '--tool', 'claude'], { cwd: ROOT, env });
  const setLang = (code) => run([path.join('.claude', 'hooks', 'lang.mjs'), '--set', code], { cwd: dir, env });
  const dashboard = () => { run([path.join('.claude', 'hooks', 'dashboard.mjs')], { cwd: dir, env }); return fs.readFileSync(path.join(dir, 'dashboard.html'), 'utf8'); };
  return { dir, env, setLang, dashboard, file: (rel) => fs.readFileSync(path.join(dir, rel), 'utf8') };
}

const withoutCode = (html) => html.replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<script[\s\S]*?<\/script>/gi, '');
const decode = (s) => s.replace(/&quot;/g, '"').replace(/&#0?39;|&#x27;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');
// What a reader sees, tags removed with nothing in their place so inline code and bold do not cut a sentence
const flat = (html) => decode(withoutCode(html).replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ');
const plain = (md) => md.replace(/`/g, '').replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();
const hasWords = (s) => /[A-Za-z]{4,}/.test(s) && s.length >= 8;
// Text nodes: every piece of text between tags, trimmed
const nodes = (html) => decode(withoutCode(html).replace(/<[^>]*>/g, '\n')).split('\n').map((s) => s.trim()).filter(Boolean);
const sha = (file) => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
const walk = (dir) => (fs.existsSync(dir) ? fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)])) : []);

// English segments of the roadmap template: headings (whole and the part after the dash), and per line the task text and the done-when text
function roadmapSegments(roadmap) {
  const headings = [], tasks = [], others = [];
  for (const raw of roadmap.split('\n')) {
    const line = raw.trim();
    if (!line) continue;
    if (/^#{2,3}\s/.test(line)) {
      const h = plain(line.replace(/^#+\s*/, ''));
      headings.push(h);
      if (h.includes(' — ')) headings.push(h.split(' — ').slice(1).join(' — '));
      continue;
    }
    if (line.startsWith('# ')) continue;
    const body = line.replace(/^>\s*/, '').replace(/^- \[[ x]\]\s*/, '').replace(/^-\s+/, '').replace(/^G-\d+:\s*/, '');
    const [text, how] = body.split(' — done when: ');
    const target = /^- \[[ x]\]\s*G-\d+/.test(line) ? tasks : others;
    target.push(plain(text));
    if (how !== undefined) target.push(plain(how));
  }
  return { headings, tasks, others };
}
const criticalFlowRows = (testPlan) => {
  const start = testPlan.indexOf('## 1. Critical flows');
  const end = testPlan.indexOf('\n## ', start + 5);
  return testPlan.slice(start, end).split('\n').filter((l) => l.trim().startsWith('|') && !/^\|\s*:?-/.test(l.trim())).slice(1)
    .map((l) => l.trim().split('|').slice(1, -1).map((c) => c.trim())).filter((c) => c.length >= 6);
};

const FORBIDDEN = ['done when', 'Phase 0', 'closed topics', 'Setup ·', 'Project skeleton set up', 'Sign-up / sign-in', 'Authorization: a user', 'The project has not started yet', 'your project idea'];

assert.ok(TYPES.length >= 3, `project types under kit/templates: ${TYPES.join(', ')}`);

for (const type of TYPES) {
  test(`AC-65.18 [${type}] in Turkish the dashboard shows none of the English template or fixed texts and says "kapalı konular"; the control in English keeps them`, T, (t) => {
    const p = makeProject(t, type);
    const protectedFiles = [...walk(path.join(p.dir, 'docs')), path.join(p.dir, 'AGENTS.md'), path.join(p.dir, 'CLAUDE.md')].filter((f) => fs.existsSync(f));
    p.setLang('tr');
    protectedFiles.push(path.join(p.dir, '.kit.json'));
    const before = Object.fromEntries(protectedFiles.map((f) => [f, sha(f)]));

    const tr = p.dashboard();
    const stripped = withoutCode(tr);
    for (const text of FORBIDDEN) assert.equal(stripped.includes(text), false, `[${type}] tr: "${text}" is still on the page`);
    assert.equal(stripped.includes('kapalı konular'), true, `[${type}] tr: "kapalı konular"`);
    const seen = flat(tr);
    assert.ok(seen.includes('G-001'), 'the roadmap is on the page, so its texts are checked for real');
    assert.ok(seen.includes('K1'), 'the critical flow rows are on the page');

    // Every line of the roadmap template, and the critical-flow rows of the test plan, leave no English behind
    const { headings, tasks, others } = roadmapSegments(p.file('docs/product/roadmap.md'));
    const flows = criticalFlowRows(p.file('docs/quality/test-plan.md')).map((c) => plain(c[1]));
    assert.ok(tasks.length >= 20 && flows.length >= 4, `the templates were read (${tasks.length} task texts, ${flows.length} flows)`);
    const left = [...headings, ...tasks, ...others, ...flows].filter((s) => hasWords(s) && seen.includes(s));
    assert.deepEqual(left, [], `[${type}] tr: template text still in English`);

    // Fixed wording must not be half translated either: no English done-when label, no English phase word in front of a number
    assert.doesNotMatch(seen, /\bPhase [0-9]\b|\bdone when\b|\bclosed topics\b/i);

    // Building the dashboard changes no project file
    for (const [f, hash] of Object.entries(before)) assert.equal(sha(f), hash, `[${type}] the dashboard changed ${path.relative(p.dir, f)}`);

    // Control: English keeps its own texts
    p.setLang('en');
    const en = p.dashboard();
    const enStripped = withoutCode(en);
    for (const text of ['done when', 'Phase 0', 'closed topics', 'Project skeleton set up']) assert.equal(enStripped.includes(text), true, `[${type}] en: "${text}" stays`);
    assert.equal(enStripped.includes('kapalı konular'), false, `[${type}] en: no Turkish`);
    const enSeen = flat(en);
    const missing = tasks.filter((s) => hasWords(s) && !enSeen.includes(s));
    assert.deepEqual(missing, [], `[${type}] en: every roadmap task text is on the page as written (control for the check above)`);
    assert.ok(flows.filter((s) => hasWords(s)).every((s) => enSeen.includes(s)), `[${type}] en: the critical flows as written`);
  });
}

test('AC-65.18 the fixed value words of decision and feedback rows (one-way, automatic, new, planned, bug) show translated in Turkish, and free text next to them is left alone', T, (t) => {
  const p = makeProject(t, 'web-saas');
  const question = 'Which new database for the bug tracker?';
  const chosen = 'a planned automatic new setup';
  const theme = 'new planned bug theme';
  const log = path.join(p.dir, 'docs', 'decisions', 'log.md');
  const sep = '|---|---|---|---|---|---|---|---|\n';
  assert.ok(fs.readFileSync(log, 'utf8').includes(sep), 'the decision log has 8 columns');
  fs.writeFileSync(log, fs.readFileSync(log, 'utf8').replace(sep, `${sep}| 1 | 2026-01-01 | Setup | tech | ${question} | ${chosen} | one-way | automatic |\n| 2 | 2026-01-02 | Setup | design | Pick the layout? | the grid | two-way | user |\n`));
  const fbFile = path.join(p.dir, 'docs', 'product', 'feedback.md');
  let fb = fs.readFileSync(fbFile, 'utf8');
  const inboxSep = '|---|---|---|---|---|---|---|---|---|---|\n';
  assert.ok(fb.includes(inboxSep), 'the feedback inbox has 10 columns');
  fb = fb.replace(inboxSep, `${inboxSep}| 1 | 2026-01-03 | web | K-001 | The login button hides | bug | login | high | new | |\n| 2 | 2026-01-04 | web | K-002 | Export comes late | request | export | medium | planned | G-012 |\n`);
  const themeSep = '|---|---|---|---|\n';
  const [inbox, themes] = fb.split('## Themes');
  assert.ok(themes?.includes(themeSep), 'the themes table');
  fb = `${inbox}## Themes${themes.replace(themeSep, `${themeSep}| ${theme} | 3 | Login | fix first |\n`)}`;
  fs.writeFileSync(fbFile, fb);
  const files = [log, fbFile];
  const before = files.map(sha);

  p.setLang('tr');
  const html = p.dashboard();
  const all = nodes(html);
  for (const word of ['one-way', 'automatic', 'new', 'planned', 'bug']) assert.equal(all.includes(word), false, `a piece of text on the page is just "${word}"`);
  assert.equal(/·\s*automatic\b/.test(flat(html)), false, 'the activity line does not say automatic either');
  // The decision row: door and decided-by cells hold a translated word
  const row = withoutCode(html).split('<tr').map((chunk) => chunk.split('</tr>')[0]).find((chunk) => chunk.includes(question) && chunk.includes('<td'));
  assert.ok(row, 'the decision row is on the page');
  const cells = [...row.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)].map((m) => decode(m[1].replace(/<[^>]*>/g, '')).trim());
  assert.equal(cells.length, 8, `eight cells: ${JSON.stringify(cells)}`);
  assert.notEqual(cells[6], 'one-way');
  assert.notEqual(cells[7], 'automatic');
  assert.notEqual(cells[6], '', 'the door is still shown');
  assert.notEqual(cells[7], '', 'who decided is still shown');
  // Free text is not touched, even when it holds the fixed words
  assert.equal(cells[4], question);
  assert.equal(cells[5], chosen);
  assert.ok(flat(html).includes(theme), 'the feedback theme, free text, as written');
  // Control: the free text is the same in English
  p.setLang('en');
  const en = p.dashboard();
  assert.ok(flat(en).includes(question) && flat(en).includes(chosen) && flat(en).includes(theme));
  assert.deepEqual(files.map(sha), before, 'building the dashboard changed neither the decision log nor the feedback file');
});
