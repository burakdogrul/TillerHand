#!/usr/bin/env node
// SessionStart hook'u: stdout'a yazılanlar oturum bağlamına eklenir.
// Kurulum, aşama, soru modu, kurul, limit, kaldığı yer ve git durumunu kısa notlarla bildirir.
// Kısa tutulur: her oturumda yüklenir, token harcar.
import { execSync } from 'node:child_process';
import { durumOku } from './status-read.mjs';
import { limitOku, ozet } from './usage.mjs';

const notlar = [];
const kok = process.env.CLAUDE_PROJECT_DIR || process.cwd();

try {
  const d = durumOku(kok);
  if (d.kitBekliyor) {
    notlar.push('Proje henüz kurulmadı. Kullanıcıya "/start [proje fikri]" ile başlamasını öner; kurulum bitmeden kod yazma.');
  } else {
    const a = d.alanlar;
    notlar.push(`Aşama: ${a['Aktif faz'] ?? '-'} · Görev: ${a['Aktif görev'] ?? '-'} · Soru modu: ${a['Soru modu'] ?? 'açık'} · Kurul: ${d.kurul.durum}`);
    if (/başlangıç/i.test(a['Aktif faz'] ?? '') && d.kurulu) {
      notlar.push(`/start yarım kaldı (adım ${a['Başlangıç adımı']}). Kullanıcıya /start ile kaldığı yerden devam etmeyi öner.`);
    }
    if (d.kaldigiYer.length) notlar.push(`Kaldığı yer: ${d.kaldigiYer.join(' | ')}. Kullanıcıya buradan devam etmeyi öner.`);
    if (d.bekleyen.length) notlar.push(`Bekleyen kararlar: ${d.bekleyen.join(' | ')}. Önce bunları sor.`);
  }
  const l = limitOku(kok);
  notlar.push(l ? `Limit (son bilinen): ${ozet(l)}` : 'Limit: bilinmiyor. İş planlamadan önce oku (get_usage veya node .claude/hooks/usage.mjs).');
  notlar.push('Rapor dili için caveman:caveman skill\'ini yükle (yüklü değilse atla).');
} catch {
  // dokümanlar okunamadıysa sadece git bilgisi ver
}

const git = (k) => execSync(`git ${k}`, { cwd: kok, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
try {
  git('rev-parse --is-inside-work-tree');
  const dal = git('branch --show-current') || '(ayrık HEAD)';
  const degisen = git('status --porcelain').split('\n').filter(Boolean).length;
  notlar.push(`Dal: ${dal} · commit edilmemiş dosya: ${degisen}`);
  const sonIlerleme = git('log -1 --format=%H -- docs/workflow/progress.md');
  if (sonIlerleme) {
    const sonra = Number(git(`rev-list --count ${sonIlerleme}..HEAD`));
    if (sonra >= 3) notlar.push(`UYARI: docs/workflow/progress.md son ${sonra} commit'tir güncellenmedi. Oturum sonunda /wrap-up hatırlat.`);
  }
} catch {
  // git deposu değil veya ilk commit öncesi
}

if (notlar.length) console.log('[Kit] ' + notlar.join('\n[Kit] '));
