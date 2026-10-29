# Council protocol (three stages)

> The board-adapted form of Karpathy's llm-council structure (github.com/karpathy/llm-council).
> 1. First opinions are collected independently.
> 2. Opinions are cross-reviewed and ranked anonymously.
> 3. An independent chair synthesizes.
>
> Counting is done by code (`node .claude/hooks/council.mjs`). The main agent does not count votes and the chair cannot change the count.

## When

The project profile decides which meetings and decisions go to the council (`docs/workflow/progress.md` → `**Profile:**`; chosen in `/start` Step 0):

| | **Light** (recommended for Pro) | **Standard** | **Full** |
|---|---|---|---|
| Add-ons | Core: ponytail, caveman, mattpocock-skills, impeccable, humanizer, security-guidance (+ the type's LSP and stack skills). The others are turned off at project scope | All on | All on |
| Commit review (haiku board on every commit) | Off | On | On |
| Command list (descriptions in the skill list) | 10 core commands with descriptions, 18 by name only | Like Light | All with descriptions |
| Meeting council (3 stages) | None; meetings are single-stage | Phase end, go-live | Plan, phase end, go-live, REJECT |
| Decision council | Database and auth decision | Database and auth decision | All one-way decisions |

Measurement (2026-10-12): One council used about 12% of the 5-hour limit on Pro.

| Case (if the profile allows) | Council type | Stage 1 members | Chair |
|---|---|---|---|
| Plan, phase-end, go-live meeting | **Meeting council** | Board members chosen by rules.md §3 (with the review role's model) | `board-chair` |
| REJECT in a task-end meeting | Meeting council (stages 2 and 3 only) | The member who gave REJECT + the other members of that meeting | `board-chair` |
| One-way door decision (Light/Standard: database and auth only; Full: all; `docs/workflow/decision-protocol.md` §2a) or `/board council <question>` in any profile | **Decision council** | 3 × `council-advisor`: `haiku`, `sonnet`, `opus` (same question, different model) | `board-chair` |

- Task-end and commit meetings stay single-stage (rules.md §4).
- If the limit is yellow: the decision council runs with 2 advisors (`sonnet`, `opus`), and at most 3 members join stage 2 in a meeting council.
- If the limit is red: suggest a single-stage meeting instead of a council and ask the user.

## Minutes

Each council is a single file: `docs/workflow/council/YYYY-MM-DD-<type>-<short-topic>.md`. The main agent writes the raw output of the stages here. To keep context small, later steps carry the file path, not the minutes.

```markdown
# Council: <type> · <topic>
**Date:** 2026-10-12 · **Type:** plan | phase-end | go-live | reject | decision
**Task:** G-012 (if any)

## Question
<decision council: the question, the options (one line each), context files. Meeting: scope and acceptance criteria>

## 1. First opinions
### Opinion A
- A1 [CRITICAL] file:line — problem — suggestion
- A2 [IMPORTANT] ...
RECOMMENDATION: <option name>          ← decision council only
### Opinion B
...

## 2. Cross review
### Reviewer: A
<strengths and weaknesses of each opinion, short>
VOTES:
B1: AGREE | DISAGREE | OVERSTATED
MISSING: <something important nobody saw, if any, one line>
RANKING:
1. Opinion C
2. Opinion B

## 3. Overall ranking
<written by council.mjs>

## 4. Chair decision
<written by board-chair>

## IDs
A = board-architect (sonnet) · B = security-auditor (sonnet) · C = board-product (haiku)
```

## Stages

1. **First opinions (parallel).** Give each member the task in its own format (in a meeting, the board format in the member file; in a decision council, the `council-advisor` format). The replies are labeled A, B, C… in random order. Findings get ids: A1, A2, B1… Write the label-to-id mapping only in the "IDs" section at the end of the minutes.
2. **Cross-review (parallel).** Give each reviewer the following and pass the instruction below verbatim:
   - The "Question" section of the minutes.
   - The other opinions, **excluding** their own. Do not say who wrote them or which model wrote them.
   - Give each reviewer the opinions in a different order (reduces order effects).

   > You do not know who wrote the opinions below. For each one, write what is good and what is missing, in no more than two sentences. Then vote on each finding: AGREE (evidenced and severity is right), OVERSTATED (real but low importance), DISAGREE (no match in the code or context). When voting, check the claim in the code or docs. Do not vote on a guess. If nobody saw something important, write it on the MISSING line. At the end, rank in exactly this format: first the "RANKING:" line, then "1. Opinion X" lines from best to worst, no other text.

   In a meeting council, the reviewers are the same members. In a decision council, they are the same advisors.
3. **Counting.** The command `node .claude/hooks/council.mjs <minutes>` computes the following and writes it to the minutes:
   - Average rank.
   - Vote distribution for each finding.
   - `Disputed` findings: when the number of objections (DISAGREE + OVERSTATED) is equal to or greater than the number of AGREE votes.
   - `Consensus` percentage.
4. **Chair.** Run `board-chair` (opus) and give it the path of the minutes. The chair writes:
   - The final decision.
   - The dropped findings and the reasons.
   - The minority view.

   Rules the chair must follow:
   - The chair cannot drop a `Disputed` **CRITICAL** finding alone. That finding stays as "ask the user".
   - REJECT is given only if at least one CRITICAL finding is not `Disputed`.
5. **User.** The main agent shows the chair's decision in the synthesis format of rules.md §4.
   - In a decision council, the AskUserQuestion options come from the council:
     - The option the chair recommends comes first and is labeled "(Recommended)".
     - Add "Council: n/N first opinions · avg. rank x" to each option's description.
     - The minority view is written in one sentence in the description of its own option.
6. **Record.**
   - Add one line to `docs/workflow/board.md` → "Meeting log" (meeting log). Write the link to the minutes in the scope column.
   - For a decision council, add the reference "Council: <minutes>" to `docs/decisions/log.md` and to the ADR.

## Why

- **Anonymity:** A member does not blindly follow a role with known authority (for example security).
- **Cross vote:** Made-up or exaggerated findings are dropped before they reach the user.
- **Separate chair:** The one who wrote the opinion and the one who decides are never the same model.
- **Different models:** The same question is answered with different abilities.

One limit: All members are Claude models. They may share similar blind spots. The council does not replace the user's decision.
