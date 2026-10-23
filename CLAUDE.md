@AGENTS.md

@docs/workflow/progress.md

## Claude Code'a özel kurallar

Ortak kurallar `AGENTS.md`'de (yukarıda içe alındı). Bunlar onlara ektir:

- **Doğru skill'i kullan.** Kod: `ponytail:ponytail`. Kritik akış: `mattpocock-skills:tdd`. Arayüz: seçilen stil skill'i + `impeccable:impeccable`; hareket: `ui-motion`. Logo: `logo-design`. Tanıtım videosu: `motion-video`. Metin: `humanizer:humanizer`. Rapor dili: `caveman:caveman`. Tam tablo (ilk ihtiyaçta oku): `docs/workflow/skills.md`.
- **Limiti ve bağlamı gözet** (`docs/workflow/usage-limits.md`). İş başlamadan limiti oku: masaüstünde `get_usage` aracı, terminalde `node .claude/hooks/usage.mjs`. Sarı/kırmızı seviyede tahmini maliyeti tek satırla söyle. Limit sadece uyarı sebebidir, işi durdurma: %90 hatırlat, %95 uyar ve "Kaldığı yer"i güncelle, %99 "yarım kalabilir" de; kullanıcı "dur" demedikçe devam et. Bağlam %50'yi geçince uygun noktada `/wrap-up` + `/clear` öner.
- **Durum bloğu** caveman dilinde yazılır.
