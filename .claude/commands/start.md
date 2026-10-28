---
description: Starts the project from an idea. Asks at every step and decides project type, stack, architecture, design and roadmap together with the user.
argument-hint: [project idea, 1-3 sentences]
---

Idea: $ARGUMENTS

This is a **9-step wizard** (0-9). Act as if the user knows nothing. Ask every decision per `docs/workflow/decision-protocol.md` (AskUserQuestion, recommended option first, each option explains when it is better). Never decide on your own. Write no application code in this session. Classify every decision as a one-way / two-way door (`docs/workflow/decision-protocol.md` §2a). For one-way decisions such as database, auth, payment and data model, get the board's opinion first (decision council for database and auth; profile rule in `.claude/board/council.md`).

**Resuming:** If `docs/workflow/progress.md` → `**Setup step:**` is greater than 0, resume from that step and tell the user. When a step ends, update this line (`N/9`) and the `**Last updated:**` line; then write the status block. After heavy steps (1b research, 4, 6, 7), suggest `/clear` in one line before the next step: the step's result is in files and the next step reads them; a clean session is cheap because every turn rereads the whole context. Calling `/start` again resumes from the saved step.

**Decisions are logged immediately:** Write each decision to `docs/decisions/log.md` → decision log the moment it is made (do not wait for the step end). The dashboard shows decisions and step progress live from there.

**Expensive steps** (decision council in Step 4, board in Step 6, design in Step 7): Before starting, state the estimated cost (table in `docs/workflow/usage-limits.md`) and the remaining limit in one line. The step is never removed; the user chooses. At Detailed depth, announce and do it. At Quick and Standard, ask: **Do it** / **Do it light** / **Leave for later**. Recommended: "Leave for later" at Quick, "Do it light" at Standard.
- Do it light: In Step 4 one advisor opinion instead of the council; in Step 6 the 3 recommended members with one approval; in Step 7 a single preview round (style direction), color and font from that direction's recommended set.
- Leave for later: In Step 4 the user still decides the one-way decision (recommended option + reasoning). For Steps 6 and 7, add tasks to Phase 0 (`/board setup`, `/design general`).

---

## Step 0: Preparation

**Language (before anything else):** If `node .claude/hooks/lang.mjs --show` returns a code other than `none`, the language is already chosen; do not ask again. Otherwise ask with AskUserQuestion, **in English**: "Which language should I talk to you in?" Options: Turkish / English / Other. For Other, the user types the language name; convert it to a BCP-47 code (`de`, `pt-BR`) and confirm in one sentence if unsure. Run `node .claude/hooks/lang.mjs --set <code>`. If the code is not `tr` or `en`, translate the hook texts the user sees: translate the output of `node .claude/hooks/lang.mjs --export` into that language (placeholders in curly braces such as `{command}`, `{step}` stay unchanged), pass the JSON to `node .claude/hooks/lang.mjs --write` through stdin, then `--check` must say `ok`. From then on every question, option, answer, status block and document text you write is in this language; no rule relaxes this. Bold labels in documents (such as `**Active phase:**`) stay as they are; tools read them. Do not generate the dashboard before the language is chosen.

0. **Profile** (first question after language): Light / Standard / Full. Show the table from `.claude/board/council.md` → "When"; **Light** is recommended on the Pro plan, Standard on the Max plan. Write the choice to `docs/workflow/progress.md` → `**Profile:**` line as `Hafif`, `Standart` or `Tam` (tools read these words; show the English names in the question).
   - **Light:** Disable these plugins at project scope (for each: `claude plugin disable <id> --scope project`): hookify@claude-plugins-official, claude-md-management@claude-plugins-official. (Package plugins come disabled in every profile anyway; commands ask to enable them when needed.) `docs/workflow/board.md` → `**Commit review:** off`.
   - **Standard / Full:** Plugins and commit review stay on.
   - **Command list:** In Light and Standard, the 20 non-core commands appear in the skill list by name only (they exist in the `/` menu and are called by name; kit default). **Full:** `node .claude/hooks/tools.mjs --commands full` (all descriptions in the list; the list may overflow a 200K context).
   - The profile can be changed later; apply the same steps in reverse.
0a. **Planning depth** (second question, separate from profile: profile sets the ongoing cost, depth only shapes this wizard). Show the options with the estimated cost from the `docs/workflow/usage-limits.md` table. **Quick** is recommended if the idea is clear and the plan is Pro; **Standard** if the idea is vague or the product has payment or personal data. Append the choice to the `**Profile:**` line (e.g. `Light · depth: Quick`).
   - **Quick:** Step 1 in one round (problem, audience, MVP multi-select); acceptance criteria as a draft with one approval. In Step 4 the recommended stack is approved on a single screen. Step 5 covers only the data model and sign-in method; external services and unit economics are left to the related task.
   - **Standard:** All steps; expensive steps are asked before they start.
   - **Detailed:** All steps in full.
   In the `**Profile:**` line write the depth as `Quick`, `Standard` or `Detailed`.
0b. **Narrator mode:** Ask: "If you are new to software, Narrator mode explains every change and error in plain language. Answers get a bit longer, which means a few more tokens. Turn it on?" Options: "Yes" and "No, short answers". If the user's knowledge level is low, "Yes" is the recommended option.
    - If yes, add `"outputStyle": "narrator"` to `.claude/settings.local.json` (merge if the file exists; this file stays out of git, it is a personal setting).
    - The mode takes effect from the next message. In the terminal, `/output-style narrator` does the same. To turn it off, delete the value.
0c. **Tool:** Which AI tools will be used in this project? If `.kit.json` → `tool` is set (chosen during `init`), report it in one line and do not ask again. Otherwise ask with **multi-select**:
    - **Claude Code (Recommended):** The kit is written for it; all features (board agents, question interface, status line, limit).
    - **Codex:** Rules from `AGENTS.md`, commands as skills (`$start`), protections through `.codex/hooks.json`. Single-model board, options as plain text, no status line.
    - **Antigravity:** Rules from `AGENTS.md`, commands as skills (`/start`), protections through `.agents/hooks.json`. Single-model board, no status line.
    Append the choice to the `**Profile:**` line (e.g. `tools: claude,codex`) and pass it as `--tool <list>` to the install command in Step 3. Claude Code files are installed in every case (hook scripts are shared).
0d. **Auto memory** (Claude Code only): By default Claude Code keeps notes to itself from your corrections. The notes stay on this machine, do not enter git, the team cannot see them and nobody reviews them. Ask:
    - **Off (Recommended):** The project's memory lives in `AGENTS.md`, `progress.md` and the decision log; visible and in git. Repeated mistakes are proposed to "Learned rules" (learned rules) through `/fix-bug`. Add `"autoMemoryEnabled": false` to `.claude/settings.json` (merge the file).
    - **On:** Your preferences are remembered across sessions on their own; notes may conflict with `AGENTS.md`. Leave the setting alone.
    Append the choice to the `**Profile:**` line (e.g. `memory: off`). Source: code.claude.com/docs/en/memory (2026-10-25).
0e. **Model and effort** (`docs/workflow/models.md`): Ask the two screens in `/build` step 0b and save them. Planning work runs in the main session, research and scanning in the document role, board review in the review role; the model is not asked separately in Step 6.
1. Check the environment and report in one line: `node --version`, `git --version` and the kit's location. There are two install paths: `kit/kit.mjs` at the root (template path) or the folder in `.kit.json` → `kit` field (installed with `init`, `type` empty). If the `kit` field is `npx:tillerhand@<version>`, the kit was installed from the npm package. If it is `local`, the folder's path on this machine is in the git-ignored `.kit.local.json` → `kit`; if that file is missing, ask the user for the kit folder or use `npx -y tillerhand@<.kit.json → version>`. If the folder already has application code (`package.json`, `pyproject.toml`, `src/` etc.), stop and suggest `/adopt`.
2. Check whether the skills of the plugins in `docs/workflow/skills.md` are in your skill list. The LSP plugin needs a language server: `npm i -g typescript-language-server typescript` for web and mobile, `npm i -g pyright` for backend (global install; with user approval). **Plugins:** The project settings enable plugins but do not download them; missing ones give a load error and their skills do not arrive. Show the user the list and ask: "Should the plugins in the project settings be installed?" First list the missing ones with `node .claude/hooks/plugins-sync.mjs`; if approved, run `node .claude/hooks/plugins-sync.mjs --install`. The script installs the missing ones at project scope and installs then disables those set to `false` (package plugins: design, security, release, video). Tell the user in one sentence: "Packages come disabled; the related command asks to enable them when needed; use `/tools` for status." Then ask the user to run `/reload-plugins`. If the claude CLI is missing, give the `/plugin install x@y` commands of the missing plugins and ask "Install and continue, or continue without the missing skills?".
3. Load the `caveman:caveman` skill (report language).
4. **Limit:** Read the limit (`docs/workflow/usage-limits.md` §1) and report it. Compare the estimated cost of the chosen depth with the remaining limit; say that you can stop between steps and continue later. If the level is yellow or red, say so in one line; do not stop.
5. **Code map:** Check whether codebase-memory-mcp tools (`index_repository`, `search_graph` etc.) exist in the session. If not, ask: "Install the code map? The AI queries code instead of reading it file by file; as the project grows it saves a lot of tokens per session."
   - **Install (Recommended):** The user installs it in their own terminal; do not run a remotely downloaded script yourself. Give the official commands:
     - Windows (PowerShell): `Invoke-WebRequest -Uri https://raw.githubusercontent.com/DeusData/codebase-memory-mcp/main/install.ps1 -OutFile install.ps1; Unblock-File .\install.ps1; .\install.ps1`
     - macOS/Linux: `curl -fsSL https://raw.githubusercontent.com/DeusData/codebase-memory-mcp/main/install.sh | bash`
     - The installer registers itself with Claude Code at user level (MCP, hook, skill). Then restart Claude Code and check with `/mcp`. For automatic indexing: `codebase-memory-mcp config set auto_index true`. Source: github.com/DeusData/codebase-memory-mcp
   - **Skip for now:** Enough for a small project; can be installed later.
6. **Notifications:** A desktop notification arrives when Claude asks a question or finishes a long task (`.claude/hooks/notify.mjs`). To turn off, set `KIT_NOTIFY=off`.
6b. **Dashboard:** Run `node .claude/hooks/dashboard.mjs`. Ask: "The dashboard shows decisions and step progress live and refreshes itself after every answer. Open it in the browser?" If yes, open it: Windows `start dashboard.html`, macOS `open dashboard.html`, Linux `xdg-open dashboard.html`.
7. If the idea is empty, ask: "What do you want to build? Describe it in 1-3 sentences."

## Step 1: Clarify the idea → `docs/product/prd.md`

Question the idea with the `mattpocock-skills:grilling` approach. Ask questions **with AskUserQuestion, in rounds** (at most 4 questions per round). For every question where possible, give 2-4 concrete options drawn from the idea, plus your recommendation; ask an open-ended question only if you cannot produce options.

Clarify in this order:
1. Problem and target user (who, in which situation, what do they use now?)
2. Value proposition and difference from competitors
3. MVP features: Draw 5-8 candidate features from the idea. Ask "Which ones should be in the first release?" with **multi-select**. Unselected ones become "Out of scope" (out of scope).
4. Write a draft of acceptance criteria for each MVP feature and get it approved.
5. Success criteria, revenue model (free / subscription / one-time / ads), budget (monthly infrastructure + AI), timeline.
6. Will there be personal data, payment and AI usage?

If the MVP looks big, ask shrinking it as a decision. State the risks in the idea openly. Write `docs/product/prd.md`, show its summary, get approval.

**1b. Research (expensive step, optional):** Ask: "Should I research articles, similar projects on GitHub and competing products related to the idea? Quick research is about 10-15% of the 5-hour limit." Options: Do it / Leave for later (a `/research` task is added to Phase 0). Recommended: "Do it" if the idea area is unfamiliar or the product is commercial, otherwise "Leave for later". If Do it, run the `/research` flow; selected features go into the PRD.

## Step 2: Project type

Ask with AskUserQuestion. Justify the options and your recommendation by the PRD:
- **Web app / SaaS:** A product used from the browser, landing page + panel. SEO, fast release, no store approval.
- **Mobile app:** Device features (camera, notifications, location), daily-habit product. Store process and two platforms.
- **Backend / API / automation:** A service without a UI, bot, data processing, API for other apps.

If the user wants more than one (e.g. web + mobile), first ask which one will be the MVP; the other enters the roadmap as a later phase.

Also ask: **Will the project have an AI (LLM) feature?** If yes, the AI add-on is installed. **Will it sell in Turkey or have Turkish users?** If yes, the Turkey add-on (`tr`) is recommended: KVKK cross-border transfer, e-Fatura/e-Arşiv, iyzico/PayTR notification signature (coded in web-saas and backend), İ/ı tests. Several add-ons with a comma: `--addons ai,tr`.

## Step 3: Installation

Tell the user in one sentence what will be done, then run:

```bash
# template path (kit/ is in the root): kit/ is deleted after the install
node kit/kit.mjs install --type <web-saas|mobile|backend> [--addons ai,tr] [--tool claude,codex,antigravity]
# init path (.kit.json → kit; if "local", .kit.local.json → kit, ask the user if that file is missing): the kit folder is not touched; --tool is not needed if the tool was chosen at init
node <kit>/kit/kit.mjs install --type <web-saas|mobile|backend> [--addons ai,tr] --project .
# npm path (.kit.json → kit = npx:tillerhand@<version>): with the same version. If the version is not exactly in the form 1.2.3 or differs from .kit.json → version, stop and ask the user
npx -y tillerhand@<version> install --type <web-saas|mobile|backend> [--addons ai,tr] --project .
```

Report the output. From now on `docs/architecture/stack.md` is the chosen type's file. Show the user the project structure (`docs/architecture/structure.md`) briefly: code will be organized by feature, the structure map (`.claude/structure.json`) will be enforced, experiments go under `sandbox/`. Suggest a commit: `chore: kit kurulumu (<tip>)`.

## Step 4: Technology decisions → `docs/architecture/stack.md`

Ask every decision in the **"Decision points"** section of `docs/architecture/stack.md` in order (dependent ones in sequence, independent ones in the same round, at most 4).
- From the catalog options, pick the 2-4 best suited to this project. Base your recommendation on the PRD (audience, budget, scale, team knowledge, SEO need etc.).
- For options that depend on version, price or free-tier information, verify only what changes: do not re-research a claim whose `(source: <url>, YYYY-MM-DD)` note in the catalog is newer than 90 days. Gather the claims without a note or with an old note, limited to the options you will present to the user, in a single `source-research` round at the start of the step (no separate research per decision). Next to a claim you verified, write the source and date note in this project's `stack.md`.
- If the user says "which is better, I'm not sure", explain the differences with a concrete example and ask again.

When all decisions are done:
1. Fill the "Chosen technologies" (chosen technologies) table in docs/architecture/stack.md.
2. If the choice differs from the recommended one, rewrite the Folder structure, Coding rules, Common AI mistakes and Verification sections of docs/architecture/stack.md to match the choice. Also adapt the files that depend on them: `.github/workflows/ci.yml`, `.claude/settings.json` permissions, `.env.example`, pre-commit settings and `.mcp.json`. Report the differences.
3. Fill the "Commands" section of `AGENTS.md`. Write the app's local address in the `preview:` line (e.g. `http://localhost:3000`); it stays empty in a project without a UI.
3a. **Installable on another computer:** Pin the runtime version: `.nvmrc` for Node, `.python-version` for Python (the version in stack.md). Fill the "Requirements" section of `README.md` (runtime and its version, system dependencies: database, ffmpeg etc., accounts) and its "Installation" section; the commands must match `AGENTS.md` "Commands". The lock file (`package-lock.json`, `uv.lock` etc.) is created at the first package install and goes into the commit.
3b. **Stack skills:** For web (React/Next) run `npx -y skills@1.7.2 add vercel-labs/agent-skills --skill react-best-practices --skill composition-patterns -a claude-code -y --copy`, for mobile with `--skill react-native-guidelines`. Read the incoming SKILL.md files before installing them (third-party content). For mobile, if the Maestro CLI is not installed, tell the user how to install it (`docs/workflow/mcp-catalog.md`).
3c. **3D (web, if the PRD has a 3D scene, product visualization or a WebGL effect):** three.js is asked as a `tech` decision. If chosen, three skills are copied from a pinned commit of `CloudAI-X/threejs-skills` (MIT, community): `threejs-fundamentals`, `threejs-performance` and, in React, `threejs-react-three-fiber`. For each: `curl -fsSL https://raw.githubusercontent.com/CloudAI-X/threejs-skills/0e181866f095b5f06d005133876e926515390d95/skills/<ad>/SKILL.md -o .claude/skills/<ad>/SKILL.md` (create the folder first). Read the files before installing them (third-party content). No skill is added for other topics (shader, light, loader); use Context7. 3D rules are in `ui-motion` → "3D".
4. `docs/decisions/log.md`: Check that no decision is missing from the log, record the technology stack as `docs/decisions/adr-0001-tech-stack.md` (template: `adr-template.md`).

## Step 5: Architecture → `docs/architecture/overview.md`, `docs/product/glossary.md`

With `mattpocock-skills:domain-modeling` and `mattpocock-skills:codebase-design`:
1. **Data model:** Show the table/entity draft. Ask unclear points as decisions: relation type, delete behavior (permanent / trash), personal data fields, retention period.
2. **Identity and authorization:** Sign-in methods (email + password, magic link, Google, Apple) and roles. Ask with multi-select.
3. **External services:** A table with monthly cost estimates; get approval for every paid service. If the chosen service has a connection in `docs/workflow/mcp-catalog.md` (GitHub, Stripe, Vercel, PostHog, Figma, Firebase, Linear), suggest installing it; the user connects the identity themselves (OAuth or environment variable). Add every service to `docs/operations/accounts.md` (owner, 2FA, expiry date; do not write passwords). For every paid service add a row to the "Alarms" (alarms) table in `docs/operations/spend-alarms.md` and ask the cap amount (recommended: 2 times the monthly estimate in unit economics).
3b. **Unit economics** (if it is a paid product): Fill the inputs of `docs/product/unit-economics.md` with estimates for price, commission, fixed and per-user cost. If the contribution margin is negative or the variable cost exceeds 30% of the price, ask it as a `cost` decision (price / usage limit / model choice).
4. **Environments:** Local / preview / prod separation.
5. `docs/product/glossary.md`: Main concepts, UI names and state transitions. Ask whether the UI will use the informal or formal "you" (Turkish "sen" or "siz").

If the AI add-on is installed, fill the model inventory in `docs/ai/guide.md`: Which feature uses which model? Ask this as a decision with the cost estimate.

## Step 6: Expert board → `.claude/agents/`, `docs/workflow/board.md`

Expensive step: state the cost first and ask by depth (see "Expensive steps" above).

Apply `.claude/board/rules.md` §5:
1. Propose a board based on the type, the PRD and the chosen stack. Explain briefly what the board is: Expert agents review the plan, the task, every commit and the phase. It is advisory; it stops on a critical finding; the decision is always the user's.
2. Get the members approved with **multi-select**; say that a new expert can be added.
3. Members work with the review role's model and effort (Step 0e, `docs/workflow/models.md`); do not ask separately. On the Pro plan, state the estimated cost of a full board meeting (`docs/workflow/usage-limits.md`).
4. Keep commit review on? Default on and light: at most 2 members, `haiku`, diff only.
5. Generate the agent files and fill their "This project" sections. Fill `docs/workflow/board.md`.
6. Say that the new agents load in the next session.

## Step 7: Design direction (if there is a UI)

Expensive step: state the cost first and ask by depth (see "Expensive steps" above). Run the `/design general` flow. Style direction, color, font and detail decisions are made with visual previews; at the end `PRODUCT.md`, `DESIGN.md` and `docs/design/design-guide.md` are ready. Skip this step for the backend type.

## Step 8: Roadmap → `docs/product/roadmap.md`

1. Split the MVP features into single-session tasks; keep the setup tasks in Phase 0. Make the first task of each feature "write the acceptance tests (red)" (`docs/quality/test-plan.md` §1a). For payment, AI, bulk notification and data-deleting features, add a feature flag task (`docs/operations/feature-flags.md`). From Phase 1 on, make the last task of every phase a "Refactor round" (complexity budget clean across the whole repo: `node .claude/hooks/budget.mjs --check`).
2. Ask: "Which feature should we start with in Phase 1?" (suggestion: the riskiest or most valuable one).
3. Ask: "What is the launch target?" (date / when features are complete / personal use only). If personal use, suggest deleting `docs/product/launch.md`.
4. Summarize the roadmap and get approval.

## Step 9: Closing

1. `docs/workflow/progress.md`: Active phase `Phase 0`, active task `G-001`, start step `9/9`, next step, pending decisions.
2. Run `node .claude/hooks/dashboard.mjs`.
3. Give the user a summary: number of decisions made, chosen stack, board members, design direction, MVP features, steps left for later, first task, remaining limit.
4. Suggest a commit: `docs: project plan`.
5. Last line: "Continue: `/build G-001`".
