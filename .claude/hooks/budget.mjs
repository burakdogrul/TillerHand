#!/usr/bin/env node
// Complexity budget: as AI code grows, functions get longer and branchier; CI turns red when the budget is exceeded.
//   node .claude/hooks/budget.mjs --check [--base <commit>]
//   Only code files changed since base are measured (the whole repo if base is missing or zero). So old code brought
//   into the kit does not block until it is touched. Tests, migrations, generated files and kit files are excluded.
//   Function complexity and length via lizard (pipx run in CI, pinned version), file length by this script.
//   With LIZARD=<executable> that is used instead of pipx (a locally installed lizard).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { isTestFile } from './test-guard.mjs';

export const BUDGET = { complexity: 15, function: 80, file: 400 };
const LIZARD = ['pipx', 'run', 'lizard==1.24.1'];
const CODE = /\.(m?[jt]sx?|cjs|py)$/i;
// build/out/vendor only at the root: a feature folder with the same name in a subfolder must not escape measurement
const EXCLUDED = /(^|\/)(node_modules|dist|\.next|\.expo|coverage|\.venv|migrations|alembic|\.claude|\.codex|\.agents)\/|^(build|out|vendor)\/|\.d\.ts$|\.(gen|generated|min)\.[cm]?[jt]sx?$/i;

export const selectFiles = (files) => files.filter((f) => CODE.test(f) && !EXCLUDED.test(f) && !isTestFile(f));

export function longFiles(root, files) {
  return files
    .map((file) => {
      const s = fs.readFileSync(path.join(root, file), 'utf8');
      return { file, lines: s.split('\n').length - (s.endsWith('\n') ? 1 : 0) };
    })
    .filter(({ lines }) => lines > BUDGET.file);
}

export const lizardArgs = (files) => ['-C', String(BUDGET.complexity), '-L', String(BUDGET.function), '-w', '--', ...files];

export function changedFiles(root, base) {
  // -z: Turkish or spaced paths are not quoted and escaped; --end-of-options: base is not taken for a flag
  const git = (...a) => execFileSync('git', a, { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean);
  let list;
  // base unknown (new branch, a commit missing from the clone after force-push): the whole repo is measured
  try { list = !base || /^0+$/.test(base) ? git('ls-files', '-z') : git('diff', '--name-only', '-z', '--diff-filter=AMR', '--end-of-options', base, 'HEAD'); }
  catch { console.warn(`base (${base}) bulunamadı; tüm depo ölçülüyor.`); list = git('ls-files', '-z'); }
  return list.filter((f) => fs.existsSync(path.join(root, f)));
}

function check() {
  const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const i = process.argv.indexOf('--base');
  const files = selectFiles(changedFiles(root, i > 0 ? process.argv[i + 1] : ''));
  if (!files.length) { console.log('Karmaşıklık bütçesi: değişen kod dosyası yok.'); return; }
  let failed = false;
  for (const { file, lines } of longFiles(root, files)) {
    console.error(`${file}: ${lines} satır (bütçe ${BUDGET.file}). Dosyayı sorumluluklarına göre böl.`);
    failed = true;
  }
  const [command, ...prefix] = process.env.LIZARD ? [process.env.LIZARD] : LIZARD;
  const r = spawnSync(command, [...prefix, ...lizardArgs(files)], { cwd: root, stdio: 'inherit' });
  if (r.error) { console.error(`lizard çalıştırılamadı (${command}): ${r.error.code}. CI'da pipx hazır gelir; yerelde: pip install lizard==1.24.1, sonra LIZARD=lizard.`); failed = true; }
  else if (r.status !== 0) { console.error(`Fonksiyon bütçesi aşıldı (karmaşıklık ${BUDGET.complexity}, uzunluk ${BUDGET.function} satır). Fonksiyonu küçük parçalara böl.`); failed = true; }
  if (failed) process.exit(1);
  console.log(`Karmaşıklık bütçesi uygun: ${files.length} dosya.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (process.argv.includes('--check')) check();
  else { console.error('Kullanım: node .claude/hooks/budget.mjs --check [--base <commit>]'); process.exit(1); }
}
