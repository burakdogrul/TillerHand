# Canlıya Alma Kontrol Listesi

> İlk lansmandan önce **tamamı**, sonraki her sürümde **"Her sürüm"** bölümü.
> `/canliya-al` komutu otomatik kontrol edilebilenleri çalıştırır, gerisini sana sorar.
> Tipe özel ek maddeler: `docs/STACK.md` → "Canlıya alma".
> İşaretler: ✅ tamam · ❌ eksik · ➖ bu projede geçerli değil

## A. Her sürüm (her deploy öncesi)

- [ ] CI `main` dalında yeşil (testler, lint, tip kontrolü, build, sır taraması)
- [ ] `docs/TEST-PLANI.md` → manuel kontrol listesi yapıldı
- [ ] Yeni ortam değişkenleri prod ortamına eklendi
- [ ] DB migration varsa: **önce yedek**, sonra migration; migration geri alınabilir mi kontrol edildi
- [ ] `CHANGELOG.md` güncellendi, sürüm numarası verildi
- [ ] Geri alma (rollback) yolu biliniyor: [Örn: Vercel'de önceki deploy'a "Promote", `git revert`]
- [ ] Deploy sonrası duman testi: ana sayfa, giriş, ana akış, hata takibinde yeni hata yok

## B. İlk lansman (bir kez, sonra yılda bir gözden geçir)

### Kod ve kalite
- [ ] `docs/YOL-HARITASI.md` Faz 1-2 tamam
- [ ] Kritik akış testleri (`docs/TEST-PLANI.md` K1-K5) yeşil
- [ ] Debug kodu, `console.log`, test verisi, sahte kullanıcılar temizlendi
- [ ] 404, 500 ve bakım sayfaları/ekranları var

### Güvenlik
- [ ] `docs/GUVENLIK.md` tüm maddeler tamam; `guvenlik-denetcisi` ajanı engelleyici bulgu vermedi
- [ ] Prod anahtarları lokal/test anahtarlarından ayrı
- [ ] GitHub: `main` dalı korumalı (CI zorunlu), Dependabot güvenlik güncellemeleri açık, gizli tarama (secret scanning) açık
- [ ] AI özelliği varsa: `docs/AI.md` → "Canlıya alma" tamam
- [ ] Admin hesapları güçlü şifre + 2FA (hosting, DB, domain, e-posta, ödeme, kod deposu)

### Yasal
- [ ] `docs/YASAL-KVKK.md` metinleri yayında ve linkli
- [ ] Çerez bandı çalışıyor, onay öncesi analitik yüklenmiyor

### Altyapı
- [ ] Alan adı, SSL, `www` yönlendirmesi
- [ ] Prod veritabanı ayrı proje/örnek; otomatik yedekleme açık
- [ ] **Yedekten geri yükleme bir kez denendi** (denenmemiş yedek, yedek değildir)
- [ ] E-posta gönderimi: alan adı doğrulandı (SPF, DKIM, DMARC), spam'e düşmüyor
- [ ] Hata takibi (Sentry vb.) prod'da aktif, alarm e-postası/bildirim geliyor
- [ ] Uptime izleme (UptimeRobot, Better Stack vb.) kuruldu
- [ ] Log saklama süresi belirlendi

### Maliyet
- [ ] Tüm ücretli servislerde (hosting, DB, AI API, e-posta) harcama limiti/alarmı ayarlı
- [ ] Ücretsiz katman limitleri biliniyor; aşınca ne olacağı (durma mı, faturalama mı?) biliniyor
- [ ] Aylık tahmini maliyet `docs/MIMARI.md` → dış servisler tablosunda

### Performans ve görünürlük
- [ ] Tipe özel performans hedefleri (`docs/STACK.md`) karşılandı
- [ ] Analitik (gizlilik dostu) kuruldu, temel olaylar (kayıt, ana eylem) izleniyor

### Hazırlık
- [ ] `docs/LANSMAN.md` → "Lansman öncesi" tamam
- [ ] Destek kanalı (e-posta/form) var ve biri bakıyor
- [ ] `README.md`: kurulum, ortam değişkenleri, deploy adımları güncel
- [ ] Tipe özel maddeler (`docs/STACK.md` → "Canlıya alma") tamam

## C. Lansman sonrası ilk 72 saat

- [ ] Hata takibi günde 2 kez kontrol
- [ ] Maliyet paneli günde 1 kez kontrol
- [ ] İlk kullanıcı geri bildirimleri `docs/YOL-HARITASI.md` → Faz 4'e eklendi
