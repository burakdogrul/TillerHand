# Konsey protokolü (üç aşama)

> Karpathy'nin llm-council yapısının kurula uyarlanmış hali (github.com/karpathy/llm-council).
> 1. İlk görüşler bağımsız toplanır.
> 2. Görüşler anonim olarak çapraz incelenir ve sıralanır.
> 3. Bağımsız bir başkan sentezler.
>
> Sayım kodla yapılır (`node .claude/hooks/council.mjs`). Ana ajan oy saymaz ve başkan sayıyı değiştiremez.

## Ne zaman

Hangi toplantı ve kararın konseye gideceğini proje profili belirler (`docs/workflow/progress.md` → `**Profil:**`; `/start` Adım 0'da seçilir):

| | **Hafif** (Pro için önerilen) | **Standart** | **Tam** |
|---|---|---|---|
| Eklentiler | Çekirdek: ponytail, caveman, mattpocock-skills, impeccable, humanizer, security-guidance (+ tipin LSP ve stack skill'leri). Diğerleri proje kapsamında kapatılır | Hepsi açık | Hepsi açık |
| Commit denetimi (her commit'te haiku kurul) | Kapalı | Açık | Açık |
| Komut listesi (skill listesindeki açıklamalar) | 10 çekirdek komut açıklamalı, 18'i sadece adıyla | Hafif gibi | Hepsi açıklamalı |
| Toplantı konseyi (3 aşama) | Yok; toplantılar tek aşamalı | Faz sonu, canlıya alma | Plan, faz sonu, canlıya alma, RET |
| Karar konseyi | Veritabanı ve auth kararı | Veritabanı ve auth kararı | Tüm tek yönlü kararlar |

Ölçüm (2026-10-12): Bir konsey Pro'da 5 saatlik limitin yaklaşık %12'sini kullandı.

| Durum (profil izin veriyorsa) | Konsey türü | Aşama 1 üyeleri | Başkan |
|---|---|---|---|
| Plan, faz sonu, canlıya alma toplantısı | **Toplantı konseyi** | rules.md §3'e göre seçilen kurul üyeleri (kendi modelleriyle) | `board-chair` |
| Görev sonu toplantısında RET çıktı | Toplantı konseyi (sadece aşama 2 ve 3) | RET veren üye + o toplantının diğer üyeleri | `board-chair` |
| Tek yönlü kapı kararı (Hafif/Standart: sadece veritabanı ve auth; Tam: hepsi; `docs/workflow/decision-protocol.md` §2a) veya her profilde `/board council <soru>` | **Karar konseyi** | 3 × `council-advisor`: `haiku`, `sonnet`, `opus` (aynı soru, farklı model) | `board-chair` |

- Görev sonu ve commit toplantıları tek aşamalı kalır (rules.md §4).
- Limit sarıysa: karar konseyi 2 danışmanla (`sonnet`, `opus`) yapılır, toplantı konseyinde aşama 2'ye en fazla 3 üye katılır.
- Limit kırmızıysa: konsey yerine tek aşamalı toplantı önerilir ve kullanıcıya sorulur.

## Tutanak

Her konsey tek bir dosyadır: `docs/workflow/council/YYYY-AA-GG-<tür>-<kısa-konu>.md`. Ana ajan aşamaların ham çıktısını buraya yazar. Bağlamı şişirmemek için sonraki adımlar tutanağı değil, dosya yolunu taşır.

```markdown
# Konsey: <tür> · <konu>
**Tarih:** 2026-10-12 · **Tür:** plan | faz-sonu | canliya-alma | ret | karar
**Görev:** G-012 (varsa)

## Soru
<karar konseyinde: soru, seçenekler (her biri tek satır), bağlam dosyaları. Toplantıda: kapsam ve kabul kriterleri>

## 1. İlk görüşler
### Görüş A
- A1 [KRİTİK] dosya:satır — sorun — öneri
- A2 [ÖNEMLİ] ...
ÖNERİ: <seçenek adı>          ← sadece karar konseyinde
### Görüş B
...

## 2. Çapraz inceleme
### İnceleyen: A
<her görüşün güçlü ve zayıf yanı, kısa>
OYLAR:
B1: DOĞRU | YANLIŞ | ABARTILI
EKSİK: <kimsenin görmediği önemli bir şey varsa, tek satır>
SIRALAMA:
1. Görüş C
2. Görüş B

## 3. Toplu sıralama
<council.mjs yazar>

## 4. Başkan kararı
<board-chair yazar>

## Kimlikler
A = board-architect (sonnet) · B = security-auditor (sonnet) · C = board-product (haiku)
```

## Aşamalar

1. **İlk görüşler (paralel).** Her üyeye kendi formatıyla görev verilir (toplantıda üye dosyasındaki kurul formatı, karar konseyinde `council-advisor` formatı). Gelen cevaplar rastgele sırayla A, B, C… etiketlenir. Bulgulara kimlik verilir: A1, A2, B1… Etiket-kimlik eşlemesi sadece tutanağın sonundaki "Kimlikler" bölümüne yazılır.
2. **Çapraz inceleme (paralel).** Her inceleyene aşağıdakiler verilir ve aşağıdaki talimat aynen iletilir:
   - Tutanağın "Soru" bölümü.
   - Kendisi **hariç** diğer görüşler; kimin yazdığı ve hangi modelin yazdığı verilmez.
   - Görüşler her inceleyene farklı sırada verilir (sıra etkisini azaltır).

   > Aşağıdaki görüşleri kimin yazdığını bilmiyorsun. Her biri için ne iyi, ne eksik, iki cümleyi geçmeden yaz. Sonra her bulguya oy ver: DOĞRU (kanıtlı ve önem derecesi yerinde), ABARTILI (gerçek ama önemi düşük), YANLIŞ (kodda/bağlamda karşılığı yok). Oy verirken iddiayı kodda veya dokümanda kontrol et; tahminle oy verme. Kimsenin görmediği önemli bir şey varsa EKSİK satırına yaz. En sonda tam bu biçimle sırala: önce "SIRALAMA:" satırı, sonra en iyiden en kötüye "1. Görüş X" satırları, başka metin yok.

   Toplantı konseyinde inceleyenler aynı üyelerdir. Karar konseyinde aynı danışmanlardır.
3. **Sayım.** `node .claude/hooks/council.mjs <tutanak>` komutu şunları hesaplar ve tutanağa yazar:
   - Ortalama sıra.
   - Her bulgu için oy dağılımı.
   - Tartışmalı bulgular: itiraz (YANLIŞ + ABARTILI) sayısı DOĞRU sayısına eşit veya fazlaysa.
   - Uzlaşma yüzdesi.
4. **Başkan.** `board-chair` (opus) çalıştırılır ve ona tutanağın yolu verilir. Başkan şunları yazar:
   - Nihai kararı.
   - Elenen bulguları ve gerekçelerini.
   - Azınlık görüşünü.

   Başkanın uyması gereken kurallar:
   - Tartışmalı **KRİTİK** bulguyu kendi başına eleyemez. Bu bulgu "kullanıcıya sor" olarak kalır.
   - RET kararı, en az bir KRİTİK bulgu tartışmalı değilse verilir.
5. **Kullanıcı.** Ana ajan, başkanın kararını rules.md §4'teki sentez biçimiyle gösterir.
   - Karar konseyinde AskUserQuestion seçenekleri konseyden gelir:
     - Başkanın önerdiği seçenek ilk sırada ve "(Önerilen)" etiketli olur.
     - Her seçeneğin açıklamasına "Konsey: n/N ilk görüş · ort. sıra x" eklenir.
     - Azınlık görüşü kendi seçeneğinin açıklamasında tek cümleyle yazılır.
6. **Kayıt.**
   - `docs/workflow/board.md` → toplantı günlüğüne bir satır eklenir. Kapsam sütununa tutanak bağlantısı yazılır.
   - Karar konseyi ise `docs/decisions/log.md` ve ADR'ye "Konsey: <tutanak>" referansı eklenir.

## Neden

- **Anonimlik:** Üye, otoritesi bilinen bir role (örn. güvenlik) körü körüne katılmaz.
- **Çapraz oy:** Uydurma veya abartılı bulgular, kullanıcıya ulaşmadan elenir.
- **Ayrı başkan:** Görüşü yazanla kararı verenin aynı model olmasını önler.
- **Farklı modeller:** Aynı sorunun farklı yeteneklerle cevaplanmasını sağlar.

Bir sınır var: Bütün üyeler Claude modelidir. Benzer kör noktaları paylaşabilirler. Konsey, kullanıcının kararının yerine geçmez.
