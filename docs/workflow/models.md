# Model and Effort (per role and job)

> The kit splits the work into five roles, and each role into jobs. You choose a role's model and effort (how much it thinks); a job follows its role unless you give it its own.
> Commands do not stop to choose. They read the value before each subagent call and show one line: `Model: code.critical → opus / high`. Change a choice with `/models`; it applies from the next call.
> `node .claude/hooks/models.mjs --for <job>` prints one job's value. `--set …` writes to `.claude/state/models.json` (not in git). `--show` shows the current choice.
> The main way to choose is the panel: `node .claude/hooks/models-panel.mjs` (also what `/models` opens). The `--set` commands stay as the way to choose without a browser (SSH, cloud).

## Roles

| Role | Key | Work it covers | Recommended |
|---|---|---|---|
| Planning and architecture | `plan` | Plan, architecture and data model decisions; PRD, README and user-visible text. Runs in the main session. | Opus · high |
| Code writing | `code` | Application code. Cannot write to test files. In the main session for a small task, otherwise in a subagent. | Sonnet · high |
| Test writing | `test` | Acceptance and adversarial tests, before the code; the `test-writer` agent. A separate agent from the one writing the code. For security, payment or data-deleting work, a different model is better: the same model shares the same blind spot. | Sonnet · high |
| Review and audit | `review` | Board members, `code-reviewer`, `security-auditor`, findings reports (`/findings-all`). | Sonnet · high |
| Docs and research | `docs` | CHANGELOG, report summary; code scanning, web research (`/research` deep). The decision log is written in the main session at decision time. | Haiku · high |

## Jobs

A job follows the chain below until it finds a saved choice. To give one job its own value: `--set code.ui=opus:xhigh`. `--reset code.ui` sends it back to the role.

| Role | Job | When |
|---|---|---|
| main session | `main` | The conversation itself. Also written to `.claude/settings.local.json` (`model`, `effortLevel`), so it applies from the next session |
| `plan` | `plan.task` | Task plan |
| | `plan.architecture` | Architecture, data model, one-way door |
| | `plan.text` | PRD, README, user-visible text |
| `code` | `code.simple` | Small task |
| | `code.feature` | Normal feature |
| | `code.critical` | Auth, payment, data deleting, migration, security |
| | `code.bugfix` | Bug fix |
| | `code.refactor` | Change that keeps behavior |
| | `code.ui` | Interface code |
| `test` | `test.simple` | Test of a small task |
| | `test.feature` | Acceptance test |
| | `test.adversarial` | Adversarial test |
| | `test.critical` | Test of auth, payment, data deleting |
| `review` | `review.code` | `code-reviewer` |
| | `review.security` | `security-auditor`, also when it joins the board |
| | `findings.default` | All findings reports, one choice |
| | `findings.security`, `findings.tech`, `findings.perf`, `findings.ux`, `findings.business`, `findings.legal` | `/findings-*`, per report |
| | `board.default` | The whole board, one choice |
| | `board.commit` | Commit meeting |
| | `board.product`, `board.architect`, `board.ux`, `board.performance`, `board.privacy`, `board.api`, `board.qa`, `board.devops`, `board.mobile`, `board.ai` | Per member |
| `docs` | `docs.changelog`, `docs.report`, `docs.scan`, `docs.research` | CHANGELOG, report summary, code scanning, web research |

Chains:

- General: job → role → recommended.
- Report: `findings.<type>` → `findings.default` → `review` → recommended.
- Board member: `board.<member>` → `board.default` → `review` → recommended.
- Commit meeting: `board.commit` → recommended `haiku:low`. The role and the member choices do not reach it, because it runs on every commit.
- Main session: `main` → `plan` → recommended.

A saved value that is not valid is skipped and the reason goes to stderr. A job name in the file that the kit does not know is ignored and kept.

`code.simple` also takes the value `main`. `--for code.simple` prints `main` when it is saved that way or when its value equals the main session's value: the work is then written in the main session. Any other value goes to a subagent, which pays a cold start, so choose `main` for this job if small tasks should stay in the session.

## The panel

`node .claude/hooks/models-panel.mjs` opens a local page in the browser. It listens on `127.0.0.1` only, a one-time token opens the page once and gives it a session secret that it keeps in that tab only (no cookie), and it closes itself after 30 minutes without use. Opening the panel again closes the earlier one, so choices not saved there are lost. A job moved to an outside model needs your confirmation in the page before it is saved. Four tabs:

- **Usage:** Claude usage by day, week and 30 days, for this project or all projects (ccusage, refreshed on request). On a subscription the USD figure is the API equivalent, not a bill. External model spend is real money and is shown on its own: the two are never added together.
- **Jobs:** the choice per role and job, with the recommended value, where a value comes from (the job, its role, or the recommendation), and a level per job: easy, medium or hard. The level says how much reasoning the job takes; any model can be picked for any level.
- **Providers:** four steps: pick a provider, add its key, pick a model, try it. Ready-made providers come with their address, key page and model list; "Not listed" takes your own address. **Try** asks the model one short question and asks it to call a tool, because jobs work through tools; each try is counted in spend and in the daily limit, and one panel run allows 30 tries. **Update model lists** fetches each provider's current list into `~/.vibe-kit/model-lists.json`. Most providers need a key for this, so a provider's list opens when its key is added; a failed update keeps the old list. Prices (USD per million tokens) count spend; with a price, the spend of a run is exact instead of an estimate. Daily limits are here too. The page can also save the project choice as your default for new projects (`/start` offers it; `node .claude/hooks/models.mjs --use-default` applies it).

On the desktop app the limit is not written by a status line, so `/models` records it first with `node .claude/hooks/usage.mjs --record …`.

## Which job

The commands pick the job by this table. If several fit, the upper one wins. Show the result in one line: `Model: code.critical → opus / high`. If the user says "treat this as simple", use that job for the task and save nothing.

| The work | Job |
|---|---|
| Auth, authorization, payment, webhook, personal data, data deleting, migration | `code.critical`, `test.critical` |
| The flow says "code: main session" | `code.simple`, `test.simple` |
| `/fix-bug` | `code.bugfix` |
| Behavior does not change | `code.refactor` |
| Interface only | `code.ui` |
| Anything else | `code.feature`, `test.feature` |

## Options

`/models` offers these per role (the first is recommended; another combination can be written with "Other"):

| Role | Options |
|---|---|
| `plan` | Opus · high / Opus · extra high / Sonnet · high / Sonnet · medium |
| `code` | Sonnet · high / Opus · high / Sonnet · medium / Haiku · high |
| `test` | Sonnet · high / Opus · high (for security, payment or data-deleting work) / Sonnet · medium / Haiku · high |
| `review` | Sonnet · high / Opus · high / Sonnet · medium / Haiku · high |
| `docs` | Haiku · high / Haiku · medium / Sonnet · high / Sonnet · medium |

If code and test are set to the same model, `models.mjs` prints a note and does not block.

Effort scale: low = `low`, medium = `medium`, high = `high`, extra high = `xhigh`, max = `max`. `max` works in subagent calls and in `/effort`, not for `main`: the `effortLevel` setting does not accept it. The higher the effort, the slower the answer and the more it takes from the limit.

Opus is the most expensive model and Haiku the cheapest. When the limit turns yellow or red, the biggest saving is to move the code role to a lower model (`docs/workflow/usage-limits.md` §3). Security, data model and architecture decisions stay in the planning role.

## How it applies in Claude Code

- **The main session** runs the `main` job, which follows the planning role. The kit cannot change a running session's model: if `--for main` differs from the session's, the AI suggests `/model <name>` and `/effort <level>` in one line. A `/model` in a session wins for that session.
- **Subagents:** Code writing, review and docs work goes to a subagent with the Agent tool. The call passes the `model` and `effort` from `--for <job>`; the value in the call overrides the `model:` line in the agent file.
- **Aliases:** `opus`, `sonnet`, `haiku` (also `fable`) always go to the newest model of that family. To pin to a specific version, use the full model ID or the `ANTHROPIC_DEFAULT_OPUS_MODEL` (SONNET, HAIKU) environment variable.
- **Effort:** In a subagent call, effort can be passed in Claude Code v2.1.292 and later. If the `CLAUDE_CODE_EFFORT_LEVEL` environment variable is set, it overrides all effort choices. A model may not support every level.
- **Exception:** The decision council (`.claude/board/council.md`) deliberately compares different models; the role choice does not apply to it.

Source: code.claude.com/docs/en/sub-agents, code.claude.com/docs/en/model-config (2026-10-26).

## External models

`/models` moves any role or job to a model from a provider the user added. Every job shows a level (easy, medium, hard), so you can match the model to how much reasoning the job takes. Available in Claude Code; Codex not yet, Antigravity not supported.

- The value is `provider/model:effort`, for example `code=myprovider/some-model:high` or `code.ui=myprovider/some-model:high`. A ready-made provider has its name; for any other the user chooses one. The model id comes from the list or is written exactly as the provider gives it. `max` is not available for an external model.
- Such a job runs with `node .claude/hooks/run-role.mjs <job> <prompt file>` (`--for` prints it), not with the Agent tool. It asks for approval each time. The reply is untrusted output. For an agent's job, put the agent's definition in the prompt file. Plan and review jobs get read-only tools there, and the file tools of any such job cannot leave the project.
- The main job opens in the user's own terminal with `node .claude/hooks/run-session.mjs`. The whole conversation goes to the provider, and an Agent call to a job set to a Claude model is refused. `--for main` prints the command.
- The provider must answer Anthropic Messages at `/v1/messages` over `https` with a Bearer key.
- The key is entered only by the user, in their own terminal: `node .claude/hooks/models.mjs --set-key <provider>` asks for the address and the key. The panel never takes a key. System variables and `.env` are not read.
- Where a key is kept: sealed with its address in the system key vault (Windows DPAPI under `~/.vibe-kit/keys/`, the macOS Keychain, Linux `secret-tool`), so it goes only to that address. `~/.vibe-kit/providers.json` holds only the date and the host for display. Showing the choice (`--show`, `--for`), the panel and the dashboard never open the vault; only a run does. With no vault, external models are not available.
- The limit is per provider, per day, and optional: `--set-limit <provider> <usd>`. `--remove-key <provider>` removes a key.
- The remaining risk: a program running as the user can open the vault, and the guards only read command text. An allowed command runs code the model wrote, and that code can read project files and the user's own files. Do not give code and test roles to an external model in a project with real secrets.

## Codex and Antigravity

| | Codex | Antigravity |
|---|---|---|
| Main session | Model picker and reasoning effort | Model picker and thinking level (Low / Medium / High) |
| Subagent | `.codex/agents/<ad>.toml` → `model`, `model_reasoning_effort`. Can also be given in the prompt at launch; if not given, it takes the main session's. | `.agents/agents/<ad>.md` → `model: inherit`, `flash` or `pro`. A subagent has no thinking level. |
| Role equivalent | Opus and Sonnet → strong model, Haiku → fast model (the docs' recommendation on 2026-10-26: `gpt-6.1-sol` and `gpt-6-luna`). Effort names are the same: `low` … `xhigh`. | Opus and Sonnet → `pro`, Haiku → `flash`. |

`--for` works there too: read the value and use the equivalent above. If you cannot run a subagent, run the role yourself and suggest the model in text.

Source: developers.openai.com/codex/subagents, antigravity.google/docs/subagents, antigravity.google/docs/models (2026-10-26).
