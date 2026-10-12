# Harcama Alarmları

> Canlıdaki ürünün faturası sessizce büyüyebilir. AI çağrısı yapan bir döngü, bot trafiği veya sızan bir API anahtarı bir gecede aylık bütçeyi bitirebilir. Bu dosya ücretli her servis için **tavanı** (aşılınca durur) ve **uyarıyı** (eşikte haber verir) kayıt altına alır.
> Bu, Claude Code limitinden ayrı bir şey: Burada konu senin ürününün kendi faturası.
> `/dashboard` panosu (Operasyon sekmesi) aşağıdaki tabloyu okur. Limiti boş olan ücretli satırı "ayarlanmadı" diye işaretler.

## Alarmlar

Her ücretli servis için bir satır. **Tür:** `tavan` (servis durur veya istek reddedilir) ya da `uyarı` (sadece haber verir). **Tutar:** aylık, para birimiyle (örn. `50 USD`). **Son kontrol:** `YYYY-AA-GG`.

| Servis | Tür | Tutar | Uyarı eşikleri | Nereden ayarlandı | Son kontrol |
|---|---|---|---|---|---|

## Sağlayıcıların sunduğu ayarlar

Doğrulama tarihi: 2026-10-12. Panel yerleri ve özellikler değişebilir. Kurmadan önce `source-research` ile güncel dokümana bak.

| Servis | Ne var | Durdurur mu? |
|---|---|---|
| Anthropic (Claude API) | Console'da organizasyon ve workspace bazında aylık harcama limiti | Evet. Limit dolunca istekler hata döner. Her ürün için ayrı bir workspace aç. |
| OpenAI | Proje bazında bütçe uyarıları; yeni hesaplarda sert limit de olabilir | Uyarılar durdurmaz. Sert limit varsa limit dolunca istek 429 döner. Panelden kontrol et. |
| Vercel | Spend Management (Pro): %50, %75 ve %100'de bildirim, webhook | Varsayılan olarak durdurmaz. "Projeleri duraklat" seçeneği ayrıca açılmalı. |
| Supabase | Pro planda harcama tavanı (spend cap) varsayılan açık | Evet, tavan açıksa kota aşımı faturalanmaz. Kapatırsan durdurmaz. |
| Google Cloud / Firebase | Bütçe ve uyarı (Budgets & alerts) | Hayır, sadece haber verir. Durdurmak için ek otomasyon gerekir. |

Kural: Durdurmayan servislerde uyarıyı en az iki eşikte kur (%50 ve %80). Uyarıların gideceği e-posta adresi gerçekten okunan bir adres olmalı.

## Uygulama içi koruma (kodda)

Sağlayıcı limiti son savunmadır. Ondan önce ürünün kendisi harcamayı sınırlar. AI veya ücretli API çağrısı yapan her özellikte:

1. **Kullanıcı başı kota:** Günlük veya aylık istek ya da token sınırı olur. Aşılınca anlaşılır bir mesaj gösterilir ("Bugünkü hakkın doldu, yarın yenilenir"). Kota sunucuda tutulur, istemciye güvenilmez.
2. **Genel günlük bütçe:** Tüm kullanıcıların o günkü tahmini harcaması toplanır.
   - Bütçenin %80'inde: Uyarı gönderilir (e-posta ve hata takibi).
   - Bütçenin %100'ünde: Özellik bayrağı (`docs/operations/feature-flags.md`) otomatik kapanır. Kullanıcıya "geçici olarak kullanılamıyor" mesajı gösterilir.
3. **Her çağrı loglanır:** özellik, model, girdi ve çıktı token sayısı, tahmini maliyet, kullanıcı id. İçerik loglanmaz (KVKK).
4. **Kötüye kullanım:** Kayıt olmadan AI çağrısı yapılamaz. İstek hızı sınırı (rate limit) ve bot koruması vardır.

Bu kuralların uygulanma yöntemi `docs/architecture/stack.md`'ye, AI ekinde `docs/ai/guide.md` → "Maliyet kontrolü"ne yazılır.

## Ne zaman kontrol edilir

- **`/start` Adım 5 (dış servisler):** Ücretli seçilen her servis için tabloya bir satır eklenir.
- **`/release`:** Ücretli her servisin tavanı veya uyarısı kurulmuş ve bir kez test edilmiş olmalıdır. Test: düşük bir eşikle uyarının geldiği görülür.
- **`/maintain` haftalık:** Alarm tetiklendi mi? Gerçek harcama, `docs/product/unit-economics.md`'deki tahminle uyumlu mu?
