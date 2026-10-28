# Decision Protocol

> This project is **question-driven**. The user makes the decisions; the AI prepares the options, recommends, implements and reports.
> Until the user says "don't ask" about a topic, not a single decision on that topic is made on its own.

## 1. What is a decision point?

Every choice that affects one of the following is a **decision point** and is asked:

| Topic (code) | Examples |
|---|---|
| `product` | Feature scope, priority, MVP boundary, user flow, price, target audience |
| `tech` | Language, framework, database, auth method, hosting, adding a library, API style, architecture, folder structure |
| `design` | Style direction, color, typeface, page/screen layout, component style, amount of animation, icon set, dark theme |
| `content` | Interface texts, tone of voice, form of address, landing page copy, email texts |
| `data` | Data model, fields, relations, retention period, deletion behavior, migration |
| `security` | Authorization model, roles, session length, rate limits, personal data handling |
| `cost` | Choice of paid service, plan tier, AI model choice, spending limits |

Projects set up before 3.48 may use the old Turkish codes (`urun`, `teknik`, `tasarim`, `icerik`, `veri`, `guvenlik`, `maliyet`); they mean the same topic. Write the English code.

**Not a decision point** (not asked; apply it and report it briefly in the status block): file/variable/function names (follow `docs/product/glossary.md`), the internal layout of code, formatting, repeating a pattern the project has already decided.

If unsure, it is a decision point. Ask.

## 2. How to ask

1. **Use the AskUserQuestion tool.** If the tool is missing, write the same structure as a numbered list and wait for the answer.
2. **Context first (1-3 sentences, inside the question text or right before it):** Which stage are we in, what does this decision affect, is it easy or hard to reverse?
3. **2-4 options.** Put the one you find best **first**, with **"(Recommended)"** at the end of its label.
4. **In each option's description:** What it is, when it is better, and what it costs. Example: "Next.js: best for products that need SEO and server-side work, the AI knows this ecosystem best; steeper learning curve and higher hosting cost than a Vite SPA."
5. **Make the reason for the recommendation specific to this project:** Base it on the user in the PRD, the budget, the scale and the user's earlier decisions. A generic "most popular" reason is not enough.
6. **At most 4 questions per round.** Group independent questions of the same step into one AskUserQuestion call: every separate call is one more round, and every round re-reads the whole context. Ask dependent decisions in order (framework first, then the library that depends on it).
7. If the user gives a free answer with "Other", evaluate it too. If you find it risky, say why once; if the user insists, apply it and record it.
8. **Freshness:** For options that depend on information that can change (version, price, deprecation), do not trust your memory. Research first if needed (`docs/workflow/skills.md` → research).
9. **Visual preview is mandatory for design decisions.** See section 5.

## 2a. Cost of reversal: one-way / two-way door

Classify every decision before asking and state it in the question text:

- **Two-way door:** Easy and cheap to change later (button text, color, internal use of a library). Asked normally.
- **One-way door:** Expensive or impossible to reverse (database, auth provider, data model, payment provider, domain name, personal data handling, store package name, public API contract). Extra rules:
  1. The question text says "One-way decision: changing it later costs [this much]".
  2. **For database and auth decisions** (in the Full profile, all one-way decisions), the **decision council** (`.claude/board/council.md`) meets before you ask; for other one-way decisions, get the opinion of `board-architect` (and `security-auditor` if relevant). Council: 3 advisors answer the same question with different models, rank each other anonymously, and `board-chair` recommends. The recommended option is the council's recommendation; add the council vote and the minority opinion to each option's description. If the limit is red, get the opinion of `board-architect` (and `security-auditor` if relevant) instead of the council.
  3. After the answer an ADR is mandatory: `docs/decisions/adr-NNNN-*.md` (template: `adr-template.md`).
  4. If the user is not in a hurry, for big one-way decisions also offer the option "think about it for a day, then decide".

## 3. When the answer arrives

1. Add the decision to the **"Decision log"** table in `docs/decisions/log.md` (date, stage, topic, question, chosen, door: `one-way`/`two-way`, decided by: `user`).
2. For decisions that affect the architecture or the long term, write an ADR (`docs/decisions/adr-NNNN-*.md`) and add it to the ADR list in `log.md`.
3. Update the document the decision affects (stack, architecture, design guide, PRD, glossary…).
4. Then implement.

## 4. Question mode

The state is kept in the `**Question mode:**` line of `docs/workflow/progress.md` (before 3.48 `**Soru modu:**`). Default: `on · closed topics: none`.

| What the user says | What you do |
|---|---|
| "don't ask", "never ask", `/ask-mode off all` | All topics closed |
| "don't ask about design", "you pick the colors", `/ask-mode off design` | Only that topic closed (match it to the topic codes; if unsure, ask which topic is meant) |
| "ask again", "keep asking", `/ask-mode on [topic\|all]` | Topic(s) open again |

**On a closed topic:** Pick the "(Recommended)" option and apply it. Write `automatic` in the log's "Decided by" column. List it in the "Auto decisions" line of the status block. Even when the design topic is closed, produce the previews under `.previews/` so the user can look later.

**Regardless of question mode, always ask for approval:** data deletion, prod deploy, an action that spends money, any command that cannot be undone, the "Never" list in `AGENTS.md`.

## 5. Visual preview for design decisions

Every `design` decision is asked with visuals. The user chooses an image, not text.

1. Produce one sample per option: `.previews/NN-topic/a.html`, `b.html`, `c.html` (NN is the sequence number). Also an `index.html` that shows them all side by side or one below the other.
2. Build the samples with **real content** (the product name, real titles and texts from the PRD); no lorem ipsum.
3. Produce each sample with the skill that `docs/workflow/skills.md` maps to that option. For example, the "Premium" option with the premium design skill, the "Minimal" option with the minimal skill. This makes the difference between options real.
4. For big decisions (style direction, page layout, home screen), each option is a separate full section. For small decisions (color palette, typeface pair, corner/shadow, button style), side-by-side samples on one comparison page are enough.
5. Open the preview: If a browser tool exists, open `index.html`, take screenshots at desktop and mobile width and show them. If not, give the file path.
6. Then ask with AskUserQuestion: options A/B/C, with the difference of each and when it is better in the descriptions. The user may want a mix ("A's layout, B's colors"); verify that with a new preview.
7. The choice is written to the decision log in `docs/design/design-guide.md` and to `docs/decisions/log.md`. `.previews/` stays out of git.

## 6. Status block (at the end of every answer)

In short, compressed language (caveman), at most 4 lines:

```
── Status ─────────────────────────────
Phase: Phase 1 · Task: G-012 (7/23) · Question mode: open · Limit: 5h %34 weekly %5
Done: signup form + validation, tests green · Board: APPROVE (ux, qa)
Auto decisions: none
Next: G-013 password reset · pending decision: email service
```

- Phase and task come from `docs/workflow/progress.md`; the task count is checked/total in `docs/product/roadmap.md`.
- Limit: `get_usage` on desktop, `node .claude/hooks/usage.mjs` in the terminal (if it cannot be read, "unknown").
- Board: if a meeting happened this turn, its result and attendees.
- "Next" must always be concrete; if a decision is awaited, say so.
- In a turn where you only ask a question (waiting for the answer), put the status block as a single line before the question.

## 7. Language

- **Questions, option descriptions, documents and texts the user sees:** Complete sentences, proper prose in the conversation language.
- **Status block, progress notes, code explanations:** Short and compressed (caveman).
