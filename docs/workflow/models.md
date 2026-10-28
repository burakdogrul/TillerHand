# Model and Effort (per role)

> The kit splits the work into five roles. You choose each role's model and effort (how much it thinks).
> `/build` asks one question per role (model and effort together) at the start of every task; `/start`, `/adopt` and `/release` ask when they begin. Two screens: first plan, code, test; then review, docs.
> The choice is written with `node .claude/hooks/models.mjs --set …` to `.claude/state/models.json` (not in git). `node .claude/hooks/models.mjs --show` shows the current choice.

## Roles

| Role | Key | Work it covers | Recommended |
|---|---|---|---|
| Planning and architecture | `plan` | Plan, architecture and data model decisions; PRD, README and user-visible text. Runs in the main session. | Opus · high |
| Code writing | `code` | Application code. Cannot write to test files. In the main session for a small task, otherwise in a subagent. | Sonnet · high |
| Test writing | `test` | Acceptance and adversarial tests, before the code; the `test-writer` agent. A separate agent from the one writing the code, and the recommended model is different too: the same model shares the same blind spot. | Opus · high |
| Review and audit | `review` | Board members, `code-reviewer`, `security-auditor`, findings reports (`/findings-all`). | Sonnet · high |
| Docs and research | `docs` | CHANGELOG, report summary; code scanning, web research (`/research` deep). The decision log is written in the main session at decision time. | Haiku · high |

Options in each question (the first is recommended; another combination can be written with "Other"):

| Role | Options |
|---|---|
| `plan` | Opus · high / Opus · extra high / Sonnet · high / Sonnet · medium |
| `code` | Sonnet · high / Opus · high / Sonnet · medium / Haiku · high |
| `test` | The model different from the code role's last choice goes first: Opus · high if code is Sonnet, Sonnet · high if code is Opus, Sonnet · high if code is Haiku. Then the other two models and the medium effort of the same model |
| `review` | Sonnet · high / Opus · high / Sonnet · medium / Haiku · high |
| `docs` | Haiku · high / Haiku · medium / Sonnet · high / Sonnet · medium |

If code and test are set to the same model, `models.mjs` warns but does not block (when the limit is tight, both can be moved to the cheap model).

Effort scale: low = `low`, medium = `medium`, high = `high`, extra high = `xhigh`. The higher the effort, the slower the answer and the more it takes from the limit.

Opus is the most expensive model and Haiku the cheapest. When the limit turns yellow or red, the biggest saving is to move the code role to a lower model (`docs/workflow/usage-limits.md` §3). Security, data model and architecture decisions stay in the planning role.

## How it applies in Claude Code

- **The main session** runs the planning role. The kit cannot change the main session's model: if the chosen plan model or effort differs from the session's, the AI suggests `/model <name>` and `/effort <level>` in one line.
- **Subagents:** Code writing, review and docs work goes to a subagent with the Agent tool. The call passes the role's `model` and `effort` value; the value in the call overrides the `model:` line in the agent file.
- **Aliases:** `opus`, `sonnet`, `haiku` (also `fable`) always go to the newest model of that family. To pin to a specific version, use the full model ID or the `ANTHROPIC_DEFAULT_OPUS_MODEL` (SONNET, HAIKU) environment variable.
- **Effort:** In a subagent call, effort can be passed in Claude Code v2.1.292 and later. If the `CLAUDE_CODE_EFFORT_LEVEL` environment variable is set, it overrides all effort choices. A model may not support every level.
- **Question mode:** If the `cost` topic is closed, no question is asked and the last choice stays valid.
- **Exceptions:** The commit (light) board review runs on every commit, so it stays at `haiku` and `low` (`.claude/board/rules.md`). The decision council (`.claude/board/council.md`) deliberately compares different models; the role choice does not apply to it.

Source: code.claude.com/docs/en/sub-agents, code.claude.com/docs/en/model-config (2026-10-26).

## Codex and Antigravity

| | Codex | Antigravity |
|---|---|---|
| Main session | Model picker and reasoning effort | Model picker and thinking level (Low / Medium / High) |
| Subagent | `.codex/agents/<ad>.toml` → `model`, `model_reasoning_effort`. Can also be given in the prompt at launch; if not given, it takes the main session's. | `.agents/agents/<ad>.md` → `model: inherit`, `flash` or `pro`. A subagent has no thinking level. |
| Role equivalent | Opus and Sonnet → strong model, Haiku → fast model (the docs' recommendation on 2026-10-26: `gpt-6.1-sol` and `gpt-6-luna`). Effort names are the same: `low` … `xhigh`. | Opus and Sonnet → `pro`, Haiku → `flash`. |

If there is no question tool with options (Codex), ask the two screens as a numbered list. If you cannot run a subagent, run the role yourself and suggest the model in text.

Source: developers.openai.com/codex/subagents, antigravity.google/docs/subagents, antigravity.google/docs/models (2026-10-26).
