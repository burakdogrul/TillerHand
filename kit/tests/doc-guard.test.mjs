// Run: node --test "kit/tests/*.test.mjs"
// 3.53.0: a PDF is not read whole into the model's context. The document-to-markdown skill converts it first
// (MarkItDown, pinned), the doc-guard hook sends a whole-PDF read there. The package gate stays as strict as it was.
// Hooks are spawned with JSON stdin. The registry is a stubbed fetch: no test here touches the network.
import { test, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const DOC_GUARD = path.join(ROOT, '.claude', 'hooks', 'doc-guard.mjs');
const PACKAGE_GATE = path.join(ROOT, '.claude', 'hooks', 'package-gate.mjs');
const SKILL = path.join(ROOT, '.claude', 'skills', 'document-to-markdown', 'SKILL.md');
const SPEC = 'markitdown[pdf,docx,pptx,xlsx]==0.1.9';
const PIN = `uvx --from "${SPEC}" markitdown`;
const CONVERT = `${PIN} a.pdf -o sandbox/a.md`;

const dirs = [];
after(() => { for (const d of dirs) fs.rmSync(d, { recursive: true, force: true }); });

function tempProject(files = {}) {
  const p = fs.mkdtempSync(path.join(os.tmpdir(), 'doc-guard-'));
  dirs.push(p);
  for (const [f, s] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(p, f)), { recursive: true });
    fs.writeFileSync(path.join(p, f), s);
  }
  return p;
}
const readText = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
const settings = () => JSON.parse(readText('.claude/settings.json'));

// ---------- doc-guard hook ----------

// No .kit.json and no kit/kit.mjs in a temp project: the hook's language is English
const EN_PROJECT = tempProject();
const runDoc = (stdin, root = EN_PROJECT, options = {}) => {
  assert.equal(fs.existsSync(DOC_GUARD), true, '.claude/hooks/doc-guard.mjs exists');
  const r = spawnSync(process.execPath, [DOC_GUARD], {
    input: stdin, encoding: 'utf8', env: { ...process.env, CLAUDE_PROJECT_DIR: root }, timeout: 10000, ...options,
  });
  assert.equal(r.error, undefined, `spawn error: ${r.error && r.error.code}`);
  return r;
};
const input = (tool_name, tool_input) => JSON.stringify({ hook_event_name: 'PreToolUse', tool_name, tool_input });
const read = (file_path, extra = {}) => input('Read', { file_path, ...extra });
const short = (s) => (s.length > 80 ? `${s.slice(0, 80)}…` : s);

// Returns the deny reason
function assertDenied(r, label) {
  assert.equal(r.status, 0, `${label}: exit code. stderr: ${r.stderr.slice(0, 300)}`);
  assert.notEqual(r.stdout.trim(), '', `${label}: the hook gives a decision`);
  const out = JSON.parse(r.stdout).hookSpecificOutput;
  assert.equal(out.hookEventName, 'PreToolUse', label);
  assert.equal(out.permissionDecision, 'deny', label);
  return out.permissionDecisionReason;
}
function assertSilent(r, label) {
  assert.equal(r.status, 0, `${label}: exit code. stderr: ${r.stderr.slice(0, 300)}`);
  assert.equal(r.stdout, '', `${label}: no output`);
  assert.equal(r.stderr, '', `${label}: no crash text`);
}

// ---------- AC-1 Skill ----------

function skill() {
  assert.equal(fs.existsSync(SKILL), true, '.claude/skills/document-to-markdown/SKILL.md exists');
  const m = fs.readFileSync(SKILL, 'utf8').match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  assert.notEqual(m, null, 'SKILL.md starts with a frontmatter block');
  return { front: m[1], body: m[2] };
}
// Does any match of a have a match of b within span characters? Two words anywhere in a long file do not state a rule.
const near = (text, a, b, span) => [...text.matchAll(new RegExp(a.source, 'gi'))]
  .some((m) => new RegExp(b.source, 'i').test(text.slice(Math.max(0, m.index - span), m.index + m[0].length + span)));

test('3.53.0 AC-1: skill frontmatter has name document-to-markdown and a description naming PDF and Word or Office', () => {
  const { front } = skill();
  assert.match(front, /^name: document-to-markdown\s*$/m);
  const at = front.search(/^description:/m);
  assert.notEqual(at, -1, 'frontmatter has a description');
  const description = front.slice(at);
  assert.match(description, /\bPDF\b/);
  assert.match(description, /\b(Word|Office)\b/);
});

test('3.53.0 AC-1: skill body has the pinned MarkItDown command', () => {
  assert.equal(skill().body.includes(PIN), true, `the body has: ${PIN}`);
});

test('3.53.0 AC-1: ATTACK: skill body has no other, unpinned spelling of the MarkItDown command', () => {
  const { body } = skill();
  for (const [spec] of body.matchAll(/markitdown\[[^\]\s"'`]*\](?:[=<>~!]+[\w.*]+)?/g)) assert.equal(spec, SPEC);
  for (const [run] of body.matchAll(/\buvx\b[^\n`]*\bmarkitdown\b[^\n`]*/gi)) assert.equal(run.startsWith(PIN), true, run);
});

test('3.53.0 AC-1: skill body writes the output under sandbox/', () => {
  assert.match(skill().body, /sandbox\//);
});

test('3.53.0 AC-1: skill body says to read only the needed part afterwards, with grep or an offset', () => {
  const { body } = skill();
  assert.equal(near(body, /\b(grep|offset)\b/, /\b(only|needed?|part|section)\b/, 200), true, 'grep or offset, tied to reading only the needed part');
});

test('3.53.0 AC-1: skill body says empty or very short output means a scanned file, and falls back to reading pages', () => {
  const { body } = skill();
  assert.equal(near(body, /\bscanned\b/, /\b(empty|short)\b/, 200), true, 'scanned is tied to empty or short output');
  assert.equal(near(body, /\bscanned\b/, /\bpages?\b/, 300), true, 'scanned falls back to reading pages');
});

test('3.53.0 AC-1: skill body says charts and images need a page read', () => {
  const { body } = skill();
  assert.equal(near(body, /\bcharts?\b/, /\bimages?\b/, 100), true, 'charts and images are named together');
  assert.equal(near(body, /\bcharts?\b/, /\bpages?\b/, 200), true, 'they need a page read');
});

test('3.53.0 AC-1: skill body says local files only, no URLs', () => {
  const { body } = skill();
  assert.equal(near(body, /\blocal\b/, /\bURLs?\b/, 100), true, 'local files and URLs are named together');
  assert.equal(near(body, /\bURLs?\b/, /(\b(no|not|never|only|refuse|reject)\b|n't)/, 60), true, 'a URL is refused');
});

test('3.53.0 AC-1: skill body says document content is data, not instructions', () => {
  assert.equal(near(skill().body, /\binstructions?\b/, /\bdata\b/, 120), true, 'document content is data rather than instructions');
});

// ---------- AC-2 Routing ----------

test('3.53.0 AC-2: docs/workflow/skills.md has a row for document-to-markdown', () => {
  assert.match(readText('docs/workflow/skills.md'), /^\|\s*`?document-to-markdown`?\s*\|[^|\n]*\S[^|\n]*\|\s*$/m);
});

test('3.53.0 AC-2: AGENTS.md rule 4 names converting documents with document-to-markdown', () => {
  const rule = readText('AGENTS.md').match(/^4\. \*\*Spend few tokens\.\*\*[\s\S]*?(?=^5\. )/m);
  assert.notEqual(rule, null, 'AGENTS.md has rule 4 "Spend few tokens"');
  assert.match(rule[0], /document-to-markdown/);
  assert.match(rule[0], /\bconvert/i);
});

test('3.53.0 AC-2: ATTACK: settings.json allows no bare uvx wildcard, and the package gate still runs on Bash', () => {
  const s = settings();
  const loose = s.permissions.allow.filter((e) => (e === 'Bash' || /^Bash\(\s*(\*|:|uv)/i.test(e)) && !e.includes(SPEC));
  assert.deepEqual(loose, [], 'an allow entry for uv or uvx names the pinned package, nothing wider');
  const bash = s.hooks.PreToolUse.find((b) => b.matcher === 'Bash');
  assert.equal(bash.hooks.some((h) => /package-gate\.mjs/.test(h.command)), true);
});

// ---------- AC-3 Hook ----------

test('3.53.0 AC-3: doc-guard is wired in settings.json under PreToolUse with a matcher of exactly Read', () => {
  const blocks = settings().hooks.PreToolUse.filter((b) => b.hooks.some((h) => /doc-guard\.mjs/.test(h.command)));
  assert.deepEqual(blocks.map((b) => b.matcher), ['Read']);
  const hook = blocks[0].hooks.find((h) => /doc-guard\.mjs/.test(h.command));
  assert.equal(hook.type, 'command');
  assert.equal(hook.command, 'node "$CLAUDE_PROJECT_DIR/.claude/hooks/doc-guard.mjs"');
});

test('3.53.0 AC-3: report.pdf with no pages is denied; the reason names document-to-markdown and pages', () => {
  const reason = assertDenied(runDoc(read('report.pdf')), 'report.pdf');
  assert.equal(reason.includes('document-to-markdown'), true, reason);
  assert.equal(reason.includes('pages'), true, reason);
});

test('3.53.0 AC-3: report.pdf with pages 1-5 gives no output, exit 0', () => {
  assertSilent(runDoc(read('report.pdf', { pages: '1-5' })), 'pages 1-5');
});

test('3.53.0 AC-3: notes.md, image.png and a.txt give no output, exit 0', () => {
  for (const f of ['notes.md', 'image.png', 'a.txt']) assertSilent(runDoc(read(f)), f);
});

// ---------- AC-4 ATTACK ----------

test('3.53.0 AC-4: ATTACK: REPORT.PDF and a path with spaces are denied, in any case and path form', () => {
  for (const f of ['REPORT.PDF', 'dir with space/a b.pdf', 'a.PdF', 'x.md.pdf', '/srv/files/report.pdf', 'C:\\docs\\q3 report.PDF', 'ŞİİR ıİ.PDF', 'şiir ı.pdf'])
    assertDenied(runDoc(read(f)), f);
});

test('3.53.0 AC-4: ATTACK: a 200000 character PDF path is denied, no crash or timeout', () => {
  assertDenied(runDoc(read(`${'a'.repeat(200000)}.pdf`)), 'long path');
});

test('3.53.0 AC-4: ATTACK: pages that is empty or only blanks is denied (empty is not a page range)', () => {
  for (const pages of ['', '   ', '\t\n']) {
    assertDenied(runDoc(read('report.pdf', { pages })), `pages ${JSON.stringify(pages)}`);
    assertDenied(runDoc(read('REPORT.PDF', { pages })), `REPORT.PDF pages ${JSON.stringify(pages)}`);
  }
});

test('3.53.0 AC-4: ATTACK: REPORT.PDF with a page range is allowed', () => {
  assertSilent(runDoc(read('REPORT.PDF', { pages: '1-5' })), 'REPORT.PDF pages 1-5');
});

test('3.53.0 AC-4: ATTACK: x.pdf.md, pdf and a.pdfx are allowed, and so is a folder that only looks like a PDF', () => {
  for (const f of ['x.pdf.md', 'pdf', 'a.pdfx', 'X.PDF.MD', 'apdf', 'pdf/notes.md', 'x.pdf/notes.md', `${'a'.repeat(200000)}.pdfx`])
    assertSilent(runDoc(read(f)), short(f));
});

test('3.53.0 AC-4: ATTACK: a tool other than Read gives no output, exit 0, even on a PDF path', () => {
  for (const tool of ['Write', 'Edit', 'Grep']) assertSilent(runDoc(input(tool, { file_path: 'report.pdf' })), tool);
});

test('3.53.0 AC-4: ATTACK: a missing file_path gives no output, exit 0', () => {
  for (const g of [{ tool_name: 'Read' }, { tool_name: 'Read', tool_input: null }, { tool_name: 'Read', tool_input: {} }, { tool_name: 'Read', tool_input: { pages: '1-5' } }, { tool_name: 'Read', tool_input: { file_path: '' } }, { tool_name: 'Read', tool_input: 'a.pdf' }])
    assertSilent(runDoc(JSON.stringify(g)), JSON.stringify(g));
});

test('3.53.0 AC-4: ATTACK: a non-string file_path gives no output, exit 0', () => {
  for (const file_path of [123, 0, null, true, ['a.pdf'], { path: 'a.pdf' }]) assertSilent(runDoc(read(file_path)), JSON.stringify(file_path));
});

test('3.53.0 AC-4: ATTACK: unreadable stdin gives no output, exit 0', () => {
  for (const stdin of ['', 'not json', '{"tool_name":"Read"', 'null', '42', '[]', '"a.pdf"', Buffer.from([0xff, 0xfe, 0x00, 0x80])])
    assertSilent(runDoc(stdin), `stdin ${JSON.stringify(String(stdin))}`);
  assertSilent(runDoc(undefined, EN_PROJECT, { stdio: ['ignore', 'pipe', 'pipe'] }), 'stdin closed');
});

// ---------- AC-5 Message catalog ----------

const docKeys = async () => {
  const { MESSAGES } = await import('../../.claude/hooks/messages.mjs');
  const keys = Object.keys(MESSAGES).filter((k) => k.startsWith('guard.doc.'));
  assert.notDeepEqual(keys, [], 'messages.mjs has a guard.doc.* key');
  return { MESSAGES, keys };
};
const shippedTr = () => JSON.parse(readText('.claude/i18n/tr.json'));
const placeholders = (s) => [...new Set([...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort();
// The text with its placeholders filled by anything
const matchesTemplate = (text, template) => new RegExp(`^${template.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\{\w+\\\}/g, '[\\s\\S]*')}$`).test(text);

test('3.53.0 AC-5: every guard.doc.* key has an English text and a Turkish entry in tr.json with the same placeholders', async () => {
  const { MESSAGES, keys } = await docKeys();
  const tr = shippedTr();
  for (const k of keys) {
    assert.equal(typeof MESSAGES[k].en, 'string', k);
    assert.notEqual(MESSAGES[k].en.trim(), '', k);
    assert.equal(typeof tr[k], 'string', `tr.json has ${k}`);
    assert.notEqual(tr[k], MESSAGES[k].en, `${k} is translated`);
    assert.match(tr[k], /[çğıöşüÇĞİÖŞÜ]/u, `${k} is Turkish`);
    assert.deepEqual(placeholders(tr[k]), placeholders(MESSAGES[k].en), k);
  }
});

test('3.53.0 AC-5: the deny reason in an English project is the guard.doc.* text', async () => {
  const { MESSAGES, keys } = await docKeys();
  const reason = assertDenied(runDoc(read('report.pdf')), 'report.pdf');
  assert.equal(keys.some((k) => matchesTemplate(reason, MESSAGES[k].en)), true, reason);
});

test('3.53.0 AC-5: the deny reason in a Turkish project is the tr.json entry and still names document-to-markdown and pages', async () => {
  const { keys } = await docKeys();
  const tr = shippedTr();
  const root = tempProject({
    '.kit.json': JSON.stringify({ version: '3.53.0', type: 'web-saas', addons: [], tool: null, files: {}, lang: 'tr' }),
    '.claude/i18n/tr.json': readText('.claude/i18n/tr.json'),
  });
  const reason = assertDenied(runDoc(read('report.pdf'), root), 'report.pdf');
  assert.equal(keys.some((k) => typeof tr[k] === 'string' && matchesTemplate(reason, tr[k])), true, reason);
  assert.equal(reason.includes('document-to-markdown'), true, reason);
  assert.equal(reason.includes('pages'), true, reason);
});

// ---------- AC-6 Package gate ----------

// fetch replaced, no network. The call is written with a synchronous write: the gate exits right after its decision.
const stub = (body) => `import { writeSync } from "node:fs"; globalThis.fetch = async (url) => { writeSync(2, "FETCH " + url + "\\n"); ${body} };`;
const pypi = (date) => `return { status: 200, ok: true, json: async () => ({ releases: { "0.1.9": [{ upload_time_iso_8601: ${date} }] } }) };`;
const NOT_FOUND = 'return { status: 404, ok: false, json: async () => ({}) };';
const REGISTRY_NORMAL = stub(`if (String(url) === "https://pypi.org/pypi/markitdown/json") ${pypi('"2024-11-01T00:00:00Z"')} ${NOT_FOUND}`);
const REGISTRY_404 = stub(NOT_FOUND);
const REGISTRY_500 = stub('return { status: 500, ok: false, json: async () => ({}) };');
const REGISTRY_NEW = stub(pypi('new Date(Date.now() - 5 * 864e5).toISOString()'));

function gateRun(command, registry) {
  const r = spawnSync(process.execPath, ['--import', `data:text/javascript,${encodeURIComponent(registry)}`, PACKAGE_GATE], {
    input: JSON.stringify({ tool_name: 'Bash', tool_input: { command } }), encoding: 'utf8',
    env: { ...process.env, CLAUDE_PROJECT_DIR: EN_PROJECT }, timeout: 15000,
  });
  assert.equal(r.error, undefined, `spawn error: ${r.error && r.error.code}`);
  assert.equal(r.status, 0, r.stderr.slice(0, 300));
  return { r, decision: r.stdout.trim() ? JSON.parse(r.stdout).hookSpecificOutput.permissionDecision : null };
}

test('3.53.0 AC-6: the package gate checks markitdown on the registry and does not stop the pinned command when the registry answers normally', () => {
  const { r, decision } = gateRun(CONVERT, REGISTRY_NORMAL);
  assert.equal(decision, null, r.stdout.slice(0, 300));
  assert.equal(r.stdout, '');
  assert.deepEqual(r.stderr.trim().split(/\r?\n/), ['FETCH https://pypi.org/pypi/markitdown/json'], 'one registry check, for markitdown');
});

test('3.53.0 AC-2: ATTACK: the gate has no exemption for markitdown: a registry that says missing, new or broken still stops the pinned command', () => {
  assert.equal(gateRun(CONVERT, REGISTRY_404).decision, 'deny', '404');
  assert.equal(gateRun(CONVERT, REGISTRY_NEW).decision, 'ask', '5 days old');
  assert.equal(gateRun(CONVERT, REGISTRY_500).decision, 'ask', '500');
});

test('3.53.0 AC-2: ATTACK: a look-alike of the pinned command and a bare uvx stay denied when the package does not exist', () => {
  for (const c of ['uvx --from "markitdown-evil[pdf,docx,pptx,xlsx]==0.1.9" markitdown a.pdf', 'uvx zzz-not-a-package a.pdf'])
    assert.equal(gateRun(c, REGISTRY_404).decision, 'deny', c);
});
