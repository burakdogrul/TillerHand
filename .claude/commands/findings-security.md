---
description: Security findings report. Scans the project through the eyes of an attacker: access control, injection, secrets, dependencies, configuration, AI agent security. Scores the 20 most important findings out of 100.
argument-hint: [empty = whole project | folder/feature | --since <commit|tarih>]
---

Type: **security** · Scope: $ARGUMENTS

1. Read `.claude/findings/protocol.md` and apply its steps in order.
2. Use `.claude/findings/lenses/security.md` for the perspective, checklist and tools.
2a. **Package:** `node .claude/hooks/tools.mjs --required security`. If it is off (exit 2), ask whether to turn it on, with its cost; if refused, continue with the tools in the lens, without the deep scan.
2b. If the `claude-security` plugin is installed, propose a deep scan: `/claude-security scan codebase at medium` (`scan changes` if the scope is `--since`). The plugin itself asks about time and token cost; on the Pro plan, read the limit and tell the user. The result is written to the `CLAUDE-SECURITY-<zaman>/` folder (not in git). Take its verified findings into the report with source `claude-security`; do not count the same finding twice.
3. Write the report in the `.claude/findings/report-template.md` format under `docs/findings/security/`.
4. Do not change code. Only write the report, then ask which findings go into the roadmap.
