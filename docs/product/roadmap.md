# Yol Haritası

> Her görev **tek oturumda bitebilecek** büyüklükte olmalı (yaklaşık 1-3 saat, 1-5 dosya).
> Büyük görünen görevi böl. AI'ya her zaman tek bir görev ver.
> Biçim: `- [ ] G-NNN: [ne] — kabul: [nasıl anlarım bitti?]`

## Faz 0 — Kurulum (iskelet)

- [ ] G-001: Repo, git, `.gitignore`, `.env.example` hazır — kabul: ilk commit atıldı
- [ ] G-002: Proje iskeleti kuruldu, lokal çalışıyor — kabul: `dev` komutu hatasız açılıyor
- [ ] G-003: Lint, format, tip kontrolü, test altyapısı — kabul: 4 komut da çalışıyor
- [ ] G-004: Pre-commit + CI (`docs/architecture/stack.md` → "Otomatik kontroller") — kabul: sır içeren deneme commit'i reddediliyor; GitHub'da CI yeşil
- [ ] G-005: **"Merhaba dünya" canlıda** — kabul: prod URL açılıyor (deploy hattını ilk gün kur)
- [ ] G-006: Hata takibi (Sentry vb.) bağlandı — kabul: test hatası panelde görünüyor
- [ ] G-007: Tasarım sistemi koda aktarıldı (arayüz varsa): `DESIGN.md` belirteçleri tema/CSS değişkenlerinde — kabul: örnek ekran yalnız belirteçleri kullanıyor

## Faz 1 — Çekirdek (MVP'nin olmazsa olmazları)

- [ ] G-010: [Auth: kayıt / giriş / çıkış] — kabul: [...]
- [ ] G-011: [Ana veri modeli + migration] — kabul: [...]
- [ ] G-012: [Ana özellik Ö-01] — kabul: [PRD'deki kriterler]
- [ ] G-019: Refactor turu (faz sonu) — kabul: `node .claude/hooks/budget.mjs --check` tüm depoda temiz; tekrar eden ve kullanılmayan kod temizlendi; testler yeşil

## Faz 2 — MVP tamamlama

- [ ] G-020: [Ö-02] — kabul: [...]
- [ ] G-021: Boş / hata / yükleniyor durumları tüm ekranlarda — kabul: [...]
- [ ] G-029: Refactor turu (faz sonu) — kabul: `node .claude/hooks/budget.mjs --check` tüm depoda temiz; tekrar eden ve kullanılmayan kod temizlendi; testler yeşil

## Faz 3 — Canlıya hazırlık

- [ ] G-030: `docs/security/checklist.md` kontrol listesi tamam
- [ ] G-031: `docs/legal/privacy-kvkk.md` metinleri yayında
- [ ] G-032: `docs/operations/release-checklist.md` kontrol listesi tamam (`/release`)
- [ ] G-033: Yedekleme + izleme + alarm kuruldu

## Faz 4 — Lansman sonrası

- [ ] [İlk kullanıcı geri bildirimlerinden gelen işler]

## Fikir havuzu (planlanmamış)

- [PRD'de "kapsam dışı" olan ama ileride yapılabilecek şeyler]
