// Run: node --test "kit/tests/*.test.mjs"
// 3.72.0 error-tracking skill: content contract of the skill file and the places that point to it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SKILL = '.claude/skills/error-tracking/SKILL.md';

function read(rel) {
  const p = path.join(ROOT, rel);
  assert.equal(fs.existsSync(p), true, `${rel} must exist`);
  return fs.readFileSync(p, 'utf8');
}
const lines = (s) => s.split(/\r?\n/);
const paragraphs = (s) => s.split(/\r?\n\s*\r?\n/);
const lineWith = (s, re) => lines(s).find((l) => re.test(l));

test('AC-72.1 SKILL.md has frontmatter name error-tracking', () => {
  const md = read(SKILL);
  const fm = md.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  assert.notEqual(fm, null, 'YAML frontmatter block');
  assert.match(fm[1], /^name:\s*error-tracking\s*$/m);
});

test('AC-72.1 description line mentions error tracking and G-006', () => {
  const md = read(SKILL);
  const fm = md.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  assert.notEqual(fm, null, 'YAML frontmatter block');
  const desc = lines(fm[1]).find((l) => /^description:/.test(l));
  assert.notEqual(desc, undefined, 'description: line');
  assert.match(desc, /error tracking/i);
  assert.match(desc, /G-006/);
});

test('AC-72.2 body names the three project stacks and both providers', () => {
  const md = read(SKILL);
  for (const word of ['Next.js', 'FastAPI', 'Expo', 'Sentry', 'GlitchTip']) {
    assert.ok(md.includes(word), `mentions ${word}`);
  }
});

test('AC-72.2 provider is asked with AskUserQuestion (same paragraph as GlitchTip)', () => {
  const md = read(SKILL);
  const para = paragraphs(md).find((p) => p.includes('AskUserQuestion') && p.includes('GlitchTip'));
  assert.notEqual(para, undefined, 'a paragraph with both AskUserQuestion and GlitchTip');
  assert.ok(para.includes('Sentry'), 'that paragraph also offers Sentry');
});

test('AC-72.3 privacy-first settings are present', () => {
  const md = read(SKILL);
  for (const s of ['sendDefaultPii: false', 'send_default_pii=False', 'max_request_body_size="never"', 'dataCollection']) {
    assert.ok(md.includes(s), `contains ${s}`);
  }
  assert.match(md, /prevent storing of ip addresses|ip (address )?storage/i);
});

test('AC-72.3 ATTACK: never turns PII sending on (vendor sample would leak)', () => {
  const md = read(SKILL);
  assert.doesNotMatch(md, /sendDefaultPii\s*:\s*true/i);
  assert.doesNotMatch(md, /send_default_pii\s*=\s*True/i);
});

test('AC-72.4 flag error_tracking with beforeSend and feature-flags doc, tested in both states', () => {
  const md = read(SKILL);
  for (const s of ['error_tracking', 'beforeSend', 'docs/operations/feature-flags.md']) {
    assert.ok(md.includes(s), `contains ${s}`);
  }
  assert.match(md, /both states/i);
});

test('AC-72.5 source maps are optional (same paragraph)', () => {
  const md = read(SKILL);
  const para = paragraphs(md).find((p) => /source ?maps?/i.test(p) && /optional/i.test(p));
  assert.notEqual(para, undefined, 'a paragraph mentioning source maps and optional');
});

test('AC-72.5 SENTRY_AUTH_TOKEN appears only in CI / secret / EAS context', () => {
  const md = read(SKILL);
  const hits = lines(md).filter((l) => l.includes('SENTRY_AUTH_TOKEN'));
  assert.ok(hits.length > 0, 'SENTRY_AUTH_TOKEN is mentioned');
  const bad = hits.filter((l) => !/\bCI\b|secret|EAS/i.test(l));
  assert.deepEqual(bad, []);
});

test('AC-72.5 ATTACK: no token value and no .env instruction for SENTRY_AUTH_TOKEN', () => {
  const md = read(SKILL);
  assert.deepEqual(lines(md).filter((l) => /SENTRY_AUTH_TOKEN\s*=\s*\S/.test(l)), [], 'no value assigned');
  const envLines = lines(md).filter((l) => l.includes('SENTRY_AUTH_TOKEN') && /\.env\b(?!\.example|-)/.test(l));
  assert.deepEqual(envLines, [], 'token is not written into a .env file');
});

test('AC-72.6 every price / quota line carries a URL and a date', () => {
  const md = read(SKILL);
  const priced = lines(md).filter((l) => /\$\s?\d/.test(l) || /\d[\d,.]*k?\s*(errors|events)\b/i.test(l));
  assert.ok(priced.length >= 1, 'at least one price or quota line');
  const bad = priced.filter((l) => !(/https:\/\//.test(l) && /\b\d{4}-\d{2}-\d{2}\b/.test(l)));
  assert.deepEqual(bad, []);
});

test('AC-72.6 versions are verified before setup (Context7 / official docs)', () => {
  const md = read(SKILL);
  const para = paragraphs(md).find((p) => /verify/i.test(p) && /Context7|official doc/i.test(p));
  assert.notEqual(para, undefined, 'paragraph with verify + Context7/official docs');
});

test('AC-72.7 messages.mjs template.07 points to error-tracking and GlitchTip', () => {
  const line = lineWith(read('.claude/hooks/messages.mjs'), /"template\.07"/);
  assert.notEqual(line, undefined, 'template.07 line');
  assert.ok(line.includes('error-tracking'), 'mentions error-tracking');
  assert.ok(line.includes('GlitchTip'), 'mentions GlitchTip');
});

test('AC-72.7 tr.json template.07 points to error-tracking and GlitchTip', () => {
  const val = JSON.parse(read('.claude/i18n/tr.json'))['template.07'];
  assert.equal(typeof val, 'string');
  assert.ok(val.includes('error-tracking'), 'mentions error-tracking');
  assert.ok(val.includes('GlitchTip'), 'mentions GlitchTip');
});

test('AC-72.7 skills.md table has an error-tracking row', () => {
  const row = lineWith(read('docs/workflow/skills.md'), /^\| `error-tracking`/);
  assert.notEqual(row, undefined, 'row starting with | `error-tracking`');
});

test('AC-72.7 release checklist error tracking line points to error-tracking', () => {
  const md = read('docs/operations/release-checklist.md');
  const hits = lines(md).filter((l) => /Error tracking/.test(l));
  assert.ok(hits.length >= 1, 'a line mentions Error tracking');
  assert.ok(hits.some((l) => l.includes('error-tracking')), 'it names the error-tracking skill');
});

for (const type of ['web-saas', 'backend', 'mobile']) {
  test(`AC-72.7 ${type} stack.md Error tracking row names GlitchTip and error-tracking`, () => {
    const row = lineWith(read(`kit/templates/${type}/docs/architecture/stack.md`), /^\| Error tracking \|/);
    assert.notEqual(row, undefined, 'row starting with | Error tracking |');
    assert.ok(row.includes('GlitchTip'), 'mentions GlitchTip');
    assert.ok(row.includes('error-tracking'), 'mentions error-tracking');
  });
}

test('AC-72.7 privacy-kvkk.md mentions GlitchTip', () => {
  assert.ok(read('docs/legal/privacy-kvkk.md').includes('GlitchTip'));
});

// ---- After security and code review ----

test('AC-72.8 PII hardening: no local variables, no breadcrumbs, no query string', () => {
  const md = read(SKILL);
  for (const s of ['include_local_variables=False', 'max_breadcrumbs=0', 'maxBreadcrumbs: 0', 'query_string']) {
    assert.ok(md.includes(s), `contains ${s}`);
  }
});

test('AC-72.8 rule: error messages and exception text must not carry personal data', () => {
  const md = read(SKILL);
  const para = paragraphs(md).find((p) => /personal data/i.test(p) && /message/i.test(p));
  assert.notEqual(para, undefined, 'a paragraph with personal data and message');
});

test('AC-72.9 flag reading names the existing flag helpers of the three stacks', () => {
  const md = read(SKILL);
  for (const s of ['isEnabled', 'is_enabled', 'useFlag']) {
    assert.ok(md.includes(s), `contains ${s}`);
  }
});

test('AC-72.9 beforeSend reads the flag with no network or database call', () => {
  const md = read(SKILL);
  const para = paragraphs(md).find((p) => p.includes('beforeSend') && /no (network|database|DB)\b|without (a )?(network|database)/i.test(p));
  assert.notEqual(para, undefined, 'a paragraph with beforeSend and a no network/database rule');
});

test('AC-72.9 unknown flag value means the event is not sent', () => {
  const md = read(SKILL);
  const para = paragraphs(md).find((p) => /unknown|not known/i.test(p) && /drop|dropped|not sent|null/i.test(p));
  assert.notEqual(para, undefined, 'a paragraph with unknown + drop/not sent/null');
});

test('AC-72.9 code returns null (JS) and None (Python) when the flag is off', () => {
  const md = read(SKILL);
  assert.match(md, /return null\b|: null\b/, 'contains "return null" or ": null"');
  assert.ok(md.includes('return None'), 'contains "return None"');
});

test('AC-72.10 wizard is never pinned to @latest', () => {
  assert.doesNotMatch(read(SKILL), /@latest/);
});

test('AC-72.10 every paragraph with @sentry/wizard says to run it in your own terminal', () => {
  const md = read(SKILL);
  const bad = paragraphs(md).filter((p) => p.includes('@sentry/wizard') && !/own terminal/i.test(p));
  assert.deepEqual(bad, []);
});

test('AC-72.11 session tracking is switched off with the right option names', () => {
  const md = read(SKILL);
  assert.ok(md.includes('enableAutoSessionTracking: false'), 'React Native / JS option');
  assert.ok(md.includes('auto_session_tracking=False'), 'Python option');
});

test('AC-72.11 ATTACK: wrong React Native option name autoSessionTracking is absent', () => {
  assert.doesNotMatch(read(SKILL), /\bautoSessionTracking/);
});

test('AC-72.12 template .env.example files define the DSN names', () => {
  const cases = [
    ['web-saas', 'NEXT_PUBLIC_SENTRY_DSN='],
    ['backend', 'SENTRY_DSN='],
    ['mobile', 'EXPO_PUBLIC_SENTRY_DSN='],
  ];
  for (const [type, prefix] of cases) {
    const line = lines(read(`kit/templates/${type}/.env.example`)).find((l) => l.startsWith(prefix));
    assert.notEqual(line, undefined, `${type} .env.example has a line starting with ${prefix}`);
  }
});

test('AC-72.12 SKILL mentions all three DSN env names', () => {
  const md = read(SKILL);
  for (const s of ['NEXT_PUBLIC_SENTRY_DSN', 'SENTRY_DSN', 'EXPO_PUBLIC_SENTRY_DSN']) {
    assert.ok(md.includes(s), `contains ${s}`);
  }
});

test('AC-72.12 SKILL adds the name to .env.example if it is missing', () => {
  const md = read(SKILL);
  const para = paragraphs(md).find((p) => /if (it is |they are )?missing|when missing/i.test(p) && p.includes('.env.example'));
  assert.notEqual(para, undefined, 'a paragraph with "if missing" and .env.example');
});

test('AC-72.13 output check looks for cookies and ip_address in a sent event', () => {
  const md = read(SKILL);
  const para = paragraphs(md).find((p) => /inspect|check/i.test(p) && /cookies/i.test(p) && p.includes('ip_address'));
  assert.notEqual(para, undefined, 'a paragraph with inspect/check, cookies and ip_address');
});

test('AC-72.14 roadmap G-006 line points to error-tracking', () => {
  const line = lineWith(read('docs/product/roadmap.md'), /G-006/);
  assert.notEqual(line, undefined, 'a G-006 line');
  assert.ok(line.includes('error-tracking'), 'G-006 line names error-tracking');
});

test('AC-72.14 CLAUDE.md "Use the right skill" line names error-tracking', () => {
  const line = lineWith(read('CLAUDE.md'), /Use the right skill/);
  assert.notEqual(line, undefined, 'the Use the right skill line');
  assert.ok(line.includes('error-tracking'), 'it names error-tracking');
});

test('AC-72.14 web-saas .gitignore.append ignores .env.sentry-build-plugin', () => {
  const hit = lines(read('kit/templates/web-saas/.gitignore.append')).map((l) => l.trim()).includes('.env.sentry-build-plugin');
  assert.equal(hit, true, 'a line equal to .env.sentry-build-plugin');
});

for (const type of ['web-saas', 'mobile']) {
  test(`AC-72.14 ${type} stack.md source map checklist lines name error-tracking`, () => {
    const md = read(`kit/templates/${type}/docs/architecture/stack.md`);
    const items = lines(md).filter((l) => /^- \[ \]/.test(l) && /source map/i.test(l));
    assert.ok(items.length >= 1, 'at least one source map checklist line');
    assert.deepEqual(items.filter((l) => !l.includes('error-tracking')), []);
  });
}
