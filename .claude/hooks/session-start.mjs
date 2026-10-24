#!/usr/bin/env node
// SessionStart hook (startup, /clear, resume): notes go into the session context (additionalContext),
// the next command is also shown to the user (systemMessage): after /clear, with an empty screen, where to continue stays visible.
// Reports setup, phase, question mode, board, limit, where we left off and git state in short notes.
// Kept short: it loads every session and costs tokens.
import fs from 'node:fs';
import { execSync } from 'node:child_process';
import { durumOku } from './status-read.mjs';
import { limitOku, ozet } from './usage.mjs';
import { detectTool, findRoot, sessionNote } from './shared.mjs';

const notes = [];
let next = '';
let input = {};
try { input = JSON.parse(fs.readFileSync(0, 'utf8')); } catch { /* no input */ }
const tool = detectTool(input); // Claude Code, Codex or Antigravity
const root = findRoot();

try {
  const d = durumOku(root);
  if (d.kitBekliyor) {
    notes.push('Proje henüz kurulmadı. Kullanıcıya yeni projede "/start [proje fikri]", klasörde var olan kod varsa "/adopt" öner; kurulum bitmeden kod yazma.');
    next = 'Başlamak için: /start [proje fikrin] · var olan projede: /adopt';
  } else {
    const a = d.alanlar;
    notes.push(`Aşama: ${a['Aktif faz'] ?? '-'} · Görev: ${a['Aktif görev'] ?? '-'} · Soru modu: ${a['Soru modu'] ?? 'açık'} · Kurul: ${d.kurul.durum}`);
    if (/başlangıç/i.test(a['Aktif faz'] ?? '') && d.kurulu) {
      const command = /uyum/i.test(a['Aktif faz']) ? '/adopt' : '/start';
      notes.push(`${command} yarım kaldı (adım ${a['Başlangıç adımı']}). Kullanıcıya ${command} ile kaldığı yerden devam etmeyi öner.`);
      next = `Devam: ${command} (adım ${a['Başlangıç adımı']})`;
    } else {
      const t = d.fazlar.flatMap((f) => f.gorevler).find((x) => !x.bitti);
      const code = t?.metin.match(/^(G-\d+)/)?.[1];
      if (code) next = `Sıradaki: /build ${code} · ${t.metin.replace(/^G-\d+:\s*/, '').split(' — ')[0].replace(/\*\*/g, '').slice(0, 70)}`;
    }
    if (d.devirBekliyor) {
      notes.push('Devir notu bekliyor (docs/workflow/handoff.md): proje başka kişiden veya hesaptan devralınıyor. İşe başlamadan /handoff devral öner.');
      next = `Devir notu var: /handoff devral${next ? ` · sonra ${next}` : ''}`;
    }
    if (next) notes.push(next);
    if (d.kaldigiYer.length) notes.push(`Kaldığı yer: ${d.kaldigiYer.join(' | ')}. Kullanıcıya buradan devam etmeyi öner.`);
    if (d.bekleyen.length) notes.push(`Bekleyen kararlar: ${d.bekleyen.join(' | ')}. Önce bunları sor.`);
  }
  if (tool === 'claude') { // limit data and the caveman plugin are Claude Code only
    const l = limitOku(root);
    notes.push(l ? `Limit (son bilinen): ${ozet(l)}` : 'Limit: bilinmiyor. İş planlamadan önce oku (get_usage veya node .claude/hooks/usage.mjs).');
    notes.push('Rapor dili için caveman:caveman skill\'ini yükle (yüklü değilse atla).');
  }
} catch {
  // docs could not be read: give git info only
}

const git = (c) => execSync(`git ${c}`, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
try {
  git('rev-parse --is-inside-work-tree');
  const branch = git('branch --show-current') || '(ayrık HEAD)';
  const changed = git('status --porcelain').split('\n').filter(Boolean).length;
  notes.push(`Dal: ${branch} · commit edilmemiş dosya: ${changed}`);
  const lastProgress = git('log -1 --format=%H -- docs/workflow/progress.md');
  if (lastProgress) {
    const since = Number(git(`rev-list --count ${lastProgress}..HEAD`));
    if (since >= 3) notes.push(`UYARI: docs/workflow/progress.md son ${since} commit'tir güncellenmedi. Oturum sonunda /wrap-up hatırlat.`);
  }
} catch {
  // not a git repo, or before the first commit
}

if (notes.length) console.log(sessionNote(tool, '[Kit] ' + notes.join('\n[Kit] '), next && `[Kit] ${next}`));
