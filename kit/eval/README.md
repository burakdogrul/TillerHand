# Kit değerlendirmesi

Aynı görevi kitli ve kitsiz çalıştırır, sonucu gizli testlerle puanlar. Kitin "daha az açık, daha çok test" iddiasını ölçmek için var. Algı ile ölçüm ayrı şeyler: kitin işe yaradığını bu tablo göstermeli.

```bash
node kit/eval/run.mjs                      # 6 görev × 2 koşul, Sonnet
node kit/eval/run.mjs --repeat 3           # hücre başına 3 koşu: ortalama ve aralık
node kit/eval/run.mjs --task bug-sort --cond kit --model haiku
node kit/eval/run.mjs --dry                # Claude çalıştırmadan hazırlık ve puanlama
```

Sonuç `kit/eval/results/<tarih>-<saat>-v<sürüm>-<model>.md` ve `.json` dosyalarına yazılır: önce görev × koşul özeti, sonra koşu koşu tablo. Her görev bitince ara sonuç geçici klasördeki `.partial.json`'a düşer (yolu koşu başında yazar). Rapor başında Claude Code ve Node sürümü ile yüklenen eklentiler yazar. `--keep` koşu klasörünü bırakır, transkript klasördeki `eval-stream.jsonl` dosyasındadır.

Bir koşu Claude aboneliğinden harcar. İlk ölçümde 6 Sonnet koşusu Pro planın 5 saatlik penceresinin yaklaşık %14'ünü kullandı (2026-10-24). Koşu başına üst sınır 2 dolardır (`--max-budget-usd`).

## Nasıl çalışır

- **Fixture** (`fixture/`): bağımlılığı olmayan küçük bir not API'si (`node:http`, `node:test`), web-saas klasör yapısında. Kimliği `x-user` başlığından okur.
- **Görevler** (`tasks/<id>/`): `prompt.md` görev metnidir, `hidden.test.mjs` gizli testtir, `task.json` kitli koşulda hangi komutun kullanılacağını söyler. `solution/` referans çözümdür: fixture'ın üstüne kopyalanınca gizli testler yeşile döner. `mutants/<ad>/` referans çözümün tek bir hata eklenmiş kopyalarıdır: gizli testler onları yakalar, fixture'ın kendi testleri yakalamaz (`kit/tests/eval.test.mjs` hepsini denetler).
  - `bug-sort`: sıralama hatası (karşılaştırıcı boolean döndürüyor). Komut: `/fix-bug`.
  - `feature-tags`: 3+ dosyalık etiket özelliği. Türkçe küçük harf kuralı, doğrulama, filtre ve sayım içerir. Komut: `/build`.
  - `security-owner`: başkasının notunu okuma, değiştirme ve silme açığı (IDOR). Testler saldırgan gözüyle yazıldı. Komut: `/build`.
  - `trash` (örtük gereksinim): çöp kutusu, 30 gün geri alma. Metin yalnız "geri alınabilsin" der; silinen notun canlı listede, okumada ve düzenlemede olmaması ve 30 günün silmeden sayılması sınanır (test tarihi `mock.timers` ile ilerletir). Fixture bu testlerden birini zaten geçer: ajan onu bozmamalı. Komut: `/build`.
  - `paging` (çok adımlı sözleşme): `limit`/`cursor` sayfalama. Önce fixture'daki sıralama hatası düzelmeli, eşit tarihlerde ve iki istek arasında yeni not eklenince tekrar ya da atlama olmamalı, yanıt eski istemciler için dizi kalmalı. Komut: `/build`.
  - `tr-sort` (tuzak): başlığa göre alfabetik sıralama ve büyük/küçük harf duyarsız arama; Türkçede `localeCompare` ve `toLowerCase` yerel ayar olmadan yanlış sonuç verir (`I`/`ı`, `İ`/`i`, `ç`, `ş`). Komut: `/build`.
- **Koşullar:** Her koşu yeni bir geçici klasörde başlar.
  - `kit`: `init` + `install --type web-saas` çalışır, ardından `/start`'ın bırakacağı durum yazılır: stack, `AGENTS.md` → Komutlar, soru modu kapalı, kapı komut onayı.
  - `plain`: fixture tek başına.
  - İki koşul da aynı modelle ve aynı `--allowedTools` listesiyle, sadece proje ayarlarıyla (`--setting-sources project,local`) `claude -p` olarak çalışır.
  - İzinler dar tutulur. Okuma ve yazma koşu klasörünün içinde kalır. Bash'te yalnız `npm test`/`npm start`, `node --test`, `node src/…`, `node tests/…`, `node .claude/hooks/…` ve salt okunur git çalışır. Klasör dışına kolay çıkış yolları yasak: `node -e`, `..`, `git --output`/`--no-index`, `npm --prefix`/`--script-shell`. İki koşulda da `.git/` ve `.claude/` düzenlenemez.
  - **Bu bir güvenlik sınırı değildir.** Ajanın yazdığı kod (`npm test`, `package.json` betikleri) senin kullanıcı hakların ve ortam değişkenlerinle çalışır. Kurallar yalnız kazara klasör dışına yazmayı zorlaştırır.
  - Her koşul kendi port aralığından boş bir `PORT` alır (3100-3109 ve 3110-3119). Koşu bitince o porttan dinleyen süreç kapatılır ve kapı onay kaydı silinir.
- **Puan:**
  - gizli testler (hiç test çalışmazsa, 0/0, satır hata sayılır)
  - fixture'ın orijinal görünür testleri (ajanın değiştirdiği kopya sayılmaz)
  - ajanın kendi test takımı
  - eklenen test sayısı (`test(` blokları)
  - öldürülen mutant: ajanın testleri referans çözümde ve her mutantta koşar; çözümde geçip mutantta kırmızıya dönen bir test varsa mutant öldü. Testin kalitesini ölçer: "test var" değil, "test hatayı yakalıyor".
  - hatayı yakalayan test: ajanın kendi kodunda geçen, değiştirilmemiş fixture'da geçmeyen test. Yeni bir modülü içe aktardığı için fixture'da yüklenemeyen testler de sayılır. İki kodda da kırmızı olan bozuk test sayılmaz.
  - önce test: transkriptte ilk test dosyası yazımı (`*.test.*` ya da `__tests__/`) `src/` altındaki ilk kod yazımından önce mi geldi? Bu ajanın beyanına değil transkripte dayanır.
  - kapı: ajan `gate.mjs --run` çalıştırdı mı (yalnız kitli koşulda)
  - değişen kod dosyası ve satır sayısı
  - maliyet (API karşılığı), süre, tur ve token

## Sınırlar

- Varsayılan her hücre tek koşudur (n=1); `--repeat 3` aralığı gösterir. Aralıklar örtüşüyorsa farkı yorumlama.
- `paging` puanı fixture'daki sıralama hatasını da içerir: sıralamayı düzeltmeyen ajan 4 testin 2'sinden kalır. Bu, `bug-sort` ile aynı beceriyi bir kez daha ölçer; özet tabloda iki görevi birlikte yorumla.
- Süre ölçümü adil kalsın diye puanlama, bir görevin bütün koşullarındaki ajanlar bittikten sonra sırayla yapılır.
- Mutant ölçümü yalnız referans çözümün arayüzü üzerinden yazılmış testleri sayar (HTTP ile ya da `createStore`'un aynı fonksiyonlarıyla). Ajanın kendi eklediği bir modüle veya parametreye (örneğin `createStore(saat)`) bağlı test referans çözümde yüklenmez ya da kırmızı kalır ve hesaba katılmaz. Bu, düşük mutant sayısının bir kısmını açıklayabilir.
- Headless koşuda kullanıcı yok. Kitin soru sorma ve onay alma değeri ölçülmez, soru modu kapalıdır.
- Kitli koşulda kitin `settings.json`'unda açık olan ve kullanıcı kapsamında kurulu eklentiler yüklenir. Proje kapsamında kurulanlar (security-guidance, hookify) yüklenmez. Yüklenenler raporun başında yazar.
- Kurul kurulu değildir: görev sonu kurul toplantısı ölçülmez.
- Geçici klasör güvenilmemiş sayılır: kitin `allow` kuralları uygulanmaz, `ask` ve `deny` kuralları uygulanır (headless koşuda `ask` ret demektir), hook'lar çalışır.
- Ajan sunucuyu `PORT` yerine sabit bir porttan açarsa o süreç koşudan sonra açık kalabilir. Ctrl+C ile kesilen koşu temizlik yapmaz: geçici klasör, onay kaydı (`~/.vibe-kit/gate-approval/`) ve açık süreç kalabilir.
- Dar izinler ajanı ara sıra takıltır: `cd <mutlak yol> && ls` ve `git -C <yol> log` gibi komutlar onaysız kalır, ajan düz komuta geçer. Bu iki koşulda eşittir ama tur sayısını biraz artırabilir.
- Puan, testleri `tests/` altından okur. Ajan testi `src/**/__tests__/` altına yazarsa "önce test" bunu görür; kendi testleri, eklenen test ve yakalayan test sütunları görmez.
- Sonuç dosyaları depoya girer. Hata ve özet metinlerinde geçici klasör `<tmp>`, kullanıcı klasörü `~` olarak maskelenir.
