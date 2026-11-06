---
description: Builds a quick slice the user can click, on a try/<topic> branch with fake parts. Nothing here reaches other people; /lock hardens it.
argument-hint: [what to try, one sentence]
---

To try: $ARGUMENTS

The user sees the product fast and keeps changing it. This is not a shortcut to "done": `/lock` reviews and hardens everything here before it reaches `main`. Until the MVP is released, only the user tries the product, on their own computer.

**Use `/build` instead** for real sign-in, payment, personal data or data deletion, and for bug fixes on locked code.

## Start

1. If the repo has no commit yet, finish `/start` Step 4b first.
2. If a `try/*` branch exists, continue on it and read its note. A second feature goes on the same branch. Otherwise, from `main`: `git switch -c try/<topic>` (`<topic>`: lower case, digits, `-`). This asks the user once per trial.
3. Write `docs/product/try/<topic>.md`: one sentence on what the user should be able to do. Later sections: `Rounds`, `Choices`, `Fake parts`. After `/clear`, continue from this note.
4. **External service:** If the slice needs a service (an AI model, a map, a payment sandbox), ask with AskUserQuestion. The user decides, per service; they can switch in any round:
   - **Fake response (Recommended):** free, no key. The real result stays unknown until `/lock`.
   - **Real result with my own key:** shows what the service really does, and it can cost money. Add the variable name to `.env.example`. The user writes the key into `.env` themselves; never read or write that file. Call the service from server code only: no `NEXT_PUBLIC_` or `EXPO_PUBLIC_` prefix, and the key never goes into client code, chat, logs or fake data. A mobile app with no server of its own does not get this option. Tell the user to set a spending limit at the provider.

   Write the choice under `Choices`.

## Build

- Real folder structure (`.claude/structure.json`), real screens, the project's stack and the style chosen in `/start`. This code stays; `/lock` builds on it.
- Only what the sentence in the note needs. No `/design` brief, no board, no tests: they come with `/lock` (AGENTS.md rule 7). Test files stay with `test-writer`.
- **Fake parts stay swappable.** Per feature, keep them in one place behind the function the screens call. Name fake-only files `*.fake.*`. Mark any other fake line with a `try:fake` comment. List each one under `Fake parts`.
- Fake data survives a page refresh (browser storage or a local file).
- Records carry an owner id from the start, even with a fake user.
- Fake sign-in works only when `NODE_ENV === 'development'`, so an unset value keeps it off.
- All guards still apply. Never use real personal data or a real payment.

## Show it

Keep the `dev` command from AGENTS.md → Commands running in the background, and stop it only when the user is done. Bind it to `localhost` so that only this computer reaches it; take the option from the stack's docs. The user's own click is the evidence.

- **Web:** give the address and what to click.
- **Backend:** give one sample request and the expected response, or a small page that sends it.
- **Mobile:** start the Expo preview and tell the user how to open it on their own phone.

Say in two lines what to try and what is fake.

## Round

1. The user says what to change. Make the change, show it again, add one line to `Rounds`.
2. Commit each round on the branch. The commit gate asks for no review on a `try/*` branch; `/lock` reviews the whole slice. Message: `wip: try <topic> round <n>`.
3. **Undo a round:** `/rollback`.
4. **Drop the trial:** ask first. On a yes, switch to `main`, then delete the branch.
5. **User likes it:** suggest `/lock`.

## Never here

- No deploy, no shared address, no `git push` of a `try/*` branch: a host can publish a pushed branch by itself, with fake sign-in on it.
- No merge into `main`: only `/lock` does that.
- No paid service unless the user chose it above.
