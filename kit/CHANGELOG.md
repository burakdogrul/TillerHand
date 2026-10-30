# Kit changelog

The kit version is in `kit/VERSION`. To update a project, run `/kit-update` in it.
Items with an "Adapt by hand" note concern files owned by the project; the update does not touch them.

## [3.49.4] - 2026-10-30

### Security
- A `.env` glob with a bracket range or POSIX class (`cat .e[a-z]v`, `.e[[:alpha:]]v`, `.env.[a-z]*`) is asked. The 3.49.3 glob matcher read `[a-z]` as the three characters `a`, `-`, `z`, so the read went through unasked.

## [3.49.3] - 2026-10-30

### Security
- **The shell guard no longer crashes on a glob with an unclosed `[`** (`…; echo .[`, `jq '.["a"]'`). The 3.49.2 `.env` glob check threw there, and a crashed hook lets the command run. Globs are now matched without regular expressions, so `.**********z` cannot stall the hook either, and any unexpected error in the shell guard asks you instead of passing.
- `.env` globs also cover `.env.staging`, `.env.test` and `.env.preview` (`cat .env.st*`).

## [3.49.2] - 2026-10-30

### Security
- **git can no longer write a file of its choosing unasked.** `git diff/log/show --output`, `git format-patch -o`/`--output-directory`, `git archive -o`/`--output` and `git bundle create` are asked, and so is a `$VAR`, `$(…)` or backtick inside `git log/diff/show`: through the allowed `git diff` and `git log` they could overwrite a guard script, a test or the settings.
- **A shell command that reaches a `.env` file is asked in Claude Code too** (`git show :.env`, `curl -d @.env`, `cat apps/web/.env.local`, globs like `.e*` or `.e[n]v`). The permission list covered only the Read tool. `.env.example`, `.env.sample` and a `vercel env pull` on its own (dev values) stay free; a read chained after the pull is asked.
- **Env files and `secrets/` are denied at any depth** (`apps/web/.env.local`, `.env.development`, `.env.staging`), in the Claude permission list and on Codex and Antigravity. `node kit/kit.mjs install` is asked instead of allowed: it copies files over the guards. `/kit-update` moves the old allow rule.
- **A line continuation no longer hides a commit**: `git commit\` + newline and `git comm\` + newline + `it` are checked like `git commit`.
- **Turning the commit review off asks you.** Any file-tool change after which the commit gate would read `**Commit review:** off` in `docs/workflow/board.md` needs your approval (the whole file is checked, so a short edit or a second line does not slip past); writing that file from the shell, by name or by glob, is asked too. Adding meeting log rows is free.
- **Saving a translation asks you.** `lang.mjs --write` is no longer allowed without a prompt (`--show`, `--check`, `--export` and `--set` still are), a heredoc, `<<<`, pipe or `$n`/`"$@"` spelling of a guard script call is asked, and a translation whose line breaks differ from the English text, that carries control characters (`\r`, ESC, bidi overrides, line separators) or is over three times the English length is neither shown nor saved. `/kit-update` removes the old `lang.mjs:*` allow rule.
- **Known limit:** the shell guards read the command text. Spellings the shell rebuilds at run time (`nod""e`, `sh -c '…'`, brace expansion, another runtime such as `bun`) can still get past them; the permission prompts and the commit gate remain the backstop.

### Fixed
- The guard-script check looks only at the part of a chain that runs the script: `node .claude/hooks/progress.mjs --check; wc -l < docs/workflow/progress.md` no longer asks.
- Setting up tests is no longer treated as weakening them: the first `"test"` script (none yet, or npm's placeholder) set to one plain runner (`vitest run`, `jest`, `playwright test`, `pytest`, `node --test`) is not asked when nothing else in `package.json` changes. Flags, `|| true`, `exit 0`, other fields and a new test config with `include`/`testDir` still are.
- Maestro flows (`.maestro/*.yaml`), XCTest files (`*Test.swift`, `*Tests.swift` with a capital T; `Latest.swift` is not one), `*.e2e.ts`, snapshots and test setup files (`vitest.setup.ts`, `setupTests.ts`) count as test files: only test-writer writes them.
- In a Turkish (or any non-English) project the session note names the fixed value words that stay English (`automatic`, `one-way`, `on`/`off`, `Setup`, `Phase N`…) and asks for free text in your language; `/start` follows closed question-mode topics; the templates say which values the dashboard reads (`test-plan.md` Status, flag table, board status, feedback `new`).
- `AGENTS.md` states the Codex and Antigravity limit: the commit gate does not run there, so run the gate and the board before committing.

## [3.49.1] - 2026-10-29

### Fixed
- **The gate command approval names keys that will not run.** A key under `## Commands` the gate does not read (for example `tip kontrol:` instead of `type check:`) is listed in the approval dialog and in the gate's "command approval needed" text, so a skipped check is visible before you approve.
- The dashboard's copy button keeps a path in the command (`/fix-bug login fails on /api/login`, `/fix-bug blank page in /index.html`); only a second slash command (`then /clear`) cuts it.

## [3.49.0] - 2026-10-29

### Changed
- **Everything the kit ships is English.** Hooks, commands, agents, board files, templates, the eval fixtures and the Turkey add-on (`docs/legal/turkiye.md`, the KVKK checklist) are written in English; official names (KVKK, GİB, e-Fatura, iyzico, PayTR) stay as they are. The conversation language is still chosen in the first question of `/start` and `/adopt`.
- **Turkish interface texts ship as a translation file.** Hook messages, the status line and the dashboard read Turkish from `.claude/i18n/tr.json`; other languages are still translated by `/language`. A missing key falls back to English.
- **A set-up project with no language chosen talks in English.**
- **Labels and keys stay English in every language.** The session note tells the AI to keep `**Active phase:**`, `## Where we left off`, `type check:` and the verdict words English, because the tools read them.
- Skill descriptions no longer carry Turkish trigger words.
- Renamed: the checkpoint tag prefix is `checkpoint/` (was `calisan/`), the path marker is `kit:path-allowed` (was `kit:yol-izinli`), the AI add-on variables are `AI_MODEL_DEFAULT`, `AI_MODEL_FAST`, `AI_USER_DAILY_LIMIT`, the Dependabot group is `minor-updates`, the preview folder of an unnamed task is `.previews/latest`, and `/adopt` archives the old files as `claude-md-old.md` / `agents-md-old.md`.
- The dashboard warns when a board meeting result has no verdict it knows, and the gate warns about unknown keys under `## Commands`.

### Breaking
- Turkish labels, values, verdicts, ids (`Ö-01.1`, `O_01_1`), prefixes (`SALDIRI:`) and arguments (`/tools ac`, `hepsi`, `K/O/B`…) are no longer read. A project file that still uses them looks empty to the dashboard and the status line, and a meeting with a Turkish verdict shows as unknown.
- The gate asks for the command approval once more after the update.
- The update no longer migrates from older versions: the narrator style rename, the old dashboard flag, the old preferences file name and the old package names are not rewritten.
- `/rollback` lists only `checkpoint/*` tags.

### Compatibility
- Adapt by hand: move Turkish labels in `docs/workflow/progress.md`, `AGENTS.md` (`## Commands`), the decision log and board files to English; take the kit's template as `.kit-new` and copy your content over. Rename the AI variables in your `.env`, and replace `kit:yol-izinli` markers with `kit:path-allowed`.

### Fixed
- The eval set-up wrote Turkish labels into the test project, so the kit condition read nothing from it.
- **The gate is no longer green on Semgrep alone.** With lint, type check and test all missing (no `## Commands` block, or a heading in another language), a clean Semgrep scan made the gate green and opened the commit gate. Now the result is EMPTY unless a project check passed.
- The unknown-key warning under `## Commands` reads only the code block: a note line or an address no longer counts as a key.
- A translation whose text drops or adds a placeholder (`{list}`, `{path}`) is not shown; the English text is shown instead, so an approval dialog never hides what it asks. Translation files are read once per process.
- The Turkey add-on names the Personal Data Protection Board and the Personal Data Protection Authority separately (who issues decisions, who is notified), and the e-invoice source keeps the communiqué's short name (VUK No. 509).
- `/start` says that writing a translation file asks for approval once.

## [3.48.1] - 2026-10-29

### Changed
- **CI job ids in the templates are English.** `ci.yml`: `check`, `complexity`, `duplicate-code`, `secret-scan` (were `kontrol`, `karmasiklik`, `kopya-kod`, `sir-taramasi`). The CI repair job is `fix` and writes its log to `ci-error.log`; the weekly maintenance job is `maintenance`, live monitoring is `monitor`. The backend pre-commit secret scan hook id is `secret-scan`.
- **AI eval cases use English fields.** `ai/evals/cases.jsonl`: `id`, `feature`, `kind` (`typical` / `hard` / `malicious`), `input`, `expected` with the checks `contains`, `not_contains`, `equals`, `schema`, `error`, `rubric`. The run script is `evals/run.ts` or `evals/run.py`.

### Compatibility
- Adapt by hand (optional): GitHub names status checks after the job id. If a branch protection rule requires the old check names (`kontrol`, `sir-taramasi`…), pick the new names there after updating the workflow files. Existing eval files and run scripts keep working as they are; the template only shows the new field names.

## [3.48.0] - 2026-10-29

### Changed
- **Labels, values and arguments the tools read are English now.** New projects get English templates: `**Active phase:**`, `**Question mode:** on · closed topics: none`, `## Where we left off`, `## Commands` with `dev:` / `preview:` / `type check:`, `# [PROJECT NAME]`, and so on. Board and council members write `VERDICT: APPROVE | CONDITIONAL | REJECT`, findings `[CRITICAL|IMPORTANT|SUGGESTION]`, and the council minutes use `Opinion`, `Reviewer`, `VOTES:` (`AGREE` / `DISAGREE` / `OVERSTATED`), `RANKING:` and `## 3. Overall ranking`.
- **Ids and prefixes.** Acceptance criteria are `AC-01.1` (`AC_01_1` in Python test names), adversarial tests start with `ATTACK:`, and dates in templates are `YYYY-MM-DD`.
- **Commands.** `/handoff take`, `/tools on|off|measure|commands light|full`, `/ask-mode on|off <topic|all>`. Decision topics are `product`, `tech`, `design`, `content`, `data`, `security`, `cost`. Package names are `design`, `security`, `release`, `video`. Cost log sizes are `S` / `M` / `L`. Bug classes are English (`authorization`, `date-time`, … `other`).
- **Values.** Board `not set up` / `set up`, commit review `on` / `off`, handoff `waiting`, decision log `automatic` / `user` and `one-way` / `two-way`, QA results `passed` / `failed` / `not run`, feedback types and statuses, learning `right` / `wrong`.
- **The narrator output style is `narrator`** (was `anlatici`). The update replaces an unchanged old copy and the `outputStyle` setting.
- Writers keep the language of the file they write into: a council section, a progress label or a question-mode line in an older Turkish file stays Turkish.

### Compatibility
- Project files from earlier versions keep working. Every hook still reads the Turkish labels, values, verdicts, ids (`Ö-01.1`, `O_01_1`), prefixes (`SALDIRI:`) and arguments (`/handoff devral`, `/tools ac`, `tasarim`, `hepsi`, `K/O/B`), and counts them together with the English ones on the dashboard.
- Adapt by hand (optional): nothing has to change. To move a project file to English, take the kit's template as `.kit-new` and copy your content over.

### Fixed
- The dashboard's question-mode hint suggested `/ask-mode ac`; it is `/ask-mode on`.
- A council decision or meeting result that only contained the letters "RET" inside a word (for example "INTERPRETATION B") got a reject badge.
- `**Commit review:** offer` no longer counts as review switched off.

## [3.47.1] - 2026-10-28

### Fixed
- The dashboard counts an English `yes` in the feature flags "Kill switch tested" column as tested (`evet`, `✅` and `var` still work).
- `/build` and `/fix-bug` look for the gate's current "command approval needed" message.

## [3.47.0] - 2026-10-28

### Changed
- **The whole kit is written in English.** Hook messages the AI reads are English. Text you see directly (dashboard, status line, notifications, permission dialogs) comes in the conversation language you picked with `/start`, `/adopt` or `/language`. Document and project templates, the installer, CI workflows, the eval harness and these release notes are English too. Board and council members now write `MEMBER:`, `VERDICT:` and `FINDINGS:`.
- **README and guide.** `README.md` is English and opens by default on GitHub; the Turkish version is `README.tr.md`. The guide on GitHub Pages is English; the Turkish guide is `guide.tr.html`, linked from the top right.
- Release notes mark manual steps with **"Adapt by hand"**.
- The optional Turkey add-on and the KVKK privacy text stay Turkish.
- Labels and values that hooks read from your project files (`progress.md` labels, board and decision log fields, verdicts such as `ONAY`/`RET`, arguments such as `/handoff devral`) are unchanged, so existing projects keep working. They move to English in a later release, with an automatic migration in `/kit-update`.

### Fixed
- Stack templates keep the exact `## Seçilen teknolojiler` heading the dashboard reads.
- CI: a test no longer depends on a `.claude/state` folder that only exists in a developer's working copy.

## [3.46.0] - 2026-10-27

### Changed
- **Agents, board, findings reports and skills are in English.** `.claude/agents/`, `.claude/board/`, `.claude/findings/`, `.claude/skills/` and the narrator mode (`anlatici`) were translated to English. The format the board and council write (`ÜYE:`, `KARAR:`, `Görüş A`, `OYLAR:`, `DOĞRU`/`YANLIŞ`/`ABARTILI`) and the fields of the findings report template stay Turkish for now, because tools read them. Narrator mode now explains in the conversation language instead of plain Turkish.

## [3.45.0] - 2026-10-27

### Changed
- **Commands and core rules are in English.** All commands under `.claude/commands/`, plus `AGENTS.md` and `CLAUDE.md`, were translated to English. The AI reads them every session, so the same content costs fewer tokens. The language it talks to you in does not change: it speaks the language you chose in `/start`. Labels that tools read and command arguments (`## Komutlar`, `**Aktif faz:**`, `/handoff devral`, board verdicts) stay Turkish for now; they will change in one go in later releases.
- **Adapt by hand:** `AGENTS.md` and `CLAUDE.md` in your project belong to the project; the update does not touch them. For the English version, take the kit's new `AGENTS.md` as `.kit-new` and move over the sections you filled in (project name, commands, learned rules). Do not change the `## Komutlar` heading: the commit gate reads the commands from it.

## [3.44.0] - 2026-10-27

### Added
- **You choose the conversation language.** `/start` and `/adopt` ask first, in English: Turkish / English / Other. The chosen language is written to `.kit.json` → `lang`; from then on questions, answers, the status block and document texts are in that language. The AI is reminded of the language at every session start and every message.
- **Languages other than Turkish and English.** The AI translates the texts the hooks show you directly once, when a language is chosen (`.claude/i18n/<kod>.json`); text without a translation shows in English. `node .claude/hooks/lang.mjs --check` lists what is missing.
- **`/language`**: changes the language later and refreshes the translation and the dashboard. Documents already written are not translated automatically; the command asks.

### Changed
- **The dashboard is not generated before a language is chosen.** In a project that is not set up, `dashboard.html` is not written until `/start` asks for the language. The dashboard texts will move to the chosen language in later releases.
- **Old projects stay Turkish.** Projects without a `lang` field count as Turkish; `/kit-update` asks for the language once. A project installed directly with `kit.mjs install`, without `/start`, also counts as Turkish; choose the language with `/language`.

## [3.43.0] - 2026-10-27

### Added
- **The commit gate checks where a test file came from.** When `test-writer` writes a test file with Write/Edit, a digest of the content is recorded (`.claude/state/test-writer.json`). If a test file entering a commit does not match this record, the commit stops: a test written with `git apply`, `patch`, a script or the shell no longer passes even with board approval. If the user made the change themselves, use `--skip` for that commit. A partially staged test file (`git apply --cached`, `skip-worktree`) always stops. Non-code files in the test folder (snapshots, images, fixtures) are not checked; the protections that ask before deleting still apply to deleted test files. Claude Code only (the agent identity exists only there).

## [3.42.1] - 2026-10-27

### Fixed
- **Two path leaks in the test separation were closed.** Paths containing `..`, such as `node_modules/../tests/a.test.ts`, are now normalized and counted as test paths; a write to a nested path that does not exist yet under a link to the test folder is also caught.

## [3.42.0] - 2026-10-27

### Added
- **A separate agent writes the tests, not the one who writes the code.** The new `test-writer` agent writes acceptance and adversarial tests before the code, looking only at the acceptance criteria, the spec and the external interface; it does not see the implementation plan. When the same agent writes code and test, the test takes the shape of the code; this separation prevents that.
- **Only `test-writer` can write to a test file.** In Claude Code, if the main session or another agent tries to write to a test file with a file tool or the shell, the test protection blocks it (test config files are still asked about as before). Codex and Antigravity do not report an agent identity, so the rule stays in the text there.
- **Bypass routes in the test protection were closed.** Writes that Windows resolves to the same file (trailing dot or space, `::$DATA`), short names and links to the test folder are checked by their real path. Writing a test with `touch`, `ln`, `dd`, `curl -o`, `wget -O` in the shell is also blocked; inline scripts that name a test path (`node -e`, `python -c`, `bash -c`) are asked about. Test folders under `node_modules/` and `.git/` do not count.
- **Plugin directory details.** A display name, version, documentation and support link were added to the plugin.
- **Fifth role: test.** A test role was added to `docs/workflow/models.md`; its recommended model differs from the code role (code Sonnet, test Opus). `models.mjs` warns if code and test are set to the same model.

### Changed
- **Model questions at task start are one question per role.** Model and effort are asked together, on two screens: first plan, code, test; then review, docs. Adapt by hand: none.
- **`/build` steps:** 2b tests (`test-writer`), 2c code. In `/fix-bug` step 5, `test-writer` writes the red test.

## [3.41.1] - 2026-10-27

### Changed
- **Installation is explained with three options.** The README and guide describe the npm (recommended), Claude Code plugin and git routes separately, with when to pick each. The plugin route is also in the steps for beginners.
- **Plugin icon.** The logo mark was added as a square PNG for the plugin directory.

## [3.41.0] - 2026-10-27

### Added
- **Copy buttons on the dashboard.** `dashboard.html` puts a button next to the next step and next to warnings that suggest a command; the command is copied to the clipboard and can be pasted into the Claude chat. For users who do not know what to type.

## [3.40.0] - 2026-10-27

### Added
- **Install as a Claude Code plugin.** The repo is now a plugin marketplace: `/plugin marketplace add burakdogrul/TillerHand`, `/plugin install tillerhand@tillerhand`, then `/tillerhand:init`. The plugin carries only the setup skill; the kit is still copied into the project as files, and the protections and the permission list stay in the project. The plugin can be turned off after setup.

## [3.39.4] - 2026-10-27

### Fixed
- **Turkey add-on: an iyzico payment id above 2^53 is rejected.** `iyziPaymentId` arrives as a JSON number; JavaScript rounds a number of this size, so an order could be queried with the wrong id. The Web SaaS signature check now accepts only safe integers; two checks were added to the adversarial test. Adapt by hand: `src/lib/payments/webhook-signature.ts` and `tests/security/payment-webhook.mjs` in the project.

### Changed
- **`/wrap-up` writes the progress file with a script.** Date, active task, next step and the roadmap mark are written with `progress.mjs`; at the end `--check` verifies the label format.

## [3.39.3] - 2026-10-26

### Fixed
- **Mobile catalog: direct StoreKit + Play Billing is not "no commission".** The store commission is still taken; the saving is only the RevenueCat fee.

### Changed
- **Sourced prices in the mobile and backend catalogs.** RevenueCat (free up to 2,500 dollars of monthly tracked revenue, 1% above) and Railway (Hobby 5 dollars a month) were written with source and date.

## [3.39.2] - 2026-10-26

### Changed
- **Hosting and email limits in the Web SaaS catalog are sourced.** The fact that Vercel's free Hobby plan is closed to commercial use, and the free limits of Cloudflare Workers and Resend, were written with source and date. The option description now says that Vercel Hobby will not be enough for a product that takes payments.

## [3.39.1] - 2026-10-26

### Changed
- **First sourced claims in the Web SaaS technology catalog.** The Supabase and Clerk free tiers, Stripe's status in Turkey and the Plausible price were written with source and date; `/start` does not research them again for 90 days.
  - Adapt by hand: In a project that is already set up, `docs/architecture/stack.md` belongs to the project and does not change with the update.

## [3.39.0] - 2026-10-26

### Changed
- **`/start` verifies only what changed.** Technology decisions no longer get a separate research per decision. Price, free tier and limit claims in the options to be shown are gathered in one research round at the start of the step. A claim in the catalog whose source and date are newer than 90 days is not researched again; a verified claim is written to the project's `stack.md` with source and date.
  - Adapt by hand: In a project that is already set up, the same note can be added to the intro paragraph of `docs/architecture/stack.md` → "Karar noktaları"; it is not required.

## [3.38.0] - 2026-10-26

### Changed
- **The cost log line fills itself.** At task start, `/build` records the 5-hour percentage and the time with `progress.mjs --start`. At task end, `--cost "<iş>" <boyut>` writes the start, the end, the difference and the duration itself. The start is used once and does not leak into the next task. The desktop app has no status line, so the percentage is given with `--limit`.

## [3.37.1] - 2026-10-26

### Changed
- **`/start` suggests `/clear` after heavy steps.** The results of the research, technology decisions, board and design direction steps are written to files; the next step reads them. Continuing in a clean session is cheaper, and `/start` resumes from where it stopped.

## [3.37.0] - 2026-10-26

### Changed
- **A subagent does not cold-start a second time.** If a code subagent or board member will look again after a fix, a new agent is not started; the same agent is continued with SendMessage and given only the fixed diff. It does not re-read the files.
- **The board prompt is in a cache-friendly order.** The part that is the same across members (meeting type, scope, acceptance criteria, gate output) is written first, and the member-specific part last.

## [3.36.0] - 2026-10-26

### Changed
- **Board members are picked from the changed files.** At task end, `flow.mjs` looks at the changed paths and suggests, by name, the members that are on the board: the one with the most matching files first, the number depending on task size and limit. If a path involves auth, payment, a webhook, file upload or a secret, `security-auditor` is added too. The path is a guess; if the change means something else, correct it against the member table.
- **A board member writes at most 5 findings.** Anything more is counted in one line ("diğer: N küçük bulgu").

## [3.35.0] - 2026-10-26

### Changed
- **End-of-task document writing is done by a script.** The roadmap mark, the cost log line and the progress labels are mechanical work; they are no longer given to a subagent. The new `node .claude/hooks/progress.mjs` writes them in one command and spends no tokens:
  - `--done G-012` marks the task in the roadmap.
  - `--cost "<iş>" <K|O|B> <başlangıç %> <bitiş %> <dk>` adds a line to the cost log and computes the difference. If the window was renewed in between, the difference is written as `?`.
  - `--task`, `--did`, `--next` update progress.md and set the last-updated date itself.
  - `--check` verifies that the bold labels the status line and the dashboard read are intact.
  - `/build` step 8 uses this. The permission line is added with `/kit-update`.

## [3.34.0] - 2026-10-26

### Added
- **Subagents only when they pay off.** A subagent cold-starts: it re-reads its prompt and the files. On a small task that costs more than it saves. The new `node .claude/hooks/flow.mjs` looks at the task size (file count), the context and the limit and tells you the flow; it spends no tokens:
  - 1-2 files: code and docs work stays in the main session. 3 and above, or context above 50%: the code role goes to a subagent.
  - At task end, the board has 1, 2 or 3 members + `code-reviewer` (plus `security-auditor` on a sensitive path). At a yellow limit the member count is halved; at red, a single member works in turn.
  - If the context is above 50%, `/clear` is suggested first.
  - `/build` (step 2a) and the board rules use this. The desktop app has no status line, so context and limit are passed with `--context` and `--limit`.
  - The permission line is added with `/kit-update`.

## [3.33.0] - 2026-10-26

### Changed
- **The main session context stays small.** Every turn re-reads the whole session context; every line that enters the context is paid for again in later turns.
  - Independent questions of the same step are asked in one question round (at most 4).
  - When the gate is red it shows the last 30 lines; the full longer output is written to `.claude/state/gate-log/<kontrol>.log` and read only if needed.
  - Board members, `code-reviewer`, `security-auditor` and the code subagent give a report of at most ~15 lines, one line per finding.
  - When a task finishes and the commit is made, `/build` suggests `/clear` (task = session); the new session continues from `progress.md`. In a large file, search first, then read only the lines needed.

## [3.32.1] - 2026-10-26

### Fixed
- **A skipped review does not count as "reviewed".** In a commit made with `--skip`, `commit-gate.mjs --status` said "these changes were reviewed". Then when a file changed, the gate asked for only that file to be reviewed; the skipped files stayed unreviewed. Now `--status` says "review skipped, not reviewed"; if there is a change, the whole diff is reviewed.

## [3.32.0] - 2026-10-26

### Changed
- **The same change is not reviewed twice.** The end-of-task board meeting is now the only full review of the change: the relevant members and `code-reviewer` (plus `security-auditor` on a sensitive path) look together. If the meeting approves and the gate is green, the commit gate opens for the same changes; the board does not meet again at the commit, and `/review-changes` is not suggested separately.
  - If a file changes after approval, only those files are reviewed. The commit gate says which files changed since the last approval.
  - New: `node .claude/hooks/commit-gate.mjs --status` shows whether these changes were reviewed, the state of the gate and the files changed since the last approval. `/review-changes` and the commit meeting look at it first.
  - If no board is set up, the flow is the same: `/review-changes` is suggested at task end.
  - The permission line is added with `/kit-update`.

## [3.31.2] - 2026-10-26

### Fixed
- **Codex and Antigravity: the protection cannot be bypassed through the commit message.** In 3.31.1 a plain commit message was not counted as a command. PowerShell also counts smart quotes (`“ ” ‘ ’ „`) as string boundaries, so a command hidden behind a message with such quotes could pass without approval. Now the message is emptied only if it stays a single string the same way in bash, PowerShell and cmd: a message containing a smart quote, `\`, `$`, a backtick, a line break or `; & | < > ^ % !` is still checked.

## [3.31.1] - 2026-10-26

### Fixed
- **Dashboard dates no longer shift with the time zone.** Date-only lines (`2026-10-26`) in the decision, board and maintenance logs were counted as UTC midnight; west of UTC they showed the previous day. They are now read as the local day. The day labels of the commit chart were fixed the same way.
- **Codex and Antigravity: `--skip` in a commit message does not ask for approval.** A message like `git commit -m "… commit-gate.mjs --skip …"` fell into approval for nothing, as "the commit gate is being skipped". The plain-text message of a commit that runs alone (or after `git add … &&`) no longer counts as a command. A message containing `$(…)`, a backtick or `\`, and a commit chained with another command, are still asked about; a real `--skip` call is still asked about in every spelling.
- **Codex and Antigravity: it also asks when another argument sits between `commit-gate.mjs` and `--skip`** (such as `commit-gate.mjs -m '--skip' x`). Before, this spelling passed without approval; the gate in Claude Code already asked.

## [3.31.0] - 2026-10-26

### Added
- **Model and effort per role.** The work was split into four roles: planning and architecture, writing code, review and audit, docs and research. You choose the model and effort of each role (`docs/workflow/models.md`).
  - At the start of each task `/build` asks on two screens: first the model of the four roles (Opus / Sonnet / Haiku), then the effort (low / medium / high / extra high). Recommended: planning Opus high, code Sonnet high, review Sonnet high, docs Haiku high. `/start`, `/adopt` and `/release` ask the same question when they begin.
  - The choice is written to `.claude/state/models.json` with `node .claude/hooks/models.mjs --set …` (it does not go into git); `--show` shows the current choice.
  - Acceptance tests and code go to a subagent running on the chosen code model; the main session reads the diff and runs the gate itself. The board, `code-reviewer` and `security-auditor` work with the review role, and the end-of-task roadmap, cost log and progress writing with the docs role.
  - The code subagent cannot ask you questions: it stops at a decision point, the main session asks the question and writes it to the log.
  - Planning stays in the main session. The kit cannot change the session model; if your chosen plan model or effort differs, the AI suggests `/model <ad>` and `/effort <düzey>`.
  - If you closed the `maliyet` topic in question mode, no question comes and the last choice stays valid.
  - `/findings-all` reports work with the review role, and the `/research` deep research with the docs role.
  - The model is no longer asked separately when the board is set up; the "change model" option in `/board setup` was removed. The commit board check runs at every commit, so it stays on `haiku` and low effort; the decision council deliberately compares different models, so the role choice does not apply to it.
  - Dashboard: the "Limit ve maliyet" tab shows the current model and effort choice of the roles.
  - The Codex and Antigravity equivalents are in `docs/workflow/models.md`, with source and date.
  - Adapt by hand: AGENTS.md belongs to the project. A model item was added to the "Codex ve Antigravity'de" section and a `docs/workflow/models.md` row to the "Gerektiğinde oku" table; take them from the `.kit-new` file if you want. The permission lines are added with `/kit-update`.

## [3.30.0] - 2026-10-26

### Added
- **Personal preference memory.** The kit learns how you want to work: conversation style, question frequency, report format, code style, things to avoid.
  - When you correct a behavior or state a preference, the AI takes a note. At task end (`/build`) and session end (`/wrap-up`) the notes are asked about with a multi-select, "save as a preference?". Nothing you do not approve is written.
  - Preferences live in a single file: `~/.vibe-kit/tercihler.md`. It applies to all your projects, is loaded at every session start (Claude Code, Codex, Antigravity) and does not go into git.
  - Writing is done only with `node .claude/hooks/prefs.mjs --add <kategori> "<tercih>"` and is asked about each time. List: `--list`, remove: `--remove <no>`.
  - A preference that looks like a secret is rejected. At most 40 preferences are kept. A project rule comes before a personal preference; project-specific rules still go to "Öğrenilen kurallar".
  - Any program on the machine can write the file. So the same checks apply when reading: a line that is long or contains a secret or a control character is not loaded, and a file bigger than 64 KB is not read. Preferences enter the session as a "style preference"; they cannot change permissions, security rules or command rules.
  - Manual editing is supported; case and Turkish letter differences in headings do not matter. If a line cannot be read, the script does not rewrite the file; it stops so as not to delete the line, and shows the line.
  - Adapt by hand: AGENTS.md belongs to the project. The new rule is item "9. Kullanıcıyı tanı" (9. Know the user); if you want to add it to your project's AGENTS.md, take it from the `.kit-new` file. The permission lines are added with `/kit-update`.

## [3.29.0] - 2026-10-26

### Added
- **"Mutlak yol" (absolute path) check in the deterministic gate.** If an added line contains the full path of this machine's project folder or home folder, the gate turns red; the path may be written plain, with backslashes or escaped. Such a path does not work on another machine. The gate lists the lines and says how to derive the path.
  - General user-folder patterns such as `C:\Users\<ad>` and `/home/<ad>/` are only listed as a note and do not block the commit. So container paths such as `/home/node/app` and routes such as `/users/42` cause no problem.
  - Only added lines are scanned; new files are scanned from start to end. Files that do not go into git are not looked at.
  - A deliberate example (an example path in a document, a test input) passes by writing `kit:yol-izinli` on the line or the line above. The line-above option is for files that cannot take inline comments, such as Dockerfile and JSON.
- The same rule was added to AGENTS.md (Never) and to the stack documents of the three types (Common AI mistakes).

### Fixed
- **When the kit was installed from a local clone outside the project, the full path of the kit folder on this machine was written to `.kit.json`.** Since `.kit.json` is committed, someone opening the project on another machine saw a path that does not exist. The path is now in the non-git file `.kit.local.json`; the `.kit.json` → `kit` field says `local`. Old records are moved automatically during `/kit-update`. If the recorded path does not exist on this machine (it was written on another), it is not moved, only removed. If the file is missing, `/start` and `/adopt` ask for the kit folder or use the npm package.
- The version number in the guide footer had been left stale. The version in the guide and the README badges is now checked by a test.
  - Adapt by hand: `docs/architecture/stack.md` belongs to the project. The new item is in the "Sık yapılan AI hataları" (Common AI mistakes) section; add it to your own stack document if you want. The `.kit.local.json` line is added to `.gitignore` during the update.

## [3.28.6] - 2026-10-26

### Fixed
- **CI auto-repair (templates) works more narrowly:**
  - It makes the fix on the commit CI saw as red. If the branch moved in the meantime, the push is rejected; so commits that have not passed CI do not reach the agent with write access.
  - It does not run on Dependabot PRs.
  - If the security jobs (Semgrep, secret scan, RLS) are red, it does not try to repair; these need human review.
  - `claude-code-action` is pinned to a commit SHA.
  - The `git log` and `gh run list` permissions of the weekly maintenance agent were narrowed; outside text such as PR titles does not go to the agent.
- **No `${{ }}` expression is left inside `run:` in the template workflows** (in the backend live monitoring, `LIVE_URL` was embedded in the shell code). Values are passed as environment variables; a test checks this.
- **Council count:** A ranking with a missing or unknown letter (`1. Görüş D` on a single line) is now counted as invalid; before, it gave that opinion the best average with the vote of the single person who made the ranking. A finding that got no vote is written as "no vote", not "accepted"; if it is KRİTİK, the user is asked.
- **Status line:** Control characters (ESC sequences) in `progress.md` no longer pass to the terminal. With these characters it was possible to write to the dashboard or to print fake text over the line.
- **Dashboard:**
  - GitHub links in the cache can only be `https`; a cache dated in the future is counted as stale.
  - The text `<skipped` in the output of a failed test no longer makes the test look skipped.
  - A prod ref written as `-` or `yok` no longer produces a false KRİTİK warning.
  - A folder with a test or report name no longer crashes the dashboard and the gate.
  - A commit type such as `constructor:` does not break the count.
  - `dashboard.html` is not written through if it is a link.
  - That the dashboard escapes the repo texts is now checked by a test.
- **`/qa` evidence:** A `shots/<id>.png` link does not copy a local file under `.previews/`.
  - Adapt by hand: If you changed `claude-ci-fix.yml`, `claude-maintenance.yml` or `live-monitoring.yml` in your project, `/kit-update` leaves the new version as `.kit-new`.

## [3.28.5] - 2026-10-26

### Fixed
- **The CI and live monitoring jobs of the backend template never started in 3.28.4.** There is no tag `astral-sh/setup-uv@v10`; only full version tags exist. The action is now pinned to the commit SHA of v10.3.2. Every `uses:` line in the kit and the templates is tested against a list of references verified to really resolve.
  - Adapt by hand: In a backend project updated with 3.28.4, if you changed `.github/workflows/ci.yml` and `live-monitoring.yml`, take the `setup-uv` line from the `.kit-new` file.

## [3.28.4] - 2026-10-26

### Changed
- **GitHub Actions versions moved to Node 24** (GitHub was forcing actions that run on Node 20 to run on Node 24 and gave a warning): `actions/checkout` v7, `actions/setup-node` v7, `gitleaks/gitleaks-action` v3, `astral-sh/setup-uv` v10. The CI, maintenance, live monitoring and payment webhook workflows in the templates were updated. The kit's own npm publish workflow stays pinned to a commit SHA and turns off the package cache (against cache poisoning).
  - Adapt by hand: If you changed the workflow in your project yourself, `/kit-update` leaves the new version as `.kit-new`; take the version lines from there.

### Fixed
- **Commit alias detection was widened:** it is case-insensitive; `!` shell aliases that call another alias or contain `commit` in their value also count as commits. An alias defined in the same command (`git -c alias.x=…`, `git config alias.x …`, `GIT_CONFIG_*`) could not be read beforehand, so the command is stopped.

## [3.28.3] - 2026-10-26

### Fixed
- **The commit gate also sees `git.exe commit`, git written with a full path, and git aliases that open to a commit** (`[alias] ci = commit`, `!git commit`, `git -c alias.x=commit x`). These did not hit the gate before.
- **A commit with `commit-gate.mjs --skip` in its message could pass the board and gate check without a question.** Such a commit now goes through the normal commit check.
- **The broad `tools.mjs` permission left from 3.10.0 (`Bash(node .claude/hooks/tools.mjs:*)`) is removed by `/kit-update`.** This permission also freed the `--enable` and `--commands` commands, which must be asked about.
  - Adapt by hand: none.

## [3.28.2] - 2026-10-26

### Fixed
- **Content staged on a file marked `skip-worktree` or `assume-unchanged` could get past the commit approval.** These marks hide the difference between the stage and the disk from `git diff`. So the new signature in 3.28.1 could not see unapproved content either. The staged content of marked files now always enters the signature.
- **The commit gate is faster on every Bash command.** The gate module is loaded only on the gate command approval.
  - Adapt by hand: none.

## [3.28.1] - 2026-10-26

### Fixed
- **Staging approved changes with `git add` invalidated the commit gate and the board approval.** The change signature is now taken from the content of the files on disk; staging the same content does not change the signature. A file staged with content different from the disk (partial staging) shows up in the signature separately, because the commit takes the staged content.
- **`kit.mjs install` in the kit's clone folder deleted uncommitted work** (the `kit/` folder, `README.md`). If there is an uncommitted change, the install now stops before starting and lists the files.
- **Nine scripts found the project root from the folder they were run in** (checkpoint, budget, notification, plugin sync, reminder, structure guard, tools, limit). When Codex ran from a subfolder, for example `checkpoint.mjs --restore` restored only that folder but said "returned". All of them now find the root the same way.
- **Gaps left in the security fixes of 3.28.0:**
  - An npm alias (`zod@npm:baska-paket`) hid the package actually installed. The package gate now checks the target package. This gap existed before 3.28.0 too.
  - The `tillerhand` exemption and the exemption for a command installed in the project apply only to plain spelling. Spellings such as `tillerhand@npm:…` or `tsc@5` are checked.
  - The exemption in the commit gate applies only to a standalone `node <yol> --approve <not>` command. A command with a chain, a subshell or `env -C` has no exemption.
  - If an argument is passed to a protection script with `xargs`, a pipe or `<`, the user is asked.
  - Adapt by hand: none.

## [3.28.0] - 2026-10-25

### Changed
- **Skipping the commit check is now a separate command: `commit-gate.mjs --skip "<neden>"`.** This command is asked about the user every time. `--approve` no longer accepts a note that starts with "atlandı" (skipped). Before, the hook looked for the word "atlandı" in the command text; when the word was written escaped, like `$'atland\xc4\xb1'`, the gate and the board could be skipped without a question.
- **Opening and closing the scope shield (`freeze-guard.mjs --plan-save`, `--plan-end`) is now asked about.** Both were free. The AI could close the plan and write to files not in the list, or save the plan again with a wider list. `/kit-update` removes the old permission lines and adds the new ones.
- **A protection script run through an indirect spelling is asked about.** If a script under `.claude/hooks` is called with `$VARIABLE`, `$(...)`, a backtick, `${...}` or `*` `?` (`commit-gate.mjs $S`, `commit-*.mjs`), the rules cannot see inside the command; so user approval is requested. `$CLAUDE_PROJECT_DIR` and commit messages in a heredoc are not caught by this rule.
- **The package gate also looks at commands that download and run:** `npx`, `bunx`, `bun x`, `npm exec`, `pnpm dlx`, `yarn dlx`, `uvx`, `uv tool run`, `uv run --with`, `pipx run`. If the package name is made up, the command is blocked. A package that is very new, little downloaded or that resembles a popular package is asked about. A command already installed in the project (`node_modules/.bin`) is not checked when run with `npx`, `npm exec` and `bunx`; `dlx` is always checked because it always downloads. The kit's own package (`tillerhand`) is not checked.
- **The package gate also sees prefixes and wrappers** (in install commands too): `FOO=1 npx`, `cmd /c`, `bash -c`, `time`, `/usr/bin/npx`, `npx.cmd`, `pnpm -C . dlx`, `npm --prefix web install`. A name after an unknown flag is not counted as certainly a package; if it is not in the registry it is not blocked, it is asked about.

### Fixed
- **On Windows the desktop notification could run a command from the project name.** The project name was embedded in the text of the PowerShell script and only a plain `'` was escaped; PowerShell also counts `’ ‘ ‚ ‛` as quotes. The title and message are now passed to the script through environment variables.
- **The formatting hook (web, mobile) did not work in a folder with spaces on Windows** and gave the file path to the shell unescaped. Prettier now runs directly with Node, without a shell (Prettier 3).
- **Cost reading (`cost.mjs`) ran `npx` in the project folder.** So a `.npmrc` in the repo or `node_modules/.bin/ccusage` could take effect. It now runs in its own temporary folder, created and deleted at each run.
- **The exemption in the commit gate applies only to the project's own `commit-gate.mjs` file.** The path is compared after resolving: a relative, absolute or `$CLAUDE_PROJECT_DIR` path stays exempt. A copy of `gate.mjs` sitting under this name in another folder (`sandbox/.claude/hooks/commit-gate.mjs`) counts as a gate command approval.
- A message starting with `-` in the Linux notification is not taken as an option.
  - Adapt by hand: none; `/kit-update` refreshes the hooks, rules and permission lines.

## [3.27.2] - 2026-10-25

### Documentation
- **Installation with npm in the README and guide:** `npx tillerhand init` is the recommended route; the git clone stays as an option. For Codex/Antigravity: `npx tillerhand init --tool codex`.
- **Guide:** The "Hemen başla" (get started now) and "Nasıl çalışır?" (how does it work?) buttons at the top were removed. Install commands and terminal blocks (status block, status line) wrap to the next line on a narrow screen instead of scrolling sideways.
- The package accepts Node.js 18 and above (the same as the requirement in the docs).

## [3.27.1] - 2026-10-25

### Fixed
- **Protection hooks silently did not work when the project was opened through a symbolic link or junction.** 17 scripts, including the secret block, destructive command shield, commit gate, and the structure and test protections, did not resolve the link when comparing the path they were started from with the real path; in linked folders such as `/tmp` on macOS or in linked project folders they exited doing nothing. Both paths are now converted to the real path and compared (`shared.mjs` → `isMain`).
- **`npx tillerhand init` did nothing on Linux and macOS** (same cause: npx starts the kit through a `node_modules/.bin` link). It worked on Windows. If you tried 3.27.0 on Linux or macOS, run it again.
  - Adapt by hand: none; `/kit-update` refreshes the hooks.

## [3.27.0] - 2026-10-25

### Added
- **Install with one command: `npx tillerhand init`.** The kit is published on npm as the `tillerhand` package; in an empty folder this command installs the kit, then in a new session run `/start` (`/adopt` on existing code). The `.kit.json` → `kit` field becomes `npx:tillerhand@<sürüm>`; `/start` and `/adopt` do the type setup with the same version through `npx -y tillerhand@<sürüm> install ...`. The git clone route (`node <kit>/kit/kit.mjs init`) works as before.
  - The package carries only the kit: internal notes, personal state files, and eval and test folders are not included. Since npm does not pack `.gitignore`, the kit carries its own copy; in a project installed with npx, `.env` also stays out of git.
  - Publishing is automatic: when a `v*` tag is pushed, GitHub Actions checks that the tag is on `main`, that the versions (tag, `package.json`, `kit/VERSION`) are the same, and runs the tests; it publishes in a separate job, without running repo code, to npm without a token (Trusted Publishing, with provenance). Actions are pinned to commit SHAs.
  - Runners other than `npx` (`pnpm dlx`, `bunx`) record the kit's temporary path; after installing with them, `/start` may not find the kit folder. Use `npx`.
- **The kit's `package.json` is not copied to the project** (so it does not clash with the project's own `package.json`).

## [3.26.1] - 2026-10-25

### Fixed
- **The gate approval exemption was narrowed.** Only the real `.claude/hooks/commit-gate.mjs --approve` is outside the gate approval rule; a copy of `gate.mjs` placed in another folder under the name `commit-gate.mjs` now falls under the approval rule (the Claude Code gate and the Codex/Antigravity list).
- **Settings merging at install** merges only the object's own keys; a `__proto__` key in a JSON does not change the prototype of the result.

## [3.26.0] - 2026-10-25

### Changed
- **Supabase keys with new names** (web-saas, mobile). Supabase is deprecating the old `anon` and `service_role` keys by the end of 2026 (supabase.com/docs/guides/api/api-keys, 2026-10-25). In new projects: `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` (`sb_publishable_…`) and `SUPABASE_SECRET_KEY` (`sb_secret_…`, server only); in mobile `EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. The warning about a secret key entering client code catches both names. The RLS adversarial test already read both kinds.
  - Adapt by hand (optional): Create the new keys in the Supabase dashboard; `.env.example`, the variables in the hosting dashboard, GitHub → Variables (`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`) and the `process.env` reads in the code change to the same name. If you keep the old names, you can put the new key into the variable with the old name.

## [3.25.1] - 2026-10-25

### Fixed
- **An add-on added later with `/kit-update` does not silently skip a file with the same name in the project.** The project's file is not touched, the kit's is placed next to it as `.kit-new`, and it shows up as a conflict in the report; the same as the behavior at first install. Before, the add-on was thought to be installed.

## [3.25.0] - 2026-10-25

### Added
- **Turkey add-on** (`--addons tr`, optional). `/start` suggests it if there are sales in Turkey or Turkish users. In `docs/legal/turkiye.md` each item is linked to a primary source and has a check date (2026-10-25); it is not legal advice, so consult a lawyer or accountant before launch.
  - KVKK transfer abroad (art. 9, as amended by Law 7499): adequacy decision, standard contract and notification to the Authority within 5 business days, incidental transfer; a checklist for AI and hosting services.
  - e-Fatura and e-Arşiv (VUK GT no. 509, current version): the 3 million TL / 500 thousand TL threshold for internet sales, e-Arşiv regardless of amount from 1/1/2026, required details on an internet sales invoice.
  - Signature check for iyzico and PayTR payment notifications, with working code: web-saas `src/lib/payments/webhook-signature.ts` and the adversarial test (`payment-webhook` workflow, Node 22.18+), backend `app/shared/payments.py` and its test (pytest; in ruff format). A fake, altered or unsigned notification is rejected; if the check is removed, the test turns red. In mobile the notification comes to the server, and the code and server keys (`.env.example`) are in the backend.
  - The guide says that a valid signature does not mean the payment succeeded: there are atomic approval steps for the result field, the amount (queried from the server in iyzico) and a repeated notification.
  - İ/ı and Turkish sort test cases. `/findings-legal` and `/findings-business` read the Turkey items.
  - Adding to an existing project: `node <kit>/kit/kit.mjs update --project . --addons tr`.
- **Add-on-specific type layer:** An add-on can carry files that go to only one project type under `addons/<ek>/types/<tip>/`; it also applies when added later with `update --addons`.

### Fixed
- **The shield cannot be bypassed with a `&` or `|` inside quotes.** In commands such as `vercel deploy --meta "a&b" --prod` and `rm "a&b" -rf` (Codex/Antigravity), the sign inside the quotes split the command and the next flag escaped the rule; every rule now sees this spelling too.

## [3.24.0] - 2026-10-25

### Added
- **Learning rules.** A `**Sınıf:**` field was added to the bug spec (empty-input, authorization, date-time, local-language… a fixed list). If `/fix-bug` finds an earlier bug spec in the same class, it suggests a single rule to prevent repetition: a `/hookify` rule if it can be checked mechanically, otherwise `AGENTS.md` → "Öğrenilen kurallar". No rule file changes without your approval. If you say "later", the dashboard reminds you with an "Aynı hata sınıfı" (same bug class) warning and `/retro` collects it. Your answer (added / not needed) is written to the spec as a `**Kural:**` line: the warning closes and the same decision is not asked again. If a new bug of the same class comes, the rule did not work and the warning reopens.
  - Each rule ends with a source and date (also the ones `/wrap-up` and `/retro` suggest). `/maintain monthly` lists rules older than 90 days: keep, update or delete; when the section passes 10 lines it suggests merging.
  - Adapt by hand: copy the "Öğrenilen kurallar" section from the kit to the end of `AGENTS.md` (if missing, `/fix-bug` opens it at the first rule); add the `**Sınıf:**` and `**Kural:**` lines to `docs/product/specs/_template.md`.
- **`/start` and `/adopt` ask about auto memory** (Claude Code). Recommended off: the project's memory is in `AGENTS.md`, `progress.md` and the decision log; auto memory notes stay on the machine and nobody reviews them. If off is chosen, `.claude/settings.json` → `"autoMemoryEnabled": false`.

## [3.23.1] - 2026-10-25

### Fixed
- **The shield also asks for an EAS command that has `&` or `|` inside quotes.** `eas update --message "a & b" --channel production` passed without approval in 3.23.0.

## [3.23.0] - 2026-10-25

### Added
- **Deployment setup** (`/release first`). If hosting or a domain is not set up, a provider-by-provider step-by-step guide: project, environment variables, domain and DNS, backup and PITR, rollback rehearsal. The steps are in `docs/operations/deploy-setup.md`: Vercel, Supabase, Railway, EAS; each from the official docs, with source and check date (2026-10-25). Before using a command, it reopens the source pages and corrects any step that changed.
  - A secret value is not written to the chat or a file; you enter the value in the provider's dashboard. You take the prod database backup in your own terminal (three commands for role, schema and data on Supabase Free); the restore rehearsal is done on a temporary local database, and prod data is not moved to the dev project. Prod deploy, the rollback rehearsal and restoring from backup start with your approval.
- **The secret block recognizes the Supabase secret key** (`sb_secret_…`, containing at least one digit). Placeholders such as `sb_publishable_…` and `sb_secret_your-key` are not blocked; the Supabase CLI's local development key is also in the secret key format, so it is blocked.

### Fixed
- **The shield also asks about EAS prod commands**: `eas update` with `--channel`/`--environment production`, `eas update:rollback`, `eas update:republish`, `eas deploy --prod` and the `npx eas-cli …` spelling. Before, only `--branch production` was asked about.

## [3.22.0] - 2026-10-25

### Changed
- **Live monitoring every 3 hours** (web-saas and backend). The hourly run (~3 min) took ~2,160 Actions minutes a month; GitHub Free gives 2,000 minutes a month for a private repo (docs.github.com, 2026-10-25). The new frequency is ~720 minutes, leaving a share for CI too.
  - Adapt by hand: `.github/workflows/live-monitoring.yml` → `cron: "17 */3 * * *"`.

### Added
- **A ready live smoke test** (web-saas, `tests/live/smoke.spec.ts`): does the home page open, is it within `LIVE_MAX_MS` (Variables, default 3000), is there an error in the console. It only opens a page, fills no form. Once `LIVE_URL` is entered, monitoring works right away; before, with no test, it raised false alarms.
- **Backend `/health` response time**: an alarm if `LIVE_MAX_SECONDS` (default 2) is exceeded. If `tests/live/` has no tests yet (pytest exit 5), no alarm.
- **The last run of live monitoring on the dashboard** (Operasyon → GitHub): succeeded / failed / not set up (no `LIVE_URL`). When it breaks, an "attention" warning suggests `/fix-bug`.
  - Adapt by hand: copy `tests/live/smoke.spec.ts` from the kit; replace the "Sağlık" (health) and "Kritik uçlar" (critical endpoints) steps in the backend workflow with the ones in the kit.

### Documentation
- **Guide (`kit/guide.html`) design cleanup.** A thin full border instead of the thick left stripe on the "exit gate" and note boxes; the label above the heading (with the old version number) was removed, and the tool info moved under the heading as a plain sentence; line height of 1.3 in labels so they do not overlap when line spacing shifts. Colors did not change: all text/background pairs in the light and dark themes pass WCAG AA (lowest 5.3:1).

## [3.21.0] - 2026-10-25

### Added
- **Feature and bug spec, drift check.** The spec writes the current, expected and must-not-change behavior in `docs/product/specs/<görev>.md` (template `_template.md`). `/plan-task` writes a feature spec only for work touching 3 or more files, and `/fix-bug` writes a few-line bug spec for every bug; there is no extra step for small work.
  - "Must not change" lines start with an acceptance criterion id (`- Ö-01.1: ...`). The gate (`gate.mjs --run`) turns red if these ids have no test, or if the test is red in the test report written during the gate's own run. An old report is not counted; if the test command does not write JUnit, only the existence of the test is checked and a note is left. Lines with an id that do not follow this format are also shown as notes. The gate catches the drift, not a model; `/review-changes` also gives the spec to the review agent.
  - If you change the behavior on purpose, update the spec first; a spec that is no longer valid is moved to `docs/archive/`.

### Fixed
- **The acceptance test scan recognizes more stacks** (dashboard and Spec check): Dart and Go (`_test.dart`, `_test.go`), Kotlin and Swift (`…Test.kt`, `…Tests.swift`) and the Jest `__tests__/` folder. `build/`, `dist/`, `kit/` are skipped only at the project root; tests in folders such as `src/features/build/` are now seen. Names such as `ISO-27.1` do not count as a criterion id.

## [3.20.1] - 2026-10-25

### Fixed
- **The package gate does not take a redirect for a package.** In commands such as `npm install zod 2>&1 | tail`, `2>&1` was counted as a "package not in the registry" and the install was blocked. Redirects such as `> dosya`, `2>/dev/null` and `&> dosya` are now filtered out of the arguments.

## [3.20.0] - 2026-10-25

### Added
- **`/qa`: UI acceptance criteria in a real browser.** Each criterion runs as a Playwright test: the existing `Ö` test if there is one, otherwise a test `/qa` writes under `tests/e2e/qa/`. New tests take a screenshot even when the test stays, and turn red on a console error. Playwright's `webServer` setting starts and stops the server; if the address is not local, `/qa` stops and asks. The run uses its own output folder (`test-results-qa/`); the acceptance report in `test-results/` is not deleted.
  - The report is written from the JUnit result with `node .claude/hooks/qa-report.mjs` (`docs/quality/qa/<tarih>.md`): per criterion passed / failed / not run, the first line of the error and a screenshot (`.previews/qa-<tarih>/`, does not go into git). So to say "it works", a green test must stand behind it. If no test ran, no report is written.
  - At the end of the report you are asked whether to move the new passing tests to `tests/e2e/` as permanent acceptance tests.
  - The last QA run shows as a card in the dashboard "Kalite" (Quality) tab. `/build` suggests `/qa` on a UI task; the go-live list has an item "no failures in the last /qa report".
  - Adapt by hand (web project): add the lines `tests/e2e/qa/` and `test-results-qa/` to `.gitignore`, the `/qa` item to `docs/operations/release-checklist.md`, and a `/qa` line to `docs/architecture/stack.md` → Doğrulama (verification).

## [3.19.1] - 2026-10-25

### Security
- **Playwright CLI commands are now asked about** (web-saas). `npx -y @playwright/cli@0.1.22 open`, `snapshot`, `console`, `requests` and `screenshot` left the permission list. When this tool runs in the project folder it reads the `.playwright/cli.config.json` file in the repo, and that file can run another program instead of the browser. In an untrusted repo these commands must not run without asking. In new projects the rules are in the "ask" list. `/kit-update` removes the old permission lines in existing projects; the command is asked about every time. For screenshots `preview.mjs` keeps running without asking, because it runs the tool in a temporary folder.

## [3.19.0] - 2026-10-25

### Added
- **Live preview** (`.claude/hooks/preview.mjs`). On a UI task `/build` starts the dev server, waits until the address responds, takes a desktop (1440) and a mobile (390) screenshot with the Playwright CLI, writes them to `.previews/<görev>/` and shuts the server down together with its child processes. If a server is already open it uses it and does not close it. In a mobile (Expo) project the step is skipped and you are asked to check the screen on a phone. The dashboard also shows the screenshots in the previews list.
  - Adapt by hand: add a `önizleme:` line to `AGENTS.md` → Komutlar (example: `önizleme:    http://localhost:3000`). The address can only be local (localhost, 127.0.0.1, [::1]).
  - The browser tool runs in a temporary folder, not in the project folder; a Playwright config file or `.npmrc` coming from the repo is not used.
- **Comprehension check** (narrator mode). After the `/build` and `/fix-bug` report, a question with at most 2 options comes about why the change was made; answering is not required. Answers are written to `docs/workflow/learning.md`, and the dashboard "Ürün ve teknik" tab shows the right/wrong counts and the concepts often missed. There is no question when narrator mode is off.
  - Adapt by hand: the narrator mode file belongs to the project, and the update does not touch it. If you use it, copy the "Görev sonunda anlama kontrolü" (comprehension check at task end) section from `.claude/output-styles/anlatici.md` in the kit into your own file.

### Changed
- **The gate command approval also covers the `geliştirme:` and `önizleme:` lines.** The preview does not run an unapproved command and does not open an unapproved address. Whenever one of these two lines changes (including the first gate after an update), command approval is asked again.

## [3.18.3] - 2026-10-25

### Fixed
- **`/fix-bug` runs the gate.** After the tests turn green, the flow runs lint, type check, tests and Semgrep with `gate.mjs --run`; if command approval is needed, it shows the commands and asks. Before, this step existed only in `/build`.

### Documentation
- **Second measurement of the evaluation** (Sonnet, 6 tasks, 24 runs per condition): both conditions passed all hidden tests. The tests the kit wrote caught 63% of the bugs deliberately added to the code, those of the run without the kit 31%. The kit wrote the test before the code in every run. The cost is about 2 times the cost and 1.8 times the time. It was seen that the gate (`gate.mjs --run`) did not run in the `/fix-bug` flow. Details: `kit/eval/results/2026-10-25-v3.18.2-sonnet-ozet.md`.

## [3.18.2] - 2026-10-25

### Fixed
- **Evaluation, two measurement errors.** Both penalized correctly written code:
  - `trash`: An app that takes the clock from outside (`createStore(now = Date.now)`) failed the 30-day test unfairly. The test mocked the date after the app was loaded. Now the mock starts before the app is loaded.
  - The reference solutions did not sort notes created in the same millisecond newest first. The agent's reasonable test for this stayed red on the reference solution and dropped out of the mutant measurement; in `bug-sort` both conditions came out 0/2. The reference solutions and mutants were fixed.
- The result file also keeps the code patch of each run (`src`, `tests`, `package.json`). So a fix made to the setup later can be scored without the agents running again.

## [3.18.1] - 2026-10-25

### Fixed
- **Evaluation setup:**
  - When the plan limit is full the setup does not try the remaining runs for nothing. It stops, writes the finished runs and says which tasks are left (exit code 2).
  - The result file name goes down to the second. Tasks finishing in the same minute no longer overwrite each other's file.

## [3.18.0] - 2026-10-25

### Added
- **Hard tasks in the evaluation** (`kit/eval/`, for people developing the kit; not copied to projects). Three new tasks were added:
  - `trash` (implicit requirement): a trash bin and restore within 30 days.
  - `paging` (multi-step contract): paging; the old client must not break.
  - `tr-sort` (trap): Turkish alphabetical sorting and case-insensitive search.
- **Mutant measurement:** Each task has two mutants: copies of the reference solution with a single bug added. The report shows how many of these bugs the agent's tests caught.
- **Repeat:** `--repeat N` runs each cell N times. The report starts with a task × condition summary: hidden test average, lowest and highest value, killed mutants, cost and time.

## [3.17.0] - 2026-10-25

### Removed
- **The Turkish flags from before 3.15.0 no longer work:** `--onayla`, `--evet`, `--sessiz`, `--kur`, `--plan-kaydet`, `--plan-ekle`, `--plan-bitir`, `--ac`, `--kapat`, `--gerekli`, `--olc`. They were replaced by `--approve`, `--yes`, `--quiet`, `--install`, `--plan-save`, `--plan-add`, `--plan-end`, `--enable`, `--disable`, `--required` and `--measure`. Old flags mostly fail with a usage message. There are two exceptions: `plugins-sync.mjs --kur` no longer installs, it only lists; `dashboard.mjs --sessiz` is ignored. In the scope shield (`freeze-guard.mjs`) an unknown flag no longer passes silently, it gives an error; so the AI does not think the plan was saved.
- The state file keys from before 3.15.0 (Turkish JSON keys) and the `~/.vibe-kit/kapi-onayi/` folder are no longer read. An old-format limit and context file counts as "unknown"; the status line writes a new one after the first reply.
- `/kit-update` deletes the 8 permission lines the kit added for the old flags from the project's `.claude/settings.json`: 5 in allow, 3 in ask. It lists what it deleted in the report. Only exactly matching lines are deleted; lines you wrote are not touched.

- The unused `.claude/.hatirlatma.json` left the kit (it was replaced in 3.x by `.claude/state/reminder.json`). It is no longer copied to new projects.

### Adapt by hand
- If your project has `.claude/.hatirlatma.json` you can delete it; `/kit-update` lists it as "removed from the kit".
- If you gave the gate command approval before 3.15.0 and have not renewed it since, approve once more: `node .claude/hooks/gate.mjs --approve`. The gate does not run an unapproved command and tells you so.
- If one of the old flags appears in your own scripts or notes, replace it with the new one.
- If a scope shield plan opened before 3.15.0 is still open, it is no longer read. Save the plan again with `--plan-save`.

## [3.16.3] - 2026-10-25

### Fixed
- **Evaluation setup** (`kit/eval/`, for people developing the kit; not copied to projects):
  - With an empty error output the error was lost; now the exit code is written. If none of the hidden tests run (0/0), the row counts as an error.
  - The change is measured against the starting commit: it counts even if the agent commits.
  - The test summary is read in the same format on every Node version (`--test-reporter=spec`).
  - There is a 2 dollar cap per run. If `claude` is not found the setup does not crash. If one task or its cleanup crashes, the others continue. When each task finishes, an interim result is written to the temporary folder.
  - Each condition gets a free `PORT`. When the run ends, the process listening on that port is closed (IPv4 and IPv6) and the gate approval record is deleted. If the port had been in use beforehand, the user's process could have been closed; now it is first checked that it is free.
  - The result file name has the time in it, so a second run on the same day does not overwrite the first. The report writes the Claude Code and Node versions and the plugins loaded per condition. In error and summary texts the temporary folder and the user folder are masked.
  - Permissions were narrowed. Reading and writing stay in the run folder. In Bash, tests, startup, project and kit scripts and read-only git work. Ways out of the folder such as `..`, `git --output`, `npm --prefix` and `node -e` are forbidden. In both conditions `.git/` and `.claude/` cannot be edited. This is not a security boundary; the README explains it.
- **Tasks:** The `security-owner` text states 401 explicitly, and the test does not look for an `owner` field in the response. The `bug-sort` text says the client may send `createdAt`. The `feature-tags` test also checks alphabetical order on ties in `/tags`. Each task has a reference solution; a test checks that the hidden tests turn green with it.

### Added
- **Measurement:** Three new columns were added to the report:
  - "Bug-catching test": a test that passes on the agent's code but not on the unchanged code. A broken test does not count.
  - "Test first": from the transcript, was the test file written before the code.
  - "Did the gate run".
- `--keep` leaves the transcript in the run folder.

## [3.16.2] - 2026-10-25

### Fixed
- **Security:** When the kit was installed from a local folder (`init`, `install`), personal files and secrets that git ignores were copied into the project: `.env`, `.env.local`, `secrets/`, `.claude/settings.local.json`, `.claude/state/`, `*.log`. They are now not copied at any level. `.env.example` is still copied. Since these files are not in a kit cloned from GitHub, only installs from a local copy of the kit were affected.
- **Adapt by hand:** If you installed the kit from a local copy, check whether these files are in the project (`.claude/settings.local.json` may hold someone else's permissions, `.env` someone else's secrets). If so, delete them; if there are secrets, change them.
- The first evaluation measurement in 3.16.1 was affected by this bug (the run with the kit took over a personal permission list). There is a note in the result file; the measurement will be run again.

## [3.16.1] - 2026-10-24

### Added
- **Kit evaluation** (`kit/eval/`): Runs the same task with and without the kit and scores it with hidden tests: acceptance and adversarial tests, regression, added tests, cost, time, tokens. It contains a small notes API and three tasks (a bug, a feature of 3+ files, IDOR). To run: `node kit/eval/run.mjs`. It is for people developing the kit and is not copied to projects.
- First measurement (Sonnet, n=1): both conditions passed all the hidden tests. The kit wrote the test before the code and added 11 tests, the run without the kit added 3 tests. The cost of the kit is ~2.3 times the cost and ~1.7 times the time. Result: `kit/eval/results/2026-10-24-v3.16.0-sonnet.md`.

## [3.16.0] - 2026-10-24

### Added
- **Light command list:** Command descriptions entered the skill list in every session (~1,600 tokens) and overflowed the list in a 200K context. In the Light and Standard profiles, 18 rarely used commands (such as `/findings-*`, `/board`, `/retro`, `/rollback`) now show only their name in the list: they appear in the `/` menu and run by name, but their descriptions stay out of the context. Each session uses ~1,100 fewer tokens. The 10 commands that keep their descriptions: `/start`, `/adopt`, `/build`, `/fix-bug`, `/plan-task`, `/design`, `/tools`, `/review-changes`, `/wrap-up`, `/release`.
- **Full profile:** `/tools komutlar tam` (`node .claude/hooks/tools.mjs --commands full`) brings back all descriptions; `komutlar hafif` reverts. The setting lives in `.claude/settings.json` → `skillOverrides` and applies to the whole team; your own values are kept. It has no effect in Codex and Antigravity.
- `/kit-update` adds the light list to a project that has no `skillOverrides` key and says so in the report.
- **Adapt by hand:** If your project uses the Full profile, run `/tools komutlar tam` after the update; otherwise the descriptions of the rarely used commands drop out of the list. The dashboard warns in this case.

### Changed
- Old flags and old state keys keep working for one more release (until 3.17.0).

## [3.15.1] - 2026-10-24

### Changed
- **Less context:** The "In Codex and Antigravity" section of `AGENTS.md` is filled in only when one of those tools is selected. A project that uses only Claude Code loads ~450 fewer tokens per session (~20% of AGENTS.md). Adding `--tool codex` or `--tool antigravity` later brings the section back. If you edited the section, the kit leaves it alone.
- **Adapt by hand:** `AGENTS.md` in installed projects does not change (it is a project file). For the same saving, delete this section if you do not use Codex/Antigravity.

## [3.15.0] - 2026-10-24

The kit's code moved to English. Messages to the user and the AI, documents and commands stay in Turkish; behavior did not change.

### Changed
- **Code in English:** Names and comments in the hooks, `kit.mjs`, template scripts and tests are in English. `.claude/hooks/arac.mjs` is now `shared.mjs`.
- **New flags:**
  - `freeze-guard.mjs`: `--plan-save`, `--plan-add`, `--plan-end` (formerly `--plan-kaydet`, `--plan-ekle`, `--plan-bitir`)
  - `gate.mjs`: `--approve` (formerly `--onayla`)
  - `tools.mjs`: `--enable`, `--disable`, `--required`, `--measure` (formerly `--ac`, `--kapat`, `--gerekli`, `--olc`)
  - `plugins-sync.mjs`: `--install` (formerly `--kur`)
  - `checkpoint.mjs`: `--restore <hedef> --yes` (formerly `--evet`)
  - `dashboard.mjs`: `--quiet` (formerly `--sessiz`)

  Old flags work until 3.16.0 and print a warning when used. Old flags that ask for approval (`--plan-ekle`, `--onayla`, `--ac`) still ask.
- **State files:** Keys in the files under `.claude/state/` are in English. Files with old keys are read until 3.16.0. The gate command approval now lives under `~/.vibe-kit/gate-approval/`; an approval in the old `kapi-onayi/` folder is still honored.
- **Update adds permission rules:** `/kit-update` adds the kit's `settings.json` permission lines that the project lacks; the project's own lines stay. The `dashboard.mjs --sessiz` line in the Stop hook becomes `--quiet`, so the dashboard and notification do not run twice.
- **RLS template:** In `tests/security/rls.mjs`, `TABLOLAR` became `TABLES` and `HERKESE_ACIK` became `PUBLIC_TABLES`; a table entry is `{ name, owner, sample, key }`. The `rls.mjs` file of installed projects does not change.

### Fixed
- `kit.mjs init` no longer copies the personal `CLAUDE.local.md` file into the project (it was carried over when installing from a local folder).

### Adapt by hand
- `.claude/hooks/arac.mjs` was removed from the kit. It shows up under "Kitten kaldırılmış" (removed from the kit) in the update report; you can delete it. If your own script imports from this file, use `shared.mjs` and the new names.
- To move your own `rls.mjs` to the new template, rename the fields in the table entries (`ad` → `name`, `sahip` → `owner`, `ornek` → `sample`, `anahtar` → `key`).

## [3.14.4] - 2026-10-24

### Changed
- **The approval record is also protected against globs and links:** The shell asks when its target resolves to a folder that contains the approval folder (`~/.vibe-kit/`) (`rm ~/.v*/…`), or when a link leads the real path there.
- **Device paths:** `\\?\` and `\\.\` are stripped only before a drive letter, `\\?\UNC\…` counts as a normal UNC path; other forms such as `\\?\GLOBALROOT\…` count as "could not be verified".

## [3.14.3] - 2026-10-24

Three findings from the automatic post-commit security review.

### Changed
- **Gate command approval lives in the user folder:** The approval now lives in `~/.vibe-kit/kapi-onayi/<proje yolu özeti>.json` instead of `.git/`. The home folder is read from the operating system and cannot be redirected with `HOME`/`USERPROFILE`. A ready-made approval that arrives with a zip/archive containing `.git` or with `.claude/state/` is no longer read. Writing to this record with a file tool or the shell asks.
- **`--onayla` only in its exact form:** Every form other than `node .claude/hooks/gate.mjs --onayla` is blocked: an environment variable prefix, a node flag, a redirect, a chain.
- **Unresolvable shell target:** If the target cannot be resolved because of a variable, backtick, brace expansion or network path, and the command names a rule/protection file (`$D/AGENTS.md`, `{AGENTS,X}.md`, `.claude`, `.git`), it asks even without a lock or plan. Local UNC paths (`\\?\C:\…`, `\\localhost\c$\…`) are converted to drive paths.
- **Adapt by hand:** The command approval given in 3.14.1/3.14.2 becomes invalid; the commands are approved once again on the first gate run. The old `.git/kit-kapi-onayi.json` can be deleted.

## [3.14.2] - 2026-10-24

### Changed
- **Gate command approval runs on its own:** `gate.mjs --onayla` is blocked if it is chained with other commands (`&&`, `;`, `|`) or contains `$(...)`. The approval window reads the commands in AGENTS.md when the window opens; a command in a chain cannot change the file afterwards and get a different list approved.

## [3.14.1] - 2026-10-24

MEDIUM/LOW findings deferred from the 3.14.0 security audit.

### Changed
- **An empty gate stops the commit:** If no check ran (Komutlar empty, no Semgrep), the gate says "BOŞ" (empty), exits with code 1 and the commit gate does not open. If the user wants, `--approve "atlandı: kullanıcı isteği"`.
- **Gate command approval (`gate.mjs --onayla`):** If the lint/type/test commands in AGENTS.md → Komutlar are new or changed, the gate does not run them; it lists them and asks for user approval. The approval lives in the shared git directory (`.git/kit-kapi-onayi.json`): a cloned repo or one that arrives with a PR cannot carry a ready-made approval. It cannot be redirected elsewhere with the `GIT_DIR`/`GIT_COMMON_DIR` environment variable. `--onayla` asks on every write (Claude: permission list + commit gate hook; Codex/Antigravity: shield); the approval window shows the commands to approve. Writing under `.git/` and to the `.git` pointer file (worktree) with a file tool or the shell also asks.
- **Shell commands hit the lock and scope shield:** While a lock or an approved plan is open, commands such as `sed -i`, `mv`, `cp`, `rm`, `ln`, `dd of=`, `curl -o`, `>`/`>>`/`>|`, `git checkout/restore`, `Set-Content`, `prettier --write`, `eslint --fix` ask if they target an existing file inside the project that is outside the list/lock. The writing command is found by the command's name (a "copy" in a path does not count). `cd`/`pushd`/`popd`/`Set-Location` in a chain, subshells, the inside of `bash -c`/`sh -c`/`cmd /c`, mid-word quotes, `~` and Git Bash paths (`/c/...`) are tracked. `find -delete/-exec`, `tar -x`, `unzip`, `rsync` and combined flags (`curl -sSLo`) are also seen. A glob target counts its folder. These also ask: a command that targets the root or a parent folder (`git checkout .`), a target with a variable, backticks or brace expansion, a `cd` that cannot be verified, and a command that does not show its target (`git apply`, `git stash`, `git switch`, `git checkout` with a branch name, `patch`, `xargs rm`). New files, files outside the project and `docs/` are free.
- **Rule and protection files are also protected from the shell (Claude Code included):** When the target of a shell command is `.claude/` (including lock, plan, gate and approval state), `.git/` and the `.git` pointer file, `AGENTS.md`, `CLAUDE.md`, `.codex/` or the workflows, it asks even without a lock or plan; `.env` and `secrets/` are blocked. The lock and plan cannot be closed with Bash, and a hook cannot be silently written under `.git/hooks/`.
- **Symbolic links and junctions are resolved:** The lock, the scope shield and the Codex/Antigravity protected-file rule look at the real path; a link inside a locked folder cannot be used to write outside.
- **NotebookEdit:** The secret block, the lock/scope shield and test protection also see Jupyter notebook edits.
- **Semgrep:** Runs with `--metrics=off`. If it is found as `.cmd`/`.bat` on Windows, it says "found but could not run; `SEMGREP=<semgrep.exe yolu>`" instead of "not installed" (file names are not passed to the shell). A semgrep inside the project folder is not recommended.
- Updated `.claude/settings.json` (matcher `Write|Edit|MultiEdit|NotebookEdit`; ask: `gate.mjs --onayla`, `Edit(./.git/**)`), `.claude/board/rules.md`, `/build`, `/plan-task`, `/freeze`, the README and `kit/guide.html`.
- **Adapt by hand:** If you changed `settings.json`, take the new lines from `.kit-new`. The first gate run after the update asks for command approval; check the commands and approve.

### Known limits
- Shell targets are heuristic: the source file of `cp` also counts as a target (an extra question); writes made by `node -e`, `python -c` and from inside a script are not seen.
- Command approval binds the text of the command, not the content it runs: if a `package.json` script or test config changes after approval, the gate runs the new version.
- `awk -i inplace` and `curl -O` (saving under the remote name) are not seen as targets.

## [3.14.0] - 2026-10-24

### Added
- **Deterministic gate (`gate.mjs --run`):** Runs the `lint`, `tip kontrol` and `test` commands from AGENTS.md → Komutlar, plus Semgrep (if installed) on changed code files. The result is written to `.claude/state/gate.json` with a change signature. Output of a green check is not written; the last 30 lines of a red one are. An empty command counts as "undefined"; if no check ran, it warns. It runs before commit, end-of-task and end-of-phase meetings, and its output is input for the board members. Members give RET on a red check and do not look again for what lint/type/test caught. The `/build` verification step uses it too.
- **Scope shield (`freeze-guard.mjs --plan-kaydet / --plan-ekle / --plan-bitir`):** After `/plan-task` approval, the plan's file list is saved. While the plan is open, writing to an existing file not on the list (Claude Code, Codex, Antigravity) asks. Adding a file to the list needs approval; new files, `docs/` and `CHANGELOG.md` are free. Silent when there is no plan. It closes at the end of `/build` and in `/wrap-up`. The lock and plan are written to the project root even when called from a subfolder; quoted `'--plan-ekle'` / `'--off'` also ask in Codex and Antigravity.

### Changed
- **Commit gate:** In addition to board approval, it asks for a green gate for the same changes. If the gate is red, stale or never ran, the commit stops. If the user explicitly asks for an interim commit, `--approve "atlandı: kullanıcı isteği"`. Untracked new files also enter the signature (a commit with only new files via `git add -A && git commit` no longer passes unchecked). Forms such as `git --no-pager commit` and `git -C x commit` are caught. A commit may stand alone or be chained only with `cd` / `git add`: `sed … && git commit`, a command containing `$(...)` and `git commit && git push` are stopped (push is a separate command). A heredoc and a `$(cat <<'EOF' … EOF)` message are free. `--approve "atlandı…"` asks the user on every write. The changed file list is read with `git -z` (Turkish paths come out right); `.claude/state/` does not enter the signature.
- Updated `.claude/board/rules.md` §4, the board member templates, `/plan-task`, `/build`, `/wrap-up`, the `.claude/settings.json` permissions (`gate.mjs --run`, `--plan-kaydet`, `--plan-bitir` without a question; `--plan-ekle` asks), the README and `kit/guide.html`.
- **Adapt by hand:** In an installed project, the `.claude/agents/board-*.md` files belong to the project: copy the gate line from `.claude/board/board-<rol>.md` into the "Çıktı" (Output) section of each. In `AGENTS.md` → Komutlar, the `lint`, `tip kontrol` and `test` lines must be filled in. If you changed `settings.json`, take the new permission lines from `.kit-new`.

### Known limits
- The gate is mandatory only in Claude Code's commit gate; in Codex and Antigravity it is run by command.
- The scope shield does not stop the AI from closing the plan and saving it again; this relies on the "no bypassing hooks" rule in AGENTS.md.
- If the commands are empty and Semgrep is not installed, the gate returns green with a warning; it does not stop the commit.
- AGENTS.md → Komutlar runs without approval: read AGENTS.md before running a command that comes from an untrusted repo (clone, PR).
- The scope shield covers file tools only: writing to a file outside the plan with the shell (`sed -i`, `mv`, `cp`) does not ask (except test files); symbolic links are not resolved; code under `docs/` (Docusaurus etc.) counts as free.
- A command that changes files while the gate runs (`lint --fix`, snapshot update) changes the signature; the gate must run again.

## [3.13.1] - 2026-10-24

### Changed
- **Test protection also works in the shell:** A shell command that changes, moves or deletes a test file (`sed -i`, `perl -i`, `rm`, `mv`, `cp`, `tee`, `>`/`>>`, `git checkout/restore`, PowerShell `Set-Content` etc.) asks in the shield. Test config files are covered too, including the `sed -e … -i` and `--in-place` forms. Each part of a command chain is checked separately; running the test is free.
- **Test config files:** In files such as `vitest`/`vite`/`jest`/`playwright`/`cypress` config (including `.json`), `.mocharc.*`, `conftest.py`, `noxfile.py`, `pytest.ini`, `pyproject.toml`, `package.json`, it asks if a line that could narrow the scope is added or removed (`include`/`exclude`, `testMatch`, `testIgnore`, `passWithNoTests`, `bail`, `retries`, `forbidOnly`, `setupFiles`, coverage thresholds `lines`/`branches`/`fail_under`, `addopts`, `collect_ignore`, a `"test…"`/`"ci…"` script). Changes such as aliases and plugins pass silently.
- **Test protection heuristics:** Commenting out with `;//`, `#assert` without a space in Python, `skipIf`/`runIf` and `expect(x)` without a matcher are caught. A focused test `model.fit(` and supertest `.expect(200)` do not count as an expect without a matcher; an `expect(x)
  .toBe()` chain broken across lines is not a problem. `*.e2e-spec.ts`, `*_test.go` and `spec/` were added to the test path patterns.
- **Codex move:** Moving a test to a name the runner does not recognize even though it stays in the test folder (`a.test.ts` → `tests/a.ts`), and moving any file on top of an existing test, ask.
- **RLS test (web and mobile template):** The other user's update attempt writes a value different from the row (it changes the owner to itself); after the update and delete attempts, the row is read again as admin and compared with its original state (a change is caught even when the returned row count is 0 because there is no select policy). In CI, if `DB_URL` is missing, the table list is not skipped; the test goes red. The file states that views and `SECURITY DEFINER` functions are out of scope.
- **CI templates (all three):** `permissions: contents: read`; the gitleaks job also gets `pull-requests: read` (for the PR commit list in a private repo); the gitleaks PR comment is off (`GITLEAKS_ENABLE_COMMENTS: "false"`, a leak still turns the job red). In the RLS job, the `supabase status -o env` output is not passed to `eval`; only the needed keys are read and exported.
- **Adapt by hand:** For a `ci.yml` you changed, `/kit-update` leaves a `.kit-new`: take the `permissions` block at the top, the `GITLEAKS_ENABLE_COMMENTS` line in the gitleaks step and the new environment export lines of the `rls` job into your own file. If you changed `tests/security/rls.mjs`, move your `TABLOLAR` list to the new file.

### Known limits
- Shell protection looks at the text: writing to a test file from inside a script (`node -e`, `python -c`, a program run with a heredoc), with `find … -delete`, `awk -i inplace`, `git apply` or `cd tests; rm *` is not caught.
- The config file rule is heuristic: a field not on the list, or deleting a line from a multi-line `include: [` array, does not ask.
- The test protection heuristic does not catch the forms `it['skip']`, `test.todo`, `it.fails`, `expect.any(Object)`.

## [3.13.0] - 2026-10-24

### Added
- **Test protection (`test-guard.mjs`, Claude Code, Codex, Antigravity):** It asks the user if an expectation (`expect`/`assert`) is deleted or commented out in a test file, if `.skip`/`.only`/`xit`/`@pytest.mark.skip` is added, if an expectation is loosened (`toBeTruthy`, `toBeDefined`, `expect.anything`, `assert True`) or if a test file is deleted. Overwriting a whole existing file with Write (with `Add File` in Codex) is compared with the version on disk; moving a test to a non-test path with Codex `Move to` also asks. Because Codex has no approval window, it blocks and tells the AI to "ask the user".
- **Edit round counter (`edit-rounds.mjs`):** When the same code file is edited for the 5th, 10th, ... time in a session, the AI is reminded of Semgrep and `security-auditor`; the work is not blocked. In Claude and Codex this is a PostToolUse note, in Antigravity PreInvocation `injectSteps` (only to the session that produced the note). If the file name contains special characters, it is not written into the note and the Semgrep command; the path is quoted and after `--`. A broken state file does not crash it.
- **Complexity budget (`budget.mjs`, CI `karmasiklik` job, three templates):** In code files changed in a PR, CI goes red if function complexity exceeds 15, a function exceeds 80 lines or a file exceeds 400 lines (lizard 1.24.1, `pipx run`). Test, migration, generated and kit files are excluded. Old code brought into the kit does not block until it is touched. Turkish and spaced paths are measured (`git -z`); `build`/`out`/`vendor` are excluded only at the root; `--base` and file names do not count as flags. `/start` puts a "Refactor round" task at the end of every phase.
- **RLS adversarial test (web and mobile template, `tests/security/rls.mjs`, CI `rls` job):** CI starts an empty local Supabase; an anonymous user and a second user try to read, update, delete and write on behalf of the first user's row. Red if a public table has RLS off or is not registered in the test. No secret is needed; it refuses to run against a non-local URL. The file name is not `.test.mjs`, so Vitest/Jest do not collect it without an environment. Blocking in `/release`.
- Dashboard: critical if the prod ref appears in `.mcp.json`, a warning if Supabase is present but there is no RLS test.

### Changed
- **Dev/prod separation:** The read-only Supabase MCP in the templates now connects to `DEV_REF` (it used to possibly be prod first). `.env.example` says "local = dev, prod only in the hosting panel". An "Environments (dev / prod)" table was added to `docs/operations/accounts.md`. `/release` checks that the prod ref does not appear in the repo or the AI settings, and asks the user whether `.env.local` is connected to dev.
- Shield: pulling prod environment variables to the machine (`vercel env pull` / `vercel pull`, targeting prod) is blocked; if the environment is not plain `development`/`preview` (a variable, `$(...)`, a custom environment), it asks. The Vercel rules also cover the short name `vc`.
- `arac.mjs` → `cozumle` also returns the before and after of the edited part (`once`/`sonra`), deletion and the session id.
- Updated `AGENTS.md`, `docs/quality/test-plan.md`, `docs/security/checklist.md`, the template `stack.md` files, `docs/workflow/mcp-catalog.md`, the README, `kit/guide.html` and the dashboard.
- **Adapt by hand:** If the Supabase line in `.mcp.json` of an installed project is connected to the prod ref, replace it with the dev ref. For a `ci.yml` you changed, `/kit-update` leaves a `.kit-new`: take the `karmasiklik` and `rls` jobs into your own file. Add the Environments table to `docs/operations/accounts.md` and the end-of-phase refactor tasks to `docs/product/roadmap.md`. In a project with Supabase, write the existing tables into `tests/security/rls.mjs` → `TABLOLAR`.

### Known limits
- Test protection and the shield look at the text: changing a test file with a shell command (`sed`, heredoc) does not trigger test protection (added to the shield in 3.13.1). The shield may also catch an example command that appears inside a heredoc writing a document.
- In Antigravity, PostToolUse carries no output; the edit round note arrives on the next model call.
- The RLS test was verified inside the kit without Docker (non-local URL rejection, missing environment error); an end-to-end run with a real `supabase start` will show up in CI of the first project that uses it.

## [3.12.0] - 2026-10-23

### Added
- **rea (reverse engineering CLI, pinned version `rea-agents@6.2.0`):** `/research` can examine how a competitor feature works, with evidence; `/adopt` lists the parts of the repo that have no source (compiled bundle, minified JS, ASAR). Both ask first with an authorization and license warning; the competitor's code, text and brand are not taken. `setup` is not run (it changes agent settings). Catalog: `docs/workflow/mcp-catalog.md`.
- **Understand-Anything (code map for humans, `yayin` package):** `/adopt` suggests a visual map, `/handoff` an onboarding guide for the person taking over (`/understand-onboard`), `/release first` a maintenance map. The first run reads all the code: the cost is stated and asked. No Turkish output (`--language en`), `--auto-update` is not used. The dashboard gives a hint if the graph is older than 30 days.
- **Inspiration brand (`/design` 1b):** From awesome-design-md (84 brands, MIT), only the chosen brand's DESIGN.md is downloaded from a pinned commit into `.previews/ref/`, and its principles are distilled with Impeccable. No imitating the brand.
- **three.js (`/start` 3c):** If 3D is chosen, `threejs-fundamentals`, `threejs-performance` and, in React, `threejs-react-three-fiber` are copied from `CloudAI-X/threejs-skills` (MIT) at a pinned commit; the rest goes through Context7.
- **`ui-motion` → 3D section:** lazy loading, a static fallback if there is no WebGL, reduced motion, mobile GPU (pixel ratio ≤2, optional rendering), `dispose()`, fps measurement. The GSAP line comes with a license note.
- **GSAP (`/design` bold direction):** `gsap-skills:` skills. License verified: free, including commercial use; the only ban is a no-code animation tool that competes with Webflow (gsap.com/standard-license, archive copy 2026).
- Animation and 3D checks were added to the `/findings-perf` and `/findings-ux` lenses (lazy loading, `dispose`, ScrollTrigger cleanup, static fallback, scroll-jacking accessibility).

### Changed
- `.ua/**` was added to the structure maps (Understand-Anything graph). **Adapt by hand:** in an installed project, add `".ua/**"` to `.claude/structure.json` → `allow`.
- `.gitignore`: `.ua/intermediate/`, `.ua/diff-overlay.json`. **Adapt by hand:** add them to the installed project's `.gitignore`.
- Updated the README, `kit/guide.html` and the dashboard.

## [3.11.4] - 2026-10-23

### Security
- **Ask if in doubt.** When a command has an obfuscation marker (a trailing `\`, `$'..'`, `$(...)`, `` `...` ``, `${...}`, `$@`/`$*`) and a protected operation appears after loose normalization (Vercel prod/promote/rollback, `DROP`/`TRUNCATE`, `reset --hard`, `push --force`, `rm -rf`, `db reset`), the shield asks. It does not try to imitate the shell; one rule closes this class of bypass. A finding from the post-commit security review.

### Known limits
- The shield looks at the text; a `$X` variable or a command read from a file cannot be resolved. In Claude Code the real limit is the permission layer (`permissions.ask`/`deny`) and the user's approval. If a protected word appears in a command with an obfuscation marker (for example "rollback" in a commit message written with `$(...)`), an unneeded question rarely comes up.

## [3.11.3] - 2026-10-23

### Security
- The destructive command shield and its permission counterpart (Codex, Antigravity) evaluate the command also in the form the shell will see: `$'..'` is expanded, quotes, `\` and PowerShell `` ` `` escapes are dropped. The stricter decision of the raw and the expanded form wins. So forms such as `--pro""d`, `pr\omote`, `$'--prod'`, `DR""OP`, `--ha"rd"` are caught without a separate regex for each. A finding from the post-commit security review (a root-cause fix; it replaces the quote additions of 3.11.2).

## [3.11.2] - 2026-10-23

### Security
- Shield: quoted or multi-space forms are also caught (`--target "production"`, `--target='prod'`, `--target    production`, `"promote"`). A finding from the post-commit security review.

## [3.11.1] - 2026-10-23

### Security
Findings from the post-commit security review.
- Shield: `promote` and `rollback` ask even when the `vercel` subcommand comes after flags (`vercel --scope ekip promote …`). `--target production` / `--target=production` also count as a prod deploy.
- In the web template, the Playwright CLI permission was narrowed to the `open`, `snapshot`, `console`, `requests` and `screenshot` subcommands. `eval` and `run-code`, which run code on the page, ask.

### Adapt by hand
- If you applied 3.11.0, in a web project replace the `Bash(npx -y @playwright/cli@0.1.22:*)` line in `.claude/settings.json` → `permissions.allow` with the five narrow lines from the kit's web template.

## [3.11.0] - 2026-10-23

### Added
- **Playwright CLI** (`npx -y @playwright/cli@0.1.22`): lets the agent look at the page, the console, the network and screenshots. It uses fewer tokens than MCP because it does not force page data into the context. Acceptance tests still run with `npx playwright test`.
- **Vercel CLI flow** (`/release`): preview deploy → evidence on the preview URL → approve `promote` or `deploy --prod`. If the Git integration is on, the CLI does not deploy separately.
- **Supabase dev MCP** (catalog, `supabase-dev`): with write access, only for the development project or branch. The prod MCP stays read-only; schema changes always go through a migration file (also added to the mobile template).
- `/design`: if the design is in Figma, it suggests adding the Figma MCP to this machine.
- A "Added when needed" section in the catalog: Playwright MCP, Chrome DevTools MCP, Figma, Supabase dev; `--scope local`, version pinned.

### Changed
- Playwright and Chrome DevTools MCP were removed from the web template's `.mcp.json`; `/findings-perf` and `/findings-ux` ask and add them when needed.
- Shield: `vercel promote` and `vercel rollback` also ask (they change the prod environment).

### Adapt by hand
- In a web project's `.mcp.json`, removing the `playwright` and `chrome-devtools` entries is optional (it saves context; they can be added from the catalog when needed).
- In a web project, add `Bash(npx -y @playwright/cli@0.1.22 open:*)` to `.claude/settings.json` → `permissions.allow`, and one line in the same form each for `snapshot`, `console`, `requests`, `screenshot` (3.11.1).
- `docs/architecture/stack.md`: in the "Doğrulama" (verification) section, Playwright CLI instead of Playwright MCP; the "MCP" line and the schema rule as in the kit's template (web and mobile).

## [3.10.1] - 2026-10-23

### Security
- The `tools.mjs` permission was narrowed (post-commit security review): status, `--gerekli`, `--olc` and `--kapat` are allowed; `--ac` always asks. Enabling a package runs plugin hooks with the user's authority.

### Adapt by hand
- If you applied 3.10.0, replace the `Bash(node .claude/hooks/tools.mjs:*)` line in `.claude/settings.json` → `permissions.allow` with the kit's four narrow lines, and add `Bash(node .claude/hooks/tools.mjs --ac:*)` to `permissions.ask`.

## [3.10.0] - 2026-10-23

### Added
- **Context packages and `/tools`.** Plugins were split into core (always on) and packages. `tasarim` (taste-skill, ui-ux-pro-max, gsap-skills), `guvenlik` (Trail of Bits 7-pack, claude-security), `yayin` (understand-anything, session-report) and `video` (remotion) come switched off. `/design`, `/findings-security`, `/findings-all` and `/release first` check with `tools.mjs --gerekli <paket>` in their first step and, if the package is off, ask whether to switch it on, with the cost. Switching on affects only this machine (`.claude/settings.local.json`). Why: the skill list is limited to 1% of the context; when it overflows, descriptions drop and skills get missed.
- `node .claude/hooks/tools.mjs --olc`: measures the skill and agent description load of installed plugins. `/maintain monthly` checks the context budget.
- New marketplaces: `gsap-skills` (GreenSock, official) and `understand-anything` (off; its use will be tied to the commands in a later release).

### Changed
- `motion-video` switches Remotion on with `tools.mjs --ac video`.
- The `/start` Light profile now switches off only hookify and claude-md-management; package plugins are already off in every profile.
- The dashboard shows packages left on in the "Dikkat" (attention) list.

### Adapt by hand
- `.claude/settings.json` belongs to the project and does not change on update. To use the packages, set these to `false` in `enabledPlugins`: `taste-skill@taste-skill`, `ui-ux-pro-max@ui-ux-pro-max-skill`, the 7 Trail of Bits plugins, `claude-security@claude-plugins-official`, `session-report@claude-plugins-official`. Add the `gsap-skills` and `understand-anything` marketplaces to `extraKnownMarketplaces`; for permissions, see the security item above. Example: the kit's `.claude/settings.json` file.
- `CLAUDE.md`: the package sentence at the end of the "Use the right skill" item (the kit's `CLAUDE.md`).

## [3.9.3] - 2026-10-23

### Fixed
- The Antigravity read protection also checks nested arguments: `.env` and `secrets/` paths inside arrays or objects are blocked too.

## [3.9.2] - 2026-10-23

### Fixed
- The Antigravity read protection looks for `.env` and `secrets/` paths in all tools (`matcher: "*"`) and in any text in the arguments. So an unknown read tool is covered too. The `secrets` folder itself is also blocked.

### Known limits
- A content search in the project root (`grep_search`, `grep -r` in the shell) can reach the contents of `.env`. The hook cannot filter the search result. Blocking root search in a project that has a `.env` file would make search unusable.

### Adapt by hand
- If you changed `.agents/hooks.json` in the project, set the `kit-okuma-korumasi` → `matcher` value to `"*"`.

## [3.9.1] - 2026-10-23

Findings from the automatic post-release security review (they affect only Codex and Antigravity).

### Fixed
- The rule against changing protection files from the shell also catches commands that write the path without a slash (`rm -r .claude`). Reverting with `git checkout` and `git restore` also asks.
- If the shield's two lists decide differently on the same command, the stricter one wins: `git push --force origin main` is now blocked instead of "ask".
- In Antigravity, `.env` and `secrets/` cannot be read with the read tools (`view_file`, `grep_search`, `list_dir`, `find_by_name`). This is the counterpart of the `Read(./.env)` block in Claude Code. `kit-okuma-korumasi` was added to `.agents/hooks.json`.

### Known limits
- In Codex, the hook script is found on Unix with `git rev-parse --show-toplevel`. If there is no git or the folder is not a repo, the hook does not run and the protection does not kick in. `init` creates a git repo, so this does not happen in a normal install.

### Adapt by hand
- If you changed `.agents/hooks.json` in the project, `/kit-update` brings the new version as `.kit-new`; add the `kit-okuma-korumasi` section by hand.

## [3.9.0] - 2026-10-23

The kit now also works in OpenAI Codex and Google Antigravity: rules, commands and protections. The board agents, the question interface and the status line stay Claude Code-only. Basis: the official hook and skill docs of both tools.

### Added
- **`AGENTS.md`:** The shared rules (core rules, definition of done, Never, Git, Komutlar, project name) moved here. All three tools read this file. `CLAUDE.md` imports it with `@AGENTS.md` and keeps the Claude Code-specific rules (the skill table, the limit). The rules Claude Code sees did not change; only the order changed and a counterpart section for the other two tools was added.
- **`kit.mjs --tool claude,codex,antigravity`** (`init`, `install`, `update`): More than one tool can be selected. If this option is not given, `init` asks in the terminal. The choice is written to the `.kit.json` → `tool` field. Claude Code files are always installed.
  - If Codex or Antigravity is selected, `.agents/skills/<ad>/SKILL.md` is generated from the `.claude/commands/*.md` and `.claude/skills/` files. Codex calls them with `$start` or `/skills`, Antigravity with `/start`. The source stays single; no copies are kept in the kit repo. The copies are refreshed on every update.
  - Hook settings: `.codex/hooks.json` (Codex) and `.agents/hooks.json` (Antigravity). Their templates are under `kit/tools/<araç>/`. On update, the same rule as the other kit files applies: refreshed if not changed, delivered as `.kit-new` if changed.
- **Hook input/output layer (`.claude/hooks/arac.mjs`):** The secret block, destructive command shield, package gate, structure guard, edit lock and session-start hook read the format of all three tools and write the decision in that tool's format.
  - Codex: the same fields as Claude. File edits arrive with `apply_patch`; added, updated and moved files are extracted from the patch text.
  - Antigravity: the `toolCall.name/args` format. Supported tools: `run_command`, `write_to_file`, `replace_file_content`, `multi_replace_file_content`. The decision is written as `decision`, the session note as `injectSteps`.
  - Codex has no "ask" decision (`ask`); if one is given, the tool still runs. So in Codex "ask" turns into a block and the AI is told to ask the user (the user decides).
  - The project root is taken from `cwd` in the input in Codex and from `workspacePaths` in Antigravity.
- **Counterpart of the Claude Code permission list (Codex, Antigravity):** These tools have no `.claude/settings.json` permissions. Following the RET decision of the security audit, counterparts were added to the hook. Applied only in these two tools; Claude Code's behavior does not change.
  - Blocked commands: `rm -rf`, bulk deletion on Windows, `git reset --hard`, `git push --force` and access to `.env` and `secrets/`.
  - `freeze-guard --off` asks.
  - Writing to `.env` files is blocked. Writing to these files asks: `CLAUDE.md`, `AGENTS.md`, `.claude/**` (lock file included), `.codex/**`, `.agents/hooks.json`, `.mcp.json`, `.github/workflows/**`. In Codex "ask" turns into a block.
  - The secret block also scans the shell command (heredoc, `echo > dosya`).
  - Fail-closed: If the patch header cannot be understood, the whole patch is scanned and the lock blocks. In Antigravity, all arguments are scanned whatever the name of the content field; if there is no target path, the lock blocks.
  - The project root is found from the hook script's own location (`<proje>/.claude/hooks/`); it does not depend on the cwd or on markers an agent could open (`.git`). So the lock and structure guard work even if Codex is opened in a subfolder. Relative patch paths are resolved against the session's folder.
  - A shell command that names a rule or protection file and writes or deletes it asks (`rm`, `sed -i`, `>`, `cp`, `Remove-Item`…). Running the kit scripts (`node .claude/hooks/...`) is free.
  - Codex detection: if `CLAUDE_PROJECT_DIR` is missing, the input counts as Codex (ask turns into a block).
- **`/start` and `/adopt` Step 0c:** The tools to use in the project are asked with a multi-select. If chosen during `init`, it is only announced.
- The dashboard header shows tools other than Claude Code. `AGENTS.md`, `.agents/**` and `.codex/**` were added to the structure map.
- Tests (`kit/tests/arac.test.mjs`): A secret-writing attempt is blocked in the input format of all three tools. The bypass paths found in the audit were added as adversarial tests: a patch header with spaces, a field name change, a subfolder, protection file and lock deletion, forbidden commands, writing a secret through the shell, Codex input without turn_id. The shield, structure guard, edit lock and session start are also tested in every format. It is also tested that `init --tool` generates the right files, that update refreshes the copies, and that a hook setting the user changed is kept.

### Changed
- **`init` in a non-empty folder does not overwrite the Codex and Antigravity files either.** The project's own `.agents/skills/` files are kept; the kit's version is placed next to them as `.kit-new`. If the project has an `AGENTS.md`, the kit's `CLAUDE.md` imports the kit's rules with the line `@AGENTS.md.kit-new` until `/adopt` Step 4.
- `init` that runs without `--tool` and non-interactively (for example run by the AI) leaves the `tool` field empty; `/start` or `/adopt` asks for the tool.
- The destructive command shield also catches `git clean` when the flags are written separately (`-f -d`, `-d -f`, `--force -d`). This fix affects Claude Code too.
- The secret block now blocks with `permissionDecision: deny` instead of exit code 2. The result is the same in Claude Code; the switch to this format was made because Antigravity does not document the exit code.
- The `git push` shield also catches the `-fu` and `+dal` forms; the `.env` rule covers all `.env*` files except `.env.example` (Codex and Antigravity only).
- The project name is read from `AGENTS.md` (status line, dashboard, notification). In projects from before 3.9.0, the name stays in `CLAUDE.md` and is still read from there.
- References to the "Komutlar", "definition of done" and "Never" lists now point to `AGENTS.md` (`/build`, `/release`, `/rollback`, `/retro`, `/wrap-up`, the decision protocol, the code review agent).

### Known limits
- The board and council agents, `AskUserQuestion`, the status line, limit reading, dashboard refresh (`Stop`), the commit gate and the reminder are not in Codex and Antigravity.
- It is not documented that skills are called with a slash in Antigravity IDE (it is documented in the App and CLI).
- In Codex, project hooks run once the folder is trusted and approved with `/hooks`.
- For shell commands, the hook only stops an accidental or single-step bypass. A glob (`rm .cl*/…`), splitting a path with `cd` and paths built with variables are not caught; the real limit is drawn by the tool's own sandbox.
- Writing a file with a shell command (`echo > dosya`, `sed -i`) does not hit the structure guard or the edit lock. It is the same in Claude Code, where shell commands come up for approval.
- In Codex, the hook script is called with `git rev-parse --show-toplevel` on Unix and with a relative path on Windows. So on Windows, Codex must be opened in the project root.
- The hook format of both tools was written according to the official docs and verified with tests. It has not been tried in the real tool yet.

### Adapt by hand
- **`AGENTS.md` and `CLAUDE.md`** (needed if you will use Codex or Antigravity, otherwise optional): The update adds `AGENTS.md` with placeholders; it does not touch the existing `CLAUDE.md`. Move the project name, the one-sentence description, the Komutlar section and, if present, the `## Proje kuralları` section to `AGENTS.md`. Then replace `CLAUDE.md` with the kit's new `CLAUDE.md` (`@AGENTS.md` + Claude-specific rules). If you skip this, Claude Code works as before, while Codex and Antigravity see the rules with placeholders.
- **Adding a tool:** `/kit-update --tool claude,codex`.
- **`.claude/settings.json` → `permissions.ask`:** Add the lines `Edit(./AGENTS.md)`, `Edit(./.codex/**)` and `Edit(./.agents/hooks.json)`. These files also carry rules and protection, so changes to them should need approval.
- **`.claude/structure.json` → `allow`:** Add the lines `AGENTS.md`, `.agents/**` and `.codex/**`.

## [3.8.0] - 2026-10-23

### Added
- **`/handoff`:** For continuing from the same place when a project passes to another person or account (a teammate, a corporate account, a closing account).
  - The person handing over runs `/handoff`: the `/wrap-up` steps are applied and a handoff note is written to `docs/workflow/handoff.md`. The note holds where things were left, pending decisions, needed accounts and only the names of environment variables (never the values). Then a commit and push are suggested.
  - The person taking over runs `/handoff devral`: the note is summarized; plugins, dependencies and tests are installed and run; the next task is stated.
  - A pending handoff note shows on screen at session start (`Devir notu var: /handoff devral`) and in the dashboard's "Dikkat" (attention) list (tested).
- **`/research` (literature and market research):** Academic papers (the Semantic Scholar and arXiv open interfaces), similar projects on GitHub (`gh search repos`) and commercial products are scanned.
  - The report is written under `docs/research/`: category tables, a gap map, opportunities. It already had a place in the dashboard.
  - Features to add are asked with a multi-select; the selected ones go into the PRD and the roadmap.
  - Depth is asked with its cost: quick ~10-15%, deep ~25-35%. In `/start` Step 1b and `/adopt` Step 3b it is offered as an optional, expensive step.

### Changed
- **The limit no longer stops work, it only warns.** In real use, the "stop safely" rule at 90% cut work off almost completely and the user had to persuade it to continue. The new rule:
  - A reminder at 90%, a "very low" warning at 95% (where we left off is saved silently), a "work may be left unfinished" warning at 99%.
  - Work continues unless the user says "stop". The options question at yellow and red level was also dropped; the cost is stated in one line and the options are offered if asked.
  - Affected places: `docs/workflow/usage-limits.md`, `CLAUDE.md` rule 4, `/build`, `/plan-task`, `/start`, `/board`.

### Adapt by hand
- Rule 4 of the project's `CLAUDE.md`: replace the limit sentence with the new version in the kit's `CLAUDE.md`. If you do not, the old "stop safely at 90%" rule stays in force in the project.

## [3.7.0] - 2026-10-23

The kit and the project can now sit in separate folders, and existing projects can be brought into the kit. Both come from feedback on a real project trial.

### Added
- **`kit.mjs init` (install and detach):** The kit runs from the folder where it sits and installs the project into the target folder (`node vibe-kit/kit/kit.mjs init`, the default target is the current folder). The kit folder is not touched and can be reused for several projects.
  - If the project folder has no git repo, it creates one. If the kit is inside the project folder, it adds it to `.gitignore`.
  - In a non-empty folder it does not overwrite the project's files: the kit's version is placed next to them as `.kit-new`. `.gitignore` is merged line by line, `.claude/settings.json` deeply; the project's values are kept.
  - `.kit.json` → `type: null` means "installed, type pending". The status line, dashboard and session start show this as a `/start` or `/adopt` suggestion.
  - `install --type <tip> --project <yol>`: adds the type layer to a project installed with init. Placeholders that init placed and the user did not change are overwritten; the project's own files are not. The kit folder is not deleted.
  - Tested: an empty folder, a non-empty folder, rejection of a second init, then `update`.
- **`/adopt` (bring an existing project into the kit):** A 9-step alignment wizard.
  - Scan depth is asked with its cost (quick / deep + selected findings reports).
  - The stack, structure, features, tests and git history are scanned. `.kit-new` files are asked one by one as decisions.
  - The PRD, stack, architecture and README are derived from the code; the purpose, audience and "what do you dislike" are asked.
  - CLAUDE.md is rewritten to match the kit's. The project-specific rules in the old file are asked with a multi-select and moved to the `## Proje kuralları` section; the old one goes to `docs/archive/`.
  - Existing tests are run and evaluated. The correct behavior of critical flows is asked from the user so the code does not lock in wrong behavior.
  - Alignment roadmap: in Phase 0 a safe baseline and critical flow tests, in Phase 1 moving feature by feature into the kit's folder structure (a separate branch, a working point in each task), in Phase 2 the findings, then new features.

### Changed
- `/start` Step 1 recognizes two install paths (template or init); if the folder has code, it suggests `/adopt`. Step 3 has the command for the init path.
- README and guide: The new install path became the main path, "Use this template" stays as an alternative.

### Adapt by hand
- The project's `CLAUDE.md`: the "Kurulum durumu" (setup status) line now also covers the `.kit.json` → `type: null` state and `/adopt` (see the kit's `CLAUDE.md`). No effect on projects that are already set up.

## [3.6.0] - 2026-10-23

The freeze is over. This release comes from feedback on trying the kit in the first real project (3.5.1).

### Added
- **Planning depth** (`/start` Step 0a): A second question, separate from the profile. Options: Quick (~25-35%), Standard (~50-70%), Detailed (~80-100%). Reason: even with the Light profile, the 9 steps used up the whole 5-hour limit and coding never started.
- **Cost gate on expensive steps:** Before the council in Step 4, the board in Step 6 and the design in Step 7, the estimated cost is stated, then it asks "Do it / Do it light / Leave for later". These steps were not removed. Those left for later enter Phase 0 as tasks. Cost table: `docs/workflow/usage-limits.md`.
- **Dashboard at the very start** (`/start` Step 0 item 6b): The dashboard is created and opening it in the browser is suggested. Decisions are written to the log the moment they are made, so the dashboard shows them step by step.
- **Next command on screen after `/clear`:** The session-start hook now shows the next command to the user too (`systemMessage`). Example: `Sıradaki: /build G-004 · ...`, `Devam: /start (adım 4/9)` (tested). `/wrap-up` gives the full command on the last line.
- **Installable on another computer:** `/start` Step 4 fills in the version file (`.nvmrc` / `.python-version`) and the README's Requirements/Setup section. `/build` updates the README when there is a new dependency. `/release` and the monthly `/maintain` clone into a clean folder and run an install test.

### Fixed
- **`/kit-update` did not work:** The command called `kit.mjs guncelle`, but the command is named `update`.

### Adapt by hand
- The project's `README.md`: add the "System dependencies" line and the lock file note to the Requirements section (template: `kit/project/README.md`).

## [3.5.1] - 2026-10-12

### Security
- **Permission list prefix hole** (found by the commit security review). Permission rules match the start of the command, but the scripts read arguments in any order. Result:
  - `checkpoint.mjs --list --restore X --evet` did a restore without approval.
  - `freeze-guard.mjs --set x --off` removed the edit lock without approval.
  - `freeze-guard.mjs --set .` widened the lock to the whole project.
- Fix:
  - In both scripts, only the first argument now decides what to do.
  - An open lock can only be narrowed without approval.
  - The permission list has only `freeze-guard --set` and `--status`; `--off` asks for approval.
  - A test was added for each of the two holes.
- Known: `commit-gate.mjs --approve` stays in the permission list as a self-approval path of the same kind (3.4.0 note). Commit review is off in the Light profile.

## [3.5.0] - 2026-10-12

Last additions before the freeze. The kit is frozen with this release.

### Added
- **`/rollback` (go back to the last working state):** The `checkpoint.mjs` script was added (tested).
  - `/build` and `/wrap-up` put a `calisan/...` tag as a working point when the tests are green.
  - On rollback, unfinished work is stashed first, the files are brought to the target state and a new commit is made. So history is not deleted and the rollback can be undone too.
  - Files in `.gitignore` (`.env`) are not touched. `reset --hard` is not used.
  - The rollback command is not in the permission list; it asks for approval every time.
- **Narrator mode** (`.claude/output-styles/anlatici.md`): A "What happened?" block after every step (what I did, why, how you see it, a new concept) and plain-language explanations of errors. Asked in `/start` Step 0b; `.claude/settings.local.json` → `outputStyle: anlatici`.
- **Spend alarm** (`docs/operations/spend-alarms.md`):
  - A table of ceilings and warnings per paid service.
  - Provider settings (Anthropic, OpenAI, Vercel, Supabase, Google Cloud; verified on 2026-10-12).
  - In-app protection: user quota, overall daily budget, the flag turning itself off at 100%.
  - A card in the dashboard's Operations tab; an unset alarm falls into the "Dikkat" (attention) list (tested).
  - `/start` Step 5 fills in the table; `/release` and `/maintain` check it.
- A **"If you know nothing: step by step"** section was added to the README: accounts, programs, creating a project, first questions, daily use. A short version was added to the guide too.

### Fixed
- `kit-tests.yml`: The job-level `if: hashFiles(...)` condition is not supported on GitHub and gave a "No jobs were run" error on every push. The condition was removed; `kit.mjs install` does not carry this file into the project anyway.

## [3.4.0] - 2026-10-12

Result of the first council evaluation: the kit was **frozen** with this release so it can be tried in a real project. From now on only blocking bugs will be fixed in the kit.

### Added
- **Profile** (`/start` Step 0): One of the Light, Standard and Full profiles is chosen. Light is recommended on the Pro plan. The profile decides:
  - which plugins are on
  - commit review
  - which meetings and decisions go to the council

  In the Light profile the 6 core plugins stay on, commit review is off and there is no meeting council. The profile is written to the `progress.md` → `**Profil:**` line and shows in the dashboard's Now box.
- A test that really runs the hook commands with `bash` was added. Earlier tests only looked at the command text and had missed the notification bug below.

### Changed
- The decision council now convenes only for database and auth decisions; in the Full profile, for all one-way decisions. For other one-way decisions the architect's opinion is taken. Measurement: one council used about 12% of the 5-hour limit on the Pro plan.

### Fixed
- **The commit gate kicked in when there was no board.** The `board-chair.md` that comes with the template was counted as a board member; so `/start`'s setup commit stopped, waiting for a board that was not set up yet. Found by: the council (the opus advisor).
- **The long-job notification never worked.** The quote in the Stop hook command was in the wrong place (`notify.mjs --stop` was read as a single path) and Node crashed with "module not found".
- The CHANGELOG heading still had the old command name (`/kit-guncelle`).

### Known, left open (by the freeze decision)
- `--approve` in the commit gate stays in the permission list; the agent can open the gate itself. Commit review is already off in the Light profile.
- In the council count, an ABARTILI vote counts as an objection and a 1-1 tie with 2 votes comes out as "contested". This rule will be reviewed in real use.

## [3.3.2] - 2026-10-12

### Changed
- `plugins-sync.mjs`: Plugins that are installed but switched off on this machine by a personal preference (settings.local.json or /plugin) are now reported with an info line. The script does not change this preference.
  - Verified by trying: this is not a load error; Claude Code deliberately does not register the plugin.
  - The `enabled` field in the `claude plugin list --json` output is computed from the folder the CLI runs in; `projectEnabled` shows the project setting.

## [3.3.1] - 2026-10-12

### Fixed
- **Plugin load error** (`/reload-plugins`: "1 error during load"). The project setting (`enabledPlugins`) switched plugins on but did not download them.
  - Trail of Bits' 7 plugins and Anthropic's 5 plugins were not in the install record. In a headless session they gave a "not cached" error and did not load.
  - For Remotion, even a `false` value gave the "enabled in project settings but isn't installed" error.
  - In this repo all were installed at project scope and Remotion was left off. The load error count in the debug log went to 0, and the number of loaded skills went from 78 to 90.

### Added
- `plugins-sync.mjs` (tested): Syncs the plugins in the project settings with the install record. By default it only lists; with `--kur` it installs missing ones at project scope and installs-then-disables the `false` ones. It does not use a shell (`execFileSync`).
  - It runs with approval in the `/start` environment step, and `/kit-update` runs it when a new plugin arrives.

## [3.3.0] - 2026-10-12

### Added
- **Council (three stages):** An adaptation of Karpathy's llm-council structure for the board (`.claude/board/council.md`).
  - **Meeting council:** Applied in plan, end-of-phase, release and RET end-of-task meetings. Members first give independent opinions. Then each member votes on the others' findings without knowing who wrote them (DOĞRU, ABARTILI or YANLIŞ) and ranks the opinions. Last, the chair decides.
  - **Decision council:** Runs for one-way door decisions and with `/board council <soru>`. 3 `council-advisor`s (haiku, sonnet, opus) answer the same question and rank each other anonymously. `board-chair` makes a recommendation; the "(Recommended)" option in AskUserQuestion comes from the council, and each option gets the council vote and the minority opinion.
  - The `board-chair` (opus) and `council-advisor` agents were added.
  - `council.mjs` was added for counting (tested). It computes the average rank, finding votes, contested findings and consensus in code. The chair cannot drop a contested CRITICAL finding.
  - Minutes are written to the `docs/workflow/council/` folder. A new Council card was added to the dashboard's Board tab: the last decision, consensus, the number of contested and dropped findings, the overall ranking with identities, the last 10 minutes.

### Changed
- `docs/workflow/decision-protocol.md` §2a: In one-way door decisions, the decision council replaced the earlier single architect opinion. If the limit is red, it goes back to the old method.
- `.claude/board/rules.md`: Council meetings and step 2b in §4 were added. `council` was added to the `/board` command.
- The guide, dashboard and README were updated with 3.3.

## [3.2.0] - 2026-10-12

Selections from ecosystem research (stars and maintenance status from the GitHub API, install details from the primary source).

### Added
- **Anthropic official plugins** (`claude-plugins-official`, every type): `security-guidance` (pattern warning while writing + commit review; the end-of-turn review is switched off with `ENABLE_STOP_REVIEW=0` to save quota), `claude-security` (`/findings-security` deep scan), `hookify`, `claude-md-management`, `session-report`.
- **LSP:** `typescript-lsp` (web, mobile), `pyright-lsp` (backend). Language server install is in `/start`.
- **Stack skills:** Supabase `supabase` + `postgres-best-practices` (web, mobile; postgres in backend), `web-quality-skills` (web), Expo's official `expo` plugin (mobile, Expo MCP included), Vercel `react-best-practices` / `composition-patterns` / `react-native-guidelines` (`/start` copies them with `npx skills`).
- **Maestro MCP** in the mobile `.mcp.json`; service MCP catalog `docs/workflow/mcp-catalog.md` (GitHub, Stripe, Vercel, PostHog, Figma, Firebase, Linear).
- **Edit lock:** `/freeze <klasör> | off`, the `freeze-guard.mjs` hook (tested).
- **Tokens and cost:** `cost.mjs` (ccusage, last 30 days per project) → a new card in the dashboard's Limit and cost tab (tested).
- Security rules `.claude/claude-security-guidance.md` and `.claude/security-patterns.json` (service_role on the client, a secret in a public env, personal data in logs).

### Changed
- Karpathy's four principles in `CLAUDE.md` rule 7; in the definition of "done", the verification command is run in this turn and its output is shown.
- `/fix-bug`: a single variable, refutation evidence, a `/freeze` suggestion once the root cause is found.
- Board: The Product member asks for a scope mode in the plan meeting (expand / hold / reduce).
- `/retro` and `/wrap-up`: `claude-md-improver`, `/revise-claude-md`, `/hookify` suggestions. `/dashboard` and `/wrap-up` refresh the cost data.
- `/findings-security`: `claude-security` scan; the output folder `CLAUDE-SECURITY-*/` is outside git and allowed in the structure map.
- The guide, dashboard and README were updated with 3.2.

### Adapt by hand (existing projects)
- Install the language server: `npm i -g typescript-language-server typescript` or `npm i -g pyright`. Maestro CLI for mobile.

## [3.1.1] - 2026-10-12

### Changed
- The guide (`kit/guide.html`) was brought to v3.1: a dashboard with 10 tabs and the notification, the new skill table (source-research, logo-design, ui-motion, motion-video, Trail of Bits), a "Capability packages" section, all protection layers.
- Dashboard: Brand pack, promo videos and research notes cards were added to the "Product and technical" tab (`uretimVarliklari`, tested).
- README: the notification, the contents of the Product and technical tab; the rule "the guide, dashboard and README are updated" in the release steps.

## [3.1.0] - 2026-10-12

### Added
- **The kit's own skills** (`.claude/skills/`, managed by the kit):
  - `source-research`: Source policy (A-D trust levels, primary source first, cross-checking, date and version), the list of official Turkey sources, `docs/research/` records. Optional Firecrawl setup: the key stays in the user's environment variable.
  - `logo-design`: Brand brief questions, 4-6 SVG concepts (16 px legibility, one-color version), visual preview, refinement, brand pack (favicon, apple-touch, 192/512, mobile icons), `docs/design/brand.md`.
  - `motion-video`: Adapted from N01ennn's "UI motion design" prompt. A closed-form spring function (verified with a test), beat map, 4-frame approval, motion blur from 240 fps subframes, loop seam and determinism check. Remotion option.
  - `ui-motion`: In-app motion rules (duration tokens, spring settings, reduced motion, performance; Motion and Reanimated).
- **MCP:**
  - Context7 in every type (remote HTTP).
  - Chrome DevTools MCP in web.
  - Playwright and Chrome DevTools versions were pinned (`@latest` removed).
- **Trail of Bits security plugins** (7): connected to the security lens and to `security-auditor`.
- **Remotion official plugin:** Defined, off by default.
- **Notification hook** (`notify.mjs`): A desktop notification arrives when Claude is waiting for a question or approval (Notification) and when a job longer than 90 seconds ends (Stop). Windows, macOS and Linux are supported.
- **Skill budget:** In backend projects the interface design plugins come switched off. Budget rules were added to `docs/workflow/skills.md`.
- **Structure map:** The `marketing/**` area was added (promo video sources; frames and outputs are outside git).

## [3.0.0] - 2026-10-12

Professional structure and findings reports. **Breaking change:** file and command names changed, the `.kit.json` format changed; 2.x projects cannot be updated automatically.

### Changed
- **File and folder names became English kebab-case** (content in Turkish). `docs/` was split into subfolders: `product`, `architecture`, `design`, `decisions`, `quality`, `security`, `legal`, `operations`, `workflow`, `findings`, `archive`.
  - Examples: `docs/PRD.md` → `docs/product/prd.md`, `docs/ILERLEME.md` → `docs/workflow/progress.md`, `docs/KARARLAR.md` → `docs/decisions/log.md`.
- **Commands became English:**

  | Old | New | Old | New |
  |---|---|---|---|
  | `/baslat` | `/start` | `/oturum-sonu` | `/wrap-up` |
  | `/planla` | `/plan-task` | `/canliya-al` | `/release` |
  | `/gelistir` | `/build` | `/bakim` | `/maintain` |
  | `/incele` | `/review-changes` | `/tasarim` | `/design` |
  | `/hata-ayikla` | `/fix-bug` | `/soru` | `/ask-mode` |
  | `/durum` | `/dashboard` | `/kurul` | `/board` |
  | `/kit-guncelle` | `/kit-update` | `/geri-bildirim` | `/user-feedback` |

  Arguments are in English too: `setup`, `convene`, `first`, `on`/`off`, `weekly`/`monthly`/`quarterly`.
- **Agents:** `inceleyici` → `code-reviewer`, `guvenlik-denetcisi` → `security-auditor`, `kurul-*` → `board-*`.
- **Hook files:**
  - They got English names: `dashboard.mjs`, `commit-gate.mjs`, `package-gate.mjs`, `destructive-guard.mjs`, `usage.mjs`, `reminder.mjs`, `status-read.mjs`, `dashboard-data.mjs`.
  - Runtime state files were gathered under `.claude/state/`.
- **Dashboard:** `DURUM.html` → `dashboard.html`. Design previews are under `.previews/`.
- **Kit internal structure:**
  - `kit/sablon` → `kit/templates`, `mobil` → `mobile`, `ekler` → `addons`.
  - `SURUM`/`KAYNAK` → `VERSION`/`SOURCE`, `REHBER.html` → `guide.html`, `testler` → `tests`.
  - Special file extensions: `.ekle` → `.append`, `.birlestir.json` → `.merge.json`. Conflict file: `.yeni` → `.kit-new`.
  - `kit.mjs`: `kur`/`guncelle` → `install`/`update`, `--tip`/`--ekler`/`--proje` → `--type`/`--addons`/`--project`. `.kit.json` fields are in English.
- **Detailed decisions moved to ADR files:** `docs/decisions/adr-NNNN-*.md` (template `adr-template.md`). The decision log is `docs/decisions/log.md`.

### Added
- **Protected project structure:**
  - A feature-based structure map per type (`.claude/structure.json`) and its guide (`docs/architecture/structure.md`).
  - `structure-guard.mjs`: The user is asked about a new file outside the map; clutter patterns (`*.bak`, `*-old.*`, copies, `temp/`, `deneme*`) are blocked; the whole repo is checked with `--check`.
  - A `structure` job was added to every type's CI. The board Architect and `/findings-tech` also check the structure.
  - `sandbox/` (a trial area outside git) and `docs/archive/` were added.
- **Findings reports:**
  - Commands: `/findings-tech`, `/findings-business`, `/findings-security`, `/findings-ux`, `/findings-perf`, `/findings-legal`, `/findings-all`.
  - A shared protocol (`.claude/findings/protocol.md`), a lens per type (`lenses/`) and a report template.
  - At most 20 findings; severity score = impact + likelihood + spread + urgency; area health score; comparison with the previous report.
  - After the report: a fix plan, board opinion and transfer to the roadmap.
  - The business report derives the industry expert role from the PRD, has the user confirm it and does web research; the settings are kept in `docs/findings/config.md`.
- **"Findings" tab in the dashboard:** health score per type and its change, report history; critical findings fall into the "Dikkat" (attention) area.
- **README refreshed:** banner (`kit/assets/banner.svg`), badges, Mermaid diagrams.
- **The kit's own CI:** `.github/workflows/kit-tests.yml` (not carried into the project).

## [2.3.0] - 2026-10-11

15 suggestions based on research.

### Added
- **Security:**
  - **Package gate** (`paket-kapisi.mjs`): A package the AI wants to install is verified against the registry before install. A nonexistent package is blocked. The user is asked about a package that is too new, little downloaded or very similar to a popular package (against slopsquatting).
  - **Destructive command shield** (`yikici-kalkan.mjs`): `DROP`, `TRUNCATE`, unconditional `DELETE`, `db reset`, volume deletion and `git clean` are blocked. The user is asked about prod deploy, push to the main branch and a remote database connection. The decision is made in Claude Code's permission layer; the AI cannot bypass it itself.
  - **Agent configuration protection:** Edits to `CLAUDE.md`, `.claude/`, `.mcp.json` and `.github/workflows/` need user approval. An "AI agent security" section was added to GUVENLIK.md.
  - **Semgrep in CI** and adversarial tests in TEST-PLANI (IDOR, unauthenticated access, role escalation, XSS, input limit, log injection).
- **Quality:**
  - **Acceptance tests became a living specification:** PRD criteria have ids (`Ö-01.1`), and tests are written red before the code. The dashboard reads the JUnit report and catches the mismatch "marked but has no test / is red".
  - **Duplicate code check in CI** (jscpd, threshold 5%).
  - **Context health:** Context fill is shown in the status line. A UserPromptSubmit hook reminds the core rules every 12 messages and suggests `/clear` at the 50%/70% thresholds.
  - **`docs/METRIKLER.md`:** Task time, fix rate, rollbacks, duplicate code and acceptance rate are recorded monthly; the retro is done with this data.
- **Operations:**
  - **Live monitoring workflow** (web, backend): Critical flows are tried hourly, and an issue is opened if one breaks.
  - **Cloud agents** (`claude-code-action`): a fix on the PR branch if CI is red (with loop and fork protection) and a weekly maintenance issue. They are switched on with a variable.
  - **`docs/HESAPLAR.md`:** Service, owner, 2FA and expiry dates; the dashboard warns about those expiring within 30 days.
  - **`docs/BAYRAKLAR.md` and the flag method in the STACKs:** An emergency switch-off does not need a deploy.
- **Product:**
  - **One-way / two-way door:** A "Kapı" (door) column was added to the decision log. For one-way decisions, a board opinion and a detailed record are mandatory.
  - **`docs/BIRIM-EKONOMISI.md`:** The dashboard computes contribution margin, the break-even point and profit/loss at the target.
  - **The `/geri-bildirim` command and `docs/GERI-BILDIRIM.md`:** An inbox, themes and transfer to the roadmap.
- **DURUM dashboard:**
  - A new "Operations" tab: accounts, flags, GitHub (CI, open PRs, live monitoring; with a 5-minute cache if gh is present).
  - Acceptance test table, metric trend, unit economics, feedback, a context card, a decision door filter.
  - The "Dikkat" (attention) list is sorted by severity; the first 6 items are shown, the rest opens.

### Changed
- **The `docs/KARARLAR.md` decision log became 8 columns (Kapı).** The dashboard also reads the old 7-column table. *(Adapt by hand: KARARLAR.md table header)*
- **A "Süre (dk)" (duration, min) column was added to `docs/MALIYET-GUNLUGU.md`.** *(Adapt by hand)*
- **Ids were added to the `docs/PRD.md` acceptance criteria.** *(Adapt by hand)*
- **Commands were updated:** `/baslat`, `/planla`, `/gelistir`, `/bakim`, `/retro`, `/canliya-al` and `/oturum-sonu` apply the new rules.

## [2.2.0] - 2026-10-11

### Changed
- **DURUM.html became the project owner's control panel:**
  - The top part has "Now" (phase, task, next step) and "Needs attention" areas. Here you see board RET, the limit, pending decisions, interrupted work, open issues, a stale ILERLEME and question mode.
  - Overall health badge: On track / Attention / Blocked.
  - Summary tiles: tasks, MVP acceptance criteria, decisions, board, the last 7 days of commits, limit.
  - 8 tabs: Overview, Roadmap (task list, active task highlighted), Decisions (topic filter), Board, Quality (checklists, code health, fix rate, critical flow tests, maintenance), Activity (14-day commit chart and a merged feed), Product and technical (PRD, MVP, stack, design, preview links, CHANGELOG), Limit and cost.
  - Light and dark theme, automatic refresh every 30 seconds, tab navigation with the keyboard.
- **Stop hook:** Refreshes the dashboard after every Claude reply (spends no tokens).
- **`durum-oku.mjs`:** Exposes its helper functions; reads task lists and last session info.

## [2.1.0] - 2026-10-11

### Added
- **Expert board:**
  - 10 role templates (`.claude/kurul/`): Product, Architect, UX, Performance/SEO, KVKK, QA, DevOps, Mobile, API and AI. `guvenlik-denetcisi` is used as the security member.
  - In `/baslat` Step 6, a board is suggested by type, approved, and project-specific agents are generated as `.claude/agents/kurul-*.md`.
  - Meetings: plan, end-of-task, commit (light) and end-of-phase/release.
  - The board is an advisor; it stops work on a critical finding.
  - The `/kurul` command and the `docs/KURUL.md` meeting log.
- **Commit gate hook** (`commit-kapisi.mjs`): The AI's commit does not pass without a light board review. Exempt only when just docs changed; it can be switched off via `docs/KURUL.md`.
- **Limit awareness:**
  - `limit.mjs` and the status line read Claude Code's `rate_limits` information and cache it. On desktop the `get_usage` tool is used.
  - `docs/LIMIT-PLANI.md`: thresholds, cost estimate, options at yellow/red level, safe stopping.
  - Task costs are recorded in `docs/MALIYET-GUNLUGU.md`.
  - A "Kaldığı yer" (where we left off) section was added to `docs/ILERLEME.md`.
- **Code map:** `/baslat` suggests installing codebase-memory-mcp; CLAUDE.md makes it the primary exploration tool.
- **Status dashboard and session note:** Limit, board and "where we left off" information were added.

### Changed
- **Startup load dropped from about 8,000 tokens to 1,700 tokens:**
  - `CLAUDE.md` now imports only `docs/ILERLEME.md`.
  - Protocol, skill and stack rules stay in CLAUDE.md as summaries; detailed docs are read when needed. *(Adapt by hand: CLAUDE.md)*
- **`/baslat` became 9 steps** (new step: Board). *(Adapt by hand: the denominator of the `Başlangıç adımı` line in ILERLEME.md became 9)*
- **`guvenlik-denetcisi`:** `model: sonnet` and the board output format were added.
- **Commands were updated:** `/planla`, `/gelistir`, `/incele`, `/oturum-sonu`, `/canliya-al` and `/durum` now include board meetings and the limit check.

## [2.0.0] - 2026-10-11

Question-driven flow and GitHub template structure. **Breaking change:** 1.x projects cannot be updated automatically (the `.kit.json` format and file layout changed).

### Added
- **Decision protocol** (`docs/KARAR-PROTOKOLU.md`):
  - Every product, technical, design, content, data, security and cost decision is asked with AskUserQuestion.
  - The recommended option is first, and when each option is better is explained.
- **Question mode:** Switched off and on per topic (`/soru`, or just saying "don't ask on design"). Decisions on a closed topic are recorded as "otomatik" (automatic).
- **Visual preview:** Design decisions are asked with examples generated under `.onizleme/`.
- **Skill routing** (`docs/SKILLER.md`):
  - Caveman, Impeccable, Taste Skill (by style direction), UI UX Pro Max, Humanizer, Ponytail, Matt Pocock skills.
  - These plugins are defined in `.claude/settings.json`; Claude Code suggests installing them when the project is opened.
- **Reporting:**
  - A status block at the end of every answer.
  - A bottom status line (`statusline.mjs`).
  - The `/durum` command and the `DURUM.html` dashboard (`durum-panosu.mjs`).
- **`/baslat` wizard:**
  - 8 steps: questioning the idea, project type, setup, technology, architecture, design, roadmap, closing.
  - It continues from the step where it stopped.
- **A "Decision points" catalog in the STACK.md files:** Options for each type and when each is better.
- **New commands:** `/tasarim`, `/soru`, `/durum`, `/kit-guncelle`.
- **A decision log table in `docs/KARARLAR.md`.**
- **New fields in `docs/ILERLEME.md`:** start step, question mode, pending decisions.

### Changed
- **Template structure:**
  - The repo root is now the shared layer itself.
  - Types and add-ons are under `kit/sablon/`.
  - `/baslat` places the type with `node kit/kit.mjs kur` and deletes the `kit/` folder.
- **The install tool moved to Node.js** (`kit/kit.mjs`). `kit.ps1` was removed.
- **Type layers are applied by merging:** `.gitignore.ekle` and `.claude/settings.birlestir.json` are now merged with the files at the root.
- **`TASARIM.md`:** Tokens moved to Impeccable's `DESIGN.md` file. TASARIM.md is now for the chosen direction, the decision log and lasting rules.
- **Commands:** `/planla`, `/gelistir`, `/incele`, `/hata-ayikla`, `/canliya-al`, `/bakim`, `/retro` and `/oturum-sonu` were updated with decision-asking and skill steps.
- **`/retro`:** Kit suggestions are now prepared as a branch in the kit repo and pushed with approval.

## [1.1.0] - 2026-10-11

### Added
- **Automatic checks**
  - Claude Code hooks (`.claude/hooks/`): blocking secret writes, file formatting, git and ILERLEME state at session start.
  - Pre-commit check: husky + lint-staged for web/mobile, pre-commit for backend. Both scan for secrets.
  - GitHub Actions CI and Dependabot (for every type).
- **Review**
  - The `inceleyici` and `guvenlik-denetcisi` subagents (`.claude/agents/`).
  - `/incele` now uses these agents.
- **Verification:** A "produce evidence" step in `/gelistir`, a "Doğrulama" (verification) section in the STACK.md files, an evidence item in the definition of "done".
- **MCP:** `.mcp.json` (Playwright, Supabase read-only, Sentry). `/bakim` can use them.
- **New docs:** `docs/SOZLUK.md`, `docs/LANSMAN.md`, `docs/RETRO.md`; `docs/TASARIM.md` for web and mobile.
- **AI add-on** (`-Ekler ai`): `docs/AI.md`, `evals/`, `prompts/`, an `.env.example` fragment.
- **The `/retro` command:** writes lessons back to the project and the kit.
- **`kit.ps1`:** `yeni` and `guncelle` operations. Files are tracked in the project with `.kit.json`; update does not overwrite files the user changed.
- Tests: `testler/`.

### Changed
- `yeni-proje.ps1` was removed, replaced by `kit.ps1 yeni`.
- Pre-commit + CI (G-004) and SOZLUK/TASARIM (G-007) tasks were added to the roadmap's Phase 0; later task numbers shifted. *(Adapt by hand: YOL-HARITASI.md)*
- New docs, hook and agent rules were added to `CLAUDE.md`. *(Adapt by hand)*
- Backend dependency scanning became `uv run --with pip-audit pip-audit`. The old `uvx pip-audit` command was scanning its own environment, not the project's. *(Adapt by hand: STACK.md, settings.json)*
- CI, branch protection, AI add-on and launch items were added to `CANLIYA-ALMA.md`.

## [1.0.0] - 2026-10-11

### Added
- First release: shared docs, 8 commands, web-saas / mobile / backend templates, `REHBER.html`.
