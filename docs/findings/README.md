# Bulgular

Projeyi farklı uzman gözleriyle tarayan raporlar. Her rapor en önemli en fazla 20 bulguyu kanıtla, 0-100 önem puanıyla ve düzeltme yöntemiyle sıralar; ayrıca alan için 0-100 sağlık puanı verir. Yöntem: `.claude/findings/protocol.md`.

| Komut | Bakış açısı | Klasör |
|---|---|---|
| `/findings-tech` | Kıdemli mimar: hatalar, tekrar ve kullanılmayan kod, yapı, testler | `tech/` |
| `/findings-business` | Sektör uzmanı: iş akışları, iş kuralları, gelir, rekabet | `business/` |
| `/findings-security` | Saldırgan: erişim, enjeksiyon, sırlar, bağımlılıklar | `security/` |
| `/findings-ux` | Kullanıcı ve UX araştırmacısı: akışlar, erişilebilirlik, metin | `ux/` |
| `/findings-perf` | Performans ve FinOps: yavaş yollar, maliyet | `perf/` |
| `/findings-legal` | Uyum uzmanı: KVKK, regülasyon, lisans (hukuki görüş değildir) | `legal/` |
| `/findings-all` | Seçilen türlerin hepsi + birleşik özet | `summary-*.md` |

Her türün klasöründe tarihli raporlar ve en son raporun kopyası (`latest.md`) bulunur.

## Raporlar

`/dashboard` panosu bu tabloyu okur; sütunları değiştirme. Sağlık ve önceki puan `NN` biçiminde yazılır.

| Tarih | Tür | Sağlık | Önceki | Bulgu | Kritik | Rapor |
|---|---|---|---|---|---|---|
