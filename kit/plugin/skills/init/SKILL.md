---
name: init
description: TillerHand kitini açık klasöre kurar (npx tillerhand init). Kullanıcı "TillerHand'i kur", "kiti bu projeye kur" dediğinde veya /tillerhand:init yazdığında kullan.
---

# TillerHand kurulumu

Bu plugin yalnızca kurulum yapar. Kitin kuralları, komutları ve korumaları projeye dosya olarak kopyalanır; plugin'in kendisi hook veya izin taşımaz.

1. Açık klasörde `.kit.json` varsa kit zaten kurulu: kurulum yapma, güncelleme için `/kit-update` öner ve dur.
2. Gereksinimleri kontrol et: `node --version` 18 veya üstü, `git --version` çalışıyor. Eksikse kullanıcıya neyi kurması gerektiğini söyle (nodejs.org LTS, git-scm.com) ve dur.
3. Klasör boş değilse ve içinde kod varsa bunu söyle: kit mevcut dosyaların üzerine yazmaz, çakışanların yanına `.kit-new` koyar; kurulumdan sonra `/start` yerine `/adopt` kullanılır.
4. Klasörün tam yolunu göster (ev klasörü veya masaüstü gibi bir yerse uyar) ve onay al: "<yol> klasörüne `.claude/`, `CLAUDE.md`, `AGENTS.md` ve `docs/` kopyalanacak, `.gitignore`'a satır eklenecek, git deposu yoksa açılacak."
5. Onay gelirse çalıştır: `npx --yes tillerhand@latest init`. Hangi araçla (Claude Code, Codex, Antigravity) çalışılacağı `/start` sırasında sorulur.
6. Çıktıyı özetle ve son adımı söyle: kitin komutları ve korumaları yeni oturumda yüklenir. Aynı klasörde yeni bir oturum aç, sonra boş projede `/start <fikrin>`, kodu olan projede `/adopt` yaz.

Kurulumdan sonra bu plugin'e ihtiyaç kalmaz; istenirse `/plugin` menüsünden kapatılabilir.
