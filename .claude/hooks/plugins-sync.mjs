#!/usr/bin/env node
// Proje ayarındaki (.claude/settings.json → enabledPlugins) eklentileri kurulum kaydıyla eşitler.
//   node .claude/hooks/plugins-sync.mjs          eksikleri listeler, kurmaz
//   node .claude/hooks/plugins-sync.mjs --kur    listeyi kurar (önce kullanıcıya sorulmuş olmalı)
// Neden: Ayar dosyası eklentiyi açar ama indirmez. Kurulmamış her eklenti "not cached" veya
// "enabled in project settings but isn't installed" yükleme hatası verir ve skill'leri gelmez.
// false olanlar da kurulur ve sonra kapatılır; yoksa aynı hata onlar için de çıkar.
// /start (ortam adımı) ve /kit-update önce listeler, kullanıcı onaylarsa --kur ile çalıştırır. Eklenti kodu (hook) senin yetkinle çalışır.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

// Windows yolları büyük/küçük harf duyarsız; diğer sistemlerde duyarlı
const norm = (p) => (process.platform === 'win32' ? path.resolve(p).toLowerCase() : path.resolve(p));
const ayni = (a, b) => norm(a) === norm(b);

// Bu projede kurulu sayılan kayıt: kullanıcı kapsamında veya bu projenin kapsamında (başka projeninki sayılmaz)
const buradaKurulu = (p, id, kok) => p.id === id && (p.scope === 'user' || (p.scope === 'project' && p.projectPath && ayni(p.projectPath, kok)));

export function eksikler(acik, kurulu, kok) {
  return Object.entries(acik ?? {})
    .filter(([id]) => !kurulu.some((p) => buradaKurulu(p, id, kok)))
    .map(([id, etkin]) => ({ id, etkin: etkin !== false }));
}

// Proje ayarında açık, kurulu ama bu makinede kapalı (settings.local.json veya /plugin ile kişisel tercih).
// Hata değildir, Claude Code bilerek yüklemez; betik kişisel tercihi ezmez, sadece söyler.
// `enabled` alanı CLI'ın çalıştığı klasöre göre hesaplanır; betik proje kökünde çalıştırır.
export function kapalilar(acik, kurulu, kok) {
  return Object.entries(acik ?? {})
    .filter(([id, etkin]) => etkin !== false && kurulu.some((p) => buradaKurulu(p, id, kok) && p.enabled === false))
    .map(([id]) => id);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const kok = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  // Kabuk yok: argümanlar doğrudan claude'a gider (claude tek dosyalık çalıştırılabilir, Windows'ta .exe)
  const calistir = (...arg) => execFileSync('claude', arg, { cwd: kok, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 180000 });
  const neden = (h) => (h.stderr || h.stdout || h.message || '').toString().trim().split('\n')[0];
  let acik;
  try { acik = JSON.parse(fs.readFileSync(path.join(kok, '.claude', 'settings.json'), 'utf8')).enabledPlugins; } catch (h) {
    console.error(`.claude/settings.json okunamadı: ${h.message}`);
    process.exit(1);
  }
  let kurulu;
  try { kurulu = JSON.parse(calistir('plugin', 'list', '--json')); } catch (h) {
    console.error(`claude CLI çalışmadı (${neden(h)}). Eklentileri /plugin ile elle kur.`);
    process.exit(1);
  }
  const kapali = kapalilar(acik, kurulu, kok);
  if (kapali.length) console.log(`Bilgi: kurulu ama bu makinede kapalı (kişisel tercih, değiştirilmedi): ${kapali.join(', ')}. Açmak için /plugin → Installed.`);
  const liste = eksikler(acik, kurulu, kok);
  if (!liste.length) { console.log('Eklentiler eşit: proje ayarındaki her eklenti kurulu.'); process.exit(0); }
  if (!process.argv.includes('--kur')) {
    console.log(`Kurulu olmayan ${liste.length} eklenti:\n${liste.map((e) => `  ${e.id}${e.etkin ? '' : ' (kurulup kapatılacak)'}`).join('\n')}\nKurmak için kullanıcıya sor, onaylarsa: node .claude/hooks/plugins-sync.mjs --kur`);
    process.exit(0);
  }
  let hata = 0;
  for (const { id, etkin } of liste) {
    if (!/^[\w.-]+@[\w.-]+$/.test(id)) { console.error(`atlandı (geçersiz ad): ${id}`); hata++; continue; }
    try {
      calistir('plugin', 'install', id, '--scope', 'project');
      if (!etkin) calistir('plugin', 'disable', id, '--scope', 'project');
      console.log(`kuruldu${etkin ? '' : ' (kapalı)'}: ${id}`);
    } catch (h) { console.error(`kurulamadı: ${id} · ${neden(h)}`); hata++; }
  }
  console.log(`${liste.length - hata}/${liste.length} eklenti kuruldu. Bu oturumda etkinleştirmek için /reload-plugins.`);
  process.exit(hata ? 1 : 0);
}
