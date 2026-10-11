# AI / LLM Özellikleri

> Projede bir dil modeli (LLM) çağrılıyorsa bu dosya geçerlidir. `docs/architecture/stack.md` ile birlikte okunur.
> AI özellikleri iki yerden bozulur: **kalite** (sessizce kötüleşen çıktı) ve **maliyet** (sessizce büyüyen fatura).
> Bu dosyadaki kurallar ikisini de görünür kılmak için var.

## 1. Model envanteri

| Özellik | Model | Neden bu model | Ortalama girdi/çıktı token | İstek başı maliyet | Eval seti |
|---|---|---|---|---|---|
| [Örn: fatura özetleme] | [model id] | [hız / kalite / fiyat] | | | `evals/ozet.jsonl` |

- Model kimliği koda gömülmez; `AI_MODEL_*` ortam değişkeni veya tek bir config dosyası.
- Basit işler (sınıflandırma, çıkarım) için önce küçük/ucuz model denenir; eval geçemezse büyüğe çıkılır.
- Sağlayıcının güncel model listesini ve fiyatlarını dokümandan kontrol et; AI'nın hafızasındaki model adları eski olabilir.

## 2. Prompt yönetimi

- Promptlar `prompts/` klasöründe, ayrı dosyalarda; kod içine uzun string olarak gömülmez.
- Her prompt dosyasının başında: amaç, beklenen girdi, beklenen çıktı biçimi, son değişiklik tarihi.
- Prompt değişikliği = kod değişikliği: commit'lenir, eval'den geçer, CHANGELOG'a yazılır.
- Yapılandırılmış çıktı gerekiyorsa sağlayıcının yapılandırılmış çıktı / araç (tool) özelliği ve şema doğrulaması (Zod / Pydantic) kullanılır; serbest metinden regex ile ayıklama yapılmaz.

## 3. Eval (kalite testi)

Prompt veya model değiştiğinde "bence daha iyi oldu" yetmez.

- `evals/` altında her özellik için en az 20 vaka: tipik örnekler + zor örnekler + kötü niyetli örnekler.
- Biçim: `ai/evals/cases.jsonl` (her satır bir vaka; bkz. örnek dosya).
- Kontrol türleri: kesin eşleşme, şema geçerliliği, içeriyor/içermiyor, gerekirse modelle puanlama (LLM-as-judge, puanlama kriteri yazılı).
- **Kabul eşiği:** [örn. vakaların %90'ı geçmeli, kötü niyetli vakaların %100'ü]. Eşiğin altındaysa merge yok.
- Canlıda kötü sonuç veren her gerçek örnek (kişisel veri temizlenerek) eval setine eklenir.

## 4. Maliyet kontrolü

- [ ] Her çağrıda `max_tokens` sınırı var.
- [ ] Kullanıcı başına günlük/aylık istek veya token sınırı var; aşınca anlaşılır mesaj.
- [ ] Sağlayıcı panelinde aylık harcama limiti ve %50/%80 alarmı.
- [ ] Tekrarlanan uzun bağlam (sistem promptu, dokümanlar) için prompt önbellekleme (prompt caching) kullanılıyor.
- [ ] Her çağrı loglanıyor: özellik, model, girdi/çıktı token, süre, tahmini maliyet, kullanıcı id (içerik değil).

## 5. Güvenlik

- [ ] API anahtarı sadece sunucuda; istemci doğrudan sağlayıcıyı çağırmaz.
- [ ] **Prompt injection varsayılır:** Kullanıcı girdisi ve dışarıdan gelen içerik (web sayfası, e-posta, dosya) talimat değil veridir. Sistem promptu bunu açıkça belirtir; ama tek savunma bu değildir.
- [ ] Model bir araç/işlem tetikleyebiliyorsa (e-posta gönderme, silme, ödeme, DB yazma): izinli işlemler beyaz listede, geri dönülemez işlemler kullanıcı onayı ister, model başka kullanıcının verisine erişemez.
- [ ] Model çıktısı HTML olarak basılmaz (XSS); kod/SQL olarak çalıştırılmaz.
- [ ] Sistem promptunda sır, iç URL veya başka kullanıcı verisi yok (sızdırılabileceğini varsay).

## 6. Gizlilik

- [ ] Modele hangi kişisel verinin gittiği `docs/legal/privacy-kvkk.md` veri envanterinde yazılı.
- [ ] Sağlayıcının veri saklama ve eğitimde kullanma politikası kontrol edildi (API verisi genelde eğitimde kullanılmaz; doğrula).
- [ ] Gerekmeyen kişisel veri (TC no, telefon, adres) modele gönderilmeden önce çıkarılıyor veya maskeleniyor.
- [ ] Yurt dışına aktarım dayanağı belirlendi (`docs/legal/privacy-kvkk.md` §4).

## 7. Dayanıklılık ve UX

- [ ] Zaman aşımı, 429 (hız sınırı) ve 5xx için geri çekilmeli tekrar; sınırlı deneme sayısı.
- [ ] Sağlayıcı çökerse ne olur? (Yedek model / özelliği geçici kapat / anlaşılır hata.)
- [ ] Uzun yanıtlarda akış (streaming) ve iptal butonu.
- [ ] Arayüzde "AI hata yapabilir" bilgisi ve kullanıcının çıktıyı düzenleyebilmesi/onaylaması.
- [ ] Kullanıcı geri bildirimi (👍/👎 veya "yanlış" butonu) loglanıyor; eval setine kaynak.

## Canlıya alma (ek)

- [ ] Eval seti kabul eşiğinin üstünde (çıktısını CHANGELOG'a not et)
- [ ] Prod anahtarı ayrı, harcama limiti ve alarm prod hesabında ayarlı
- [ ] Kullanıcı başı sınırlar prod'da açık
- [ ] Kötü niyetli vakalar (prompt injection, veri sızdırma denemesi) eval'de geçti
- [ ] Token ve maliyet logları panelde görülebiliyor

## Bakım (ek)

- Haftalık: AI maliyeti (toplam ve kullanıcı başı en yüksek 10), hata/zaman aşımı oranı, 👎 geri bildirimleri.
- Aylık: Eval setini tekrar çalıştır (sağlayıcı aynı model adı altında davranış değiştirmese bile), yeni zor vakaları ekle.
- Çeyreklik: Kullanılan modellerin **kullanımdan kaldırılma (deprecation) tarihleri**, fiyat değişiklikleri, daha ucuz/yeni model ile eval karşılaştırması.
