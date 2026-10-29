// Run: node --test "kit/tests/*.test.mjs"
// Council tally: anonymous ranking, finding votes, decision council vote split, writing into the minutes.
// 3.49.0: minutes are English (the Turkish minutes words are covered as "not understood" in council-lang.test.mjs).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseRanking, parseBallots, countVotes, writeMinutes } from '../../.claude/hooks/council.mjs';

const MEETING = `# Council: plan · G-012 sign-up form
**Date:** 2026-10-12 · **Type:** plan

## 1. First opinions

### Opinion A
- A1 [CRITICAL] api/signup.ts:12 — account is active before the email check — add verification
- A2 [SUGGESTION] form text is long

### Opinion B
- B1 [IMPORTANT] no RLS policy — add a policy

### Opinion C
No findings.

## 2. Cross review

### Reviewer: A
B is more concrete than C.
VOTES:
B1: AGREE
RANKING:
1. Opinion B
2. Opinion C

### Reviewer: B
VOTES:
A1: OVERSTATED
A2: agree
RANKING:
1. Opinion A
2. Opinion C

### Reviewer: C
VOTES:
- A1: DISAGREE
- B1: AGREE
RANKING:
1. Opinion B
2. Opinion A

## 4. Chair decision
**Decision:** CONDITIONAL
`;

test('council: ranking and vote parsing (Karpathy format)', () => {
  assert.deepEqual(parseRanking('Opinion A is good.\nRANKING:\n1. Opinion C\n2. Opinion A\n'), ['C', 'A']);
  assert.deepEqual(parseRanking('Opinion B is better than Opinion A'), [], 'without RANKING no order is guessed from prose');
  assert.deepEqual(parseRanking('RANKING:\n1. **Opinion B**\n2. Opinion A'), ['B', 'A'], 'bold text');
  const s = countVotes('## 1. First opinions\n### Opinion A\nRECOMMENDATION: $& plan\n### Opinion B\nRECOMMENDATION: $$ 25/mo\n## 2. Cross review\n### Reviewer: A\nOpinion B is good.\n### Reviewer: B\nRANKING:\n1. Opinion A\n## 4. Chair decision\n');
  assert.deepEqual(s.invalid, ['A']);
  const written = writeMinutes('## 4. Chair decision\n', s);
  assert.match(written, /\| \$& plan \| 1 \|[\s\S]*\| \$\$ 25\/mo \| 1 \|/, '$ sequences are written as they are');
  assert.equal(writeMinutes(written, s), written);
  assert.deepEqual(Object.keys(parseBallots('VOTES:\nA1: agree\n- B2 = OVERSTATED\nRANKING:\n1. Opinion A')).sort(), ['A1', 'B2']);
});

test('council: aggregate ranking, disputed critical finding, consensus', () => {
  const s = countVotes(MEETING);
  assert.equal(s.reviewerCount, 3);
  assert.deepEqual(s.ranking.map((r) => [r.opinion, r.average, r.votes]), [['B', 1, 2], ['A', 1.5, 2], ['C', 2, 2]]);
  const a1 = s.findings.find((f) => f.id === 'A1');
  assert.equal(a1.severity, 'CRITICAL');
  assert.equal(a1.disputed, true);
  assert.equal(s.findings.find((f) => f.id === 'B1').disputed, false);
  assert.equal(s.consensus, 60, '3 of 5 votes agree');
  const written = writeMinutes(MEETING, s);
  assert.match(written, /## 3\. Overall ranking[\s\S]*\| A1 \| CRITICAL \| 0 \| 1 \| 1 \| disputed · ask the user \|[\s\S]*## 4\. Chair decision/);
  assert.equal(writeMinutes(written, s), written, 'running again does not duplicate the section');
});

test('council: in a decision council the option votes set the consensus', () => {
  const text = '## 1. First opinions\n### Opinion A\nRECOMMENDATION: Supabase\n### Opinion B\nRECOMMENDATION: Supabase\n### Opinion C\nRECOMMENDATION: Neon\n## 2. Cross review\n### Reviewer: A\nRANKING:\n1. Opinion B\n2. Opinion C\n';
  const s = countVotes(text);
  assert.deepEqual(s.options, [{ option: 'Supabase', votes: 2 }, { option: 'Neon', votes: 1 }]);
  assert.equal(s.consensus, 67);
});

test('council: the dashboard reads the minutes (decision, consensus, ranking with ids); agents are defined', async () => {
  const fs = await import('node:fs');
  const os = await import('node:os');
  const path = await import('node:path');
  const { councilMinutes } = await import('../../.claude/hooks/dashboard-data.mjs');
  const p = fs.mkdtempSync(path.join(os.tmpdir(), 'council-'));
  assert.deepEqual(councilMinutes(p), []);
  fs.mkdirSync(path.join(p, 'docs/workflow/council'), { recursive: true });
  const s = countVotes(MEETING);
  const minutes = `${writeMinutes(MEETING, s).replace('**Decision:** CONDITIONAL', '**Decision:** CONDITIONAL\n**Eliminated:** 1')}\n## IDs\nA = board-architect (sonnet) · B = security-auditor (sonnet) · C = board-product (haiku)\n`;
  fs.writeFileSync(path.join(p, 'docs/workflow/council/2026-10-12-plan-signup.md'), minutes);
  const [k] = councilMinutes(p);
  assert.equal(k.topic, 'plan · G-012 sign-up form');
  assert.equal(k.kind, 'plan');
  assert.equal(k.decision, 'CONDITIONAL');
  assert.equal(k.consensus, 60);
  assert.equal(k.disputed, 1);
  assert.equal(k.eliminated, 1);
  assert.deepEqual(k.ranking[0], { opinion: 'B', who: 'security-auditor (sonnet)', average: '1' });
  fs.rmSync(p, { recursive: true, force: true });
  const { fileURLToPath } = await import('node:url');
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
  for (const [agent, model] of [['board-chair', 'opus'], ['council-advisor', 'sonnet']]) {
    assert.match(fs.readFileSync(path.join(root, `.claude/agents/${agent}.md`), 'utf8'), new RegExp(`^model: ${model}$`, 'm'), agent);
  }
});

test('council audit: a partial or unknown-letter ranking does not count; an unvoted critical finding is not "accepted"', () => {
  const minutes = MEETING.replace('RANKING:\n1. Opinion B\n2. Opinion A\n', 'RANKING:\n1. Opinion B\n')
    .replace('RANKING:\n1. Opinion A\n2. Opinion C\n', 'RANKING:\n1. Opinion A\n2. Opinion Z\n');
  const s = countVotes(minutes);
  assert.deepEqual(s.invalid.sort(), ['B', 'C']);
  assert.deepEqual(s.ranking.map((r) => [r.opinion, r.votes]), [['B', 1], ['C', 1]], 'only A\'s full ranking counts');
  const none = countVotes(MEETING.replace(/VOTES:[\s\S]*?(?=RANKING:)/g, ''));
  const a1 = none.findings.find((f) => f.id === 'A1');
  assert.equal(a1.unvoted, true);
  assert.match(writeMinutes('', none), /\| A1 \| CRITICAL \| 0 \| 0 \| 0 \| no votes · ask the user \|/);
});
