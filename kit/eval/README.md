# Kit değerlendirmesi

Aynı görevi kitli ve kitsiz çalıştırır, sonucu gizli testlerle puanlar. Kitin "daha az açık, daha çok test" iddiasını ölçmek için var. Algı ile ölçüm ayrı şeyler: kitin işe yaradığını bu tablo göstermeli.

```bash
node kit/eval/run.mjs                      # 3 görev × 2 koşul, Sonnet
node kit/eval/run.mjs --task bug-sort --cond kit --model haiku
node kit/eval/run.mjs --dry                # Claude çalıştırmadan hazırlık ve puanlama
```

Sonuç `kit/eval/results/<tarih>-v<sürüm>-<model>.md` ve `.json` dosyalarına yazılır. Bir koşu Claude aboneliğinden harcar. Pro planda 6 koşu 5 saatlik limitin yaklaşık %25-40'ı kadar tutar.

## Nasıl çalışır

- **Fixture** (`fixture/`): bağımlılığı olmayan küçük bir not API'si (`node:http`, `node:test`), web-saas klasör yapısında. Kimliği `x-user` başlığından okur.
- **Görevler** (`tasks/<id>/`): `prompt.md` görev metnidir, `hidden.test.mjs` gizli testtir, `task.json` kitli koşulda hangi komutun kullanılacağını söyler.
  - `bug-sort`: sıralama hatası (karşılaştırıcı boolean döndürüyor). Komut: `/fix-bug`.
  - `feature-tags`: 3+ dosyalık etiket özelliği. Türkçe küçük harf kuralı, doğrulama, filtre ve sayım içerir. Komut: `/build`.
  - `security-owner`: başkasının notunu okuma, değiştirme ve silme açığı (IDOR). Testler saldırgan gözüyle yazıldı. Komut: `/build`.
- **Koşullar:** Her koşu yeni bir geçici klasörde başlar.
  - `kit`: `init` + `install --type web-saas` çalışır, ardından `/start`'ın bırakacağı durum yazılır: stack, `AGENTS.md` → Komutlar, soru modu kapalı, kapı komut onayı.
  - `plain`: fixture tek başına.
  - İki koşul da aynı modelle ve aynı `--allowedTools` listesiyle, sadece proje ayarlarıyla (`--setting-sources project,local`) `claude -p` olarak çalışır.
- **Puan:**
  - gizli testler
  - fixture'ın orijinal görünür testleri (ajanın değiştirdiği kopya sayılmaz)
  - ajanın kendi test takımı
  - eklenen test sayısı
  - değişen kod dosyası ve satır sayısı
  - maliyet (API karşılığı), süre, tur ve token

## Sınırlar

- Her hücre tek koşu (n=1). Aynı koşu tekrarlanınca sonuç değişebilir. Küçük farkları yorumlama.
- Headless koşuda kullanıcı yok. Kitin soru sorma ve onay alma değeri ölçülmez, soru modu kapalıdır.
- Geçici klasör güvenilmemiş sayılır. Kitin `settings.json` izin listesi yok sayılır, hook'lar ise çalışır.
- Kitli koşulda sadece kullanıcı kapsamında kurulu eklentiler yüklenir. Proje kapsamında kurulanlar (security-guidance, hookify) yüklenmez.
- Kurul kurulu değildir: görev sonu kurul toplantısı ölçülmez.
- Kapı onayı `~/.vibe-kit/gate-approval/` altına geçici klasör başına bir kayıt bırakır.
