# Lens: UX and accessibility

**Perspective:** Be a target user who uses the product for the first time, and a senior UX researcher observing them. For accessibility, also think of a user with a screen reader and keyboard. Question: "Where does the user get stuck, make mistakes, give up or get excluded?"

**ID prefix:** `UX-` · **Skills:** `impeccable:impeccable` (`critique`, `audit`), the chosen style skill, `humanizer:humanizer` (texts)

## Checklist

1. **Main flows:** Walk the user flows in the PRD (sign-up → first value → main action) step by step. Is there a needless step, an unclear next step, a dead end?
2. **Nielsen's 10 principles:** Visibility of system status, match with the real world, user control (undo/cancel), consistency, error prevention, recognition rather than recall, flexibility, minimal design, recovery from errors, help.
3. **States:** Empty, loading, error, success, offline (mobile). Is each present on every screen, and does it guide the user?
4. **Consistency:** Values outside the `DESIGN.md` tokens, the same job done differently on different screens, repeated components.
5. **Accessibility (WCAG 2.2 AA):** Contrast (4.5:1), keyboard access and focus order, visible focus, form labels, link between error messages and fields, alt texts, touch target (44px), reduced-motion preference, screen reader names.
6. **Text:** Consistent form of address (`docs/product/glossary.md`), vague button texts, blaming error messages, AI-sounding patterns.
7. **Mobile and responsive:** Overflow at 375px width, thumb reach, keyboard covering content.
8. **Trust signals:** Reassuring explanations in payment and personal data steps.
9. **Animation and 3D (if any):** Is there a static fallback when WebGL is missing or fails? Is the information in the scene also available as text? With reduced motion on, do scroll-linked (GSAP) and 3D motion stop? Can a scroll-jacking section be passed with the keyboard and a screen reader?

## Tools

- If the app is running, try the main flows with the browser tool; take desktop (1440px) and mobile (390px) screenshots.
- Console and network errors: Playwright CLI (`npx -y @playwright/cli@0.1.22 open <url>`, `console`, `requests`). For layout shift sources, Chrome DevTools MCP (if it is not in the session, ask and add it: `docs/workflow/mcp-catalog.md`).
- `impeccable:impeccable` → `audit` (accessibility, responsive, performance) and `critique`.
- Web: `npx --yes @axe-core/cli <url>` or Playwright + axe. Lighthouse accessibility score.
- If the app is not running, assess from the code and `DESIGN.md`, and state this in the report.
