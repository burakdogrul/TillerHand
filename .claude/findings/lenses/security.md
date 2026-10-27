# Lens: Security

**Perspective:** Be an experienced attacker who wants to attack this product, and the application security expert tasked with stopping them. Question: "What can be stolen, changed or stopped without anyone noticing?"

**ID prefix:** `SEC-` · **Agent:** `security-auditor` · **Skill:** `security-review`

## Checklist (based on OWASP Top 10)

1. **Access control:** Server-side authorization on every endpoint; IDOR (someone else's record); role escalation; is RLS on for every table?
2. **Authentication:** Session lifetime, password reset flow, rate limit, account enumeration (leaking registered emails).
3. **Injection:** SQL (string concatenation), command, template, log injection; XSS (user content rendered as HTML, `dangerouslySetInnerHTML`).
4. **Secrets:** Secrets in code or history, secret variables that reach the client bundle (`NEXT_PUBLIC_`, `EXPO_PUBLIC_`), tokens in logs.
5. **Security configuration:** CORS `*`, security headers (CSP, HSTS), debug and `/docs` open in prod, default passwords.
6. **Dependencies:** Known vulnerabilities, abandoned packages, very new or suspicious packages.
7. **Data protection:** Encryption of sensitive data, access to backups, file upload (type, size, public storage).
8. **Webhooks and integrations:** Signature verification, idempotency against replay attacks.
9. **AI agent and LLM security:** Prompt injection paths, actions triggered by the model, `.mcp.json` and `.claude/` changes, `@latest` MCP versions.
10. **Adversarial tests:** Do the tests in `docs/quality/test-plan.md` §1b exist for every endpoint that returns data?

## Trail of Bits skills

| Skill | Used for |
|---|---|
| `differential-review` | Security impact and blast radius of recent changes (with git history) |
| `insecure-defaults` | Hard-coded credentials, fallback secrets, insecure default settings |
| `sharp-edges` | Error-prone APIs and dangerous configurations |
| `static-analysis` | Semgrep and CodeQL scan, SARIF parsing |
| `supply-chain-risk-auditor` | Supply chain risk of npm and PyPI dependencies |
| `agentic-actions-auditor` | Security of Claude/AI workflows in `.github/workflows/` |
| `fp-check` | Verifying that each candidate finding is not a false alarm (protocol §2) |

## Tools

| What | Command |
|---|---|
| Static analysis | `semgrep scan --config p/default --config p/owasp-top-ten` (or `docker run --rm -v "$PWD:/src" semgrep/semgrep semgrep scan ...`) |
| Dependency vulnerabilities | `npm audit --omit=dev` · `uv run --with pip-audit pip-audit` |
| Secret scan | `gitleaks detect --source .` (if installed); otherwise the grep in `docs/security/checklist.md` §9 |
| Configuration | The items of `docs/security/checklist.md`, one by one |

Never write the value of a secret in the report; write only file:line and the type.
