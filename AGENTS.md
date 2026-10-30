# [PROJECT NAME]

> [One sentence: who is this project for, and what problem does it solve?]

This file holds the shared rules of the project. Claude Code, Codex and Antigravity read it. Claude Code-only additions are in `CLAUDE.md`.

**Setup status:** The project is not set up yet if a `kit/` folder exists in the root and `.kit.json` does not, or if `.kit.json` → `type` is empty (`null`). Suggest `/start [idea]` to the user for a new project, and `/adopt` if the folder already has code. Do not write code before setup is done.

**Session start:** Read `docs/workflow/progress.md` (current state, next step). Claude Code loads it by itself.

## Core rules (always apply)

1. **The user decides.** Ask with AskUserQuestion for product, technical, design, content, data, security and cost decisions. Offer 2-4 options; put your recommendation first and label it "(Recommended)". For each option, state when it is better and what it costs. Ask design decisions with a visual preview. In question mode, pick the recommended option on closed topics and record it as `automatic` in the decision log ("Auto decisions" in the status block). **Read `docs/workflow/decision-protocol.md` before the first decision question.** Earlier decisions are in `docs/decisions/log.md`; do not ask them again. Classify every decision as a one-way or two-way door; for one-way doors (database, auth, payment, data model), get the board's opinion first.
2. **The expert board reviews** (`docs/workflow/board.md`, rules in `.claude/board/rules.md`). The relevant members meet before plan approval, when a task ends, at every commit (light) and at the end of a phase. The board only advises; if there is a REJECT (critical finding), the work is not done and the user is asked.
3. **Right source.** Do not use information that can change from memory: versions, prices, quotas, regulation, APIs. Use the `source-research` skill (primary source first, every claim with source and date). When using a library, first fetch the current docs with the **Context7** MCP.
4. **Spend few tokens.** If the code map (codebase-memory-mcp) is connected, query it first when exploring code (`get_architecture`, `search_graph`, `trace_path`, `get_code_snippet`). Do not read files in bulk. Read docs only when needed (table below).
5. **Follow the structure (mandatory).** Write each new file to its place in the `.claude/structure.json` map (by feature: `features/<feature>/`); it is explained in `docs/architecture/structure.md`. Writing outside the map is asked about; clutter files (`*.bak`, `*-old.*`, copies) are blocked. Temporary and trial work goes to `sandbox/`, outdated docs to `docs/archive/`. Changing the map is a technical decision.
6. **Plan first, then code.** Work that touches more than 2 files goes through `/plan-task`. One task at a time. Do not widen the scope. Four principles: (1) state your assumption, ask if unsure; (2) simplest solution, no flexibility nobody asked for; (3) touch only the lines the task needs; (4) write a verifiable success criterion when you start.
7. **Root cause, evidence, tests.** Acceptance tests (criterion id in the test name, `AC-01.1`) and adversarial tests are written before the code and are red first. A separate agent (`test-writer`, with the test role's model) writes the tests, not the one who writes the code; the code writer does not touch test files (test protection blocks it). Risky features ship behind a feature flag (`docs/operations/feature-flags.md`). When fixing a bug, reproduce it first. Show that it works before saying "done". If you cannot fix the same error in 2 attempts, stop and ask for direction.
8. **A status block at the end of every answer** (short; its words in the conversation language, no tool reads it). Format:

```
── Status ──────────────────────
Phase: … · Task: … (x/y) · Question mode: … · Limit: 5h %… weekly %…
Done: … · Board: … · Auto decisions: …
Next: … · pending decision: …
```

9. **Know the user.** Follow the "Personal preferences" that arrive at session start (project rules come first). If the user corrects a behavior or says how they want to work (conversation, question frequency, report format, code style, things to avoid), note it briefly; do not break the flow. At the end of a task (`/build`) and at the end of a session (`/wrap-up`), ask about the notes with AskUserQuestion as a multi-select ("Save as a preference?"). Write the selected ones with `node .claude/hooks/prefs.mjs --add <conversation|questions|reports|code|avoid> "<preference>"`. Do not write without approval. Do not write secrets, personal data or the project name. A project-specific rule goes to "Learned rules", not to this file.

<!-- kit:other-tools -->
## In Codex and Antigravity

The kit was written for Claude Code; these equivalents apply in these two tools:

- **Commands** (`/start`, `/build`…) live under `.agents/skills/` as skills: in Codex `$start` or `/skills`, in Antigravity `/start`. Their sources are in `.claude/commands/`; skill copies are regenerated on kit update, so edit the source.
- **Wherever AskUserQuestion appears:** in Antigravity, the `ask_question` tool. If there is no question tool with options (Codex), write the options as a numbered list, put the recommended one first and mark it "(Recommended)", then wait for the answer. The decision is still the user's.
- **Subagents** (board members, council, review agents in `.claude/agents/`): If you cannot run them, read the matching definition, assess as that role yourself and state "single model" in the report. The test separation (rule 7) cannot be enforced here by a hook: write the tests with the `test-writer` definition, before you think about the code, and show the red run; do not change the test file while writing the code.
- **Model and effort** (`docs/workflow/models.md`): Start the subagent with the role's equivalent (Codex: model and reasoning effort in the prompt; Antigravity: `inherit`, `flash` or `pro`). If you cannot, run the role yourself and suggest the model in text.
- **Protections** (secret block, destructive command shield, structure guard, edit lock, test protection, edit round counter, package gate, commit gate and the equivalent of the Claude Code permission list) run as hooks: Codex `.codex/hooks.json`, Antigravity `.agents/hooks.json`. Writing to rule and protection files (`AGENTS.md`, `.claude/`, `.codex/`, `.agents/hooks.json`) needs approval. Do not try another route (for example a shell command) around a blocked action; tell the user why. The commit gate stops a commit until `node .claude/hooks/gate.mjs --run` is green and the board review (you, as the relevant members) is approved with `commit-gate.mjs --approve`; it does not check who wrote a test file there. Known limit: the shell rules read the command text and can miss unusual spellings.
- Skills that belong to Claude Code plugins (named `plugin:skill`) do not exist in these tools: skip that step. There is also no limit reading and no status line: the limit stays "-" in the status block.
<!-- /kit:other-tools -->

## Read when needed

| File | When |
|---|---|
| `docs/architecture/stack.md` | When writing code: commands, rules, verification method |
| `docs/product/prd.md` | When scope or an acceptance criterion is unclear |
| `docs/architecture/overview.md`, `docs/product/glossary.md` | When adding a new file/table/service/concept |
| `docs/product/roadmap.md` | When picking and marking tasks |
| `docs/design/design-guide.md`, `DESIGN.md`, `PRODUCT.md` | On interface work |
| `docs/quality/test-plan.md`, `docs/security/checklist.md` | When touching critical flow, auth, data or payment code |
| `docs/workflow/models.md` | When calling a subagent (the role's model and effort) |
| `docs/ai/guide.md` (if present) | On prompt or model-call work |
| `docs/operations/accounts.md`, `docs/product/unit-economics.md` | New external service, price or cost decision |
| `docs/operations/feature-flags.md` | Payment, AI, bulk notification, data-deleting or large interface change |
| `docs/product/feedback.md`, `docs/quality/metrics.md` | User feedback, retro, maintenance |
| `docs/findings/<type>/latest.md` | When working in the relevant area: known findings (`/findings-<type>` reports) |

## Commands

```bash
# /start fills these in for the chosen stack
dev:         [ ]
preview:     [ ]
test:        [ ]
lint:        [ ]
type check: [ ]
build:       [ ]
```

## Definition of "done"

- [ ] Acceptance criteria are met; decisions that came up in the task were asked and recorded
- [ ] Lint, types and tests are clean; a test was added if critical flow was touched
- [ ] Error, empty and loading states are handled; evidence that it works was shown (the verification command ran in this turn and its output was shown; "it should work" is not evidence)
- [ ] If there is an interface: matches `DESIGN.md`, Impeccable critique done, texts passed through humanizer
- [ ] No REJECT in the end-of-task board meeting
- [ ] No secrets in code; any new environment variable is in `.env.example`; `docs/product/roadmap.md` is marked

## Never

- Do not read, write or print `.env` files. Do not put a secret in code, logs or client-side code.
- Do not do these without approval (regardless of question mode): data deletion/reset, `git push --force`, `git reset --hard`, bulk file deletion, prod deploy, any action that spends money.
- Do not delete or weaken a test to make it pass (the test protection hook asks). Do not invent APIs or packages that do not exist.
- Do not try to bypass hooks (secret block, commit gate). Do not decide for the user and report afterwards.
- Do not write a machine-specific absolute path into code, tests or docs (`C:\Users\<name>\…`, `/home/<name>/…`, the full project folder path). Derive the path from the project root, the script location or a temp folder; the gate catches it. For a deliberate example, write `kit:path-allowed` on the line.

## Git

Small, frequent commits. Message format: `type: description` (`feat`, `fix`, `refactor`, `docs`, `test`, `chore`, `wip`). `main` must always work.

## Learned rules

> `/fix-bug` suggests when the same error class repeats, `/retro` suggests at the end of a period; added if you approve. Format: `- Rule. (source: … · YYYY-MM-DD)`; the date is when it was added or last reviewed. At most ~10 lines. `/maintain monthly` reviews those older than 90 days.
