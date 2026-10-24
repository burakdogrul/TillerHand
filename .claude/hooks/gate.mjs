#!/usr/bin/env node
// Deterministik kapı: kurul toplanmadan önce lint, tip kontrolü, test ve Semgrep çalışır; çıktı üyelere girdi olur.
// Neden: lint/tip/test'in yakaladığını model aramasın, kırmızı kontrol model kararına kalmasın (F-03).
//   node .claude/hooks/gate.mjs --run      çıkış kodu: 0 yeşil, 1 kırmızı
//   Komutlar AGENTS.md → Komutlar bölümünden okunur (lint, tip kontrol, test); boş ([ ]) olan "tanımsız" sayılır.
//   Semgrep kuruluysa değişen kod dosyalarında çalışır (SEMGREP=<çalıştırılabilir> ile değiştirilir); yoksa atlanır, CI'da çalışır.
//   Sonuç .claude/state/gate.json'a commit kapısıyla aynı değişiklik imzasıyla yazılır; commit kapısı kırmızı veya
//   eski sonuçta commit'i durdurur. Yeşil kontrolün çıktısı yazılmaz, kırmızının son 30 satırı yazılır.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { degisiklikler } from './commit-gate.mjs';
import { kodDosyasi } from './edit-rounds.mjs';
import { kokBul } from './arac.mjs';

const KONTROLLER = ['lint', 'tip kontrol', 'test'];
const SURE = 10 * 60 * 1000;
const TAMPON = 64 * 1024 * 1024;
const kuyruk = (s) => s.trimEnd().split(/\r?\n/).slice(-30).join('\n');

// Sadece "## Komutlar" bölümü okunur: başka yerdeki "test:" satırı komut sayılmasın
export function komutlar(md) {
  const bolum = md.match(/^## Komutlar[^\n]*\n([\s\S]*?)(?=^## |(?![\s\S]))/m)?.[1] ?? '';
  return KONTROLLER.map((ad) => {
    const deger = bolum.match(new RegExp(`^${ad}:[ \\t]*(.*?)[ \\t\\r]*$`, 'm'))?.[1];
    return { ad, komut: deger && !/^\[.*\]$/.test(deger) ? deger : null };
  });
}

function kontrol(kok, { ad, komut }) {
  if (!komut) return { ad, durum: 'tanımsız', not: 'AGENTS.md → Komutlar' };
  const bas = Date.now();
  // Komut AGENTS.md'den gelir (kural dosyası, yazımı onaylı); boru ve && için kabuk gerekir
  const r = spawnSync(komut, { cwd: kok, shell: true, encoding: 'utf8', timeout: SURE, maxBuffer: TAMPON });
  const sn = Math.round((Date.now() - bas) / 1000);
  if (r.status === 0) return { ad, komut, durum: 'geçti', sn };
  return { ad, komut, durum: 'kaldı', sn, cikti: kuyruk(`${r.error ? `${r.error.message}\n` : ''}${r.stdout ?? ''}${r.stderr ?? ''}`) };
}

function semgrep(kok, dosyalar) {
  const ad = 'Semgrep';
  const kod = dosyalar.filter((f) => kodDosyasi(f) && fs.existsSync(path.join(kok, f)));
  if (!kod.length) return { ad, durum: 'atlandı', not: 'değişen kod dosyası yok' };
  const bas = Date.now();
  const r = spawnSync(process.env.SEMGREP || 'semgrep', ['scan', '--config', 'p/default', '--config', 'p/owasp-top-ten', '--severity', 'ERROR', '--error', '--quiet', '--', ...kod],
    { cwd: kok, encoding: 'utf8', timeout: SURE, maxBuffer: TAMPON });
  if (r.error?.code === 'ENOENT') return { ad, durum: 'atlandı', not: 'kurulu değil; CI\'daki semgrep işi çalıştırır' };
  const sn = Math.round((Date.now() - bas) / 1000);
  if (r.status === 0) return { ad, durum: 'geçti', sn };
  return { ad, durum: 'kaldı', sn, cikti: kuyruk(`${r.error ? `${r.error.message}\n` : ''}${r.stdout ?? ''}${r.stderr ?? ''}`) };
}

const ISARET = { 'geçti': '✅', 'kaldı': '❌', 'tanımsız': '⚪', 'atlandı': '⚪' };
const satir = (k) => `${ISARET[k.durum]} ${k.ad}${k.sn != null ? ` (${k.sn} sn)` : ''}${k.durum === 'geçti' ? '' : `: ${k.durum}`}${k.not ? ` (${k.not})` : ''}` +
  (k.cikti ? `\n\`\`\`\n${k.cikti}\n\`\`\`` : '');

export function calistir(kok) {
  let imza = null, dosyalar = [];
  try { ({ imza, dosyalar } = degisiklikler()); } catch { /* git deposu değil: komutlar yine çalışır */ }
  let md = '';
  try { md = fs.readFileSync(path.join(kok, 'AGENTS.md'), 'utf8'); } catch { /* komutlar tanımsız */ }
  const kontroller = [...komutlar(md).map((k) => kontrol(kok, k)), semgrep(kok, dosyalar)];
  const gecti = kontroller.every((k) => k.durum !== 'kaldı');
  const yol = path.join(kok, '.claude', 'state', 'gate.json');
  fs.mkdirSync(path.dirname(yol), { recursive: true });
  fs.writeFileSync(yol, JSON.stringify({ imza, tarih: new Date().toISOString(), gecti, kontroller }, null, 2));
  return { gecti, metin: [`## Kapı · ${dosyalar.length} dosya değişti`, ...kontroller.map(satir),
    gecti ? `Sonuç: YEŞİL.${kontroller.some((k) => k.durum === 'geçti') ? '' : ' Uyarı: hiçbir kontrol çalışmadı; AGENTS.md → Komutlar\'ı doldur.'}` : 'Sonuç: KIRMIZI. Commit kapısı açılmaz: düzelt ve kapıyı tekrar çalıştır.'].join('\n') };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  if (!process.argv.includes('--run')) { console.error('Kullanım: node .claude/hooks/gate.mjs --run'); process.exit(1); }
  const { gecti, metin } = calistir(kokBul());
  console.log(metin);
  process.exit(gecti ? 0 : 1);
}
