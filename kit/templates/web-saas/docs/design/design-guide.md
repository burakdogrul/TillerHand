# Design

> The interface has three sources of truth:
> - `PRODUCT.md`: product context (who, for what). Written with Impeccable `init`, fed from the PRD.
> - `DESIGN.md`: visual world and design tokens (color, type, spacing, corners, shadow, motion). Impeccable writes it; components use only these tokens.
> - This file: the chosen direction, the design decision log and the lasting rules that apply on every screen.
>
> Decisions are made with `/design` using **visual previews** (`docs/workflow/decision-protocol.md` §5). If a new color, size or component
> is needed, it is asked as a decision first, then added to DESIGN.md. No raw colors or arbitrary sizes in code.

## 1. Seçilen yön (Chosen direction)

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

- First check whether it exists in `components/ui/` (shadcn); if it does, use it, do not copy and change it.
- Button variants: `default` (at most 1 main action per page), `secondary`, `outline`, `ghost`, `destructive`.
- Form: the label is always visible (not only a placeholder), the error message sits under the field, the button is disabled + loading while submitting.
- Table/list: an empty-state component + a loading skeleton are required.
- Icons: [lucide-react], a single set.

## 4. States (on every screen)

| State | How it looks |
|---|---|
| Loading | Skeleton; nothing for loads shorter than 300 ms |
| Empty | One sentence saying what will be here + a first-step button |
| Error | What happened + what the user can do (retry / support); no technical detail |
| Successful action | Short notification (toast), 3-4 s |

## 5. Accessibility

- Text contrast at least 4.5:1 (large text 3:1); in both themes.
- Everything is reachable by keyboard, the focus ring is visible.
- `alt` on images, `aria-label` on icon buttons.
- No horizontal scroll at mobile width (375 px), touch target at least 44 px.

## 6. Copy language

- Form of address: [informal/formal] (same as `docs/product/glossary.md`).
- Buttons are verbs: "Save", "Create invoice"; not vague ones like "OK", "Submit".
- An error message does not blame the user and says the fix: "The email address is not valid. Example: name@domain.com".
