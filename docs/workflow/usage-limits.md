# Limit Planı

> Claude aboneliğinin 5 saatlik ve haftalık kullanım limitleri iş planlanırken hesaba katılır.
> Amaç: İşin yarıda kalıp bağlamın kaybolmaması ve kullanıcının limit konusunda şaşırmaması.

## 1. Limit nereden okunur (sırayla)

1. **Masaüstü uygulaması:** `get_usage` aracı (ccd session management). Kesin yüzde ve sıfırlanma saati verir.
2. **Terminal / IDE:** `node .claude/hooks/usage.mjs`. Durum çubuğu, Claude Code'un gönderdiği `rate_limits` bilgisini `.claude/state/usage.json`'a yazar; bu komut onu okur. İlk API yanıtından önce boş olabilir. 30 dakikadan eskiyse doğrula.
3. **İkisi de yoksa:** Kullanıcıdan `/usage` çıktısındaki yüzdeleri iste.

## 2. Seviyeler

| Seviye | 5 saatlik | Haftalık | Davranış |
|---|---|---|---|
| 🟢 yeşil | < %60 | < %70 | Normal çalış. Durum bloğunda limiti göster. |
| 🟡 sarı | %60–84 | %70–89 | İş başlamadan tahmini maliyeti söyle. Kurul toplantılarında üye sayısını yarıya indir. |
| 🔴 kırmızı | ≥ %85 | ≥ %90 | Yeni iş başlamadan §3'teki seçenekleri sor. |

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

Max planda yüzdeler daha düşüktür. Günlük doldukça tahmin kendini düzeltir.

2. **Tahmin, kırmızı eşiğe kadar kalan payı aşıyorsa** veya seviye kırmızıysa AskUserQuestion ile sor. Bağlama uyanları sun, en uygun olanı "(Önerilen)" yap:
   - **Limite sığanı yap, kalanı sıraya koy:** İşleri önceliğe göre sırala, sığanları yap, kalanları `docs/workflow/progress.md` → "Sıradaki adım"a yaz.
   - **Hepsini başlat, dolunca kaydet, yenilenince devam:** 5 saatlik %90'a gelince §4'teki güvenli durmayı uygula. Yenilenince devam için:
     - Masaüstü uygulamasında sıfırlanma saatine zamanlanmış görev kur (scheduled tasks). Görevin içeriği: "Bu projeyi aç, `docs/workflow/progress.md` → Kaldığı yer'den `/build` ile devam et."
     - Terminalde oturum açık kalacaksa sıfırlanma saatine tek seferlik bir hatırlatma/cron kur. Kalmayacaksa kullanıcıya sıfırlanma saatini söyle; tekrar açtığında oturum başı notu kaldığı yeri hatırlatır.
   - **Ucuz modele geçerek devam:** Kalan uygulama işini `model: "haiku"` (veya `"sonnet"`) verilen alt ajana devret. Ana ajan sadece koordine eder ve sonucu doğrular. Güvenlik, veri modeli ve mimari kararlar güçlü modelde kalır.
   - **Kurulu hafiflet:** Plan ve görev sonu toplantılarına sadece `security-auditor` + `board-architect` katılır. Commit denetimini sadece kod dosyalarında yap, tek üyeyle.
3. **Haftalık limit sarı veya kırmızıysa** ayrıca uyar: Haftalık limit geç yenilenir. Kalan haftalık bütçenin hangi işlere ayrılacağını sor (en önemli 2-3 iş).
4. Kararı `docs/decisions/log.md` günlüğüne `maliyet` konusu olarak yaz.

## 4. Güvenli durma

Çalışırken 5 saatlik limit %90'a ulaşırsa (veya kullanıcı "dur" derse):

1. Yarım dosya bırakma; mevcut adımı tamamla veya geri al.
2. Testleri çalıştır. Kırmızıysa bunu not et.
3. WIP commit öner (`wip: <görev> - limit nedeniyle durdu`).
4. `docs/workflow/progress.md` → **Kaldığı yer** bölümünü doldur: görev, tamamlanan adımlar, sıradaki adım, açık dosyalar, bekleyen kararlar, yenilenme saati.
5. Durum bloğuyla raporla.

## 5. Maliyet günlüğü (tahmini kalibre etmek için)

`/build` ve tam kurul toplantıları başlangıçta ve sonda 5 saatlik yüzdeyi okur ve `docs/workflow/cost-log.md`'ye bir satır ekler. Limit okunamıyorsa satır eklenmez.
