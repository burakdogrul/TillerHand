# AI / LLM Features

> This file applies if the project calls a language model (LLM). It is read together with `docs/architecture/stack.md`.
> AI features break in two places: **quality** (output that quietly gets worse) and **cost** (a bill that quietly grows).
> The rules in this file exist to make both visible.

## 1. Model inventory

| Feature | Model | Why this model | Average input/output tokens | Cost per request | Eval set |
|---|---|---|---|---|---|
| [E.g. invoice summarization] | [model id] | [speed / quality / price] | | | `evals/summary.jsonl` |

- The model id is not embedded in code; use an `AI_MODEL_*` environment variable or a single config file.
- For simple jobs (classification, extraction) try a small/cheap model first; move up to a bigger one only if the eval fails.
- Check the provider's current model list and prices in its docs; the model names in the AI's memory may be outdated.

## 2. Prompt management

- Prompts live in the `prompts/` folder, in separate files; they are not embedded in code as long strings.
- At the top of each prompt file: purpose, expected input, expected output format, date of last change.
- A prompt change is a code change: it is committed, passes the eval, and is written to the CHANGELOG.
- If structured output is needed, use the provider's structured output / tool feature and schema validation (Zod / Pydantic); do not extract from free text with regex.

## 3. Eval (quality test)

When a prompt or model changes, "I think it got better" is not enough.

- At least 20 cases per feature under `evals/`: typical examples + hard examples + malicious examples.
- Format: `ai/evals/cases.jsonl` (each line is one case; see the example file).
- Check types: exact match, schema validity, contains/does not contain, and if needed scoring with a model (LLM-as-judge, with written scoring criteria).
- **Acceptance threshold:** [e.g. 90% of the cases must pass, 100% of the malicious cases]. Below the threshold there is no merge.
- Every real example that gave a bad result in production (with personal data removed) is added to the eval set.

## 4. Cost control

- [ ] Every call has a `max_tokens` limit.
- [ ] There is a daily/monthly request or token limit per user; when it is exceeded, a clear message is shown.
- [ ] A monthly spend limit and 50%/80% alarms are set in the provider's dashboard; recorded in the `docs/operations/spend-alarms.md` table.
- [ ] Overall daily budget: warning at 80%, at 100% the AI feature's flag closes automatically (`docs/operations/spend-alarms.md` → "In-app protection").
- [ ] Prompt caching is used for repeated long context (system prompt, documents).
- [ ] Every call is logged: feature, model, input/output tokens, duration, estimated cost, user id (not the content).

## 5. Security

- [ ] The API key is on the server only; the client does not call the provider directly.
- [ ] **Assume prompt injection:** User input and content from outside (web page, email, file) is data, not instructions. The system prompt says this clearly; but this is not the only defense.
- [ ] If the model can trigger a tool/action (sending email, deleting, payment, DB write): allowed actions are on an allowlist, irreversible actions ask for user confirmation, the model cannot reach another user's data.
- [ ] Model output is not rendered as HTML (XSS); it is not run as code/SQL.
- [ ] The system prompt holds no secret, internal URL or other users' data (assume it can be leaked).

## 6. Privacy

- [ ] Which personal data goes to the model is written in the data inventory in `docs/legal/privacy-kvkk.md`.
- [ ] The provider's data retention and training-use policy was checked (API data is usually not used for training; verify).
- [ ] Personal data that is not needed (ID number, phone, address) is removed or masked before it is sent to the model.
- [ ] The basis for transfer abroad is set (`docs/legal/privacy-kvkk.md` §4).

## 7. Resilience and UX

- [ ] Retry with backoff for timeouts, 429 (rate limit) and 5xx; a limited number of attempts.
- [ ] What happens if the provider goes down? (Fallback model / turn the feature off for now / clear error.)
- [ ] Streaming and a cancel button for long responses.
- [ ] An "AI can make mistakes" notice in the interface, and the user can edit/approve the output.
- [ ] User feedback (👍/👎 or a "wrong" button) is logged; it is a source for the eval set.

## Go live (add-on)

- [ ] The eval set is above the acceptance threshold (note the result in the CHANGELOG)
- [ ] The prod key is separate; the spend limit and alarm are set in the prod account
- [ ] Per-user limits are on in prod
- [ ] Malicious cases (prompt injection, data exfiltration attempts) passed in the eval
- [ ] Token and cost logs can be seen in the dashboard

## Maintenance (add-on)

- Weekly: AI cost (total and the top 10 per user), error/timeout rate, 👎 feedback.
- Monthly: Run the eval set again (even if the provider did not change behavior under the same model name), add new hard cases.
- Quarterly: **Deprecation dates** of the models in use, price changes, an eval comparison with a cheaper/newer model.
