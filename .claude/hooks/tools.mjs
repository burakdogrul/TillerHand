#!/usr/bin/env node
// Bağlam paketleri: çekirdek dışı eklentiler proje ayarında kapalı gelir, gerekince kişisel ayarda (settings.local.json) açılır.
//   node .claude/hooks/tools.mjs                     paket durumu
//   node .claude/hooks/tools.mjs --ac <paket>        paketi bu makinede açar (sonra /reload-plugins)
//   node .claude/hooks/tools.mjs --kapat <paket>     kişisel istisnayı siler, proje varsayılanına döner
//   node .claude/hooks/tools.mjs --gerekli <paket>   açıksa 0, kapalıysa 2 (komutlar ilk adımda çağırır)
//   node .claude/hooks/tools.mjs --olc               kurulu eklentilerin skill ve ajan açıklama yükü
// Neden: Skill listesi bağlamın %1'iyle sınırlı; taşınca açıklamalar düşer ve skill kaçırılır. Plugin skill'leri tek tek
// kapatılamaz, eklenti bütün olarak açılır/kapanır. Oturum ortasında açmak prompt önbelleğini bozar: en iyisi faz sınırında, /clear ile.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { eksikler } from './plugins-sync.mjs';

export const PAKETLER = {
  tasarim: {
    aciklama: 'Stil yönleri, palet ve yazı tipi, GSAP',
    komut: '/design',
    eklentiler: ['taste-skill@taste-skill', 'ui-ux-pro-max@ui-ux-pro-max-skill', 'gsap-skills@gsap-skills'],
  },
  guvenlik: {
    aciklama: 'Derin güvenlik taraması',
    komut: '/findings-security, /release',
    eklentiler: ['differential-review', 'insecure-defaults', 'sharp-edges', 'static-analysis', 'supply-chain-risk-auditor', 'agentic-actions-auditor', 'fp-check']
      .map((e) => `${e}@trailofbits`).concat('claude-security@claude-plugins-official'),
  },
  yayin: {
    aciklama: 'İnsan için kod haritası, oturum raporu',
    komut: '/release, /handoff, /adopt',
    eklentiler: ['understand-anything@understand-anything', 'session-report@claude-plugins-official'],
  },
  video: { aciklama: 'Remotion ile video', komut: 'motion-video', eklentiler: ['remotion@remotion'] },
};

const yollar = (kok) => ({ proje: path.join(kok, '.claude', 'settings.json'), yerel: path.join(kok, '.claude', 'settings.local.json') });

function oku(p) {
  if (!fs.existsSync(p)) return {};
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch {
    throw new Error(`${p} geçerli JSON değil; düzeltmeden paket değiştirilemez.`);
  }
}

function paket(ad) {
  if (!Object.hasOwn(PAKETLER, ad ?? '')) throw new Error(`Bilinmeyen paket: ${ad}. Seçenekler: ${Object.keys(PAKETLER).join(', ')}`);
  return PAKETLER[ad];
}

export function paketDurumu(kok) {
  const y = yollar(kok);
  const proje = oku(y.proje).enabledPlugins ?? {};
  const yerel = oku(y.yerel).enabledPlugins ?? {};
  return Object.entries(PAKETLER).map(([ad, p]) => {
    const ids = p.eklentiler.filter((id) => id in proje); // projenin tipinde olmayan eklenti sayılmaz
    return { ad, ...p, eklentiler: ids, acik: ids.length > 0 && ids.every((id) => (yerel[id] ?? proje[id]) !== false) };
  });
}

// Sadece projede tanımlı eklentilere dokunur. Proje varsayılanıyla aynı değer yazılmaz, istisna silinir.
export function paketAyarla(kok, ad, acik) {
  const p = paket(ad);
  const y = yollar(kok);
  const proje = oku(y.proje).enabledPlugins ?? {};
  const yerel = oku(y.yerel);
  const ep = { ...(yerel.enabledPlugins ?? {}) };
  const ids = p.eklentiler.filter((id) => id in proje);
  for (const id of ids) {
    if ((proje[id] !== false) === acik) delete ep[id];
    else ep[id] = acik;
  }
  fs.writeFileSync(y.yerel, JSON.stringify({ ...yerel, enabledPlugins: ep }, null, 2) + '\n');
  return ids;
}

const ayarDizini = () => process.env.CLAUDE_CONFIG_DIR || path.join(os.homedir(), '.claude');
function kurulumKaydi() {
  try { return JSON.parse(fs.readFileSync(path.join(ayarDizini(), 'plugins', 'installed_plugins.json'), 'utf8')).plugins ?? {}; } catch { return {}; }
}

function gez(d, out = []) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { if (e.name !== 'node_modules' && e.name !== '.git') gez(p, out); } else out.push(p);
  }
  return out;
}
const aciklamaUzunlugu = (md) => {
  const fm = md.replace(/\r\n/g, '\n').match(/^---\n([\s\S]*?)\n---/)?.[1] ?? '';
  return Math.min(1536, fm.match(/^description:\s*([\s\S]*?)(?=\n[\w-]+:|$)/m)?.[1].length ?? 0); // listede 1536 karakterde kesilir
};

// shortcut: token ≈ karakter/4 ve when_to_use sayılmaz; kesin değer için /context veya /doctor.
export function olc() {
  return Object.entries(kurulumKaydi()).map(([id, kayit]) => {
    const yol = [kayit].flat().map((k) => k?.installPath).find((p) => p && fs.existsSync(p));
    if (!yol) return { id, skill: 0, skillTok: 0, ajanTok: 0 };
    const dosyalar = gez(yol).map((p) => path.relative(yol, p));
    const skill = dosyalar.filter((p) => /(^|[\\/])SKILL\.md$/.test(p) && !/(^|[\\/])(\.claude|tests?|examples?|upstream)[\\/]/.test(p));
    const ajan = dosyalar.filter((p) => /(^|[\\/])agents[\\/][^\\/]+\.md$/.test(p) && !/(^|[\\/])\.claude[\\/]/.test(p));
    const top = (liste) => Math.round(liste.reduce((s, p) => s + aciklamaUzunlugu(fs.readFileSync(path.join(yol, p), 'utf8')), 0) / 4);
    return { id, skill: skill.length, skillTok: top(skill), ajanTok: top(ajan) };
  });
}

const kuruluListe = () => Object.entries(kurulumKaydi()).flatMap(([id, k]) => [k].flat().map((e) => ({ id, scope: e?.scope, projectPath: e?.projectPath })));
const tokenOf = (olcum, ids) => {
  const bulunan = olcum.filter((o) => ids.includes(o.id));
  return bulunan.length ? `~${bulunan.reduce((s, o) => s + o.skillTok + o.ajanTok, 0)} token` : '? token (kurulu değil)';
};
const NOT = 'Açtıktan sonra /reload-plugins. Oturum ortasında açmak prompt önbelleğini bozar; en iyisi faz sınırında, /clear ile.';

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const kok = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const [bayrak, ad] = process.argv.slice(2);
  try {
    if (bayrak === '--ac' || bayrak === '--kapat') {
      const ids = paketAyarla(kok, ad, bayrak === '--ac');
      if (!ids.length) { console.log(`${ad} paketinin eklentisi bu projede tanımlı değil; değişiklik yok.`); process.exit(0); }
      console.log(`${ad} paketi ${bayrak === '--ac' ? 'açıldı' : 'proje varsayılanına döndü'} (.claude/settings.local.json): ${ids.join(', ')}`);
      const eksik = eksikler(Object.fromEntries(ids.map((id) => [id, true])), kuruluListe(), kok).map((e) => e.id);
      if (bayrak === '--ac' && eksik.length) console.log(`Kurulu değil: ${eksik.join(', ')}. Kullanıcıya sor, onaylarsa: node .claude/hooks/plugins-sync.mjs --kur`);
      console.log(NOT);
    } else if (bayrak === '--gerekli') {
      paket(ad);
      const d = paketDurumu(kok).find((x) => x.ad === ad);
      if (!d.eklentiler.length) { console.log(`${ad} paketi bu projede yok; adımı atla.`); process.exit(0); }
      if (d.acik) { console.log(`${ad} paketi açık.`); process.exit(0); }
      console.log(`${ad} paketi kapalı (${tokenOf(olc(), d.eklentiler)}/oturum: ${d.eklentiler.join(', ')}). ` +
        `Kullanıcıya sor; onaylarsa: node .claude/hooks/tools.mjs --ac ${ad}, sonra /reload-plugins. Reddederse adımı paketsiz yap.`);
      process.exit(2);
    } else if (bayrak === '--olc') {
      const proje = oku(yollar(kok).proje).enabledPlugins ?? {};
      const etkin = { ...proje, ...(oku(yollar(kok).yerel).enabledPlugins ?? {}) };
      const paketi = (id) => Object.keys(PAKETLER).find((a) => PAKETLER[a].eklentiler.includes(id)) ?? (id in proje ? 'çekirdek' : '-');
      const satir = olc().map((o) => ({ eklenti: o.id, paket: paketi(o.id), acik: etkin[o.id] === true, skill: o.skill, aciklamaTok: o.skillTok, ajanTok: o.ajanTok }))
        .sort((a, b) => b.aciklamaTok + b.ajanTok - a.aciklamaTok - a.ajanTok);
      console.table(satir);
      const top = (l) => l.reduce((s, r) => s + r.aciklamaTok + r.ajanTok, 0);
      console.log(`Açık eklentiler: ~${top(satir.filter((r) => r.acik))} token · hepsi açık olsaydı: ~${top(satir)} token. Kesin değer: /context, /doctor.`);
    } else if (!bayrak) {
      const durum = paketDurumu(kok);
      const proje = oku(yollar(kok).proje).enabledPlugins ?? {};
      const paketli = new Set(Object.values(PAKETLER).flatMap((p) => p.eklentiler));
      console.log(`Çekirdek (hep açık): ${Object.keys(proje).filter((id) => proje[id] !== false && !paketli.has(id)).join(', ') || '-'}`);
      const olcum = olc();
      for (const d of durum.filter((x) => x.eklentiler.length)) {
        console.log(`  ${d.ad.padEnd(9)} ${d.acik ? 'açık  ' : 'kapalı'}  ${tokenOf(olcum, d.eklentiler).padEnd(24)} ${d.komut} · ${d.aciklama}`);
      }
      console.log(NOT);
    } else {
      console.error('Kullanım: tools.mjs [--ac <paket> | --kapat <paket> | --gerekli <paket> | --olc]');
      process.exit(1);
    }
  } catch (h) {
    console.error(h.message);
    process.exit(1);
  }
}
