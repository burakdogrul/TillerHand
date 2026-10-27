# Decisions

> There are two sections:
> 1. **Decision log ("Karar günlüğü"):** one line for every decision asked. Door (Kapı): `tek` (one-way, costly to reverse) / `çift` (two-way, easy to reverse). Decided by: `kullanıcı` (user) or `otomatik` (automatic, when question mode is off).
> 2. **ADRs** (Architecture Decision Record): decisions that affect the architecture or the long term, and all one-way decisions, go in a separate file: `docs/decisions/adr-NNNN-kisa-ad.md` (template: `adr-template.md`).
>
> Look here before asking a decision: if it was made before, do not ask again, follow it.
> Decisions are never deleted; if one changes, a new line is added and "→ changed by #N" is written next to the old one.
> The decision log columns stay Turkish: Tarih = date, Aşama = stage, Konu = topic, Soru = question, Seçilen = chosen, Kapı = door, Karar veren = decided by.

## Karar günlüğü

`/dashboard` reads this table; do not change the columns.

| # | Tarih | Aşama | Konu | Soru | Seçilen | Kapı | Karar veren |
|---|---|---|---|---|---|---|---|

## ADR list

| ADR | Title | Status | Log no |
|---|---|---|---|
