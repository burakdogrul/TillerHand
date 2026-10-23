#!/usr/bin/env node
// SessionStart hook'u (açılış, /clear, devam): notlar oturum bağlamına (additionalContext) eklenir,
// sıradaki komut kullanıcıya da gösterilir (systemMessage): /clear sonrası ekran boşken nereden devam edileceği görünsün.
// Kurulum, aşama, soru modu, kurul, limit, kaldığı yer ve git durumunu kısa notlarla bildirir.
// Kısa tutulur: her oturumda yüklenir, token harcar.
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { durumOku } from './status-read.mjs';
import { limitOku, ozet } from './usage.mjs';
import { aracBul, kokBul, oturumNotu } from './arac.mjs';

const notlar = [];
let siradaki = '';
let girdi = {};
try { girdi = JSON.parse(fs.readFileSync(0, 'utf8')); } catch { /* girdi yok */ }
const arac = aracBul(girdi); // Claude Code, Codex veya Antigravity
const kok = kokBul();

try {
  const d = durumOku(kok);
  if (d.kitBekliyor) {
    notlar.push('Proje henüz kurulmadı. Kullanıcıya yeni projede "/start [proje fikri]", klasörde var olan kod varsa "/adopt" öner; kurulum bitmeden kod yazma.');
    siradaki = 'Başlamak için: /start [proje fikrin] · var olan projede: /adopt';
  } else {
    const a = d.alanlar;
    notlar.push(`Aşama: ${a['Aktif faz'] ?? '-'} · Görev: ${a['Aktif görev'] ?? '-'} · Soru modu: ${a['Soru modu'] ?? 'açık'} · Kurul: ${d.kurul.durum}`);
    if (/başlangıç/i.test(a['Aktif faz'] ?? '') && d.kurulu) {
      const komut = /uyum/i.test(a['Aktif faz']) ? '/adopt' : '/start';
      notlar.push(`${komut} yarım kaldı (adım ${a['Başlangıç adımı']}). Kullanıcıya ${komut} ile kaldığı yerden devam etmeyi öner.`);
      siradaki = `Devam: ${komut} (adım ${a['Başlangıç adımı']})`;
    } else {
      const g = d.fazlar.flatMap((f) => f.gorevler).find((x) => !x.bitti);
      const kod = g?.metin.match(/^(G-\d+)/)?.[1];
      if (kod) siradaki = `Sıradaki: /build ${kod} · ${g.metin.replace(/^G-\d+:\s*/, '').split(' — ')[0].replace(/\*\*/g, '').slice(0, 70)}`;
    }
    if (d.devirBekliyor) {
      notlar.push('Devir notu bekliyor (docs/workflow/handoff.md): proje başka kişiden veya hesaptan devralınıyor. İşe başlamadan /handoff devral öner.');
      siradaki = `Devir notu var: /handoff devral${siradaki ? ` · sonra ${siradaki}` : ''}`;
    }
    if (siradaki) notlar.push(siradaki);
    if (d.kaldigiYer.length) notlar.push(`Kaldığı yer: ${d.kaldigiYer.join(' | ')}. Kullanıcıya buradan devam etmeyi öner.`);
    if (d.bekleyen.length) notlar.push(`Bekleyen kararlar: ${d.bekleyen.join(' | ')}. Önce bunları sor.`);
  }
  if (arac === 'claude') { // limit verisi ve caveman eklentisi Claude Code'a özel
    const l = limitOku(kok);
    notlar.push(l ? `Limit (son bilinen): ${ozet(l)}` : 'Limit: bilinmiyor. İş planlamadan önce oku (get_usage veya node .claude/hooks/usage.mjs).');
    notlar.push('Rapor dili için caveman:caveman skill\'ini yükle (yüklü değilse atla).');
  }
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

if (notlar.length) console.log(oturumNotu(arac, '[Kit] ' + notlar.join('\n[Kit] '), siradaki && `[Kit] ${siradaki}`));
