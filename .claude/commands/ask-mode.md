---
description: Shows or changes the question mode (on which topics decisions are asked).
argument-hint: [empty | off <konu|hepsi> | on <konu|hepsi>]
---

Request: $ARGUMENTS

Topics: `urun`, `teknik`, `tasarim`, `icerik`, `veri`, `guvenlik`, `maliyet` (`docs/workflow/decision-protocol.md` §1).

- **Empty:** Show the current question mode, the closed topics and the automatic decisions made while closed (`docs/decisions/log.md` → deciding party `otomatik`).
- **`off <konu|hepsi>`:** Update the `**Soru modu:**` line in `docs/workflow/progress.md`. Example: `açık · kapalı konular: tasarim, icerik`. If all are closed: `kapalı · kapalı konular: hepsi`.
- **`on <konu|hepsi>`:** Remove the topic from the list. If the list becomes empty: `açık · kapalı konular: yok`.
- If the topic name is not in the list, propose the closest topic and ask.

Confirm the change in one line. Also remind: Deleting data, prod deploys and actions that spend money always ask for approval, regardless of question mode.
