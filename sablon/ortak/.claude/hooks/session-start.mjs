#!/usr/bin/env node
// SessionStart hook'u: stdout'a yazılanlar oturum bağlamına eklenir.
// Git durumunu ve ILERLEME.md'nin güncelliğini kısa bir notla bildirir.
import { execSync } from 'node:child_process';

const git = (k) => execSync(`git ${k}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();

try {
  git('rev-parse --is-inside-work-tree');
} catch {
  process.exit(0); // git deposu değil
}

const notlar = [];
try {
  const dal = git('branch --show-current') || '(ayrık HEAD)';
  const degisen = git('status --porcelain').split('\n').filter(Boolean).length;
  notlar.push(`Dal: ${dal} · commit edilmemiş dosya: ${degisen}`);

  const sonIlerleme = git('log -1 --format=%H -- docs/ILERLEME.md');
  if (sonIlerleme) {
    const sonra = Number(git(`rev-list --count ${sonIlerleme}..HEAD`));
    if (sonra >= 3) {
      notlar.push(
        `UYARI: docs/ILERLEME.md son ${sonra} commit'tir güncellenmedi; içeriği eski olabilir. ` +
          'Kullanıcıya oturum sonunda /oturum-sonu çalıştırmayı hatırlat.'
      );
    }
  }
} catch {
  // ilk commit öncesi vb. durumlarda sessiz geç
}

if (notlar.length) console.log('[Kit] ' + notlar.join('\n[Kit] '));
