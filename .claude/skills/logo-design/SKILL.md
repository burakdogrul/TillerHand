---
name: logo-design
description: Designs a brand logo: asks brand questions first, presents 4-6 SVG concepts with a visual preview, refines the chosen concept and produces the brand pack with favicon, app icon and PNG sizes. Use when a logo, icon, favicon, brand mark or "marka kimliği" (brand identity) is requested. Needs no API; the output is vector and editable.
---

# Logo design

A logo is not an image-generation request. It is **code**: editable SVG built from simple geometric shapes that reads at every size. Ask decisions per `docs/workflow/decision-protocol.md` (design decision = visual preview). If the `tasarim` topic is closed in question mode, go with the recommended option and still produce the previews.

## 1. Brand summary (questions)

First read `docs/product/prd.md`, `docs/product/glossary.md` and `DESIGN.md` (colors and typeface, if it exists). Ask the questions you cannot answer from them, with recommended options, in one round (4 questions at most):

1. **Personality:** 3 adjectives. For example trustworthy, plain, fast or playful, warm, bold.
2. **Logo type:**
   - **Wordmark:** just the name itself.
   - **Lettermark:** the initial.
   - **Symbol + wordmark:** recommended; the most flexible.
   - **Emblem:** the name inside a shape.
3. **Symbol idea:** 2-3 concept suggestions derived from what the product does (e.g. invoice → paper fold, check mark, up arrow).
4. **Constraints:** Existing colors, things to avoid (competitors' logos, cliché symbols), places of use (app icon, favicon, social media).

Write the answers to `docs/design/brand.md` → "Marka özeti" (brand summary) section.

## 2. Concepts

Produce 4-6 **truly different** concepts. The difference must come from the idea; color variations of the same shape do not count. Rules:

- Build the SVG by hand: `viewBox="0 0 64 64"` (symbol) and `0 0 240 64` (horizontal). Use `rect`, `circle`, `path` and simple transforms. Snap to an 8-unit grid and check optical balance.
- 2 colors at most + neutral. A one-color (black and white) version must work too.
- **Must be recognizable at 16 px.** No thin lines, small gaps or fine detail.
- In a wordmark, concepts may use a typeface (the heading font from `DESIGN.md`). In the final version the text must be a path (see §4).
- Avoid clichés: light bulb, gear, globe, random gradient, shield + check.

Preview: `.previews/NN-logo/index.html`. For each concept show a large version on light and dark backgrounds, 64/32/16 px sizes, the one-color version and a real-use example (browser tab, app icon square). If a browser tool is available, open it and show a screenshot. Then ask with AskUserQuestion: A-F, with each concept's idea and strength in one sentence.

## 3. Refinement

For the chosen concept, produce 2-3 fine-tuning variants (weight, proportion, corner, color) and ask the same way. If the user wants a mix ("A's symbol, C's text"), verify it with a new preview.

## 4. Brand pack

Output folder: `public/brand/` for web, `assets/brand/` for mobile (allowed in the structure map).

| File | Content |
|---|---|
| `logo.svg` | Symbol + wordmark, horizontal |
| `logo-mark.svg` | Symbol only |
| `logo-wordmark.svg` | Wordmark only |
| `logo-mono.svg`, `logo-white.svg` | One color, white for dark backgrounds |
| `favicon.svg` | Simplified symbol (a separate drawing if needed for 16 px legibility) |
| `favicon-32.png`, `apple-touch-icon.png` (180), `icon-192.png`, `icon-512.png` | Web |
| `icon.png` (1024), `adaptive-icon.png` (Android foreground, safe area 66%) | Mobile |

- **Convert text to paths:** Convert the wordmark text from the font file to paths, so it looks the same where the font is not installed. Example: a short script with `opentype.js`, run under `sandbox/`. Check that the font license allows this.
- **Optimize:** `npx --yes svgo --multipass <dosya>`
- **Make PNGs:** `npx --yes sharp-cli -i logo-mark.svg -o icon-512.png resize 512 512`. If this tool fails, take a screenshot of the SVG with Playwright.
- On web, `<link rel="icon" href="/brand/favicon.svg" type="image/svg+xml">` and PNG fallbacks. On mobile, `app.config.ts` → `icon`, `android.adaptiveIcon`.

## 5. Record

- `docs/design/brand.md`:
  - Brand summary and the reason for the chosen concept
  - Usage rules: clear space (half the symbol height), minimum size, color codes, what not to do (stretch, shadow, rotate, change color)
- Write the choices to `docs/decisions/log.md` (topic: `tasarim`) and to `docs/design/design-guide.md` → decision log ("karar günlüğü").
- If there is a slogan or brand text, run it through `humanizer:humanizer`.
