# Kurul Kuralları

> Uzman kurulu, projeye özel ajanlardan oluşur (`.claude/agents/board-*.md` + `security-auditor`).
> Üyeler ve toplantı günlüğü `docs/workflow/board.md`'de. Bu dosya kitindir ve toplantıların nasıl yapılacağını anlatır.
> Rol şablonları bu klasörde (`board-*.md`); kurul kurulurken `.claude/agents/`'a kopyalanıp projeye özelleştirilir.

## 1. Yetki: danışman + kritikte durdurur

- Kurul görüş, uyarı ve karar önerisi verir. **Kararı kullanıcı verir.**
- Bir üye **RET** verirse (KRİTİK bulgu: güvenlik açığı, veri kaybı riski, yasal ihlal, kabul kriteri karşılanmadı) iş "bitti" sayılmaz ve commit edilmez. Kullanıcıya bulgu ve seçenekler sunulur: düzelt (önerilen) / riski kabul et ve gerekçeyi kaydet / görevi geri al.
- Üyeler arasında görüş ayrılığı varsa ana ajan kendi başına seçmez; iki görüşü yan yana koyup kullanıcıya **karar olarak sorar**.

## 2. Toplantılar

| Toplantı | Ne zaman | Kim katılır | Model |
|---|---|---|---|
| **Plan** | `/plan-task` sonunda, kullanıcı onayından önce | `board-product` + `board-architect` + değişikliğe ilgili üyeler (en fazla 4) | üyenin kendi modeli |
| **Görev sonu** | `/build` sonunda, "bitti" demeden önce | Değişikliğe ilgili üyeler (en fazla 3) | üyenin kendi modeli |
| **Commit (hafif)** | Her `git commit` öncesi (hook zorunlu kılar) | Değişen dosyalara ilgili en fazla 2 üye; sadece değişen satırları (diff) inceler | her zaman `haiku` |
| **Faz sonu** | Faz bitince (`/wrap-up` önerir) veya `/board convene phase-end` | Tüm kurul | üyenin kendi modeli |
| **Canlıya alma** | `/release ilk` | Tüm kurul | üyenin kendi modeli |

Sadece dokümantasyon değişikliği (`.md`, `docs/`) içeren commit'ler denetimden muaftır.

**Konsey (üç aşama):** Hangi toplantıların konseyle yapılacağını proje profili belirler (`.claude/board/council.md` → "Ne zaman"). Tam profilde plan, faz sonu ve canlıya alma toplantıları ile RET çıkan görev sonu toplantıları `.claude/board/council.md` protokolüyle yapılır; Standart'ta sadece faz sonu ve canlıya alma; Hafif'te hiçbiri. Önce ilk görüşler alınır, sonra üyeler birbirinin bulgularını anonim olarak oylar ve sıralar, en son `board-chair` karar verir. Görev sonu ve commit toplantıları tek aşamalıdır.

## 3. Kim ilgili? (değişikliğe göre üye seçimi)

| Değişiklik | Üye |
|---|---|
| Yeni özellik, kapsam, kullanıcı akışı | board-product |
| Veri modeli, migration, yeni modül, yeni bağımlılık, klasör yapısı | board-architect |
| Auth, yetki, ödeme, webhook, dosya yükleme, ortam değişkeni, sır | security-auditor |
| Kişisel veri alanı, yeni dış servis, log içeriği, yasal metin | board-privacy |
| Arayüz bileşeni, sayfa, ekran, metin | board-ux (+ web'de board-performance) |
| API ucu, sözleşme, hata biçimi | board-api |
| Test, kritik akış, hata düzeltmesi | board-qa |
| CI, deploy, Docker, hosting, yapılandırma | board-devops |
| Mobil izin, native modül, mağaza ayarı | board-mobile |
| Prompt, model çağrısı, eval | board-ai |

Kurulda olmayan bir üyeyi çağırma; ilgili alan kurulda yoksa durum bloğunda "kurulda X uzmanı yok" diye belirt.

## 4. Toplantı nasıl yapılır

1. **Limit kontrolü** (`docs/workflow/usage-limits.md`): Seviye sarıysa üye sayısını yarıya indir; kırmızıysa kullanıcıya sor (kurulu hafiflet seçeneği dahil).
2. **Üyeleri paralel çalıştır** (Agent aracı, her üye ayrı alt ajan). Her üyeye şunları ver: toplantı türü, kapsam (plan metni / diff aralığı / faz), görev kodu ve kabul kriterleri. Commit toplantısında `model: "haiku"` ver.
2b. **Konsey toplantısıysa** (§2) `.claude/board/council.md` aşama 1-4'ü uygula. Sentezi başkanın kararından kur; görüş ayrılığı satırına azınlık görüşünü yaz.
3. **Sentezle** (ana ajan; konseyde başkanın kararına göre):

```
## Kurul: [tür] · [kapsam]
Katılan: [üyeler] · Sonuç: ONAY | KOŞULLU ONAY | RET
Kritik: [varsa]
Önemli: [birleştirilmiş, tekrarsız, önem sırasıyla]
Görüş ayrılığı: [varsa iki görüş]
Kullanıcıya sorulacaklar: [üyelerin işaretlediği kararlar]
```

4. **Kullanıcıyı bilgilendir ve sor:** Sorulacak kararları AskUserQuestion ile sor. Hangi bulguların düzeltileceğini **çoklu seçimle** sor; KRİTİK olanlar önerilen olarak işaretli olsun.
5. **Kaydet:** `docs/workflow/board.md` → toplantı günlüğüne bir satır ekle. Kararları `docs/decisions/log.md` günlüğüne ekle. Açık kalan bulguları `docs/workflow/progress.md` → "Açık sorunlar"a yaz.
6. **Commit toplantısı sonucu ONAY veya KOŞULLU ONAY ise** commit kapısını aç: `node .claude/hooks/commit-gate.mjs --approve "<katılan üyeler>"`. RET ise açma; önce kullanıcıya sor.

Kullanıcı commit denetimini o an için atlamak isterse açıkça söylemesi gerekir. O durumda `node .claude/hooks/commit-gate.mjs --approve "atlandı: kullanıcı isteği"` çalıştır ve günlüğe yaz. Kalıcı olarak kapatmak için: `docs/workflow/board.md` → `**Commit denetimi:** kapalı`.

## 5. Kurul nasıl kurulur (`/start` Kurul adımı veya `/board setup`)

1. Proje tipine ve PRD'ye göre öneri (aşağıdaki tablo). AI eki varsa `board-ai`, kişisel veri varsa `board-privacy` mutlaka önerilir.
2. Kullanıcıya **çoklu seçimle** sor (önerilenler işaretli). "Other" ile yeni bir uzman isteyebilir. Örneğin "Erişilebilirlik uzmanı", "Oyun tasarımcısı" veya "Fintech uyum uzmanı". Bu durumda mevcut şablon yapısıyla yeni bir `board-<ad>.md` yaz.
3. Model dağılımını onaylat. Önerilen karma: Mimar ve Güvenlik güçlü model (`sonnet`), diğerleri `haiku`.
4. Seçilen her üye için `.claude/board/board-<role>.md` dosyasını `.claude/agents/board-<role>.md`'ye kopyala ve **"Bu proje" bölümünü doldur**: ürün özeti, seçilen stack, kritik akışlar, bu role özel riskler. `security-auditor` zaten `.claude/agents/` altında.
5. `docs/workflow/board.md` → durum, üye tablosu ve commit denetimi satırını doldur.
6. Kullanıcıya kurulu tanıt: Her üye ne yapar, ne zaman devreye girer, tahmini maliyeti nedir (tek satır).
7. Yeni ajanlar oturum yeniden başlatıldığında yüklenir. Kullanıcıya bunu söyle; bu oturumda gerekirse üyeyi genel amaçlı alt ajana rol dosyasının içeriğini vererek çalıştır.

| Tip | Önerilen kurul |
|---|---|
| web-saas | urun, mimar, security-auditor, ux, performans, kvkk, qa (+ devops, + ai) |
| mobil | urun, mimar, security-auditor, ux, mobil, kvkk, qa (+ devops, + ai) |
| backend | urun, mimar, security-auditor, api, devops, qa (+ kvkk, + ai) |
