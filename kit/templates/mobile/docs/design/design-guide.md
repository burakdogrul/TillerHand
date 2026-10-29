# Design

> The interface has three sources of truth:
> - `PRODUCT.md`: product context (who, for what). Written with Impeccable `init`, fed from the PRD.
> - `DESIGN.md`: visual world and design tokens (color, type, spacing, corners, shadow, motion). Impeccable writes it; components use only these tokens.
> - This file: the chosen direction, the design decision log and the lasting rules that apply on every screen.
>
> Decisions are made with `/design` using **visual previews** (`docs/workflow/decision-protocol.md` §5). If a new color, size or component
> is needed, it is asked as a decision first, then added to DESIGN.md. No raw colors or arbitrary sizes in code.

## 1. Chosen direction

| Area | Choice | Skill | Preview | Date |
|---|---|---|---|---|
| Style direction | [e.g. Premium / Apple style] | [e.g. taste-skill:high-end-visual-design] | `.previews/01-stil/b.html` | |
| Color palette | | ui-ux-pro-max | | |
| Font pair | | ui-ux-pro-max | | |
| Corners / shadow / motion | | | | |
| Dark theme | | | | |
| Form of address (informal/formal) | | | | |

## 2. Design decision log

| # | Date | Screen/scope | Question | Chosen | Preview |
|---|---|---|---|---|---|

## 3. Components

- Shared components live under `components/`: `Button`, `TextField`, `Screen` (SafeArea + keyboard + scrolling), `EmptyState`, `ErrorState`, `ListSkeleton`. A new screen is built from these.
- At most 1 main action per screen; the primary button sits at the bottom of the screen within thumb reach.
- List: `FlatList`/`FlashList`, empty state + loading skeleton + pull to refresh.
- Icon set: [@expo/vector-icons → a single set].
- Feedback: light vibration (haptics) on important actions, used consistently.

## 4. States (on every screen)

| State | How it looks |
|---|---|
| Loading | Skeleton |
| Empty | One sentence + a first-step button |
| Error | What happened + retry |
| Offline | Banner at the top; cached data is shown, write operations are queued or blocked |

## 5. Accessibility and platform

- Touch target at least 44x44 pt; text contrast at least 4.5:1.
- `accessibilityLabel` is required on icon buttons; try the main flow once with a screen reader (VoiceOver/TalkBack).
- The safe area (notch, home indicator) and the keyboard never cover any content.
- The Android back button and the iOS swipe-back gesture work as expected.

## 6. Copy language

- Form of address: [informal/formal] (same as `docs/product/glossary.md`).
- Buttons are verbs; permission explanation texts say why the permission is needed.
