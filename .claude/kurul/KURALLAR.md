# Kurul Kuralları

> Uzman kurulu, projeye özel ajanlardan oluşur (`.claude/agents/kurul-*.md` + `guvenlik-denetcisi`).
> Üyeler ve toplantı günlüğü `docs/KURUL.md`'de. Bu dosya kitindir ve toplantıların nasıl yapılacağını anlatır.
> Rol şablonları bu klasörde (`kurul-*.md`); kurul kurulurken `.claude/agents/`'a kopyalanıp projeye özelleştirilir.

## 1. Yetki: danışman + kritikte durdurur

- Kurul görüş, uyarı ve karar önerisi verir. **Kararı kullanıcı verir.**
- Bir üye **RET** verirse (KRİTİK bulgu: güvenlik açığı, veri kaybı riski, yasal ihlal, kabul kriteri karşılanmadı) iş "bitti" sayılmaz ve commit edilmez. Kullanıcıya bulgu ve seçenekler sunulur: düzelt (önerilen) / riski kabul et ve gerekçeyi kaydet / görevi geri al.
- Üyeler arasında görüş ayrılığı varsa ana ajan kendi başına seçmez; iki görüşü yan yana koyup kullanıcıya **karar olarak sorar**.

## 2. Toplantılar

| Toplantı | Ne zaman | Kim katılır | Model |
|---|---|---|---|
| **Plan** | `/planla` sonunda, kullanıcı onayından önce | `kurul-urun` + `kurul-mimar` + değişikliğe ilgili üyeler (en fazla 4) | üyenin kendi modeli |
| **Görev sonu** | `/gelistir` sonunda, "bitti" demeden önce | Değişikliğe ilgili üyeler (en fazla 3) | üyenin kendi modeli |
| **Commit (hafif)** | Her `git commit` öncesi (hook zorunlu kılar) | Değişen dosyalara ilgili en fazla 2 üye; sadece değişen satırları (diff) inceler | her zaman `haiku` |
| **Faz sonu** | Faz bitince (`/oturum-sonu` önerir) veya `/kurul topla faz-sonu` | Tüm kurul | üyenin kendi modeli |
| **Canlıya alma** | `/canliya-al ilk` | Tüm kurul | üyenin kendi modeli |

Sadece dokümantasyon değişikliği (`.md`, `docs/`) içeren commit'ler denetimden muaftır.

## 3. Kim ilgili? (değişikliğe göre üye seçimi)

| Değişiklik | Üye |
|---|---|
| Yeni özellik, kapsam, kullanıcı akışı | kurul-urun |
| Veri modeli, migration, yeni modül, yeni bağımlılık, klasör yapısı | kurul-mimar |
| Auth, yetki, ödeme, webhook, dosya yükleme, ortam değişkeni, sır | guvenlik-denetcisi |
| Kişisel veri alanı, yeni dış servis, log içeriği, yasal metin | kurul-kvkk |
| Arayüz bileşeni, sayfa, ekran, metin | kurul-ux (+ web'de kurul-performans) |
| API ucu, sözleşme, hata biçimi | kurul-api |
| Test, kritik akış, hata düzeltmesi | kurul-qa |
| CI, deploy, Docker, hosting, yapılandırma | kurul-devops |
| Mobil izin, native modül, mağaza ayarı | kurul-mobil |
| Prompt, model çağrısı, eval | kurul-ai |

Kurulda olmayan bir üyeyi çağırma; ilgili alan kurulda yoksa durum bloğunda "kurulda X uzmanı yok" diye belirt.

## 4. Toplantı nasıl yapılır

1. **Limit kontrolü** (`docs/LIMIT-PLANI.md`): Seviye sarıysa üye sayısını yarıya indir; kırmızıysa kullanıcıya sor (kurulu hafiflet seçeneği dahil).
2. **Üyeleri paralel çalıştır** (Agent aracı, her üye ayrı alt ajan). Her üyeye şunları ver: toplantı türü, kapsam (plan metni / diff aralığı / faz), görev kodu ve kabul kriterleri. Commit toplantısında `model: "haiku"` ver.
3. **Sentezle** (ana ajan):

```
## Kurul: [tür] · [kapsam]
Katılan: [üyeler] · Sonuç: ONAY | KOŞULLU ONAY | RET
Kritik: [varsa]
Önemli: [birleştirilmiş, tekrarsız, önem sırasıyla]
Görüş ayrılığı: [varsa iki görüş]
Kullanıcıya sorulacaklar: [üyelerin işaretlediği kararlar]
```

4. **Kullanıcıyı bilgilendir ve sor:** Sorulacak kararları AskUserQuestion ile sor. Hangi bulguların düzeltileceğini **çoklu seçimle** sor; KRİTİK olanlar önerilen olarak işaretli olsun.
5. **Kaydet:** `docs/KURUL.md` → toplantı günlüğüne bir satır ekle. Kararları `docs/KARARLAR.md` günlüğüne ekle. Açık kalan bulguları `docs/ILERLEME.md` → "Açık sorunlar"a yaz.
6. **Commit toplantısı sonucu ONAY veya KOŞULLU ONAY ise** commit kapısını aç: `node .claude/hooks/commit-kapisi.mjs --onayla "<katılan üyeler>"`. RET ise açma; önce kullanıcıya sor.

Kullanıcı commit denetimini o an için atlamak isterse açıkça söylemesi gerekir. O durumda `node .claude/hooks/commit-kapisi.mjs --onayla "atlandı: kullanıcı isteği"` çalıştır ve günlüğe yaz. Kalıcı olarak kapatmak için: `docs/KURUL.md` → `**Commit denetimi:** kapalı`.

## 5. Kurul nasıl kurulur (`/baslat` Kurul adımı veya `/kurul kur`)

1. Proje tipine ve PRD'ye göre öneri (aşağıdaki tablo). AI eki varsa `kurul-ai`, kişisel veri varsa `kurul-kvkk` mutlaka önerilir.
2. Kullanıcıya **çoklu seçimle** sor (önerilenler işaretli). "Other" ile yeni bir uzman isteyebilir. Örneğin "Erişilebilirlik uzmanı", "Oyun tasarımcısı" veya "Fintech uyum uzmanı". Bu durumda mevcut şablon yapısıyla yeni bir `kurul-<ad>.md` yaz.
3. Model dağılımını onaylat. Önerilen karma: Mimar ve Güvenlik güçlü model (`sonnet`), diğerleri `haiku`.
4. Seçilen her üye için `.claude/kurul/kurul-<rol>.md` dosyasını `.claude/agents/kurul-<rol>.md`'ye kopyala ve **"Bu proje" bölümünü doldur**: ürün özeti, seçilen stack, kritik akışlar, bu role özel riskler. `guvenlik-denetcisi` zaten `.claude/agents/` altında.
5. `docs/KURUL.md` → durum, üye tablosu ve commit denetimi satırını doldur.
6. Kullanıcıya kurulu tanıt: Her üye ne yapar, ne zaman devreye girer, tahmini maliyeti nedir (tek satır).
7. Yeni ajanlar oturum yeniden başlatıldığında yüklenir. Kullanıcıya bunu söyle; bu oturumda gerekirse üyeyi genel amaçlı alt ajana rol dosyasının içeriğini vererek çalıştır.

| Tip | Önerilen kurul |
|---|---|
| web-saas | urun, mimar, guvenlik-denetcisi, ux, performans, kvkk, qa (+ devops, + ai) |
| mobil | urun, mimar, guvenlik-denetcisi, ux, mobil, kvkk, qa (+ devops, + ai) |
| backend | urun, mimar, guvenlik-denetcisi, api, devops, qa (+ kvkk, + ai) |
