#!/usr/bin/env node
// Council tally (the stage-2 aggregate of Karpathy's llm-council): counts the anonymous rankings and finding votes in the minutes
// and writes the "## 3. Toplu sıralama" section into them. Protocol: .claude/board/council.md
//   node .claude/hooks/council.mjs docs/workflow/council/<tutanak>.md
// The tally is done in code: a model cannot add up the ranking wrong, the chair cannot change the count.
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
import { sections, findSection } from './status-read.mjs';

const VOTE = /^\s*[-*]?\s*([A-Z]\d+)\s*[:=]\s*(DOĞRU|YANLIŞ|ABARTILI)(?!\p{L})/gimu; // \b does not work on Turkish letters (Ş)

// Numbered "Görüş X" lines after "SIRALAMA:". Without the heading or numbered lines it returns empty:
// guessing an order from prose silently gives a wrong count, so that review counts as invalid.
export function parseRanking(text) {
  const part = text.split(/SIRALAMA:/i)[1] ?? '';
  return [...new Set([...part.matchAll(/^\s*\d+\.\s*\**\s*Görüş\s+([A-Z])\b/gmu)].map((m) => m[1]))];
}

export function parseBallots(text) {
  const part = text.split(/OYLAR:/i)[1]?.split(/SIRALAMA:/i)[0] ?? '';
  return Object.fromEntries([...part.matchAll(VOTE)].map((m) => [m[1].toUpperCase(), m[2].toLocaleUpperCase('tr')]));
}

// From the first opinions: finding ids, severity and (in a decision council) the proposed option
export function parseOpinions(firstOpinions) {
  const opinions = {};
  for (const [title, body] of Object.entries(sections(firstOpinions, '### '))) {
    const label = title.match(/Görüş\s+([A-Z])/u)?.[1];
    if (!label) continue;
    const findings = [...body.matchAll(/^\s*[-*]?\s*([A-Z]\d+)\s*\[(KRİTİK|ÖNEMLİ|ÖNERİ)\]/gmu)].map((m) => ({ id: m[1], severity: m[2] }));
    const proposal = body.match(/^\s*ÖNERİ:\s*(.+)$/mu)?.[1].trim() ?? null;
    opinions[label] = { findings, proposal };
  }
  return opinions;
}

export function countVotes(minutes) {
  const b = sections(minutes);
  const opinions = parseOpinions(findSection(b, '1.'));
  const reviews = Object.entries(sections(findSection(b, '2.'), '### '))
    .map(([title, body]) => ({ reviewer: title.match(/İnceleyen:\s*([A-Z])/u)?.[1] ?? '?', ranking: parseRanking(body), ballots: parseBallots(body) }));

  const positions = {};
  for (const i of reviews) i.ranking.forEach((g, n) => (positions[g] ??= []).push(n + 1));
  const ranking = Object.entries(positions)
    .map(([opinion, k]) => ({ opinion, average: Math.round((k.reduce((a, x) => a + x, 0) / k.length) * 100) / 100, votes: k.length }))
    .sort((x, y) => x.average - y.average || x.opinion.localeCompare(y.opinion));

  const findings = Object.values(opinions).flatMap((g) => g.findings).map((f) => {
    const s = { DOĞRU: 0, YANLIŞ: 0, ABARTILI: 0 };
    for (const i of reviews) if (i.ballots[f.id]) s[i.ballots[f.id]]++;
    const objections = s.YANLIŞ + s.ABARTILI;
    return { ...f, ...s, disputed: objections > 0 && objections >= s.DOĞRU };
  });

  const proposals = Object.values(opinions).map((g) => g.proposal).filter(Boolean);
  const voteCounts = {};
  for (const o of proposals) voteCounts[o] = (voteCounts[o] ?? 0) + 1;
  const options = Object.entries(voteCounts).map(([option, votes]) => ({ option, votes })).sort((x, y) => y.votes - x.votes);

  // Consensus: in a decision council the share of the top option, in a meeting the share of "doğru" among finding votes
  const totalVotes = findings.reduce((t, f) => t + f.DOĞRU + f.YANLIŞ + f.ABARTILI, 0);
  const consensus = options.length
    ? Math.round((options[0].votes / proposals.length) * 100)
    : totalVotes ? Math.round((findings.reduce((t, f) => t + f.DOĞRU, 0) / totalVotes) * 100) : null;
  const invalid = reviews.filter((i) => !i.ranking.length).map((i) => i.reviewer);
  return { ranking, findings, options, consensus, reviewerCount: reviews.length, invalid };
}

export function renderSection(s) {
  const lines = [];
  lines.push(`**Uzlaşma:** ${s.consensus == null ? '-' : `%${s.consensus}`}`);
  lines.push(`**Tartışmalı:** ${s.findings.filter((f) => f.disputed).length}`, '');
  if (s.invalid?.length) lines.push(`> Uyarı: ${s.invalid.join(', ')} incelemesinde biçimli SIRALAMA yok; sıralamaya katılmadı (oyları sayıldı). İnceleyenden SIRALAMA'yı yeniden iste.`, '');
  if (s.ranking.length) {
    lines.push('| Görüş | Ortalama sıra | Sıralayan |', '|---|---|---|');
    for (const r of s.ranking) lines.push(`| ${r.opinion} | ${r.average} | ${r.votes} |`);
    lines.push('');
  }
  if (s.options.length) {
    lines.push('| Seçenek | İlk görüşte öneren |', '|---|---|');
    for (const o of s.options) lines.push(`| ${o.option} | ${o.votes} |`);
    lines.push('');
  }
  if (s.findings.length) {
    lines.push('| Bulgu | Önem | Doğru | Yanlış | Abartılı | Durum |', '|---|---|---|---|---|---|');
    for (const f of s.findings) lines.push(`| ${f.id} | ${f.severity} | ${f.DOĞRU} | ${f.YANLIŞ} | ${f.ABARTILI} | ${f.disputed ? (f.severity === 'KRİTİK' ? 'tartışmalı · kullanıcıya sor' : 'tartışmalı') : 'kabul'} |`);
    lines.push('');
  }
  return lines.join('\n');
}

// Replaces the "## 3. ..." section in the minutes (if any), otherwise inserts before "## 4." or at the end
export function writeMinutes(minutes, s) {
  const section = `## 3. Toplu sıralama\n\n${renderSection(s).trimEnd()}\n\n`;
  // Replace with a function: sequences like "$&", "$$" in an option name must not get their special meaning
  if (/^## 3\./m.test(minutes)) return minutes.replace(/^## 3\.[^\n]*\n[\s\S]*?(?=^## |(?![\s\S]))/m, () => section);
  if (/^## 4\./m.test(minutes)) return minutes.replace(/^## 4\./m, () => `${section}## 4.`);
  return `${minutes.trimEnd()}\n\n${section}`;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const file = process.argv[2];
  if (!file || !fs.existsSync(file)) { console.error('Kullanım: node .claude/hooks/council.mjs <tutanak.md>'); process.exit(1); }
  const text = fs.readFileSync(file, 'utf8');
  const s = countVotes(text);
  if (!s.reviewerCount) { console.error('Tutanakta "## 2. Çapraz inceleme" altında "### İnceleyen: X" bölümü yok.'); process.exit(1); }
  fs.writeFileSync(file, writeMinutes(text, s));
  console.log(renderSection(s));
}
