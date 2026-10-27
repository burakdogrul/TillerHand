---
description: Hands the project over to another person or account (writes a handoff note) or takes it over (`/handoff devral`). For a teammate, a company account, or continuing from the same place after an account closes.
argument-hint: [empty = hand over | devral]
---

Mode: $ARGUMENTS (empty = hand over, `devral` = take over)

The project's state lives in files and git, not in the chat. A handoff means leaving these files complete and current, and rebuilding the environment on the receiving side. **Never write secret values into the note, code or chat**; write only their names and where to get them.

## Hand over (no argument)

1. Apply the `/wrap-up` steps (progress, roadmap, decisions, CHANGELOG). If there is unfinished work, fill in "Kaldığı yer" (where we left off).
2. Write `docs/workflow/handoff.md` (overwrite if it exists):

```markdown
# Devir notu

**Durum:** bekliyor
**Tarih:** YYYY-AA-GG
**Devreden:** [ad veya rol]

## Nerede kaldık
- Aktif faz ve görev, son biten görevler, yarım kalan iş (dosya ve adım)

## Bekleyen kararlar
- ...

## Devralanın ihtiyacı
- Hesaplar ve erişimler: `docs/operations/accounts.md`'deki servisler; kimin davet etmesi gerekiyor
- Ortam değişkenleri: `.env.example`'daki adlar ve her birinin nereden alınacağı (değer yok)
- Sistem bağımlılıkları ve kurulum: `README.md` → Gereksinimler / Kurulum
- Yerel ayarlar (git'e girmeyenler): anlatıcı mod, kod haritası, MCP bağlantıları

## Dikkat
- Bilinen sorunlar, riskli bölgeler, yapılmaması gerekenler
```

2b. **Optional, if the receiver will see the code for the first time:** an onboarding guide with Understand-Anything (`yayin` package: `node .claude/hooks/tools.mjs --required yayin`). `/understand --language en` reads all the code on the first run and is expensive on a large project: state the cost and ask. Then `/understand-onboard`; write the output path into the "Devralanın ihtiyacı" (what the receiver needs) section of the handoff note.
3. If there are uncommitted changes, suggest a commit: `docs: devir notu`. If a remote repo exists, suggest a push (get approval). If there is no push, tell the receiver how to get the project (repo invite or folder copy; the `.env` file is not copied).
4. Give the user the single line to pass to the receiver: "Clone the repo, open it in Claude Code, type `/handoff devral`."

## Take over (`/handoff devral`)

1. Read `docs/workflow/handoff.md` and summarize: where things stand, pending decisions, things to watch. If the note has an Understand-Anything onboarding guide, give its path; for a visual map use `/understand-dashboard` (`yayin` package).
2. Set up the environment, reporting each step in one line:
   - `node --version`, `git --version`; do they match the runtime version in the README (`.nvmrc` / `.python-version`)?
   - Plugins: list the missing ones with `node .claude/hooks/plugins-sync.mjs`, install with approval via `--install`, then `/reload-plugins`. Package preferences are personal and do not come with the handoff: show the ones needed with `/tools`.
   - Dependencies: the install command in README → "Kurulum" (install) (from the lock file).
   - Environment variables: list the names in `.env.example`. Do not create or read the `.env` file yourself; the user enters the values (where to get them is in the handoff note).
   - Accounts: show the accesses in the handoff note as a list; mark those waiting for an invite.
   - Personal settings: narrator mode (`/start` Step 0b) and the code map (Step 5) are asked separately for this user.
3. Run the tests and show the result. If red, compare with "Dikkat" (watch out) in the handoff note.
4. If there are pending decisions, ask them now.
5. In `docs/workflow/handoff.md`, set `**Durum:** devralındı` and add the `**Devralan:**` line. Suggest a commit: `docs: devir alındı`.
6. Last line: the next command (`/build G-NNN`, or continue from "Kaldığı yer" if it is filled in).
