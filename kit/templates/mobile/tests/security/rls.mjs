// RLS saldırgan testi: anonim kullanıcı ve ikinci kullanıcı, birinci kullanıcının verisini okuyamamalı, değiştirememeli,
// silememeli ve onun adına yazamamalı. RLS'i kapalı veya bu teste kayıtsız public tablo varsa test kırmızıdır.
// Sadece YEREL Supabase'e karşı çalışır (dev ve prod verisine dokunmaz, sır gerekmez). CI: .github/workflows/ci.yml → rls.
//   npx -y supabase@2.120.0 start
//   npx -y supabase@2.120.0 status -o env  → API_URL, ANON_KEY, SERVICE_ROLE_KEY, DB_URL değerlerini ortama aktar (CI'daki adıma bak)
//   node --test tests/security/rls.mjs   (adı .test.mjs değil: Vitest/Jest ortamsız toplamasın)
// Kapsam dışı: view'lar (security_invoker yoksa sahibinin yetkisiyle çalışır, RLS'i atlar) ve SECURITY DEFINER
// fonksiyonlar. Bunlar public şemadaysa elle incele veya ayrı test yaz.
// Her yeni tabloda: TABLOLAR'a ekle. Bilerek herkesin okuduğu tablo (fiyat planları vb.) HERKESE_ACIK'a; yazma yine kapalı olmalı.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';

// { ad: 'notes', sahip: 'user_id', ornek: () => ({ title: 'gizli not' }) }  (anahtar sütunu "id" değilse: anahtar: 'note_id')
const TABLOLAR = [];
// { ad: 'plans', ornek: () => ({ name: 'deneme' }) }
const HERKESE_ACIK = [];

const API = process.env.API_URL;
const ANON = process.env.ANON_KEY ?? process.env.PUBLISHABLE_KEY;
const SERVIS = process.env.SERVICE_ROLE_KEY ?? process.env.SECRET_KEY;
const DB = process.env.DB_URL;

const yerel = (u) => { try { return ['localhost', '127.0.0.1', '[::1]'].includes(new URL(u).hostname); } catch { return false; } };
if (!API || !ANON || !SERVIS) throw new Error('API_URL, ANON_KEY ve SERVICE_ROLE_KEY yok: önce yerel Supabase\'i başlat ve "supabase status -o env" çıktısını ortama aktar.');
// CI'da tablo listesi atlanırsa RLS'i kapalı tablo fark edilmeden geçer
if (!DB && process.env.CI) throw new Error(`DB_URL yok: CI'da tablo listesi atlanamaz. "supabase status -o env" çıktısındaki DB_URL'yi ortama aktar.`);
if (!yerel(API) || (DB && !yerel(DB))) throw new Error(`RLS testi sadece yerel Supabase'e karşı çalışır; ${new URL(API).hostname} yerel değil. Dev veya prod projesine karşı çalıştırma.`);

let istemci, admin, kullanicilar;
const yeniKullanici = async () => {
  const email = `rls-${randomUUID()}@test.local`;
  const password = randomUUID();
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const c = istemci(ANON);
  const giris = await c.auth.signInWithPassword({ email, password });
  if (giris.error) throw giris.error;
  return { id: data.user.id, c };
};

before(async () => {
  const { createClient } = await import('@supabase/supabase-js');
  istemci = (anahtar) => createClient(API, anahtar, { auth: { persistSession: false, autoRefreshToken: false } });
  admin = istemci(SERVIS);
  kullanicilar = [await yeniKullanici(), await yeniKullanici()];
});
after(async () => { for (const k of kullanicilar ?? []) await admin.auth.admin.deleteUser(k.id); });

function publicTablolar(t) {
  if (!DB) return t.skip('DB_URL yok; tablo listesi atlandı') ?? null;
  try {
    return execFileSync('psql', [DB, '-At', '-F', ':', '-c', "select tablename, rowsecurity from pg_tables where schemaname = 'public'"], { encoding: 'utf8' })
      .split('\n').filter(Boolean).map((s) => { const [ad, rls] = s.split(':'); return { ad, rls: rls === 't' }; });
  } catch (e) {
    if (e.code === 'ENOENT' && !process.env.CI) return t.skip('psql kurulu değil; CI\'da çalışır') ?? null;
    throw e;
  }
}

test('SALDIRI: RLS bütün public tablolarda RLS açık', (t) => {
  const tablolar = publicTablolar(t);
  if (!tablolar) return;
  assert.deepEqual(tablolar.filter((x) => !x.rls).map((x) => x.ad), [], 'RLS kapalı tablo: "alter table ... enable row level security" ve politika yaz');
});

test('SALDIRI: RLS bütün public tablolar bu teste kayıtlı', (t) => {
  const tablolar = publicTablolar(t);
  if (!tablolar) return;
  const kayitli = new Set([...TABLOLAR, ...HERKESE_ACIK].map((x) => x.ad));
  assert.deepEqual(tablolar.map((x) => x.ad).filter((ad) => !kayitli.has(ad)), [], 'Yeni tabloyu tests/security/rls.mjs → TABLOLAR (veya HERKESE_ACIK) listesine ekle');
});

for (const { ad, sahip, ornek, anahtar = 'id' } of TABLOLAR) {
  test(`SALDIRI: RLS ${ad} başka kullanıcıya ve anonime kapalı`, async () => {
    const [a, b] = kullanicilar;
    const anon = istemci(ANON);
    const { data: satir, error } = await a.c.from(ad).insert({ ...ornek(), [sahip]: a.id }).select().single();
    assert.ifError(error); // sahibi kendi satırını yazabilmeli; yazamıyorsa ornek() veya politika eksik
    const id = satir[anahtar];

    assert.equal((await anon.from(ad).select().eq(anahtar, id)).data?.length ?? 0, 0, 'anonim okuyabiliyor');
    assert.equal((await b.c.from(ad).select().eq(anahtar, id)).data?.length ?? 0, 0, 'başka kullanıcı okuyabiliyor');
    assert.equal((await b.c.from(ad).update({ ...ornek(), [sahip]: b.id }).eq(anahtar, id).select()).data?.length ?? 0, 0, 'başka kullanıcı güncelleyebiliyor');
    assert.equal((await b.c.from(ad).delete().eq(anahtar, id).select()).data?.length ?? 0, 0, 'başka kullanıcı silebiliyor');
    // Dönen satır sayısı 0 olsa da değişiklik uygulanmış olabilir (select politikası yokken): satır yeniden okunur
    assert.deepEqual((await admin.from(ad).select().eq(anahtar, id).single()).data, satir, 'başka kullanıcı satırı değiştirmiş veya silmiş');
    assert.ok((await b.c.from(ad).insert({ ...ornek(), [sahip]: a.id })).error, 'başka kullanıcı onun adına yazabiliyor');
    assert.ok((await anon.from(ad).insert({ ...ornek(), [sahip]: a.id })).error, 'anonim yazabiliyor');
  });
}

for (const { ad, ornek } of HERKESE_ACIK) {
  test(`SALDIRI: RLS ${ad} herkese açık ama yazmaya kapalı`, async () => {
    assert.ok((await istemci(ANON).from(ad).insert(ornek())).error, 'anonim yazabiliyor');
    assert.ok((await kullanicilar[1].c.from(ad).insert(ornek())).error, 'giriş yapmış kullanıcı yazabiliyor');
  });
}
