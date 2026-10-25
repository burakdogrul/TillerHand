# Dağıtım Kurulumu

> `/release first` → "Dağıtım kurulumu" bu dosyayı kullanır. Sadece `docs/architecture/stack.md`'deki sağlayıcıların bölümü okunur.
> Adımlar sağlayıcıların resmî dokümanından alındı; her bölümde kaynak ve kontrol tarihi var. Paneller değişir:
> kullanmadan önce kaynak sayfayı `source-research` ile yeniden aç. Bir şey değiştiyse güncel kaynağa göre ilerle ve farkı raporda yaz.
> Bir yıldan eski kaynak tarihi ⚠️ ile işaretlidir.

## Kurallar

- **Sır değeri sohbete ve dosyaya yazılmaz.** Bu dosyaya, `accounts.md`'ye ve koda da. AI sadece değişken adını söyler (`.env.example`'daki gibi); değeri kullanıcı sağlayıcının panelinde kendisi girer.
- `mattpocock-skills:wizard` betiği prod sırrı istemez ve `.env`'e prod değeri yazmaz. Prod değeri panelde girilir. Betik sadece CI sırlarını (ör. `LIVE_TEST_*`) kullanıcının terminalinde gizli girişle `gh secret set`'e verir. Betik `sandbox/` altında durur, iş bitince silinir.
- Prod deploy, geri alma provası ve yedekten geri yükleme onaysız başlamaz.
- AI ve yerel ortam prod veritabanına bağlanmaz (`accounts.md` → Ortamlar). Tek istisna: kullanıcının kendi terminalinde aldığı yedek (Supabase → Yedek).
- Her adımın sonucu `accounts.md`'ye (servis, sahip, 2FA, plan, bitiş; Ortamlar'da prod ref ve URL) ve `/release` raporuna işlenir.
- Bu dosya kitle güncellenir; projede düzenleme. Kaynakla çelişen adımı raporda yaz.

## Sıra

1. Hosting projesi (prod, dev'den ayrı)
2. Ortam değişkenleri (Production ve Preview ayrı değer)
3. Alan adı ve DNS
4. Yedek ve zamana geri dönüş (PITR)
5. Geri alma provası (en sonda, onaylı)

## Vercel (web)

Kontrol: 2026-10-25. Kaynaklar: [Environment variables](https://vercel.com/docs/environment-variables) (2026-09-17) · [Add a domain](https://vercel.com/docs/domains/working-with-domains/add-a-domain) (2026-09-16) · [A record](https://vercel.com/kb/guide/a-record-and-caa-with-vercel) (2026-10-16) · [Instant Rollback](https://vercel.com/docs/instant-rollback) (2026-07-07)

**Proje.** GitHub deposunu Vercel projesine bağla. Prod dalına (genelde `main`) push prod deploy'u, diğer dallar önizlemeyi üretir.

**Ortam değişkenleri.** Settings → Environment Variables. Her değişken için ortam seç: Production, Preview, Development. Anahtar ve token **Secret** türünde girilir (kaydedildikten sonra okunamaz); URL gibi açık değerler **Config**. Değişiklik eski deploy'lara uygulanmaz, yeni deploy gerekir. Sınır: deploy başına toplam 64 KB (edge'de değişken başı 5 KB).

**Alan adı.** Settings → Domains → Add Domain (CLI: `vercel domains add example.com <proje>`). Apex eklenince `www` önerilir: ikisini de ekle, birini diğerine yönlendir.
- Apex (`example.com`): **A** kaydı. Değeri proje alan adı kartından al. Çoğu projede `76.76.21.21`, yeni projelerde farklı olabilir (ör. `216.198.79.1`); doğrulama karttaki değeri arar.
- Alt alan (`www`, `app`): **CNAME**, hedef projeye özel (kartta, ör. `…vercel-dns-017.com`).
- Alan başka bir Vercel hesabındaysa `_vercel` adında **TXT** doğrulaması istenir.
- Nameserver'ı Vercel'e taşıyacaksan önce MX ve doğrulama TXT kayıtlarını kopyala; yoksa e-posta durur. SSL otomatik.

**Yedek.** Vercel'de veri yok; veritabanının bölümüne bak.

**Geri alma.** Proje → Production Deployment kutusu → Instant Rollback (ya da Deployments → ⋮ → Instant Rollback).
- Hobby sadece bir önceki prod deploy'a döner; Pro ve Enterprise prod'a çıkmış her deploy'a.
- Ortam değişkenleri geri alınmaz, eski build'in değerleriyle çalışır.
- Geri almadan sonra prod alan adı otomatik atanmaz: yeni push canlıya çıkmaz. Düzeltme hazır olunca "Undo Rollback" ya da `vercel promote <deploy-url>`.

## Supabase (veritabanı + kimlik)

Kontrol: 2026-10-25. Kaynaklar: [Backups](https://supabase.com/docs/guides/platform/backups) · [Backup and restore using the CLI](https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore) · [API keys](https://supabase.com/docs/guides/api/api-keys) (sayfalarda tarih yok)

**Proje.** Prod için ayrı proje aç. Ref'ini `accounts.md` → Ortamlar → prod satırına yaz. Auth ve e-posta ayarları: `docs/architecture/stack.md` → "Canlıya alma (ek)".

**Anahtarlar.** Yeni anahtarlar `sb_publishable_…` (istemciye gidebilir) ve `sb_secret_…` (sadece sunucuda; hosting panelinde Secret türünde). `eyJ` ile başlayan uzun anahtar eski türdür. Supabase eski `anon` ve `service_role` anahtarlarını 2026 sonuna kadar kullanımdan kaldırıyor: yeni projede yeni anahtarları kullan. `.env.example`'da eski adlar (`NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`) duruyorsa yeni anahtarı aynı adla gir.

**Yedek.**
- Free: otomatik yedek listelenmiyor. Düzenli dış yedek al. Varsayılan `db dump` sadece şemayı alır; tam yedek üç dosyadır. Bu komutları **kullanıcı kendi terminalinde** çalıştırır: bağlantı adresinde prod veritabanı parolası var, AI komutu çalıştırmaz ve parolayı istemez. Dosyalar depoya girmez.
  ```bash
  npx -y supabase@2.120.0 db dump --db-url "$PROD_DB_URL" -f roles.sql --role-only
  npx -y supabase@2.120.0 db dump --db-url "$PROD_DB_URL" -f schema.sql
  npx -y supabase@2.120.0 db dump --db-url "$PROD_DB_URL" -f data.sql --use-copy --data-only -x "storage.buckets_vectors" -x "storage.vector_indexes"
  ```
  `PROD_DB_URL`: panelin Connect ekranındaki Session pooler adresi; kalıcı dosyaya yazılmaz. Gerekenler: Supabase CLI ve Docker.
- Pro 7 gün, Team 14 gün, Enterprise 30 güne kadar günlük yedek.
- PITR: Pro ve üstünde eklenti, en az Small compute. 7/14/28 gün saklama, aylık yaklaşık $100/$200/$400. En kötü durumda 2 dakikalık veri kaybı. PITR açılınca günlük yedek durur.
- Geri yükleme: Database → Backups. Bu sırada proje erişilemez, süre veritabanı boyutuyla uzar. Storage dosyaları yedekte yok.
- Prova: prod'u geri yükleme. Kullanıcı üç dosyayı kendi makinesinde geçici bir yerel veritabanına (`supabase start`) `psql --single-transaction` ile yükler (sıra ve bayraklar kaynak sayfada), birkaç tabloyu kontrol eder, sonra yerel veritabanını ve dosyaları siler. Dev projesine yükleme: prod'daki kişisel veri AI'nın okuduğu ortama geçer.

**Geri alma.** Migration'ı geri almak için ters migration yaz; yedekten dönüş son çaredir (kesinti ve veri kaybı).

## Railway (backend)

Kontrol: 2026-10-25. Kaynaklar: [Working with domains](https://docs.railway.com/networking/domains/working-with-domains) · [Variables](https://docs.railway.com/variables) · [Deployment actions](https://docs.railway.com/deployments/deployment-actions) · [Backups](https://docs.railway.com/volumes/backups) · [Plans](https://docs.railway.com/pricing/plans) (sayfalarda tarih yok)

**Proje.** GitHub deposundan servis oluştur. Railway adresi: servis Settings → Networking → Public Networking → Generate Domain.

**Ortam değişkenleri.** Servisin Variables sekmesi. Birden çok serviste aynı olan değer: Project Settings → Shared Variables, serviste `${{shared.AD}}`. Veritabanı adresi referansla: `${{Postgres.DATABASE_URL}}` (servis adı Postgres ise). Sırları **sealed** yap: değer arayüzde ve API'de görünmez, geri açılamaz, PR ortamına kopyalanmaz. Değişiklikler önce "staged" olur; Deploy ile uygulanır.

**Alan adı.** Servis Settings → Public Networking → + Custom Domain. Panel bir **CNAME** (ör. `…up.railway.app`) ve bir **TXT** kaydı gösterir; ikisini de aynen gir. TXT yoksa alan doğrulanmaz ve 404 döner. Yayılma 72 saate kadar sürebilir.
- Apex için DNS sağlayıcısı CNAME flattening veya ALIAS desteklemeli (Cloudflare, Namecheap: CNAME; DNSimple: ALIAS). Route 53, Azure DNS, GoDaddy, Hostinger, NameSilo, Squarespace desteklemez: nameserver'ı Cloudflare'e taşı.
- Cloudflare proxy açıksa SSL/TLS ayarı **Full** olmalı; Full (Strict) çalışmaz.
- SSL (Let's Encrypt) DNS'ten sonra 1 saat içinde. Sınır: Trial 1 alan, Hobby servis başı 2, Pro 20.

**Yedek.** Veritabanı servisi → Backups sekmesi. Elle yedek ve zamanlama: günlük (6 gün saklanır), haftalık (27 gün), aylık (89 gün). Elle yedek volume boyutunun %50'siyle sınırlı. Geri yükleme yeni bir volume açar, eskisi bağlantısız kalır; Deploy ile uygulanır ve sadece aynı proje ve ortama yapılır. Volume silinirse yedekleri de gider: ayrıca `pg_dump` ile dış yedek al.

**Geri alma.** Servis → Deployments → önceki deploy → ⋮ → Rollback. İmajı ve değişkenleri geri getirir, veritabanı şemasını getirmez. Pencere imaj saklama süresi kadar: Free/Trial 24 saat, Hobby 72 saat, Pro 120 saat. Daha eskisine yeniden deploy gerekir.

## EAS (mobil)

Kontrol: 2026-10-25. Kaynaklar: [Environment variables](https://docs.expo.dev/eas/environment-variables/) (2026-07-21) · [Manage variables](https://docs.expo.dev/eas/environment-variables/manage/) (2026-07-21) · [Submit](https://docs.expo.dev/submit/introduction/) (2026-10-12) · [Rollbacks](https://docs.expo.dev/eas-update/rollbacks/) (2025-03-03 ⚠️)

**Proje ve hesaplar.** Apple Developer Program ve Google Play Console hesapları `accounts.md`'ye (yıllık yenileme tarihiyle). Mağaza listesini Play Console'da gönderimden önce hazırla. `eas submit` ilk Android sürümünü internal testing kanalına yükler. CI'da gönderim için Google servis hesabı anahtarı ve App Store Connect API anahtarı gerekir; bu dosyalar depoya girmez.

**Ortam değişkenleri.** Ortamlar: development, preview, production. Görünürlük:
- plain text: sitede, CLI'da ve logda görünür;
- sensitive: logda gizlenir, sitede ve CLI'da okunur;
- secret: sadece EAS sunucularında okunur. Derleme sırasında gereken anahtarlar içindir (ör. özel paket token'ı).

Uygulamaya giren her değer (`EXPO_PUBLIC_…`) herkese açıktır: oraya sır koyma. Build profili ortamı `eas.json` → `environment` alanından seçer; güncelleme `eas update --environment production`. Değeri sitede gir: `eas env:set --value …` değeri kabuk geçmişine yazar.

**Yedek.** EAS'ta veri yok; backend'in bölümüne bak (Supabase veya Railway).

**Geri alma.** `eas update:rollback`: önceki güncellemeyi yeniden yayımlar ya da build'e gömülü güncellemeye döner. Native kod değişikliği güncellemeyle geri alınmaz: yeni build ve mağaza incelemesi gerekir.

## Geri alma provası (hepsi)

Lansmandan önce bir kez, kullanıcı onayıyla: zararsız bir değişiklik yayımla, geri al, duman testiyle eski sürümün canlıda olduğunu gör, sonra normale dön (Vercel'de "Undo Rollback"). Sonucu `/release` raporunda "Geri alma yolu" satırına yaz.
