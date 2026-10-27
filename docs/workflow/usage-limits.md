# Limit Plan

> The 5-hour and weekly usage limits of the Claude subscription are factored into work planning.
> Goal: work is not cut off with context lost, and the user is not surprised by the limit.
> **The limit is only a reason to warn, not a reason to stop.** Work continues unless the user says "stop"; the warning is one line and waits for no approval.

## 1. Where to read the limit (in order)

1. **Desktop app:** the `get_usage` tool (ccd session management). It gives the exact percentage and the reset time.
2. **Terminal / IDE:** `node .claude/hooks/usage.mjs`. The status line writes the `rate_limits` data that Claude Code sends into `.claude/state/usage.json`; this command reads it. It may be empty before the first API response. If it is older than 30 minutes, verify it.
3. **If neither exists:** Ask the user for the percentages from the `/usage` output.

## 2. Levels

| Level | 5-hour | Weekly | Behavior |
|---|---|---|---|
| 🟢 green | < 60% | < 70% | Work normally. Show the limit in the status block. |
| 🟡 yellow | 60–84% | 70–89% | Before work starts, state the estimated cost. In board meetings, halve the member count. |
| 🔴 red | ≥ 85% | ≥ 90% | Before new work starts, state the estimated cost and the remaining share in one line, then continue. Offer the options in §3 only if the user asks. |

The thresholds are in `.claude/hooks/usage.mjs` → `ESIKLER`; if you change them, change both together.

## 3. When planning work

Before `/start`, `/plan-task`, `/build`, `/board convene` and `/release` begin:

1. Read the limit and estimate the cost of the work. The estimate table is below; if `docs/workflow/cost-log.md` has at least 3 records, use their average.

| Work | Estimated 5-hour usage (Pro plan, starting estimate) |
|---|---|
| Small task (1-2 files) | 3–6% |
| Medium task (3-6 files + tests) | 8–15% |
| Large task (many files, new module) | 20%+ (suggest splitting first) |
| Board meeting at plan or task end | 2–5% |
| Commit review (light) | 1% |
| Full board meeting (phase end, go-live) | 8–15% |
| `/design` visual preview round | 5–10% |
| `/start` Quick depth (board and design later) | 25–35% |
| `/start` Standard depth | 50–70% |
| `/start` Detailed depth (full flow) | 80–100% (a whole window on Pro) |
| Decision council (`/start` Step 4, one-way decision) | ~12% (measured: 3 advisors + chair) |
| Board setup (`/start` Step 6) | 5–10% |
| Design direction (`/start` Step 7, `/design general`) | 15–30% |
| `/research` quick · deep | 10–15% · 25–35% |

On the Max plan the percentages are lower. As the log fills day by day, the estimate corrects itself.

2. **If the estimate exceeds the remaining share** or the level is red, say so in one line ("Estimate 15%, remaining 10%: the work may be left unfinished; I can offer the options if you want") and start the work. Do not ask a question and do not wait for approval. If the user wants, offer these options:
   - **Do what fits the limit, queue the rest:** Order the tasks by priority, do those that fit, and write the rest to `docs/workflow/progress.md` → "Sıradaki adım" (next step).
   - **Start everything; if cut off, continue after the reset:** Continue with the warnings in §4. To continue after the reset:
     - In the desktop app, set up a scheduled task for the reset time (scheduled tasks). Task text: "Open this project and continue with `/build` from `docs/workflow/progress.md` → "Kaldığı yer" (where we left off)."
     - In the terminal, if the session will stay open, set a one-time reminder/cron for the reset time. If it will not stay open, tell the user the reset time; when they reopen, the session-start note reminds them where they left off.
   - **Continue with a cheaper model:** Move the code role to a lower model (e.g. `node .claude/hooks/models.mjs --set code=haiku:medium`; `docs/workflow/models.md`). The main agent only coordinates and verifies the result. Security, data model and architecture decisions stay in the planning role.
   - **Lighten the board:** Only `security-auditor` + `board-architect` join plan-end and task-end meetings. Run the commit review only on code files, with a single member.
3. **If the weekly limit is yellow or red,** also warn in one line: the weekly limit resets late.
4. If the user chose an option, write the decision to the `docs/decisions/log.md` decision log as topic `maliyet`.
5. **Task = session.** Every turn re-reads the whole session context; the files and outputs of the previous task cost money in the next one for nothing. When a task is done and committed, suggest `/clear` (regardless of the context percentage). The new session continues from `docs/workflow/progress.md`.

## 4. Limit warnings while working

Work does not stop; a one-line warning is given once at each threshold:

| 5-hour | What to do |
|---|---|
| 90% | Remind: "Limit 90%, resets at HH:MM." Continue the work. |
| 95% | Warn: "Limit is very low (95%)." Quietly update `docs/workflow/progress.md` → **Kaldığı yer** (where we left off), so work can resume from there if it is cut off. Continue the work. |
| 99% | Warn: "The limit may not be enough for this work; it may be left unfinished." Keep steps small and leave no half-written files; suggest a WIP commit at a suitable point. Continue unless the user says "stop". |

**If the user says "stop",** stop safely:

1. Leave no half-written file; finish the current step or undo it.
2. Run the tests. If they are red, note it.
3. Suggest a WIP commit (`wip: <görev> - limit nedeniyle durdu`).
4. Fill in the `docs/workflow/progress.md` → **Kaldığı yer** section: task, completed steps, next step, open files, pending decisions, reset time.
5. Report with the status block.

## 5. Cost log (to calibrate the estimate)

`/build` and full board meetings read the 5-hour percentage at the start and at the end and add one row to `docs/workflow/cost-log.md`: `node .claude/hooks/progress.mjs --start` at the start, `--cost "<iş>" <boyut>` at the end (percentages, difference and duration are computed; if the window reset in between, the difference is `?`; on the desktop pass `--limit <%>` to both calls). The percentages can also be given by hand: `--cost "<iş>" <boyut> <başlangıç %> <bitiş %> <dk>`. If the limit cannot be read, no row is added.
