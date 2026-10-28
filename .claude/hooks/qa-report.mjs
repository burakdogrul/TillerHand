#!/usr/bin/env node
// Browser QA report (F-18): written from the JUnit result of the /qa run, so "it works" needs a green test behind it.
//   node .claude/hooks/qa-report.mjs [junit file]   default: test-results-qa/junit.xml (the /qa run has its own output folder:
//   Playwright empties its output folder at every run, a shared one would delete the acceptance report and the evidence)
//   → docs/quality/qa/<YYYY-MM-DD-HHMMSS>.md: one row per PRD criterion (passed / failed / not run), the first failure line,
//   evidence test-results-qa/shots/<Ö-id>.png copied to .previews/qa-<stamp>/ (kept out of git, outlives the next run).
//   Exit code: 0 nothing failed, 1 a criterion failed, 2 nothing to report (no JUnit file, no PRD criterion, no test ran).
import fs from 'node:fs';
import path from 'node:path';
import { prdCriteria, junitCases } from './dashboard-data.mjs';
import { findRoot, isMain } from './shared.mjs';
import { t } from './lang.mjs';

// A pipe would split the table cell (the dashboard's table reader does not know \|)
const cell = (s) => String(s ?? '').split(/\r?\n/)[0].trim().slice(0, 160).replace(/\|/g, '/');
const pad = (n) => String(n).padStart(2, '0');
// Playwright's JUnit failure text starts with the test title; the reason is the first "Error" line
const reasonLine = (s) => (s ?? '').split(/\r?\n/).find((l) => /^\s*Error\b/.test(l)) ?? (s ?? '').split(/\r?\n/).find((l) => l.trim());
const STALE_MIN = 30;

export function qaReport(root, junit = 'test-results-qa/junit.xml', now = new Date()) {
  const none = (why) => ({ code: 2, text: `QA report not written: ${why}` });
  let xml, age;
  try { xml = fs.readFileSync(path.resolve(root, junit), 'utf8'); age = (now - fs.statSync(path.resolve(root, junit)).mtimeMs) / 60000; } catch {
    return none(`${junit} not found. Run the tests with a JUnit report (qa.md step 4).`);
  }
  let prd;
  try { prd = fs.readFileSync(path.join(root, 'docs/product/prd.md'), 'utf8'); } catch { return none('docs/product/prd.md not found.'); }
  const criteria = prdCriteria(prd);
  if (!criteria.length) return none('the PRD has no acceptance criterion with an id (`- [ ] Ö-01.1: ...`).');
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
    // Only a real screenshot file: a shots/<id>.png link would copy any local file into .previews/
    let real = false;
    try { real = fs.lstatSync(shot).isFile(); } catch { /* no screenshot */ }
    if (r && !linked && real) {
      fs.mkdirSync(shots, { recursive: true });
      fs.copyFileSync(shot, path.join(shots, `${k.id}.png`));
      evidence = `.previews/qa-${stamp}/${k.id}.png`;
    }
    return { criterion: `${k.id} ${k.text}`, result: !r ? 'not run' : r.failed ? 'failed' : 'passed', evidence, note: r?.failed ? reasonLine(r.reason) : '' };
  });
  const count = (x) => rows.filter((r) => r.result === x).length;
  if (!count('passed') && !count('failed')) return none(`no test result tied to a PRD criterion in ${junit} (the test name must start with the id: \`Ö-01.1 ...\`; did the server start?).`);
  const counts = { passed: count('passed'), failed: count('failed'), notRun: count('not run') };
  const file = `docs/quality/qa/${stamp}.md`;
  const md = `${t(root, 'qaReport.title', { stamp })}\n\n${t(root, 'qaReport.result', { summary: t(root, 'qaReport.summary', counts), count: rows.length, junit })}\n\n` +
    `${t(root, 'qaReport.tableHeader')}\n|---|---|---|---|\n${rows.map((r) => `| ${cell(r.criterion)} | ${r.result} | ${r.evidence} | ${cell(r.note)} |`).join('\n')}\n`;
  fs.mkdirSync(path.join(root, 'docs/quality/qa'), { recursive: true });
  fs.writeFileSync(path.join(root, file), md);
  const stale = age > STALE_MIN ? `\nWarning: ${junit} was written ${Math.round(age)} min ago; it may not be the result of this run, rerun the tests.` : '';
  return { code: count('failed') ? 1 : 0, text: `QA: ${counts.passed} passed · ${counts.failed} failed · ${counts.notRun} not run → ${file}${stale}` };
}

if (isMain(import.meta.url)) {
  const { code, text } = qaReport(findRoot(), process.argv[2]);
  console.log(text);
  process.exit(code);
}
