# Bakım ve Düzenli Kontroller

> Canlıdaki proje kendi kendine bozulur: bağımlılıklar eskir, sertifikalar ve kartlar süresi dolar,
> faturalar şişer, yedekler sessizce durur. Bu dosya bunları yakalar.
> `/bakim haftalik` · `/bakim aylik` · `/bakim ceyreklik` komutları ilgili listeyi çalıştırır ve kayda ekler.
> Tipe özel ek maddeler: `docs/STACK.md` → "Bakım".

## Haftalık (~15 dk)

- [ ] Hata takibi: yeni veya artan hata var mı? Varsa `docs/YOL-HARITASI.md`'ye görev olarak ekle.
- [ ] Uptime: kesinti oldu mu?
- [ ] Maliyet: hosting, DB, AI API harcaması beklenen aralıkta mı?
- [ ] Kullanıcı geri bildirimi / destek kutusu tarandı.
- [ ] Yedekler son 7 günde başarıyla alındı mı?

## Aylık (~1 saat)

- [ ] Bağımlılık güncellemesi (yama ve küçük sürümler) + testler.
- [ ] Bağımlılık güvenlik taraması (`npm audit` / `uv run --with pip-audit pip-audit`).
- [ ] Performans ölçümü (tipe özel hedefler, `docs/STACK.md`).
- [ ] Maliyet trendi: geçen aya göre artış neden?
- [ ] Kullanılmayan servis, ortam değişkeni, özellik bayrağı, ölü kod temizliği.
- [ ] `docs/ILERLEME.md`, `docs/MIMARI.md` güncel mi?
- [ ] Analitik: başarı kriterlerine (`docs/PRD.md` §4) göre durum.
- [ ] Kopya kod oranı (`npx jscpd --silent .`) ve `docs/METRIKLER.md`'ye aylık satır.
- [ ] `docs/BIRIM-EKONOMISI.md` gerçek faturalarla güncel mi?
- [ ] `docs/BAYRAKLAR.md`: kaldırma tarihi geçen bayraklar temizlendi mi?
- [ ] `docs/GERI-BILDIRIM.md`: yeni geri bildirimler işlendi mi (`/geri-bildirim`)?

## Çeyreklik (3 ayda bir, ~yarım gün)

- [ ] **Yedekten tam geri yükleme tatbikatı** (ayrı bir ortama).
- [ ] Erişim gözden geçirme: hosting, DB, ödeme, domain, kod deposu. Eski erişimleri kaldır.
- [ ] Kritik anahtarların yenilenmesi (rotation), özellikle sızma şüphesi olanlar.
- [ ] Majör sürüm güncellemeleri planla (framework, runtime, SDK).
- [ ] `docs/YASAL-KVKK.md` ve yayındaki metinler güncel mi? Yeni veri/servis eklendi mi?
- [ ] `docs/GUVENLIK.md` tam tur.
- [ ] `docs/HESAPLAR.md`: bitiş tarihleri, 2FA, artık kullanılmayan hesaplar.

## Olay müdahale (site çöktü / veri sızdı / fatura patladı)

1. **Durdur:** Zarar sürüyorsa önce durdur. Önceki sürüme dön (rollback), sızan anahtarı iptal et, servisi bakım moduna al.
2. **Kaydet:** Ne zaman başladı, kimler etkilendi, ne gördün? Ekran görüntüsü ve log al. Şimdi değil sonra hatırlamazsın.
3. **Düzelt:** Kök nedeni bul ve düzelt; regresyon testi ekle.
4. **Bildir:** Kişisel veri ihlali varsa KVKK Kurulu'na **72 saat** içinde bildirim ve etkilenen kullanıcılara bilgilendirme (`docs/YASAL-KVKK.md`).
5. **Öğren:** Aşağıdaki kayda yaz. Tekrarı engelleyen kontrolü ilgili listeye ekle.

## Bakım kaydı

| Tarih | Tür | Bulgular | Yapılan / açılan görev |
|---|---|---|---|
| | haftalık/aylık/çeyreklik/olay | | |
