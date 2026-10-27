---
description: Updates the project to the kit's latest version on GitHub (commands, agents, hooks, checklists).
argument-hint: [empty | --addons ai,tr | --tool claude,codex,antigravity]
---

Extra argument: $ARGUMENTS

1. Read `.kit.json`: current version, `source` (kit repo address), project type, add-ons.
2. If there are uncommitted changes, stop and propose committing first (the update writes files).
3. Clone the kit into a temp folder and run the update:

```bash
git clone --depth 1 <kaynak> "<geçici klasör>/vibe-kit"
node "<geçici klasör>/vibe-kit/kit/kit.mjs" update --project . $ARGUMENTS
```

4. Report the output:
   - **Updated / added** files.
   - **Conflicts (`.kit-new`):** For each, summarize the difference between your change and the kit's new version. Ask how to merge as a **decision**: take the kit's / keep mine / merge. Then delete the `.kit-new` file.
   - From the clone's `kit/CHANGELOG.md`, summarize the notes from the current version to the new version. Show the **"Elle uyarla"** (adapt manually) items (project-owned files such as AGENTS.md, CLAUDE.md, docs/architecture/stack.md, settings.json) one by one and ask for each whether to apply it.
4a. **Language:**
   - If `.kit.json` has no `lang` field, the project was set up before language selection existed (Turkish is assumed): ask the language once (in the current conversation language; Turkish / English / Other) and run `node .claude/hooks/lang.mjs --set <kod>`.
   - If the language (newly chosen or existing) is not `tr` or `en`, run `node .claude/hooks/lang.mjs --check` after every update. If keys are missing, translate the output of `node .claude/hooks/lang.mjs --export --missing` into that language and pass it to `--write` via stdin.
4b. If the new version enabled new plugins, list them with `node .claude/hooks/plugins-sync.mjs`; if the user approves, install with `--install`, then suggest `/reload-plugins`. If a package definition changed (`.claude/hooks/tools.mjs` → `PAKETLER`), show the status with `node .claude/hooks/tools.mjs`.
5. Delete the temp folder. Propose a commit: `chore: kit <eski> → <yeni>`.
