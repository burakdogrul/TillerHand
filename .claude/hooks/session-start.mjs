#!/usr/bin/env node
// SessionStart hook'u: stdout'a yazılanlar oturum bağlamına eklenir.
// Kurulum durumu, soru modu, git durumu ve ILERLEME.md'nin güncelliğini kısa notlarla bildirir.
import { execSync } from 'node:child_process';
import { durumOku } from './durum-oku.mjs';

const notlar = [];
const kok = process.env.CLAUDE_PROJECT_DIR || process.cwd();

try {
  const d = durumOku(kok);
  if (d.kitBekliyor) {
    notlar.push('Proje henüz kurulmadı. Kullanıcıya "/baslat [proje fikri]" ile başlamasını öner; kurulum bitmeden kod yazma.');
  } else {
    notlar.push(
      `Aşama: ${d.alanlar['Aktif faz'] ?? '-'} · Görev: ${d.alanlar['Aktif görev'] ?? '-'} · ` +
        `Soru modu: ${d.alanlar['Soru modu'] ?? 'açık'}. Kararları docs/KARAR-PROTOKOLU.md'ye göre sor; her cevabın sonuna durum bloğu ekle.`
    );
    if (/başlangıç/i.test(d.alanlar['Aktif faz'] ?? '') && d.kurulu) {
      notlar.push(`/baslat yarım kaldı (adım ${d.alanlar['Başlangıç adımı']}). Kullanıcıya /baslat ile kaldığı yerden devam etmeyi öner.`);
    }
    if (d.bekleyen.length) notlar.push(`Bekleyen kararlar: ${d.bekleyen.join(' | ')}. Önce bunları sor.`);
  }
  notlar.push('Rapor dili için caveman:caveman skill\'ini yükle (yüklü değilse atla); sorular ve dokümanlar tam cümleyle yazılır.');
} catch {
  // dokümanlar okunamadıysa sadece git bilgisi ver
}

const git = (k) => execSync(`git ${k}`, { cwd: kok, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
try {
  git('rev-parse --is-inside-work-tree');
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
  // git deposu değil veya ilk commit öncesi
}

if (notlar.length) console.log('[Kit] ' + notlar.join('\n[Kit] '));
