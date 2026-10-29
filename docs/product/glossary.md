# Glossary

> **One** name for every concept in the project. If the AI says `customer` in one place, `client` in another and "Member" on screen,
> the code and the interface fall apart. When a new concept appears, add it here first, then use it in code.
> `/start` pulls the first terms from the PRD.

| Term (in the UI) | In code | Definition | Do not confuse with / do not use |
|---|---|---|---|
| [Customer] | `customer` | [The person or company that is invoiced] | `client` (clashes with the HTTP client), "Member" |
| [Invoice] | `invoice` | [...] | `bill` |
| [User] | `user` | The account that signs in to the app | Not the same thing as Customer |

## States (status fields)

The states a record can have and the transitions between them. This stops the AI from inventing a new state.

```
[invoice.status]: draft → sent → paid
                                  ↘ overdue → paid
                  draft → cancelled
```

## Writing rules

- Code: English (`camelCase` variable, `PascalCase` component/type, `snake_case` DB field).
- UI text: [language]; formal or informal "you", if the language has both → [pick]
- Date and money: format with `Intl` and the UI locale (e.g. `tr-TR`: `29.10.2026`, `1.234,56 ₺`) → [locale]
