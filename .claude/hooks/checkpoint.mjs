#!/usr/bin/env node
// Working points and safe rollback (/rollback). For a user who does not know git:
//   node .claude/hooks/checkpoint.mjs --save "G-012 bitti, testler yeşil"   tag the current commit as a "working point"
//   node .claude/hooks/checkpoint.mjs --list [--json]                        working points + recent commits
//   node .claude/hooks/checkpoint.mjs --restore <tag|commit> --yes           go back to that state
// Rollback does not delete history: unsaved work is stashed first, files are set to the target state and
// a NEW commit is made. So a rollback can be undone too. reset --hard is not used.
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

// Tag prefix in users' repos: it stays as it is, existing tags must keep matching
const TAG_PREFIX = 'calisan/';

export function git(root, ...arg) {
  return execFileSync('git', arg, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

const timestamp = (d = new Date()) => d.toISOString().slice(0, 19).replace(/[-:]/g, '').replace('T', '-');

export function saveCheckpoint(root, note = '') {
  if (git(root, 'status', '--porcelain')) throw new Error('Kaydedilmemiş değişiklik var; çalışan nokta sadece commit edilmiş hale konur. Önce commit et.');
  const label = `${TAG_PREFIX}${timestamp()}`;
  git(root, 'tag', '-a', label, '-m', note || 'çalışan nokta');
  return label;
}

export function listCheckpoints(root, n = 10) {
  const points = git(root, 'for-each-ref', '--sort=-creatordate', `--count=${n}`, '--format=%(refname:short)%09%(creatordate:short)%09%(contents:subject)%09%(*objectname:short)', `refs/tags/${TAG_PREFIX}`)
    .split('\n').filter(Boolean).map((s) => { const [label, date, note, commit] = s.split('\t'); return { label, date, note, commit }; });
  const commits = git(root, 'log', `-${n}`, '--format=%h%x09%ad%x09%s', '--date=format:%Y-%m-%d %H:%M')
    .split('\n').filter(Boolean).map((s) => { const [commit, date, message] = s.split('\t'); return { commit, date, message }; });
  return { points, commits };
}

export function restore(root, target) {
  const sha = git(root, 'rev-parse', '--verify', `${target}^{commit}`);
  const short = sha.slice(0, 7);
  let stashed = null;
  if (git(root, 'status', '--porcelain')) {
    stashed = `geri-alma öncesi ${new Date().toISOString().slice(0, 16)}`;
    git(root, 'stash', 'push', '--include-untracked', '-m', stashed);
  }
  // Tracked files take the target state; files not in the target are deleted. Files in .gitignore (.env) are not touched.
  git(root, 'restore', `--source=${sha}`, '--staged', '--worktree', '--', '.');
  if (!git(root, 'status', '--porcelain')) return { changed: false, stashed, target: short };
  git(root, 'commit', '-m', `revert: ${target} (${short}) haline dönüldü`);
  return { changed: true, stashed, target: short, newCommit: git(root, 'rev-parse', '--short', 'HEAD') };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const arg = process.argv.slice(2);
  // ONLY the first argument sets the mode: the permission list matches by prefix ("--list:*", "--save:*"),
  // so a trailing "--restore ... --yes" must not lead to an unapproved rollback.
  const mode = arg[0];
  try {
    if (mode === '--save') {
      console.log(`Çalışan nokta kaydedildi: ${saveCheckpoint(root, arg[1] ?? '')}`);
    } else if (mode === '--restore') {
      const target = arg[1];
      // --evet: the flag before 3.15.0; still accepted with a warning, remove in 3.17.0
      if (arg[2] === '--evet') console.error("Uyarı: --evet eski bayrak; yenisi --yes. 3.17.0'da kalkacak.");
      if (!target || target.startsWith('--') || (arg[2] !== '--yes' && arg[2] !== '--evet')) {
        console.error('Geri dönüş onay ister: node .claude/hooks/checkpoint.mjs --restore <etiket|commit> --yes');
        process.exit(1);
      }
      const r = restore(root, target);
      if (r.stashed) console.log(`Kaydedilmemiş işin saklandı: "${r.stashed}" (geri getirmek: git stash pop)`);
      console.log(r.changed ? `${r.target} haline dönüldü, yeni commit: ${r.newCommit}. Bunu da geri almak için: /rollback ile bir önceki commit'i seç.` : `Dosyalar zaten ${r.target} ile aynı; değişiklik yok.`);
    } else {
      const { points, commits } = listCheckpoints(root);
      if (arg.includes('--json')) { console.log(JSON.stringify({ points, commits })); process.exit(0); }
      console.log('Çalışan noktalar:');
      console.log(points.length ? points.map((p) => `  ${p.label}  ${p.date}  ${p.note}`).join('\n') : '  (yok; /build ve /wrap-up testler yeşilken kaydeder)');
      console.log('Son commit\'ler:');
      console.log(commits.map((c) => `  ${c.commit}  ${c.date}  ${c.message}`).join('\n'));
    }
  } catch (h) {
    console.error((h.stderr || h.message).toString().trim().split('\n')[0]);
    process.exit(1);
  }
}
