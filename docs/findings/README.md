# Findings

Reports that scan the project through different expert eyes. Each report ranks at most the 20 most important findings with evidence, a 0-100 severity score and a fix method; it also gives a 0-100 health score for the area. Method: `.claude/findings/protocol.md`.

| Command | Viewpoint | Folder |
|---|---|---|
| `/findings-tech` | Senior architect: bugs, duplicate and unused code, structure, tests | `tech/` |
| `/findings-business` | Industry expert: workflows, business rules, revenue, competition | `business/` |
| `/findings-security` | Attacker: access, injection, secrets, dependencies | `security/` |
| `/findings-ux` | User and UX researcher: flows, accessibility, copy | `ux/` |
| `/findings-perf` | Performance and FinOps: slow paths, cost | `perf/` |
| `/findings-legal` | Compliance expert: KVKK, regulation, license (not legal advice) | `legal/` |
| `/findings-all` | All of the selected types + a combined summary | `summary-*.md` |

Each type's folder holds dated reports and a copy of the latest report (`latest.md`).

## Raporlar

The `/dashboard` dashboard reads this table; do not change the columns. Write health and the previous score in the `NN` format.

| Date | Type | Health | Previous | Findings | Critical | Report |
|---|---|---|---|---|---|---|
