// Run: node --test "kit/tests/try-lock.test.mjs"
// Fast lane (/try → /lock): the command text contract. Exact tokens are checked, not prose.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CORE_COMMANDS } from '../../.claude/hooks/tools.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const read = (rel) => {
  const file = path.join(ROOT, rel);
  assert.equal(fs.existsSync(file), true, `${rel} exists`);
  return fs.readFileSync(file, 'utf8');
};
const missing = (text, tokens) => tokens.filter((t) => !text.includes(t));
const hasDescription = (text) => /^---\r?\n(?:[^\n]*\r?\n)*?description:[ \t]*\S[^\n]*\r?\n(?:[^\n]*\r?\n)*?---\r?\n/.test(text);
// Text of one "## " section, up to the next "## " heading
const section = (text, heading) => {
  const start = text.indexOf(heading);
  assert.notEqual(start, -1, `${heading} exists`);
  const rest = text.slice(start + heading.length);
  const end = rest.search(/^## /m);
  return end === -1 ? rest : rest.slice(0, end);
};

test('fast lane try.md: has a description and every token of the fast-lane contract', () => {
  const text = read('.claude/commands/try.md');
  assert.equal(hasDescription(text), true, 'frontmatter description');
  assert.deepEqual(missing(text, ['try/<topic>', 'try:fake', '*.fake.*', 'docs/product/try/<topic>.md', '--skip "try round"', 'NODE_ENV', '.env.example', '/rollback', 'AskUserQuestion']), []);
});

test('fast lane try.md: names the forbidden things (localhost, Expo, git push) and does not use preview.mjs', () => {
  const text = read('.claude/commands/try.md');
  assert.deepEqual(missing(text, ['localhost', 'Expo', 'git push']), []);
  assert.equal(text.includes('preview.mjs'), false);
});

test('fast lane lock.md: has a description and every token of the review contract', () => {
  const text = read('.claude/commands/lock.md');
  assert.equal(hasDescription(text), true, 'frontmatter description');
  assert.deepEqual(missing(text, ['git merge --squash', 'git diff main...try/<topic>', 'test-writer', 'security-auditor', 'code-reviewer', 'docs/product/prd.md', 'keep', 'fix', 'rewrite', '.claude/commands/build.md']), []);
});

test('AC-13 lock.md: the headings Setup, Criteria, Review, Tests, Harden, Merge come in this order', () => {
  const headings = read('.claude/commands/lock.md').split(/\r?\n/).filter((l) => /^#{1,6}\s/.test(l));
  const index = ['Setup', 'Criteria', 'Review', 'Tests', 'Harden', 'Merge'].map((w) => headings.findIndex((h) => new RegExp(`\\b${w}\\b`).test(h)));
  assert.equal(index.every((i) => i !== -1), true, `a heading for each word, got ${JSON.stringify(index)}`);
  assert.deepEqual(index, [...index].sort((a, b) => a - b), 'ascending order');
  assert.equal(new Set(index).size, 6, 'six different headings');
});

test('AC-16 lock.md: the new tests must be green on first run', () => {
  assert.equal(read('.claude/commands/lock.md').includes('green on first run'), true);
});

test('fast lane release.md: stays blocked while trial code remains (try:fake, *.fake.*, origin/try/)', () => {
  assert.deepEqual(missing(read('.claude/commands/release.md'), ['try:fake', '*.fake.*', 'origin/try/']), []);
});

test('fast lane start.md: Step 4a, 4b and 4c exist in order, 4c mentions /try, and Step 5 comes after them', () => {
  const text = read('.claude/commands/start.md');
  const at = ['## Step 4a', '## Step 4b', '## Step 4c', '## Step 5'].map((h) => text.indexOf(h));
  assert.equal(at.every((i) => i !== -1), true, `all four headings exist, got ${JSON.stringify(at)}`);
  assert.deepEqual(at, [...at].sort((a, b) => a - b), 'order 4a, 4b, 4c, 5');
  assert.equal(section(text, '## Step 4c').includes('/try'), true, 'Step 4c mentions /try');
});

test('fast lane build.md: mentions /try', () => {
  assert.equal(read('.claude/commands/build.md').includes('/try'), true);
});

test('fast lane tools.mjs: try and lock are core commands', () => {
  assert.deepEqual(['try', 'lock'].filter((c) => !CORE_COMMANDS.includes(c)), []);
});

test('fast lane roadmap: G-005 and G-006 appear after the Phase 3 heading', () => {
  const text = read('docs/product/roadmap.md');
  const start = text.indexOf('## Phase 3');
  assert.notEqual(start, -1, 'Phase 3 heading exists');
  const after = text.slice(start);
  assert.deepEqual(['G-005', 'G-006'].filter((g) => !after.includes(g)), []);
});

test('fast lane templates: every structure.json maps docs/product/try', () => {
  for (const type of ['web-saas', 'mobile', 'backend']) {
    const rel = `kit/templates/${type}/.claude/structure.json`;
    assert.equal(read(rel).includes('docs/product/try'), true, rel);
  }
});
