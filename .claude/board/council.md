# Council protocol (three stages)

> The board-adapted form of Karpathy's llm-council structure (github.com/karpathy/llm-council).
> 1. First opinions are collected independently.
> 2. Opinions are cross-reviewed and ranked anonymously.
> 3. An independent chair synthesizes.
>
> Counting is done by code (`node .claude/hooks/council.mjs`). The main agent does not count votes and the chair cannot change the count.

## Ne zaman (when)

The project profile decides which meetings and decisions go to the council (`docs/workflow/progress.md` → `**Profil:**`; chosen in `/start` Step 0):

| | **Hafif** (recommended for Pro) | **Standart** | **Tam** |
|---|---|---|---|
| Add-ons | Core: ponytail, caveman, mattpocock-skills, impeccable, humanizer, security-guidance (+ the type's LSP and stack skills). The others are turned off at project scope | All on | All on |
| Commit review (haiku board on every commit) | Off | On | On |
| Command list (descriptions in the skill list) | 10 core commands with descriptions, 18 by name only | Like Hafif | All with descriptions |
| Meeting council (3 stages) | None; meetings are single-stage | Phase end, go-live | Plan, phase end, go-live, RET |
| Decision council | Database and auth decision | Database and auth decision | All one-way decisions |

Measurement (2026-10-12): One council used about 12% of the 5-hour limit on Pro.

| Case (if the profile allows) | Council type | Stage 1 members | Chair |
|---|---|---|---|
| Plan, phase-end, go-live meeting | **Meeting council** | Board members chosen by rules.md §3 (with the review role's model) | `board-chair` |
| RET in a task-end meeting | Meeting council (stages 2 and 3 only) | The member who gave RET + the other members of that meeting | `board-chair` |
| One-way door decision (Hafif/Standart: database and auth only; Tam: all; `docs/workflow/decision-protocol.md` §2a) or `/board council <soru>` in any profile | **Decision council** | 3 × `council-advisor`: `haiku`, `sonnet`, `opus` (same question, different model) | `board-chair` |

- Task-end and commit meetings stay single-stage (rules.md §4).
- If the limit is yellow: the decision council runs with 2 advisors (`sonnet`, `opus`), and at most 3 members join stage 2 in a meeting council.
- If the limit is red: suggest a single-stage meeting instead of a council and ask the user.

## Minutes

Each council is a single file: `docs/workflow/council/YYYY-AA-GG-<tür>-<kısa-konu>.md`. The main agent writes the raw output of the stages here. To keep context small, later steps carry the file path, not the minutes.

```markdown
# Konsey: <tür> · <konu>
**Tarih:** 2026-10-12 · **Tür:** plan | faz-sonu | canliya-alma | ret | karar
**Görev:** G-012 (varsa)

## Soru
<karar konseyinde: soru, seçenekler (her biri tek satır), bağlam dosyaları. Toplantıda: kapsam ve kabul kriterleri>

## 1. İlk görüşler
### Görüş A
- A1 [KRİTİK] dosya:satır — sorun — öneri
- A2 [ÖNEMLİ] ...
ÖNERİ: <seçenek adı>          ← sadece karar konseyinde
### Görüş B
...

## 2. Çapraz inceleme
### İnceleyen: A
<her görüşün güçlü ve zayıf yanı, kısa>
OYLAR:
B1: DOĞRU | YANLIŞ | ABARTILI
EKSİK: <kimsenin görmediği önemli bir şey varsa, tek satır>
SIRALAMA:
1. Görüş C
2. Görüş B

## 3. Toplu sıralama
<council.mjs yazar>

## 4. Başkan kararı
<board-chair yazar>

## Kimlikler
A = board-architect (sonnet) · B = security-auditor (sonnet) · C = board-product (haiku)
```

## Stages

1. **First opinions (parallel).** Give each member the task in its own format (in a meeting, the board format in the member file; in a decision council, the `council-advisor` format). The replies are labeled A, B, C… in random order. Findings get ids: A1, A2, B1… Write the label-to-id mapping only in the "Kimlikler" section at the end of the minutes.
2. **Cross-review (parallel).** Give each reviewer the following and pass the instruction below verbatim:
   - The "Soru" section of the minutes.
   - The other opinions, **excluding** their own. Do not say who wrote them or which model wrote them.
   - Give each reviewer the opinions in a different order (reduces order effects).

   > You do not know who wrote the opinions below. For each one, write what is good and what is missing, in no more than two sentences. Then vote on each finding: DOĞRU (evidenced and severity is right), ABARTILI (real but low importance), YANLIŞ (no match in the code or context). When voting, check the claim in the code or docs. Do not vote on a guess. If nobody saw something important, write it on the EKSİK line. At the end, rank in exactly this format: first the "SIRALAMA:" line, then "1. Görüş X" lines from best to worst, no other text.

   In a meeting council, the reviewers are the same members. In a decision council, they are the same advisors.
3. **Counting.** The command `node .claude/hooks/council.mjs <tutanak>` computes the following and writes it to the minutes:
   - Average rank.
   - Vote distribution for each finding.
   - `Tartışmalı` (contested) findings: when the number of objections (YANLIŞ + ABARTILI) is equal to or greater than the number of DOĞRU votes.
   - `Uzlaşma` (consensus) percentage.
4. **Chair.** Run `board-chair` (opus) and give it the path of the minutes. The chair writes:
   - The final decision.
   - The dropped findings and the reasons.
   - The minority view.

   Rules the chair must follow:
   - The chair cannot drop a `Tartışmalı` **KRİTİK** finding alone. That finding stays as "ask the user".
   - RET is given only if at least one KRİTİK finding is not `Tartışmalı`.
5. **User.** The main agent shows the chair's decision in the synthesis format of rules.md §4.
   - In a decision council, the AskUserQuestion options come from the council:
     - The option the chair recommends comes first and is labeled "(Recommended)".
     - Add "Konsey: n/N ilk görüş · ort. sıra x" to each option's description.
     - The minority view is written in one sentence in the description of its own option.
6. **Record.**
   - Add one line to `docs/workflow/board.md` → "Toplantı günlüğü" (meeting log). Write the link to the minutes in the scope column.
   - For a decision council, add the reference "Konsey: <tutanak>" to `docs/decisions/log.md` and to the ADR.

## Why

- **Anonymity:** A member does not blindly follow a role with known authority (for example security).
- **Cross vote:** Made-up or exaggerated findings are dropped before they reach the user.
- **Separate chair:** The one who wrote the opinion and the one who decides are never the same model.
- **Different models:** The same question is answered with different abilities.

One limit: All members are Claude models. They may share similar blind spots. The council does not replace the user's decision.
