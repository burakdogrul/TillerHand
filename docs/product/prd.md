# Product Requirements (PRD)

> Stage: **0 - Idea**. Fill it in before writing code. The `/start` command fills this file in together with you.
> Last updated: [YYYY-MM-DD]

## 1. Problem

[Who cannot do what, or finds what hard to do, and in which situation? 2-3 sentences.]

## 2. Target user

| Persona | Who? | Biggest pain | What do they use now? |
|---|---|---|---|
| [Primary] | | | |
| [Secondary] | | | |

## 3. Value proposition (value proposition)

[One sentence: "With [product], [user] gets [result], because [difference]."]

## 4. Success criteria (measurable)

- [ ] [E.g. 50 registered users in the first 30 days]
- [ ] [E.g. time from signup to first value < 3 minutes]
- [ ] [E.g. monthly infrastructure cost < X TL]

## 5. MVP scope

Each feature is a user story + acceptance criteria. A feature without acceptance criteria is not ready.
Each criterion has an id (`AC-01.1`). Acceptance tests carry this id in the test name; the `/dashboard` reads MVP progress from **test results**, not from checkboxes (`docs/quality/test-plan.md` §1a).
The label "Priority" (priority) stays Turkish: the dashboard reads it.

### AC-01: [Feature name]
**Story:** As a [user], I want to [action], so that [benefit].
**Acceptance criteria:**
- [ ] AC-01.1: [Observable behavior: "When an invalid email is entered, the form is not sent and an error message is shown"]
- [ ] AC-01.2: [...]
**Priority:** Must have / Nice to have

### AC-02: [Feature name]
...

## 6. Out of scope (out of scope: NOT built in this release)

This list stops the AI from widening the scope. Write every "later" idea that comes to mind here.

- [E.g. Multi-language support]
- [E.g. Team/organization accounts]
- [E.g. Mobile app]

## 7. Main user flows

```
[Flow 1: Sign-up]  Landing → Sign up → Verify email → Onboarding → Dashboard
[Flow 2: ...]
```

## 8. List of screens / endpoints

| Name | Type (page/screen/endpoint) | Who can access | Related feature |
|---|---|---|---|
| | | | |

## 9. Constraints

- **Budget:** [monthly cap for infrastructure + AI API]
- **Time:** [MVP target date]
- **Legal:** [Is personal data processed? Is payment taken? → `docs/legal/privacy-kvkk.md`]
- **Technical:** [Required platform, integrations, etc.]

## 10. Revenue model (if any)

[Free / subscription / one-time / ads. Price. Payment provider.]

## 11. Open questions

- [ ] [Questions without an answer yet that affect a decision]
