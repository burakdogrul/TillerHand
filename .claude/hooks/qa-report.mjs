#!/usr/bin/env node
// Browser QA report (F-18): written from the JUnit result of the /qa run, so "it works" needs a green test behind it.
//   node .claude/hooks/qa-report.mjs [junit file]   default: test-results-qa/junit.xml (the /qa run has its own output folder:
//   Playwright empties its output folder at every run, a shared one would delete the acceptance report and the evidence)
//   → docs/quality/qa/<YYYY-MM-DD-HHMMSS>.md: one row per PRD criterion (geçti / kaldı / koşulmadı), the first failure line,
//   evidence test-results-qa/shots/<Ö-id>.png copied to .previews/qa-<stamp>/ (kept out of git, outlives the next run).
//   Exit code: 0 nothing failed, 1 a criterion failed, 2 nothing to report (no JUnit file, no PRD criterion, no test ran).
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { prdCriteria, junitCases } from './dashboard-data.mjs';
import { findRoot } from './shared.mjs';

// A pipe would split the table cell (the dashboard's table reader does not know \|)
const cell = (s) => String(s ?? '').split(/\r?\n/)[0].trim().slice(0, 160).replace(/\|/g, '/');
const pad = (n) => String(n).padStart(2, '0');
// Playwright's JUnit failure text starts with the test title; the reason is the first "Error" line
const reasonLine = (s) => (s ?? '').split(/\r?\n/).find((l) => /^\s*Error\b/.test(l)) ?? (s ?? '').split(/\r?\n/).find((l) => l.trim());
const STALE_MIN = 30;

export function qaReport(root, junit = 'test-results-qa/junit.xml', now = new Date()) {
  const none = (why) => ({ code: 2, text: `QA raporu yazılmadı: ${why}` });
  let xml, age;
  try { xml = fs.readFileSync(path.resolve(root, junit), 'utf8'); age = (now - fs.statSync(path.resolve(root, junit)).mtimeMs) / 60000; } catch {
    return none(`${junit} yok. Testleri JUnit raporuyla çalıştır (qa.md adım 4).`);
  }
  let prd;
  try { prd = fs.readFileSync(path.join(root, 'docs/product/prd.md'), 'utf8'); } catch { return none('docs/product/prd.md yok.'); }
  const criteria = prdCriteria(prd);
  if (!criteria.length) return none('PRD\'de kimlikli kabul kriteri yok (`- [ ] Ö-01.1: ...`).');
  const results = new Map();
  for (const c of junitCases(xml)) {
    for (const k of c.keys) {
      if (results.get(k)?.failed) continue; // a failure wins over a later pass (retry, a second test)
      results.set(k, { failed: c.failed, reason: c.reason });
    }
  }
  const stamp = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const shots = path.join(root, '.previews', `qa-${stamp}`);
  let linked = false;
  try { linked = fs.lstatSync(path.join(root, '.previews')).isSymbolicLink(); } catch { /* missing: created below */ }
  const rows = criteria.map((k) => {
    const r = results.get(k.key);
    let evidence = '';
    const shot = path.join(root, path.dirname(junit), 'shots', `${k.id}.png`);
    if (r && !linked && fs.existsSync(shot)) {
      fs.mkdirSync(shots, { recursive: true });
      fs.copyFileSync(shot, path.join(shots, `${k.id}.png`));
      evidence = `.previews/qa-${stamp}/${k.id}.png`;
    }
    return { criterion: `${k.id} ${k.text}`, result: !r ? 'koşulmadı' : r.failed ? 'kaldı' : 'geçti', evidence, note: r?.failed ? reasonLine(r.reason) : '' };
  });
  const count = (x) => rows.filter((r) => r.result === x).length;
  if (!count('geçti') && !count('kaldı')) return none(`${junit} içinde PRD kriterine bağlı test sonucu yok (test adı kimlikle başlamalı: \`Ö-01.1 ...\`; sunucu açıldı mı?).`);
  const summary = `${count('geçti')} geçti · ${count('kaldı')} kaldı · ${count('koşulmadı')} koşulmadı`;
  const file = `docs/quality/qa/${stamp}.md`;
  const md = `# QA raporu · ${stamp}\n\n**Sonuç:** ${summary} (PRD'de ${rows.length} kriter, kaynak: \`${junit}\`)\n\n` +
    `| Kriter | Sonuç | Kanıt | Not |\n|---|---|---|---|\n${rows.map((r) => `| ${cell(r.criterion)} | ${r.result} | ${r.evidence} | ${cell(r.note)} |`).join('\n')}\n`;
  fs.mkdirSync(path.join(root, 'docs/quality/qa'), { recursive: true });
  fs.writeFileSync(path.join(root, file), md);
  const stale = age > STALE_MIN ? `\nUyarı: ${junit} ${Math.round(age)} dk önce yazılmış; bu koşunun sonucu olmayabilir, testleri yeniden çalıştır.` : '';
  return { code: count('kaldı') ? 1 : 0, text: `QA: ${summary} → ${file}${stale}` };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { code, text } = qaReport(findRoot(), process.argv[2]);
  console.log(text);
  process.exit(code);
}
