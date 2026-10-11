#!/usr/bin/env node
// UserPromptSubmit hook'u: Uzun oturumlarda temel kuralları düzenli aralıklarla hatırlatır (bağlam çürümesine karşı)
// ve bağlam doluluğu yüksekse oturumu kapatmayı önerir. stdout, kullanıcının mesajına bağlam olarak eklenir.
// Kısa tutulur: her hatırlatma token harcar.
import fs from 'node:fs';
import path from 'node:path';

export const ARALIK = 12; // her 12 mesajda bir
const kok = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const sayacDosyasi = path.join(kok, '.claude', '.hatirlatma.json');

let veri = { oturum: '', sayi: 0 };
let oturum = '';
try { oturum = JSON.parse(fs.readFileSync(0, 'utf8')).session_id ?? ''; } catch { /* girdi yok */ }
try { veri = JSON.parse(fs.readFileSync(sayacDosyasi, 'utf8')); } catch { /* ilk çalışma */ }
if (veri.oturum !== oturum) veri = { oturum, sayi: 0 };
veri.sayi++;
try { fs.writeFileSync(sayacDosyasi, JSON.stringify(veri)); } catch { /* yazılamazsa sessiz geç */ }

const notlar = [];
if (veri.sayi % ARALIK === 0) {
  notlar.push('[Kit hatırlatma] Kararları AskUserQuestion ile sor (önerilen ilk sırada). Kapsamı genişletme. Kurul ve limit kurallarına uy. Her cevabın sonuna durum bloğu ekle.');
}
try {
  const b = JSON.parse(fs.readFileSync(path.join(kok, '.claude', '.baglam.json'), 'utf8'));
  if (b.yuzde >= 70) notlar.push(`[Kit] Bağlam %${b.yuzde} dolu: yanıt kalitesi düşebilir. Mevcut adımı bitir, kullanıcıya /oturum-sonu ve ardından /clear öner.`);
  else if (b.yuzde >= 50 && veri.sayi % 4 === 0) notlar.push(`[Kit] Bağlam %${b.yuzde}: uygun bir noktada /oturum-sonu + /clear önermeyi düşün.`);
} catch { /* bağlam bilgisi yok */ }

if (notlar.length) console.log(notlar.join('\n'));
