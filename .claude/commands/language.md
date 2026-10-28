---
description: Changes the language the AI talks to you in (questions, answers, dashboard, status texts).
argument-hint: [empty | language name or code]
---

Argument: $ARGUMENTS

1. Show the current language: `node .claude/hooks/lang.mjs --show`.
2. If the argument names a language, use it. Otherwise ask with AskUserQuestion, in the current language: Turkish / English / Other. With Other the user writes the language name; turn it into a BCP-47 code (`de`, `pt-BR`) and confirm in one sentence if unsure.
3. `node .claude/hooks/lang.mjs --set <code>`.
4. If the code is not `tr` or `en`: translate `node .claude/hooks/lang.mjs --export --missing` into that language (keep placeholders in braces such as `{command}`, `{step}` exactly), pass the JSON to `node .claude/hooks/lang.mjs --write` on stdin, then `--check` must print `ok`.
5. `node .claude/hooks/dashboard.mjs` to rebuild the dashboard.
6. From the next sentence on, every question, option, answer, status block and document text you write is in the new language. Documents already written stay as they are: say so in one line and ask whether to translate them (that costs tokens). Bold labels such as `**Active phase:**` never change; the tools read them.
