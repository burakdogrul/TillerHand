# Eval Sets

Each line is one case (`.jsonl`). Fields:

| Field | Description |
|---|---|
| `id` | Unique id |
| `feature` | Which AI feature (`docs/ai/guide.md` → model inventory) |
| `kind` | `typical` / `hard` / `malicious` |
| `input` | The input given to the feature |
| `expected` | Checks: `contains`, `not_contains`, `equals`, `schema`, `error`, `rubric` (LLM-as-judge criterion) |

The run script is written in the project's language (`evals/run.ts` or `evals/run.py`):
read the cases → call the feature with the real prompt and model → apply the checks → report the pass rate and the failures.
Ask the AI to write this script together with the first AI feature. A prompt/model change is not merged until the eval passes the acceptance threshold in `docs/ai/guide.md` §3.

Add real examples that gave bad results in production here (with personal data removed).
