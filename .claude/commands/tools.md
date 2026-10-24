---
description: Bağlam paketlerini yönetir: hangi eklentilerin açık olduğunu gösterir, paket açar/kapatır, skill ve ajan yükünü ölçer.
argument-hint: [boş = durum | ac <paket> | kapat <paket> | olc | komutlar hafif|tam]
---

İstek: $ARGUMENTS

Neden var: Skill listesi bağlamın %1'iyle sınırlı. Taşınca az kullanılan skill'lerin açıklaması düşer ve Claude onları tanımaz. Bu yüzden çekirdek dışındaki eklentiler kapalı gelir ve paket olarak gerektiğinde açılır. Paketler ve içerikleri: `docs/workflow/skills.md` → "Bağlam paketleri".

- **Boşsa:** `node .claude/hooks/tools.mjs` çalıştır, çıktıyı kısa bir tabloyla göster (paket, durum, yaklaşık token, hangi komut açar).
- **`ac <paket>`:** Önce kullanıcıya paketin yaklaşık token maliyetini ve şu notu söyle: "Oturum ortasında açmak prompt önbelleğini bozar; en ucuzu faz sınırında `/clear` ile birlikte açmaktır." Onay gelirse `node .claude/hooks/tools.mjs --enable <paket>` çalıştır. Betik kurulu olmayan eklenti bildirirse kurulum için ayrıca sor (`node .claude/hooks/plugins-sync.mjs --install`). Sonra kullanıcıdan `/reload-plugins` çalıştırmasını iste.
- **`kapat <paket>`:** `node .claude/hooks/tools.mjs --disable <paket>`, sonra `/reload-plugins`.
- **`olc`:** `node .claude/hooks/tools.mjs --measure` çalıştır. En büyük 5 eklentiyi ve toplamı göster. Kesin değer için kullanıcıya `/context` (Skills satırı) ve `/doctor` öner; kullanılmayan skill'leri bulmak için `/skill-doctor`.

- **`komutlar hafif` / `komutlar tam`:** `node .claude/hooks/tools.mjs --commands light` veya `--commands full`. Hafif: çekirdek dışı 18 komut listede sadece adıyla durur (~1.100 token/oturum az), `/` menüsünde kalır. Tam: bütün açıklamalar listede. Bu ayar `.claude/settings.json`'a yazılır, ekibin hepsini etkiler; profil değişikliğiyle birlikte yapılır (`docs/workflow/progress.md` → `**Profil:**`). Yeni oturumda geçerli olur.

Açma ve kapama sadece bu makineyi etkiler (`.claude/settings.local.json`, git'e girmez). Herkes için varsayılanı değiştirmek `.claude/settings.json` → `enabledPlugins` düzenlemesidir ve `teknik` karardır.

Codex ve Antigravity'de eklenti paketi yoktur: bu komut orada sadece `docs/workflow/mcp-catalog.md`'deki isteğe bağlı araçları listeler.
