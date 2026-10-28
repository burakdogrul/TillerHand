# Yasal / KVKK / Gizlilik

> Bu bir kontrol listesidir, hukuki danışmanlık değildir. Kişisel veri işleyen veya ödeme alan
> bir ürünü yayına almadan önce metinleri bir hukukçuya kontrol ettir.
> Türkiye'de kullanıcıya hizmet veriyorsan KVKK (6698), yurt dışından kullanıcı varsa GDPR de gündeme gelir.

## 1. Veri envanteri (önce bunu çıkar)

| Veri | Neden toplanıyor (amaç) | Hukuki dayanak | Nerede saklanıyor (ülke) | Ne kadar süre | Kimlerle paylaşılıyor |
|---|---|---|---|---|---|
| E-posta | Hesap, bildirim | Sözleşmenin ifası | [Servis, bölge] | Hesap silinene kadar | [E-posta servisi] |
| IP, cihaz bilgisi | Güvenlik, hata takibi | Meşru menfaat | | | [Sentry vb.] |
| [...] | | | | | |

Kural: **Amaç yoksa toplama.** Kullanmadığın veriyi isteme.

## 2. Yayında olması gereken metinler

- [ ] **Aydınlatma metni (KVKK md. 10):** Veri sorumlusu, amaçlar, aktarılan taraflar, toplama yöntemi, haklar.
- [ ] **Gizlilik politikası:** Aydınlatma metniyle birleşik olabilir. Kayıt formunda ve footer'da link.
- [ ] **Çerez politikası + çerez onay bandı:** Zorunlu olmayan (analitik, pazarlama) çerezler **onaydan önce yüklenmez**. Reddet butonu, kabul et kadar görünür olmalı.
- [ ] **Kullanım şartları / üyelik sözleşmesi.**
- [ ] **Açık rıza metni:** Sadece açık rıza gereken işlemler için (pazarlama, yurt dışına aktarımın bazı halleri, özel nitelikli veri). Aydınlatma metniyle aynı onay kutusunda birleştirme.
- [ ] Ücretli ürün ise: **Mesafeli satış sözleşmesi** ve **ön bilgilendirme formu** (6502 sayılı Kanun), iade/cayma koşulları.

## 3. Kullanıcı hakları süreçleri

- [ ] Kullanıcı verisini görebiliyor / indirebiliyor (veya talep edebiliyor).
- [ ] **Hesap silme** uygulama içinden yapılabiliyor ve gerçekten siliyor/anonimleştiriyor (yedeklerdeki durum metinde belirtildi).
- [ ] Başvuru kanalı (e-posta adresi) metinde yazılı; başvurular **en geç 30 gün** içinde yanıtlanıyor.

## 4. Yurt dışına veri aktarımı

Vercel, Supabase, AWS, OpenAI, Sentry gibi yurt dışı sunuculu servisler = yurt dışına aktarım.

- [ ] Hangi servislerin hangi bölgede veri tuttuğu veri envanterinde yazılı.
- [ ] Mümkünse AB bölgesi seçildi.
- [ ] KVKK md. 9 kapsamında aktarım dayanağı belirlendi (2024 değişikliği sonrası: standart sözleşme imzalanıyorsa Kurul'a süresi içinde bildirim gerekir). **Hukukçuya danış.**

## 5. Diğer yükümlülükler

- [ ] **VERBİS** kayıt yükümlülüğü kontrol edildi (çalışan sayısı / bilanço eşiklerine göre muafiyet olabilir).
- [ ] Ticari e-posta/SMS gönderiliyorsa: önceden onay, **İYS** (İleti Yönetim Sistemi) kaydı, her iletide ret linki.
- [ ] Veri ihlali olursa: Kurul'a **72 saat** içinde bildirim prosedürü `docs/operations/maintenance.md` → olay müdahalede yazılı.
- [ ] Çocuklara yönelik değilse yaş sınırı kullanım şartlarında belirtildi.
- [ ] Kullanılan font, ikon, görsel ve kütüphanelerin lisansları ticari kullanıma uygun.

## 6. Mobil mağaza ek gereksinimleri

`docs/architecture/stack.md` (mobil) → "Go live (extra)" bölümüne bak: App Store gizlilik etiketleri, Google Play Veri Güvenliği formu, uygulama içi hesap silme.

## 7. Gözden geçirme

Her **3 ayda bir** ve yeni bir veri türü / yeni bir servis eklendiğinde bu dosyayı ve yayındaki metinleri güncelle.
