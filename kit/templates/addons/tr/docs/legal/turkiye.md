# Türkiye Paketi

> `tr` ekiyle gelir (`--addons tr`). Türkiye'de satış yapan veya Türk kullanıcısı olan ürün için.
> **Hukuki görüş değildir.** Her madde birincil kaynağa bağlı ve kontrol tarihli; mevzuat değişir. Yayından önce bir avukata veya mali müşavire danış.
> Kullanmadan önce kaynakları `source-research` ile yeniden aç; değişen varsa bu dosyayı güncelle ve tarihi değiştir.
> `/findings-legal` ve `/findings-business` bu dosyayı okur.

## 1. KVKK: yurt dışına aktarım

Kontrol: 2026-10-25. Kaynak: [6698 sayılı KVKK, m.9](https://www.mevzuat.gov.tr/MevzuatMetin/1.5.6698.pdf) (7499 sayılı Kanunla değişik, 2/3/2024)

Yurt dışındaki bir servise kişisel veri gitmesi aktarımdır: AI sağlayıcısı (istem metninde kullanıcı verisi), barındırma ve veritabanı bölgesi, e-posta, analitik, hata takibi. Sıra:

1. **Yeterlilik kararı** var mı (m.9/1-3)? Kurul verir, Resmî Gazete'de yayımlanır. Varsa m.5 veya m.6'daki bir şartla aktarılabilir.
2. Yoksa **uygun güvence** (m.9/4): Kurul'un ilan ettiği **standart sözleşme**, onaylı bağlayıcı şirket kuralları, Kurul izinli taahhütname veya (kamu kurumları arasında) Kurul izinli anlaşma. Burada da m.5 veya m.6'daki bir şart gerekir ve ilgili kişinin o ülkede haklarını kullanabilmesi şarttır.
   - **Standart sözleşme imzalandıktan sonra 5 iş günü içinde Kuruma bildirilir** (m.9/5).
3. İkisi de yoksa sadece **arızi** (tekrarlanmayan) hallerde (m.9/6): bilgilendirilmiş açık rıza, sözleşmenin ifası için zorunluluk ve maddede sayılan diğer haller. Sürekli çalışan bir AI veya barındırma servisi "arızi" değildir.

Projede yapılacaklar:
- [ ] `docs/operations/accounts.md`'deki her dış servis için: veri hangi ülkede, aktarım dayanağı ne (yeterlilik / standart sözleşme / yok)?
- [ ] Standart sözleşme gerekiyorsa sağlayıcıyla imzalandı ve 5 iş günü içinde Kuruma bildirildi; tarih `accounts.md` → Not sütununda.
- [ ] Aydınlatma metni (`docs/legal/privacy-kvkk.md`) yurt dışına aktarımı, alıcı grubunu ve amacını söylüyor (m.10).
- [ ] AI istemine gerekmeyen kişisel veri gitmiyor (veri en aza indirme); mümkünse kimlik bilgisi maskeleniyor.

## 2. e-Fatura ve e-Arşiv Fatura

Kontrol: 2026-10-25. Kaynak: [509 Sıra No.lu VUK Genel Tebliği, güncel hali](https://cdn.gib.gov.tr/api/gibportal-file/file/getFile?objectKey=MEVZUAT_TEBLIGLER%2FUNIVERSAL%2F2026%2FMEVZUAT_TEBLIGLER_2026_VukTeb509_Guncel.pdf) (GİB, 589 Sıra No.lu Tebliğ değişiklikleri işlenmiş) · [e-Belge](https://ebelge.gib.gov.tr/)

- **e-Fatura zorunluluğu** (IV.1.4): 2022 veya sonraki hesap dönemlerinde brüt satış hasılatı **3 milyon TL** ve üzeri olanlar. Kendi sitesinde veya başka elektronik ortamda mal/hizmet satanlar, aracı hizmet sağlayıcılar ve internet ilan/reklam aracıları için eşik **500 bin TL**. Eşiği aşan, izleyen yılın yedinci ayının başına kadar geçer (IV.1.5).
- **e-Arşiv**: e-Fatura'ya dahil olan e-Arşiv'e de geçer (IV.2.4.1). e-Arşiv'e dahil olmayanların faturaları 1/1/2026'dan itibaren tutarından bağımsız olarak e-Arşiv Fatura olarak (GİB portalı veya özel entegratör üzerinden) düzenlenir. Basit usul ve işletme hesabı esasında bu tarih 1/1/2027'dir (IV.2.4.3).
- **İnternet satışı faturası** (IV.2.4.5): Fatura elektronik ortamda iletilir. Üzerinde "Bu satış internet üzerinden yapılmıştır." ifadesi, satışın yapıldığı web adresi, ödeme şekli ve tarihi, gönderen kargo bilgisi, gönderim tarihi ve iade bölümü yer alır.

Projede yapılacaklar:
- [ ] Fatura kesme yöntemi seçildi: GİB portalı (elle, küçük hacim) veya özel entegratör API'si (otomatik). Seçim `docs/decisions/log.md`'de.
- [ ] Ödeme başarılı olunca fatura akışı tetikleniyor; fatura kesilemezse sipariş kaybolmuyor (yeniden deneme kuyruğu).
- [ ] Mali müşavir eşik ve yöntem için onay verdi.

## 3. Ödeme bildirimleri (iyzico, PayTR)

Kontrol: 2026-10-25. Kaynaklar: [iyzico webhook](https://docs.iyzico.com/en/advanced/webhook) · [iyzico Retrieve Payment](https://docs.iyzico.com/en/advanced/retrieve-payment) · [iyzico CF Retrieve](https://docs.iyzico.com/en/payment-methods/checkoutform/cf-implementation/cf-retrieve) · [iyzico live / sandbox](https://docs.iyzico.com/en/getting-started/preliminaries/live-vs-sandbox) · [PayTR iFrame API 2. adım](https://dev.paytr.com/en/iframe-api/iframe-api-2-adim) (sayfalarda tarih yok)

Ödeme sonucu tarayıcı yönlendirmesine değil, sağlayıcının sunucudan gönderdiği bildirime göre işlenir. Bildirim imzası doğrulanmadan sipariş onaylanmaz. Kod hazır:
- web-saas: `src/lib/payments/webhook-signature.ts` → `verifyIyzico`, `verifyPaytr`; saldırgan testi `tests/security/payment-webhook.mjs` (CI: `payment-webhook` iş akışı; yerelde Node 22.18 veya üstü)
- backend: `app/shared/payments.py` → `verify_iyzico`, `verify_paytr`; saldırgan testi `tests/security/test_payment_webhook.py`
- mobil: ödeme bildirimi sunucuya gelir; backend şablonunu veya Supabase Edge Function'ı kullan. Kartı uygulama içinde alma; sağlayıcının ödeme sayfasına yönlendir.

Akış:
1. Sandbox hesabı aç (iyzico: sandbox-merchant.iyzipay.com, API `https://sandbox-api.iyzipay.com`; PayTR: mağaza panelinde test modu). Anahtarlar `.env.example`'daki adlarla **sadece sunucuda**; değerleri sen girersin.
2. Ödeme başlatma sunucuda yapılır; tutar ve sipariş numarası istemciden değil veritabanındaki siparişten alınır. iyzico'da her ödemeye sipariş numarasını `conversationId` olarak ver: imza bu alanı da kapsar, boşsa doğrulama reddeder.
3. Bildirim ucu (route) önce imzayı doğrular. `false` dönerse 4xx dön ve logla; isteğin gövdesini loglama (kişisel veri).
   - iyzico: `X-IYZ-SIGNATURE-V3` başlığı. İmza özelliği hesapta açık olmalı (iyzico'dan istenir). Abonelik bildirimleri bu kodun kapsamında değil.
   - PayTR: POST'taki `hash` alanı; yanıt düz metin `OK`, oturum kontrolü yok. Alanları form gövdesinden metin olarak al; `total_amount`'u sayıya çevirip geri yazma (imza bozulur).
4. **Geçerli imza, ödemenin başarılı olduğu demek değildir.** Başarısız ödeme de imzalı gelir. Sadece sonuç başarılıysa siparişi onayla: PayTR `status` = `success`, iyzico `status` = `SUCCESS` ve `iyziEventType` beklediğin tür. Diğerlerinde onaylama, sağlayıcıya yine başarı yanıtı dön.
5. Tutarı ve para birimini siparişle karşılaştır:
   - PayTR: bildirimdeki `total_amount` (kuruş: 34,56 TL → 3456).
   - iyzico: bildirimde tutar yok. Sunucudan sorgula: checkout formunda `token` ile CF Retrieve, diğerlerinde `paymentId` ile Retrieve Payment. Dönen `paymentStatus`, `paidPrice`, `currency` ve `conversationId` siparişle aynı olmalı.
6. **Tekrar gelen bildirim** (sağlayıcı yeniden dener, saldırgan eski bildirimi yeniden gönderebilir; iyzico imzasında zaman damgası yok): siparişi tek bir atomik güncellemeyle onayla (`UPDATE … SET durum='odendi' WHERE id=… AND durum='bekliyor'`) veya ödeme kimliğine (`merchant_oid` / `paymentId`) benzersiz kısıt koy. Önce okuyup sonra yazma; iki eşzamanlı bildirim ikisi de geçer. Tekrar gelene de başarı yanıtı dön.
7. Ödeme özelliği bayrak arkasında yayınlanır (`docs/operations/feature-flags.md`); canlıya almadan önce `/findings-security`.

- [ ] İmza saldırgan testi yeşil (imzasız ve değiştirilmiş bildirim reddediliyor).
- [ ] Bildirim ucu testinde: başarısız ödeme bildirimi siparişi onaylamıyor; aynı bildirim iki kez (ve eşzamanlı) gelince sipariş bir kez işleniyor; tutarı farklı ödeme onaylanmıyor. Bu testler projenin kendi rotası için yazılır.
- [ ] Prod anahtarları sadece barındırma panelinde; sandbox ve prod ayrı.

## 4. Türkçe metin: İ/ı

`"I".toLowerCase()` → `"i"`, ama Türkçede `"ı"`. `"i".toUpperCase()` → `"I"`, Türkçede `"İ"`. Varsayılan sıralama `ç, ğ, ı, ö, ş, ü` harflerini alfabenin sonuna atar. Arama, sıralama, büyük harfe çevirme ve e-posta karşılaştırması yapan her özelliğin testine şu durumları ekle:

```js
// Türkçe görünen metin: dil açıkça verilir
expect('ISPARTA'.toLocaleLowerCase('tr')).toBe('ısparta');
expect('istanbul'.toLocaleUpperCase('tr')).toBe('İSTANBUL');
expect(['Zeynep', 'Çağla', 'Ali', 'Ömer'].sort(new Intl.Collator('tr').compare)).toEqual(['Ali', 'Çağla', 'Ömer', 'Zeynep']);
// Büyük/küçük harf duyarsız arama: "İstanbul" araması "istanbul"u bulur
expect(new Intl.Collator('tr', { sensitivity: 'base' }).compare('İstanbul', 'istanbul')).toBe(0);
// Makine metni (e-posta, kod, URL, anahtar): dile bağlı çevirme yok
expect('INFO@ORNEK.COM'.toLowerCase()).toBe('info@ornek.com');
```

- [ ] Kullanıcıya görünen metinde `toLocaleLowerCase('tr')` / `Intl.Collator('tr')`; e-posta, kullanıcı adı ve kod gibi makine metninde dile bağlı olmayan `toLowerCase()`.
- [ ] Veritabanı sıralaması: Postgres'te Türkçe collation (ör. ICU `tr-TR-x-icu`) veya sıralama uygulamada.
