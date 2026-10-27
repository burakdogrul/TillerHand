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
                  taslak → iptal (cancelled)
```

## Writing rules

- Code: English (`camelCase` variable, `PascalCase` component/type, `snake_case` DB field).
- UI text: Turkish; formal or informal "you" ("siz" or "sen")? → [pick: sen]
- Date: `GG.AA.YYYY`, money: `1.234,56 ₺` (`tr-TR` with `Intl`).
