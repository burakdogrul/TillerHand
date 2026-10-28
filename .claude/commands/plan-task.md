---
description: Produces an implementation plan for a task or feature before any code is written.
argument-hint: [task id (G-012) or feature description]
---

Work to plan: $ARGUMENTS

In this step **do not write code**, only produce the plan.

0. **Limit:** Read the limit and compute the task's estimated cost (`docs/workflow/usage-limits.md` §3). If the level is yellow or red, or the estimate exceeds the remaining share, state this in one line at the top of the plan and add a "part that fits the limit" order to the plan. Do not ask a question about the limit.
1. Read the needed context: `docs/product/roadmap.md` (task and acceptance criterion), `docs/product/prd.md` (the relevant feature), `docs/architecture/overview.md`, `docs/decisions/log.md`. Read the existing code the task will touch.
2. Check whether something similar already exists in the project. If it does, reuse it.
3. **List the decision points and ask.** List the decisions the user must make in this task: library, user flow, data field, error behavior, text, design, etc. (`docs/workflow/decision-protocol.md`). Take already-made decisions from `docs/decisions/log.md`; do not ask again. Ask the rest with AskUserQuestion. For a large feature, first question the scope with `mattpocock-skills:grilling`. If module boundaries are unclear, use `mattpocock-skills:codebase-design`.
3b. **Door class:** Mark each decision in the plan as one-way / two-way door; for one-way doors a board opinion and an ADR are required.
3c. **Is a feature flag needed?** Yes if it involves payment, AI, bulk email/notification, data deletion/migration or a large UI change (`docs/operations/feature-flags.md`).
4. Write the plan in this format:

```
## Plan: [task]
**Acceptance criteria:** [items]
**Decisions made:** [question → chosen]
**Skills to use:** [from docs/workflow/skills.md; e.g. ponytail, tdd, impeccable]
**Files to touch:** [path — what changes] (list new files separately)
**Steps:** [numbered, each verifiable]
**Data model / API change:** [if any; is a migration needed?]
**New dependency:** [if any: package name + why + why the built-in alternative is not enough]
**Acceptance tests:** [which criterion ids (Ö-01.1...), test file; written BEFORE the code and red first]
**Adversarial tests:** [if there is an endpoint that returns or writes data: IDOR, unauthenticated, role, XSS, input limit]
**Flag:** [not needed / flag name + emergency shutoff path]
**Tests:** [other tests; critical flow? → docs/quality/test-plan.md]
**Security/legal impact:** [authorization, personal data, secret, payment impact?]
**Risks and open questions:** [...]
**Left out of scope:** [...]
```

4b. **Feature spec (only for work touching 3 or more files):** Write `docs/product/specs/<task id>.md` from `_template.md`: current, expected and must-not-change behavior. Each must-not-change line starts with an acceptance criterion id that has a test (`- Ö-01.1: ...`); the gate stops if these tests are missing or red. Do not write a spec for smaller work.
5. If the task does not fit one session, split it into subtasks and propose them for `docs/product/roadmap.md`.
6. Write the decisions to the `docs/decisions/log.md` log; write an ADR for architectural and one-way decisions (`docs/decisions/adr-NNNN-*.md`).

7. **Board plan meeting** (`.claude/board/rules.md` §2-4; if the board is set up): `board-product`, `board-architect` and the members relevant to the plan review the plan. Add the synthesis to the plan as "Board opinion". If there is a RET, do not present the plan for approval before fixing it. Ask the decisions the members want asked.

To get the plan approved, use AskUserQuestion: "Approve / Change this / Split the task". Wait for my approval. After approval it will be implemented with `/build`.

8. **After approval, open the scope shield:** `node .claude/hooks/freeze-guard.mjs --plan-save <task id> <files...>` (the paths in "Files to touch"; add `/` at the end for a whole folder). The command asks the user: they see the list and approve. While the plan is active, writing to an existing file not in the list (with a file tool, or with shell commands such as `sed -i`, `mv`, `>`) asks the user; new files and `docs/` are free. If a file not in the list is needed during implementation, ask the user; if they approve, `--plan-add <path>`.
