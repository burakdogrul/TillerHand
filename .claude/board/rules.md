# Board Rules

> The expert board is made of project-specific agents (`.claude/agents/board-*.md` + `security-auditor`).
> Members and the meeting log live in `docs/workflow/board.md`. This file belongs to the kit and says how to run meetings.
> Role templates are in this folder (`board-*.md`). When the board is set up, they are copied to `.claude/agents/` and customized for the project.

## 1. Authority: advisor, and stops on critical findings

- The board gives opinions, warnings and decision proposals. **The user decides.**
- If a member gives **REJECT** (a CRITICAL finding: security hole, data-loss risk, legal violation, acceptance criterion not met), the work does not count as "done" and is not committed. Show the user the finding and the options: fix (recommended) / accept the risk and record the reason / roll the task back.
- If members disagree, the main agent does not pick alone. Put both views side by side and **ask the user as a decision**.

## 2. Meetings

| Meeting | When | Who attends | Model |
|---|---|---|---|
| **Plan** | At the end of `/plan-task`, before user approval | `board-product` + `board-architect` + members relevant to the change (max 4) | review role (`docs/workflow/models.md`) |
| **Task end** | At the end of `/build`, before saying "done" | Members relevant to the change (max 3) | review role (`docs/workflow/models.md`) |
| **Commit (light)** | Before every `git commit` (a hook enforces it) | Max 2 members relevant to the changed files; reviews only the changed lines (diff) | always `haiku`, effort `low` |
| **Phase end** | When a phase ends (`/wrap-up` suggests it) or `/board convene phase-end` | The whole board | review role (`docs/workflow/models.md`) |
| **Go-live** | `/release first` | The whole board | review role (`docs/workflow/models.md`) |

Commits that contain only documentation changes (`.md`, `docs/`) are exempt from review.

**Council (three stages):** The project profile decides which meetings go to the council (`.claude/board/council.md` → "When"). In the Full profile, plan, phase-end and go-live meetings, and task-end meetings that end in REJECT, follow the `.claude/board/council.md` protocol. In Standard, only phase-end and go-live. In Light, none. First opinions are collected first. Then members vote on and rank each other's findings anonymously. Last, `board-chair` decides. Task-end and commit meetings are single-stage.

## 3. Who is relevant? (pick members by change)

| Change | Member |
|---|---|
| New feature, scope, user flow | board-product |
| Data model, migration, new module, new dependency, folder structure | board-architect |
| Auth, authorization, payment, webhook, file upload, environment variable, secret | security-auditor |
| Personal data field, new external service, log content, legal text | board-privacy |
| UI component, page, screen, copy | board-ux (+ board-performance on web) |
| API endpoint, contract, error format | board-api |
| Test, critical flow, bug fix | board-qa |
| CI, deploy, Docker, hosting, configuration | board-devops |
| Mobile permission, native module, store setting | board-mobile |
| Prompt, model call, eval | board-ai |

At task end, `node .claude/hooks/flow.mjs` suggests members from the changed paths (only those on the board, the one with the most matching files first; `security-auditor` on a sensitive path). The path is a guess. If the meaning of the change differs (a new feature → board-product, for example), correct it using the table.

Do not call a member who is not on the board. If the relevant area has no member, write "no X expert on the board" in the status block.

## 4. How to run a meeting

1. **Limit check** (`docs/workflow/usage-limits.md`): If the level is yellow, halve the member count. If red, ask the user (including the option to lighten the board). For a task-end meeting, `node .claude/hooks/flow.mjs` gives the member count and whether to run in parallel or in sequence (change size + limit; `code-reviewer` always attends, and `security-auditor` on a sensitive path).
1b. **Deterministic gate** (commit, task end, phase end; not in the plan meeting): `node .claude/hooks/gate.mjs --run`. It runs the lint, type check and test from AGENTS.md → `Commands`, plus Semgrep. The result is stored with the change signature. If it is red or empty (no check ran), the commit gate does not open: fix first or fill in `Commands`. If the user explicitly asks for an intermediate commit, use `node .claude/hooks/commit-gate.mjs --skip "user request"` (it always asks for approval). If the gate says "command approval required", show the commands to the user. If the user approves, run `node .claude/hooks/gate.mjs --approve` (a new or changed command does not run without approval).
1c. **In a commit meeting, first** run `node .claude/hooks/commit-gate.mjs --status`. If it says "Approval valid", there is no meeting (the task-end meeting already reviewed the same changes). If it says "Changed since the last approval: …", give the members only the diff of those files.
2. **Run the members in parallel** (Agent tool, each member as a separate subagent). Give each member: meeting type, scope (plan text / diff range / phase), task id, acceptance criteria and gate output (if any). In the call, pass the `model` and `effort` of the review role (`node .claude/hooks/models.mjs --show`). In a commit meeting, pass `model: "haiku"`, `effort: "low"`. Write the report contract in the prompt: max ~15 lines and 5 findings (any more as one line: "other: N minor findings"), one line per finding, in order of severity, no praise or summary (reports enter the main session's context). Prompt order: the part that is the same for all members (meeting type, scope, acceptance criteria, gate output) first, the member-specific part last; the shared head is read from cache. If a re-check is needed after fixes, do not start a new member. Continue the same member with SendMessage and give only the fixed diff (the cold start is paid once).
2b. **If it is a council meeting** (§2), apply stages 1-4 of `.claude/board/council.md`. Build the synthesis from the chair's decision. Write the minority view on the disagreement line.
3. **Synthesize** (main agent; in a council, from the chair's decision):

```
## Board: [type] · [scope]
Attended: [members] · Result: APPROVE | CONDITIONAL | REJECT
Critical: [if any]
Important: [merged, no duplicates, in order of severity]
Disagreement: [the two views, if any]
To ask the user: [decisions the members flagged]
```

4. **Inform the user and ask:** Ask the decisions with AskUserQuestion. Ask which findings to fix as a **multi-select**, with CRITICAL ones marked as recommended.
5. **Record:** Add one line to `docs/workflow/board.md` → "Meeting log". Add the decisions to the decision log `docs/decisions/log.md`. Write open findings to `docs/workflow/progress.md` → "Open issues / blockers".
6. **If the commit meeting result is APPROVE or CONDITIONAL,** open the commit gate: `node .claude/hooks/commit-gate.mjs --approve "<attending members>"`. If REJECT, do not open it; ask the user first.

If the user wants to skip commit review for now, they must say so explicitly. Then run `node .claude/hooks/commit-gate.mjs --skip "user request"` (it asks for approval) and write it to the log. To turn it off permanently: `docs/workflow/board.md` → `**Commit review:** off`.

## 5. How to set up the board (`/start` board step or `/board setup`)

1. Recommend by project type and PRD (table below). If there is an AI add-on, `board-ai` is always recommended. If there is personal data, `board-privacy` is always recommended.
2. Ask the user as a **multi-select** (recommended ones marked). With "Other" they can ask for a new expert, for example "Accessibility expert", "Game designer" or "Fintech compliance expert". In that case, write a new `board-<name>.md` using the existing template structure.
3. Do not ask for a model: members work with the model and effort of the review role (`docs/workflow/models.md`).
4. For each selected member, copy `.claude/board/board-<role>.md` to `.claude/agents/board-<role>.md` and **fill in the "This project" section**: product summary, chosen stack, critical flows, risks specific to this role. `security-auditor` is already under `.claude/agents/`.
5. In `docs/workflow/board.md`, fill in the status (`set up (YYYY-MM-DD)`; English in every language), the member table (write "review role" in the Model column) and the commit review line.
6. Introduce the board to the user: what each member does, when it steps in, the estimated cost (one line).
7. New agents load when the session restarts. Tell the user this. In this session, if needed, run the member as a general-purpose subagent by giving it the content of the role file.

| Type | Recommended board |
|---|---|
| web-saas | product, architect, security-auditor, ux, performance, privacy, qa (+ devops, + ai) |
| mobile | product, architect, security-auditor, ux, mobile, privacy, qa (+ devops, + ai) |
| backend | product, architect, security-auditor, api, devops, qa (+ privacy, + ai) |
