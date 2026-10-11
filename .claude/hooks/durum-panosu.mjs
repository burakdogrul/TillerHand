#!/usr/bin/env node
// Proje durum panosunu üretir: DURUM.html (git'e girmez).
// Çalıştır: node .claude/hooks/durum-panosu.mjs   (/durum ve /oturum-sonu çalıştırır)
import fs from 'node:fs';
import path from 'node:path';
import { durumOku } from './durum-oku.mjs';

const kok = process.argv[2] ? path.resolve(process.argv[2]) : process.cwd();
const d = durumOku(kok);
const e = (s = '') => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const kod = (s) => e(s).replace(/`([^`]+)`/g, '<code>$1</code>');
const yuzde = (b, t) => (t ? Math.round((b / t) * 100) : 0);
const cubuk = (b, t) =>
  `<div class="bar" role="img" aria-label="${b}/${t}"><span style="width:${yuzde(b, t)}%"></span></div><span class="num">${b}/${t}</span>`;
const liste = (l, bos) => (l.length ? `<ul>${l.map((s) => `<li>${kod(s)}</li>`).join('')}</ul>` : `<p class="muted">${bos}</p>`);

const a = d.alanlar;
const aktif = a['Aktif faz'] ?? '';
const asamalar = [{ ad: 'Başlangıç', bitti: Number((a['Başlangıç adımı'] ?? '0/8').split('/')[0]) || 0, toplam: Number((a['Başlangıç adımı'] ?? '0/8').split('/')[1]) || 8 }, ...d.fazlar];
const aktifNo = Math.max(0, asamalar.findIndex((f) => aktif && f.ad.toLowerCase().startsWith(aktif.toLowerCase().split(' ').slice(0, 2).join(' '))));
const kararlar = [...d.kararlar].reverse().slice(0, 20);
const otomatik = d.kararlar.filter((k) => /otomatik/i.test(k.veren)).length;

const html = `<!doctype html>
<html lang="tr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${e(d.proje)} · Durum</title>
<style>
:root{--bg:#f5f7fa;--surface:#fff;--fg:#172033;--muted:#5b6578;--line:#dde3ec;--accent:#2648c9;--accent-soft:#e7edfc;--ok:#18794e;--warn:#8a5a00;--warn-soft:#fdf3dd;
--sans:"Segoe UI",system-ui,-apple-system,sans-serif;--mono:Consolas,"SF Mono",ui-monospace,monospace}
@media (prefers-color-scheme:dark){:root{--bg:#0f141d;--surface:#161d2a;--fg:#e4e9f2;--muted:#9aa5b8;--line:#283246;--accent:#8ea8ff;--accent-soft:#1c2847;--ok:#5fd39a;--warn:#f2c46b;--warn-soft:#2b2416;color-scheme:dark}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:15px/1.55 var(--sans);padding:32px 16px 64px}
.wrap{max-width:1040px;margin:0 auto;display:grid;gap:20px}
h1{font-size:1.9rem;margin:0;letter-spacing:-.01em}h2{font-size:.78rem;margin:0 0 12px;font-family:var(--mono);text-transform:uppercase;letter-spacing:.08em;color:var(--muted);font-weight:600}
code{font-family:var(--mono);font-size:.88em;background:var(--accent-soft);padding:.05em .35em;border-radius:4px}
.muted{color:var(--muted);margin:0}.meta{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
.pill{font:600 .78rem/1 var(--mono);padding:6px 9px;border-radius:999px;background:var(--surface);border:1px solid var(--line)}
.pill.acc{background:var(--accent);border-color:var(--accent);color:var(--bg)}
.card{background:var(--surface);border:1px solid var(--line);border-radius:12px;padding:18px;min-width:0}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:20px}
.steps{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px}
.step{border:1px solid var(--line);border-radius:10px;padding:12px;display:grid;gap:6px;background:var(--bg)}
.step.now{border-color:var(--accent);box-shadow:0 0 0 2px var(--accent-soft)}.step b{font-size:.92rem}
.row{display:grid;grid-template-columns:1fr auto;gap:4px 10px;align-items:center}
.bar{grid-column:1/2;height:8px;background:var(--line);border-radius:99px;overflow:hidden}.bar span{display:block;height:100%;background:var(--accent)}
.num{font:600 .8rem/1 var(--mono);font-variant-numeric:tabular-nums;color:var(--muted)}
.lists{display:grid;gap:12px}.lists .lbl{font-size:.9rem}
ul{margin:0;padding-left:1.1em;display:grid;gap:4px}
.warn{background:var(--warn-soft);border-color:transparent}.warn h2{color:var(--warn)}
.tw{overflow-x:auto}table{border-collapse:collapse;width:100%;font-size:.88rem}
th,td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line);vertical-align:top}
th{font:600 .72rem/1.2 var(--mono);text-transform:uppercase;letter-spacing:.06em;color:var(--muted)}
.who{font:600 .72rem/1 var(--mono);padding:4px 7px;border-radius:6px;background:var(--accent-soft);color:var(--accent);white-space:nowrap}
.who.auto{background:var(--warn-soft);color:var(--warn)}
footer{color:var(--muted);font-size:.82rem}
</style></head><body><div class="wrap">
<header>
  <h1>${e(d.proje)}</h1>
  <div class="meta">
    <span class="pill acc">${e(aktif || '-')}</span>
    <span class="pill">Görev: ${e(a['Aktif görev'] ?? '-')}</span>
    <span class="pill">Soru modu: ${e(a['Soru modu'] ?? '-')}</span>
    ${d.kit ? `<span class="pill">${e(d.kit.tip)}${d.kit.ekler?.length ? ' + ' + e(d.kit.ekler.join(', ')) : ''} · kit ${e(d.kit.surum)}</span>` : '<span class="pill">Kit kurulmadı</span>'}
  </div>
  ${d.durum ? `<p class="muted" style="margin-top:12px">${kod(d.durum)}</p>` : ''}
</header>

<section class="card"><h2>Aşamalar</h2><div class="steps">
${asamalar.map((f, i) => `<div class="step${i === aktifNo ? ' now' : ''}"><b>${e(f.ad)}</b><div class="row">${cubuk(f.bitti, f.toplam)}</div></div>`).join('\n')}
</div></section>

<div class="grid">
  <section class="card"><h2>Sıradaki adım</h2>${liste(d.siradaki, 'Belirtilmemiş.')}</section>
  <section class="card${d.bekleyen.length ? ' warn' : ''}"><h2>Bekleyen kararlar</h2>${liste(d.bekleyen, 'Bekleyen karar yok.')}</section>
  <section class="card${d.sorunlar.length ? ' warn' : ''}"><h2>Açık sorunlar</h2>${liste(d.sorunlar, 'Açık sorun yok.')}</section>
  <section class="card"><h2>Kontrol listeleri</h2><div class="lists">
  ${d.listeler.map((l) => `<div><div class="lbl">${e(l.ad)}</div><div class="row">${cubuk(l.bitti, l.toplam)}</div></div>`).join('\n')}
  </div></section>
</div>

<section class="card"><h2>Kararlar · toplam ${d.kararlar.length}, otomatik ${otomatik}${d.kararlar.length > 20 ? ' · son 20' : ''}</h2>
${kararlar.length ? `<div class="tw"><table><thead><tr><th>#</th><th>Tarih</th><th>Konu</th><th>Soru</th><th>Seçilen</th><th>Veren</th></tr></thead><tbody>
${kararlar.map((k) => `<tr><td class="num">${e(k.no)}</td><td class="num">${e(k.tarih)}</td><td>${e(k.konu)}</td><td>${kod(k.soru)}</td><td><b>${kod(k.secilen)}</b></td><td><span class="who${/otomatik/i.test(k.veren) ? ' auto' : ''}">${e(k.veren)}</span></td></tr>`).join('\n')}
</tbody></table></div>` : '<p class="muted">Henüz karar verilmedi.</p>'}
</section>

<footer>Son güncelleme: ${e(a['Son güncelleme'] ?? '-')} · Pano üretildi: ${new Date().toLocaleString('tr-TR')} · Kaynak: docs/ILERLEME.md, YOL-HARITASI.md, KARARLAR.md</footer>
</div></body></html>
`;

fs.writeFileSync(path.join(kok, 'DURUM.html'), html);
console.log(`DURUM.html güncellendi · ${d.gorev.bitti}/${d.gorev.toplam} görev · ${d.kararlar.length} karar · ${d.bekleyen.length} bekleyen`);
