#!/usr/bin/env node
// Council tally (the stage-2 aggregate of Karpathy's llm-council): counts the anonymous rankings and finding votes in the minutes
// and writes the "## 3. Overall ranking" section into them. Protocol: .claude/board/council.md
//   node .claude/hooks/council.mjs docs/workflow/council/<minutes>.md
// The tally is done in code: a model cannot add up the ranking wrong, the chair cannot change the count.
import fs from 'node:fs';
import { sections, findSection } from './status-read.mjs';
import { isMain } from './shared.mjs';

const VOTE = /^\s*[-*]?\s*([A-Z]\d+)\s*[:=]\s*(AGREE|DISAGREE|OVERSTATED)(?!\p{L})/gimu;
const isCritical = (severity) => severity === 'CRITICAL';

const W = {
  heading: '3. Overall ranking', consensus: 'Consensus', disputed: 'Disputed', percent: (n) => `${n}%`,
  warning: (who) => `> Warning: the review by ${who} has no well-formed, complete RANKING (each Opinion once); it was left out of the ranking (its votes were counted). Ask the reviewer for the RANKING again.`,
  ranking: '| Opinion | Average rank | Rankers |', options: '| Option | Proposed in first opinions |',
  findings: '| Finding | Severity | Agree | Disagree | Overstated | Status |',
  noVotes: 'no votes', isDisputed: 'disputed', ask: 'ask the user', accepted: 'accepted',
};

// Numbered "Opinion X" lines after "RANKING:". Without the heading or numbered lines it returns empty:
// guessing an order from prose silently gives a wrong count, so that review counts as invalid.
export function parseRanking(text) {
  const part = text.split(/RANKING:/i)[1] ?? '';
  return [...new Set([...part.matchAll(/^\s*\d+\.\s*\**\s*Opinion\s+([A-Z])\b/gmu)].map((m) => m[1]))];
}

export function parseBallots(text) {
  const part = text.split(/VOTES:/i)[1]?.split(/RANKING:/i)[0] ?? '';
  // Plain uppercase: a Turkish locale would turn "disagree" into "DİSAGREE"
  return Object.fromEntries([...part.matchAll(VOTE)].map((m) => [m[1].toUpperCase(), m[2].toUpperCase()]));
}

// From the first opinions: finding ids, severity and (in a decision council) the proposed option
export function parseOpinions(firstOpinions) {
  const opinions = {};
  for (const [title, body] of Object.entries(sections(firstOpinions, '### '))) {
    const label = title.match(/Opinion\s+([A-Z])/u)?.[1];
    if (!label) continue;
    const findings = [...body.matchAll(/^\s*[-*]?\s*([A-Z]\d+)\s*\[(CRITICAL|IMPORTANT|SUGGESTION)\]/gmu)].map((m) => ({ id: m[1], severity: m[2] }));
    const proposal = body.match(/^\s*RECOMMENDATION:\s*(.+)$/mu)?.[1].trim() ?? null;
    opinions[label] = { findings, proposal };
  }
  return opinions;
}

export function countVotes(minutes) {
  const b = sections(minutes);
  const opinions = parseOpinions(findSection(b, '1.'));
  // Only "### Reviewer: X" sections are reviews
  const reviews = Object.entries(sections(findSection(b, '2.'), '### ')).filter(([title]) => /^Reviewer:/u.test(title))
    .map(([title, body]) => ({ reviewer: title.match(/Reviewer:\s*([A-Z])/u)?.[1] ?? '?', ranking: parseRanking(body), ballots: parseBallots(body) }));

  // A ranking counts only as a full order of the other opinions (or of all of them), each once: a partial
  // "1. Opinion D" would give D a perfect average, and a letter with no opinion means nothing
  const labels = Object.keys(opinions);
  const complete = (i) => {
    const want = labels.filter((g) => g !== i.reviewer);
    const got = [...new Set(i.ranking)];
    return got.length === i.ranking.length && [want, labels].some((w) => w.length === got.length && w.every((g) => got.includes(g)));
  };
  const valid = labels.length ? reviews.filter(complete) : reviews;
  const positions = {};
  for (const i of valid) i.ranking.forEach((g, n) => (positions[g] ??= []).push(n + 1));
  const ranking = Object.entries(positions)
    .map(([opinion, k]) => ({ opinion, average: Math.round((k.reduce((a, x) => a + x, 0) / k.length) * 100) / 100, votes: k.length }))
    .sort((x, y) => x.average - y.average || x.opinion.localeCompare(y.opinion));

  const findings = Object.values(opinions).flatMap((g) => g.findings).map((f) => {
    const s = { AGREE: 0, DISAGREE: 0, OVERSTATED: 0 };
    for (const i of reviews) if (i.ballots[f.id]) s[i.ballots[f.id]]++;
    const objections = s.DISAGREE + s.OVERSTATED;
    // No vote at all is not acceptance: a reviewer skipped VOTES or the id
    return { ...f, ...s, disputed: objections > 0 && objections >= s.AGREE, unvoted: objections + s.AGREE === 0 };
  });

  const proposals = Object.values(opinions).map((g) => g.proposal).filter(Boolean);
  const voteCounts = {};
  for (const o of proposals) voteCounts[o] = (voteCounts[o] ?? 0) + 1;
  const options = Object.entries(voteCounts).map(([option, votes]) => ({ option, votes })).sort((x, y) => y.votes - x.votes);

  // Consensus: in a decision council the share of the top option, in a meeting the share of "agree" among finding votes
  const totalVotes = findings.reduce((t, f) => t + f.AGREE + f.DISAGREE + f.OVERSTATED, 0);
  const consensus = options.length
    ? Math.round((options[0].votes / proposals.length) * 100)
    : totalVotes ? Math.round((findings.reduce((t, f) => t + f.AGREE, 0) / totalVotes) * 100) : null;
  const invalid = reviews.filter((i) => !valid.includes(i)).map((i) => i.reviewer);
  return { ranking, findings, options, consensus, reviewerCount: reviews.length, invalid };
}

export function renderSection(s) {
  const lines = [];
  lines.push(`**${W.consensus}:** ${s.consensus == null ? '-' : W.percent(s.consensus)}`);
  lines.push(`**${W.disputed}:** ${s.findings.filter((f) => f.disputed).length}`, '');
  if (s.invalid?.length) lines.push(W.warning(s.invalid.join(', ')), '');
  if (s.ranking.length) {
    lines.push(W.ranking, '|---|---|---|');
    for (const r of s.ranking) lines.push(`| ${r.opinion} | ${r.average} | ${r.votes} |`);
    lines.push('');
  }
  if (s.options.length) {
    lines.push(W.options, '|---|---|');
    for (const o of s.options) lines.push(`| ${o.option} | ${o.votes} |`);
    lines.push('');
  }
  if (s.findings.length) {
    lines.push(W.findings, '|---|---|---|---|---|---|');
    const ask = (f, word) => (isCritical(f.severity) ? `${word} · ${W.ask}` : word);
    for (const f of s.findings) lines.push(`| ${f.id} | ${f.severity} | ${f.AGREE} | ${f.DISAGREE} | ${f.OVERSTATED} | ${f.unvoted ? ask(f, W.noVotes) : f.disputed ? ask(f, W.isDisputed) : W.accepted} |`);
    lines.push('');
  }
  return lines.join('\n');
}

// Replaces the "## 3. ..." section in the minutes (if any), otherwise inserts before "## 4." or at the end
export function writeMinutes(minutes, s) {
  const section = `## ${W.heading}\n\n${renderSection(s).trimEnd()}\n\n`;
  // Replace with a function: sequences like "$&", "$$" in an option name must not get their special meaning
  if (/^## 3\./m.test(minutes)) return minutes.replace(/^## 3\.[^\n]*\n[\s\S]*?(?=^## |(?![\s\S]))/m, () => section);
  if (/^## 4\./m.test(minutes)) return minutes.replace(/^## 4\./m, () => `${section}## 4.`);
  return `${minutes.trimEnd()}\n\n${section}`;
}

if (isMain(import.meta.url)) {
  const file = process.argv[2];
  if (!file || !fs.existsSync(file)) { console.error('Usage: node .claude/hooks/council.mjs <minutes.md>'); process.exit(1); }
  const text = fs.readFileSync(file, 'utf8');
  const s = countVotes(text);
  if (!s.reviewerCount) { console.error('The minutes have no "### Reviewer: X" section under "## 2. Cross review".'); process.exit(1); }
  fs.writeFileSync(file, writeMinutes(text, s));
  console.log(renderSection(s));
}
