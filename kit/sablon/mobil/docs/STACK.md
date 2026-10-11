# Stack: Mobil Uygulama

> Bu dosya her oturumda AI'ya yüklenir. Projede farklı bir seçim yaptıysan burayı güncelle
> ve nedenini `docs/KARARLAR.md`'ye yaz.

## Karar noktaları

`/baslat` bu kararları sırayla sorar (`docs/KARAR-PROTOKOLU.md`). Her kararda bu projeye en uygun 2-4 seçeneği sun; **önerilen** etiketi varsayılandır, ama PRD'ye göre başka seçenek daha uygunsa onu öner ve nedenini söyle.

| # | Karar | Seçenekler (ne zaman daha iyi) |
|---|---|---|
| 1 | Yaklaşım | **Expo / React Native** (önerilen: tek kod iki platform, TypeScript, OTA güncelleme, AI'nın iyi bildiği ekosistem) · Flutter (piksel hassasiyetinde özel arayüz, yüksek animasyon performansı; Dart) · Native Swift + Kotlin (en iyi platform deneyimi; iki ayrı kod tabanı) · PWA (mağazasız, en ucuz; cihaz özellikleri sınırlı) |
| 2 | Platformlar | **iOS + Android** · Önce iOS (ödeme yapan kitle, daha az cihaz çeşidi) · Önce Android (TR pazar payı yüksek, yayın süreci hızlı) |
| 3 | Backend | **Supabase** (önerilen: auth + Postgres + storage + RLS) · Firebase (gerçek zamanlı, çevrimdışı senkron güçlü) · Kendi API'n (karmaşık iş mantığı; ayrı backend projesi) · Yok (tamamen cihazda) |
| 4 | Yerel veri | **SecureStore + MMKV** (önerilen: ayar ve token) · SQLite / expo-sqlite (çevrimdışı çok veri) · WatermelonDB (çevrimdışı öncelikli, senkron) |
| 5 | Veri ve durum yönetimi | **TanStack Query + Zustand** (önerilen) · Redux Toolkit (büyük ekip, katı yapı) |
| 6 | Uygulama içi satın alma | Yok · **RevenueCat** (önerilen: iki mağaza tek API, abonelik analitiği) · Doğrudan StoreKit + Play Billing (komisyon yok, çok iş) |
| 7 | Bildirim | **expo-notifications** (önerilen) · OneSignal (pazarlama kampanyaları, segmentasyon) · Yok |
| 8 | UI bileşenleri | **Kendi bileşenlerin + tema dosyası** (önerilen: DESIGN.md'ye tam uyum) · Tamagui (web + mobil ortak) · React Native Paper (Material hazır bileşenler) |
| 9 | Analitik ve hata | **Sentry + PostHog** (önerilen) · Firebase Analytics + Crashlytics (Firebase seçildiyse) |
| 10 | Test | **Jest + RNTL + Maestro** (önerilen) · Detox (daha derin e2e, kurulumu zor) |

## Seçilen teknolojiler

> `/baslat` Adım 4'te karar noktalarına göre doldurulur. Aşağıdaki tablo **önerilen** yığındır ve onaylanana kadar öneri sayılır.
> Seçim farklıysa bu dosyanın komut, klasör, kural, doğrulama ve kontrol bölümleri seçime göre yeniden yazılır.

| Katman | Seçim | Not |
|---|---|---|
| Framework | Expo (React Native) + TypeScript (strict) | Alternatif: Flutter |
| Navigasyon | Expo Router | Dosya tabanlı |
| Backend | Supabase veya Firebase | Ayrı API gerekiyorsa `backend` şablonu |
| Güvenli depolama | `expo-secure-store` | Token'lar burada, AsyncStorage'da değil |
| Uygulama içi satın alma | RevenueCat | Dijital içerik = mağaza ödemesi zorunlu |
| Build / yayın | EAS Build, EAS Submit, EAS Update | |
| Hata takibi | Sentry (`@sentry/react-native`) | |
| Test | Jest + React Native Testing Library, Maestro (e2e) | |

## Komutlar

```bash
npx expo start                          # geliştirme
npx expo lint
npx tsc --noEmit
npm run test                            # jest
npx expo install [paket]                # paket ekleme (SDK uyumlu sürüm seçer, npm install değil)
npx expo-doctor                         # bağımlılık uyumu kontrolü
eas build --profile preview --platform all     # test build'i
eas build --profile production --platform all  # mağaza build'i
eas submit --platform ios|android
eas update --branch production          # OTA güncelleme (sadece JS değişikliği)
maestro test .maestro/                  # e2e
```

## Klasör yapısı

```
app/                 # ekranlar (Expo Router)
  (auth)/
  (tabs)/
components/
lib/                 # iş mantığı, API istemcisi
hooks/
assets/              # ikon, splash, font
.maestro/            # e2e akışları
app.config.ts        # sürüm, izinler, bundle id
eas.json             # build profilleri
```

## Kodlama kuralları

- **Uygulama paketindeki her şey herkese açıktır.** Sır, servis anahtarı, admin anahtarı uygulamaya konmaz; gizli işlemler sunucuda.
- `EXPO_PUBLIC_` ön ekli değişkenler pakete gömülür; sadece herkese açık değerler.
- Paket eklerken `npx expo install` kullan.
- Her ekranda: yükleniyor, boş, hata, **çevrimdışı** durumu.
- İzin istemeden önce neden gerektiğini kullanıcıya göster; izin metinleri (`infoPlist`) Türkçe ve açıklayıcı.
- Klavye ekranı kapatmasın (`KeyboardAvoidingView`), güvenli alan (`SafeAreaView`) kullan.
- Dokunma alanı en az 44x44 pt; erişilebilirlik etiketleri (`accessibilityLabel`).
- Her özelliği **hem iOS hem Android'de, gerçek cihazda** dene.
- UI işinden önce `DESIGN.md` ve `docs/TASARIM.md`'yi oku; belirteçlerin ve kuralların dışına çıkma. Yeni tasarım kararı gerekiyorsa `/tasarim`.

## Doğrulama (görev bitmeden kanıt)

- Mantık: Jest testleri çalıştır, çıktıyı göster.
- Akış: `.maestro/` altında ilgili akış varsa `maestro test` çalıştır; yoksa kritik akışlar için yaz.
- Cihaz testi AI tarafından yapılamaz: Bana iOS ve Android'de denemem gereken adımları, beklenen sonuçla birlikte madde madde yaz.

## Otomatik kontroller

| Katman | Ne yapar | Kurulum |
|---|---|---|
| Claude hook'ları | Sır yazımını engeller; düzenlenen dosyayı Prettier ile biçimlendirir | Hazır (`.claude/settings.json`). Prettier projede kurulu olmalı |
| Pre-commit | lint-staged (ESLint + Prettier) + sır taraması | `npm i -D husky lint-staged prettier` → `npm pkg set scripts.prepare="husky"` → `npx husky` |
| CI (+ Semgrep, kopya kod) | Lint, tip, test, expo-doctor, açık taraması, gitleaks | `.github/workflows/ci.yml` hazır |
| Dependabot | Haftalık küçük güncellemeler (Expo SDK paketleri hariç) | `.github/dependabot.yml` hazır |
| MCP | Supabase (salt-okunur), Sentry | `.mcp.json`: `PROJE_REF`'i doldur. Supabase MCP'yi sadece **geliştirme** projesine bağla |

## Kabul testleri ve özellik bayrakları

**Kabul testleri** (`docs/TEST-PLANI.md` §1a): Jest testinin veya Maestro akışının adı kriter kimliğini taşır (`Ö-01.1`). Pano JUnit raporunu okur:

```bash
npx jest --reporters=default --reporters=jest-junit   # JEST_JUNIT_OUTPUT_DIR=test-results
maestro test .maestro/ --format junit --output test-results/junit-e2e.xml
```

**Özellik bayrakları** (`docs/BAYRAKLAR.md`): Mağaza güncellemesi olmadan kapatılabilmeli. Uygulama açılışta uzaktan okur ve son bilinen değeri önbellekte tutar; ağ yoksa güvenli varsayılan (kapalı) kullanılır:
- PostHog feature flags veya Firebase Remote Config; ya da Supabase `feature_flags` tablosu.
- Okuma tek bir hook'tan yapılır: `hooks/useBayrak.ts`. Ödeme, AI ve bildirim gönderen özellikler bayraksız yayınlanmaz.

## Sık yapılan AI hataları (bunlara dikkat)

- Web'e özel API veya paket kullanmak (DOM, `window`, sadece web çalışan kütüphaneler).
- `npm install` ile SDK ile uyumsuz sürüm kurmak.
- Token'ı AsyncStorage'a yazmak.
- Native modül gerektiren paketi Expo Go'da çalışır sanmak (development build gerekir).
- Native değişikliği (yeni izin, native paket) OTA güncellemesiyle göndermeye çalışmak.

## Güvenlik (ek)

- [ ] Pakette sır yok (build sonrası `EXPO_PUBLIC_` değişkenlerini gözden geçir).
- [ ] Token'lar SecureStore'da.
- [ ] Deep link parametreleri doğrulanıyor.
- [ ] API çağrıları sadece HTTPS.

## Canlıya alma (ek)

- [ ] `app.config.ts`: bundle id / package adı kalıcı ve doğru; `version`, iOS `buildNumber`, Android `versionCode` artırıldı
- [ ] Uygulama ikonu, splash, uygulama adı
- [ ] Mağaza sayfası: açıklama, anahtar kelimeler, ekran görüntüleri (tüm gerekli boyutlar), destek URL'si, **gizlilik politikası URL'si**
- [ ] **App Store gizlilik etiketleri** (App Privacy) ve **Google Play Veri Güvenliği** formu, gerçek veri toplamayla uyumlu
- [ ] **Uygulama içi hesap silme** (hesap oluşturma varsa Apple ve Google zorunlu kılar)
- [ ] Üçüncü taraf girişi (Google vb.) varsa Apple'ın giriş kuralı (Guideline 4.8) kontrol edildi
- [ ] Dijital içerik/abonelik satışı mağaza ödemesiyle (Apple 3.1.1); fiyatlar ve abonelik metinleri mağazada
- [ ] İnceleme ekibi için **test hesabı** ve notlar
- [ ] TestFlight / Google Play dahili test kanalında en az birkaç gün test
- [ ] Android: Google Play'in güncel **hedef API seviyesi** şartı karşılanıyor
- [ ] EAS Update: `runtimeVersion` politikası belirlendi; OTA ile sadece JS değişikliği gidiyor
- [ ] Sentry sembol/kaynak haritaları yükleniyor
- [ ] Performans: soğuk açılış < 3 sn (orta seviye Android'de), liste kaydırma takılmıyor

## Bakım (ek)

- Haftalık: Sentry'de **çökme oranı** (hedef: çökmesiz kullanıcı ≥ %99.5), mağaza yorumları ve puanı.
- Aylık: `npx expo-doctor`, `npm outdated`, `npm audit`.
- Çeyreklik: Expo SDK yükseltmesi (yılda ~3 SDK çıkar; 2 sürümden fazla geride kalma), Apple geliştirici üyeliği ve sertifika/provisioning bitiş tarihleri, Google Play hedef API seviyesi duyuruları, Apple'ın yeni Xcode/SDK zorunlulukları.
