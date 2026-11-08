# Legal / KVKK / Privacy

> This is a checklist, not legal advice. Before you launch a product that processes personal data or takes payments,
> have a lawyer check the texts.
> If you serve users in Turkey, KVKK (6698) applies; if you have users from abroad, GDPR may apply too.

## 1. Data inventory (do this first)

| Data | Why it is collected (purpose) | Legal basis | Where it is stored (country) | How long | Who it is shared with |
|---|---|---|---|---|---|
| Email | Account, notification | Performance of a contract | [Service, region] | Until the account is deleted | [Email service] |
| IP, device information | Security, error tracking | Legitimate interest | | | [Sentry / GlitchTip] |
| [...] | | | | | |

Rule: **No purpose, no collection.** Do not ask for data you do not use.

## 2. Texts that must be live

- [ ] **Privacy notice (KVKK art. 10):** Data controller, purposes, parties it is transferred to, collection method, rights.
- [ ] **Privacy policy:** Can be combined with the privacy notice. Link in the sign-up form and in the footer.
- [ ] **Cookie policy + cookie consent banner:** Non-essential (analytics, marketing) cookies are **not loaded before consent**. The reject button must be as visible as the accept button.
- [ ] **Terms of use / membership agreement.**
- [ ] **Explicit consent text:** Only for processing that needs explicit consent (marketing, some cases of transfer abroad, special categories of data). Do not merge it into the same checkbox as the privacy notice.
- [ ] For a paid product: **Distance sales contract** and **pre-information form** (Law no. 6502), return/withdrawal terms.

## 3. User rights processes

- [ ] The user can see / download their data (or request it).
- [ ] **Account deletion** can be done inside the app and really deletes/anonymizes (the status in backups is stated in the text).
- [ ] The application channel (email address) is written in the text; applications are answered **within 30 days at most**.

## 4. Transfer of data abroad

Services with servers abroad, such as Vercel, Supabase, AWS, OpenAI, Sentry = transfer abroad.

- [ ] Which services keep data in which region is written in the data inventory.
- [ ] The EU region was chosen where possible.
- [ ] The transfer basis under KVKK art. 9 was determined (after the 2024 amendment: if a standard contract is signed, notification to the Personal Data Protection Authority (KVKK Authority) is required within the deadline). **Ask a lawyer.**

## 5. Other obligations

- [ ] The **VERBİS** registration obligation was checked (an exemption may apply based on the number of employees / balance sheet thresholds).
- [ ] If commercial email/SMS is sent: prior consent, **İYS** (Message Management System) registration, an opt-out link in every message.
- [ ] In case of a data breach: the procedure for notifying the Personal Data Protection Board (KVKK Board) within **72 hours** is written in `docs/operations/maintenance.md` → incident response.
- [ ] If the product is not aimed at children, the age limit is stated in the terms of use.
- [ ] The licenses of the fonts, icons, images and libraries used allow commercial use.

## 6. Extra requirements for mobile stores

See `docs/architecture/stack.md` (mobile) → the "Go live (extra)" section: App Store privacy labels, Google Play Data Safety form, in-app account deletion.

## 7. Project memory

The kit's project memory (`memory` skill) keeps notes, person cards and session receipts. It is about the people who build the product, not the product's users, but it is still personal data once it names someone.

- [ ] A person card is data about a third person (a colleague, a customer contact). Keep only role, relation and the contact the user wrote; nothing about health, religion, ethnicity, political view, union membership, sexual life, criminal record, biometric or genetic data, no national ID or passport number, nothing about a child.
- [ ] Personal memory (`.claude/state/memory/`) stays on this machine and out of git; the commit check blocks it if it is staged. Settings keep the AI's file tools out of the default folder, but a shell command can still read it: treat it as private, not as secret. Shared notes (`docs/memory/`, `visibility: project`) are in git and refused if they hold an email, phone, ID or IBAN.
- [ ] The folder can still leave the machine another way: a Docker `COPY .`, a zip of the project, a synced folder (OneDrive, Dropbox, iCloud) or a deploy that uploads the whole folder. Exclude `.claude/state/` there (`.dockerignore`, the sync tool's exclude list).
- [ ] Recalled notes are sent to the AI provider with the prompt. With a provider abroad that is a transfer abroad (section 4); turn recall off with `memory: { "inject": false }` in `.kit.local.json` if that is not acceptable.
- [ ] Retention: notes stay until someone removes them. `node .claude/hooks/memory.mjs forget <name|id> [--dry-run]` removes a personal note, or a person card with the receipt lines and archive entries that name the person (it does not edit `journal.md`). A shared note in `docs/memory/` is removed with git and stays in the git history until the history is rewritten; `export` gives everything as JSON for an access request.
- [ ] This is not legal advice: if the memory will hold data about people outside the team, ask a lawyer.

## 8. Review

Update this file and the live texts every **3 months** and whenever a new data type / a new service is added.
