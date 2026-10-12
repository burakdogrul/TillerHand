---
description: Düzenlemeyi tek klasöre kilitler (hata ayıklarken veya riskli bir özellikte işin yayılmasını önler).
argument-hint: <klasör> | off | (boş = durum)
---

Kilit: $ARGUMENTS

- **Klasör verildiyse:** `node .claude/hooks/freeze-guard.mjs --set <klasör>` çalıştır. Bundan sonra o klasör dışına yazma hook tarafından engellenir (`docs/workflow/progress.md` hariç).
- **`off` ise:** `node .claude/hooks/freeze-guard.mjs --off`.
- **Boşsa:** `node .claude/hooks/freeze-guard.mjs --status` ve sonucu tek satırla söyle.

Kilit varken klasör dışında bir dosyaya gerçekten dokunmak gerekirse kilidi kendin kaldırma: hangi dosya ve neden gerektiğini söyle, kullanıcıya sor.
`/fix-bug` hatanın kök nedeni bulunduktan sonra ilgili özellik klasörü için kilit önerir.
