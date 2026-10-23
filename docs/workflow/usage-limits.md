# Limit Planı

> Claude aboneliğinin 5 saatlik ve haftalık kullanım limitleri iş planlanırken hesaba katılır.
> Amaç: İşin yarıda kalıp bağlamın kaybolmaması ve kullanıcının limit konusunda şaşırmaması.
> **Limit sadece uyarı sebebidir, durma sebebi değildir.** Kullanıcı "dur" demedikçe iş devam eder; uyarı tek satırdır ve onay beklemez.

## 1. Limit nereden okunur (sırayla)

1. **Masaüstü uygulaması:** `get_usage` aracı (ccd session management). Kesin yüzde ve sıfırlanma saati verir.
2. **Terminal / IDE:** `node .claude/hooks/usage.mjs`. Durum çubuğu, Claude Code'un gönderdiği `rate_limits` bilgisini `.claude/state/usage.json`'a yazar; bu komut onu okur. İlk API yanıtından önce boş olabilir. 30 dakikadan eskiyse doğrula.
3. **İkisi de yoksa:** Kullanıcıdan `/usage` çıktısındaki yüzdeleri iste.

## 2. Seviyeler

| Seviye | 5 saatlik | Haftalık | Davranış |
|---|---|---|---|
| 🟢 yeşil | < %60 | < %70 | Normal çalış. Durum bloğunda limiti göster. |
| 🟡 sarı | %60–84 | %70–89 | İş başlamadan tahmini maliyeti söyle. Kurul toplantılarında üye sayısını yarıya indir. |
| 🔴 kırmızı | ≥ %85 | ≥ %90 | Yeni iş başlamadan tahmini maliyeti ve kalan payı tek satırla söyle, işe devam et. §3'teki seçenekleri sadece kullanıcı isterse sun. |

Eşikler `.claude/hooks/usage.mjs` → `ESIKLER` içinde; değiştirirsen ikisini birlikte değiştir.

## 3. İş planlanırken

`/start`, `/plan-task`, `/build`, `/board convene` ve `/release` başlamadan önce:

1. Limiti oku ve işin maliyetini tahmin et. Tahmin tablosu aşağıda; `docs/workflow/cost-log.md`'de en az 3 kayıt varsa onların ortalamasını kullan.

| İş | Tahmini 5 saatlik kullanım (Pro plan, başlangıç tahmini) |
|---|---|
| Küçük görev (1-2 dosya) | %3–6 |
| Orta görev (3-6 dosya + test) | %8–15 |
| Büyük görev (çok dosya, yeni modül) | %20+ (önce bölmeyi öner) |
| Plan veya görev sonu kurul toplantısı | %2–5 |
| Commit denetimi (hafif) | %1 |
| Tam kurul toplantısı (faz sonu, canlıya alma) | %8–15 |
| `/design` görsel önizleme turu | %5–10 |
| `/start` Hızlı derinlik (kurul ve tasarım sonraya) | %25–35 |
| `/start` Standart derinlik | %50–70 |
| `/start` Ayrıntılı derinlik (tam akış) | %80–100 (Pro'da bir pencerenin tamamı) |
| Karar konseyi (`/start` Adım 4, tek yönlü karar) | ~%12 (ölçüm: 3 danışman + başkan) |
| Kurul kurulumu (`/start` Adım 6) | %5–10 |
| Tasarım yönü (`/start` Adım 7, `/design genel`) | %15–30 |
| `/research` hızlı · derin | %10–15 · %25–35 |

Max planda yüzdeler daha düşüktür. Günlük doldukça tahmin kendini düzeltir.

2. **Tahmin kalan payı aşıyorsa** veya seviye kırmızıysa bunu tek satırla söyle ("Tahmin %15, kalan %10: iş yarım kalabilir; istersen seçenekleri sunarım") ve işe başla. Soru sorma, onay bekleme. Kullanıcı isterse şu seçenekleri sun:
   - **Limite sığanı yap, kalanı sıraya koy:** İşleri önceliğe göre sırala, sığanları yap, kalanları `docs/workflow/progress.md` → "Sıradaki adım"a yaz.
   - **Hepsini başlat, kesilirse yenilenince devam:** §4'teki uyarılarla devam et. Yenilenince devam için:
     - Masaüstü uygulamasında sıfırlanma saatine zamanlanmış görev kur (scheduled tasks). Görevin içeriği: "Bu projeyi aç, `docs/workflow/progress.md` → Kaldığı yer'den `/build` ile devam et."
     - Terminalde oturum açık kalacaksa sıfırlanma saatine tek seferlik bir hatırlatma/cron kur. Kalmayacaksa kullanıcıya sıfırlanma saatini söyle; tekrar açtığında oturum başı notu kaldığı yeri hatırlatır.
   - **Ucuz modele geçerek devam:** Kalan uygulama işini `model: "haiku"` (veya `"sonnet"`) verilen alt ajana devret. Ana ajan sadece koordine eder ve sonucu doğrular. Güvenlik, veri modeli ve mimari kararlar güçlü modelde kalır.
   - **Kurulu hafiflet:** Plan ve görev sonu toplantılarına sadece `security-auditor` + `board-architect` katılır. Commit denetimini sadece kod dosyalarında yap, tek üyeyle.
3. **Haftalık limit sarı veya kırmızıysa** ayrıca tek satırla uyar: Haftalık limit geç yenilenir.
4. Kullanıcı bir seçenek seçtiyse kararı `docs/decisions/log.md` günlüğüne `maliyet` konusu olarak yaz.

## 4. Çalışırken limit uyarıları

İş durmaz; her eşikte bir kez, tek satır uyarı verilir:

| 5 saatlik | Ne yapılır |
|---|---|
| %90 | Hatırlat: "Limit %90, sıfırlanma HH:MM." İşe devam. |
| %95 | Uyar: "Limit çok azaldı (%95)." `docs/workflow/progress.md` → **Kaldığı yer**'i sessizce güncelle (iş kesilirse oradan devam edilsin). İşe devam. |
| %99 | Uyar: "Limit bu işe yetmeyebilir, iş yarım kalabilir." Adımları küçük tut ve yarım dosya bırakma; uygun noktada WIP commit öner. Kullanıcı "dur" demedikçe devam. |

**Kullanıcı "dur" derse** güvenli dur:

1. Yarım dosya bırakma; mevcut adımı tamamla veya geri al.
2. Testleri çalıştır. Kırmızıysa bunu not et.
3. WIP commit öner (`wip: <görev> - limit nedeniyle durdu`).
4. `docs/workflow/progress.md` → **Kaldığı yer** bölümünü doldur: görev, tamamlanan adımlar, sıradaki adım, açık dosyalar, bekleyen kararlar, yenilenme saati.
5. Durum bloğuyla raporla.

## 5. Maliyet günlüğü (tahmini kalibre etmek için)

`/build` ve tam kurul toplantıları başlangıçta ve sonda 5 saatlik yüzdeyi okur ve `docs/workflow/cost-log.md`'ye bir satır ekler. Limit okunamıyorsa satır eklenmez.
