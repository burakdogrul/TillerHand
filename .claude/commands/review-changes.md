---
description: Reviews changes with independent review agents (including a security audit when needed).
argument-hint: [empty = uncommitted changes | main..HEAD | commit hash]
---

Range to review: $ARGUMENTS (if empty, `git diff HEAD` and untracked new files).

Do not review your own code yourself; hand it to independent agents.

0. **Already reviewed?** If the range is empty (uncommitted changes), run `node .claude/hooks/commit-gate.mjs --status`. If it says "Onay geçerli", these changes were reviewed in the end-of-task meeting: do not review again, report the approval and the gate status; review anyway if the user explicitly asks. If it says "Son onaydan sonra değişen: …", do the steps below only with those files.
1. See the changed files with `git diff --stat`.
2. Run the **`code-reviewer`** subagent with the review role's `model` and `effort` (`docs/workflow/models.md`; step 3 too). Give it the range and (if known) the task id. If the task has a spec under `docs/product/specs/`, give that too: was the expected behavior met, was the must-not-change behavior broken?
3. If the change touches any of these, also run the **`security-auditor`** subagent in parallel: auth, authorization, payment, webhook, file upload, personal data, DB access rules, environment variables, AI/LLM calls.
   If the board is set up, also add the board members relevant to the change (`.claude/board/rules.md` §3, at most 3; 1 if the limit is yellow).
   At the same time, use `ponytail:ponytail-review` to look for unnecessary code, over-engineering and places that will break under load. If the UI changed, also run `impeccable:impeccable` → `audit`.
4. Merge the agents' findings, remove duplicates, order by severity:

```
[KRİTİK|ÖNEMLİ|KÜÇÜK] dosya:satır — sorun. Öneri.
```

5. If you disagree with a finding, write the reason in one line; do not drop it silently.
6. Last line: **Commit'e hazır** (ready to commit) / **Önce düzelt: [maddeler]** (fix first: items).

Do not fix the findings. Ask which ones to fix with a **multi-select** (KRİTİK ones marked as recommended). Then write the status block.
