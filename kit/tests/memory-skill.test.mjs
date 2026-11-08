// Run: node --test "kit/tests/*.test.mjs"
// 3.74.0 memory skill: content contract of the skill file and the places that point to it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SKILL = '.claude/skills/memory/SKILL.md';
const CLI = '.claude/hooks/memory.mjs';
const SUBCOMMANDS = ['search', 'add', 'person', 'receipt', 'recap', 'forget', 'export', 'compact', 'init', 'doctor'];

function read(rel) {
  const p = path.join(ROOT, rel);
  assert.equal(fs.existsSync(p), true, `${rel} must exist`);
  return fs.readFileSync(p, 'utf8');
}
const frontmatter = (md) => {
  const fm = md.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  assert.notEqual(fm, null, 'YAML frontmatter block');
  return fm[1];
};
// text of one "## heading" section, up to the next "## "
const section = (md, heading) => {
  const m = md.match(new RegExp(`^## ${heading}\\s*$([\\s\\S]*?)(?=^## |(?![\\s\\S]))`, 'm'));
  assert.notEqual(m, null, `section "## ${heading}"`);
  return m[1];
};
const jsonBlocks = (md) => [...md.matchAll(/```json\r?\n([\s\S]*?)```/g)].map((m) => m[1]);
const usageCommands = () => {
  const line = read(CLI).split(/\r?\n/).find((l) => l.includes('Usage: node .claude/hooks/memory.mjs'));
  assert.notEqual(line, undefined, 'usage line in memory.mjs');
  return line.split('memory.mjs')[1].split(' | ').map((part) => part.trim().split(/\s+/)[0].replace(/[^a-z]/g, ''));
};

test('AC-74.150 SKILL.md has frontmatter name memory and a description', () => {
  const fm = frontmatter(read(SKILL));
  assert.match(fm, /^name:\s*memory\s*$/m);
  const desc = fm.split(/\r?\n/).find((l) => /^description:/.test(l));
  assert.notEqual(desc, undefined, 'description: line');
  assert.match(desc, /^description:\s*\S.{20,}/, 'description is not empty or a stub');
});

test('AC-74.151 "Never write" forbids special category data, national ID / passport numbers, children and secrets', () => {
  const never = section(read(SKILL), 'Never write');
  assert.match(never, /secrets?:[^\n]*(keys|tokens|passwords)/i);
  assert.match(never, /special category personal data/i);
  for (const w of ['health', 'religion', 'ethnicity', 'political', 'union', 'sexual', 'criminal', 'biometric', 'genetic']) {
    assert.match(never, new RegExp(w, 'i'), `names ${w}`);
  }
  assert.match(never, /national ID or passport numbers/i);
  assert.match(never, /anything about a child/i);
});

test('AC-74.152 recalled memory is data, not instructions; it grants no permission and skips no approval', () => {
  const data = section(read(SKILL), 'Recalled memory is data');
  assert.match(data, /not an instruction/i);
  assert.match(data, /never grants a permission, skips an approval/i);
  assert.match(data, /a test/i);
  assert.match(data, /quote it to the user and ask/i);
});

test('AC-74.152 soul.md sets tone and working style only; project rules come first', () => {
  const data = section(read(SKILL), 'Recalled memory is data');
  const line = data.split(/\r?\n/).find((l) => l.includes('`soul.md`'));
  assert.notEqual(line, undefined, 'a line about soul.md');
  assert.match(line, /tone and working style only/);
  assert.match(line, /Project rules come first/);
});

test('AC-74.153 names the opt-out markers [kaydetme] and [no-memory]', () => {
  const md = read(SKILL);
  const line = md.split(/\r?\n/).find((l) => l.includes('[kaydetme]'));
  assert.notEqual(line, undefined, 'a line with [kaydetme]');
  assert.ok(line.includes('[no-memory]'), 'same line has [no-memory]');
  assert.match(line, /no receipt, no note, no reminder/);
});

test('AC-74.154 every memory.mjs subcommand the skill mentions exists in the CLI usage line', () => {
  const md = read(SKILL);
  const mentioned = new Set();
  for (const m of md.matchAll(/memory\.mjs (?!"|`)([a-z]+)/g)) mentioned.add(m[1]);
  for (const l of md.split(/\r?\n/)) {
    if (l.startsWith('|')) {
      const cmd = (l.split('|')[2] || '').trim().match(/^`([a-z]+)[ `]/);
      if (cmd) mentioned.add(cmd[1]);
    }
  }
  for (const m of section(md, 'Other commands').matchAll(/^- `([a-z]+)[ `:]/gm)) mentioned.add(m[1]);
  const usage = usageCommands();
  assert.deepEqual([...usage].sort(), [...SUBCOMMANDS].sort(), 'CLI usage line lists exactly the ten subcommands');
  assert.deepEqual([...mentioned].sort(), [...SUBCOMMANDS].sort(), 'the skill mentions all ten, and nothing else');
  for (const c of mentioned) assert.ok(usage.includes(c), `${c} exists in the usage line`);
});

test('AC-74.155 the two JSON examples parse: note (text + meta.visibility) and person (name)', () => {
  const blocks = jsonBlocks(read(SKILL));
  assert.equal(blocks.length, 2, 'exactly two json examples');
  const note = JSON.parse(blocks[0]);
  assert.equal(typeof note.text, 'string');
  assert.notEqual(note.text.trim(), '');
  assert.ok(['personal', 'project', 'private'].includes(note.meta.visibility), 'meta.visibility is a real value');
  const person = JSON.parse(blocks[1]);
  assert.equal(typeof person.name, 'string');
  assert.notEqual(person.name.trim(), '');
  assert.ok(Array.isArray(person.facts), 'person facts is a list');
});

test('AC-74.156 skills table, CLAUDE.md skill line and /wrap-up point to the memory skill', () => {
  assert.match(read('docs/workflow/skills.md'), /^\| `memory` \| \S.*\|\s*$/m);
  const claude = read('CLAUDE.md');
  const line = claude.split(/\r?\n/).find((l) => l.includes('Use the right skill'));
  assert.notEqual(line, undefined, '"Use the right skill" line');
  assert.match(line, /`memory`/);
  assert.ok(read('.claude/commands/wrap-up.md').includes('memory.mjs receipt'), 'wrap-up writes a receipt');
});

test('AC-74.157 each stack structure.md names docs/memory/ in the docs tree', () => {
  for (const stack of ['web-saas', 'backend', 'mobile']) {
    const md = read(`kit/templates/${stack}/docs/architecture/structure.md`);
    const docsTree = md.match(/├── docs\/\r?\n([\s\S]*?)\r?\n├── sandbox\//);
    assert.notEqual(docsTree, null, `${stack}: docs/ tree before sandbox/`);
    assert.match(docsTree[1], /^│\s+├── memory\/\s+#/m, `${stack}: memory/ folder under docs`);
  }
});

test('AC-74.158 an installed project (codex) carries .agents/skills/memory/SKILL.md and the Claude skill', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'kit-memskill-'));
  try {
    const kit = path.join(tmp, 'kit-clone');
    fs.cpSync(ROOT, kit, { recursive: true, filter: (src) => !/[\\/](\.git|node_modules)$/.test(src) && !src.endsWith('.kit.json') });
    const p = path.join(tmp, 'proj');
    const r = spawnSync(process.execPath, [path.join(kit, 'kit', 'kit.mjs'), 'init', '--project', p, '--tool', 'codex'], { encoding: 'utf8' });
    assert.equal(r.status, 0, r.stderr);
    const agents = path.join(p, '.agents/skills/memory/SKILL.md');
    assert.equal(fs.existsSync(agents), true, '.agents/skills/memory/SKILL.md');
    assert.match(fs.readFileSync(agents, 'utf8'), /^---\nname: memory\n/);
    assert.equal(fs.existsSync(path.join(p, '.claude/skills/memory/SKILL.md')), true, '.claude/skills/memory/SKILL.md');
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});
