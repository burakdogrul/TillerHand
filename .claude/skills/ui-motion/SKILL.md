---
name: ui-motion
description: In-app motion rules (micro-interactions, transitions, loading, list and page animations). Use when adding or changing an animation or transition in the interface, or when told to make it "daha canlı / akıcı" (livelier / smoother). Not for promo videos (use motion-video for those).
---

# UI motion

Motion's job is to give information: what changed, where it came from, is the system working? No motion for decoration. The motion language is defined as tokens in `DESIGN.md` → "Motion" section; if missing, get a decision with `/design` first (animation amount: none / measured / rich).

## Rules

1. **Animate only `transform` and `opacity`.** Do not animate `width`, `height`, `top`, `left`, `box-shadow` or `filter` (layout and paint cost). Use FLIP or a layout animation if needed.
2. **Durations** (with token names):

   | Token | Duration | Use |
   |---|---|---|
   | `motion.micro` | 100-150 ms | press, hover, toggle |
   | `motion.base` | 200-250 ms | dropdown, tooltip, card |
   | `motion.page` | 300-400 ms | page or screen transition, modal |
   | `motion.max` | 500 ms | no interface motion exceeds this |

3. **Prefer springs.** Any motion that can be interrupted (the user can change it midway) uses a spring. Springs keep velocity and end naturally. Default: damping 0.75-0.85, settling time 0.3-0.4 s, only a very small overshoot at most. Use a bouncy spring only as a deliberate brand choice.
4. **Curves** (if no spring): `ease-out` on enter, `ease-in` on exit, `ease-in-out` for repositioning. Use `linear` only for progress bars and looping spinners.
5. **Staggered list (stagger):** 20-40 ms per item; only the first 8-10 items enter staggered, the rest enter together.
6. **Loading:** no indicator for operations shorter than 300 ms; a skeleton or spinner between 300 ms and 2 s; above 2 s, progress and text saying what is being done. There must be no layout shift between skeleton and content.
7. **Accessibility:** when `prefers-reduced-motion: reduce` (web) or the system "reduce motion" (mobile) is on, turn off motion that moves position or scales; keep only a short opacity transition. Autoplaying motion longer than 5 seconds must be stoppable. No flashing more than 3 times per second.
8. **Text and legibility:** Text that must be read cannot be read while it moves; it must be readable after the motion ends. Do not leave `will-change` on permanently for scaling elements (it blurs text).
9. **Performance:** Target 60 fps; test on a low-end device (mobile). No separate animation on every item in a long list.

## Tools

| Stack | Library |
|---|---|
| Web (React/Next.js) | CSS transitions for simple cases; **Motion** (`motion/react`) for springs, layout and enter/exit. GSAP only if a landing page needs scroll-driven storytelling (`gsap-skills:`, `tasarim` package; free, commercial use included, forbidden in a no-code animation tool that competes with Webflow). |
| Web 3D | **three.js**; **React Three Fiber** + drei in React. The skills are copied in `/start` step 3c (`threejs-*`). |
| Mobile (Expo) | **react-native-reanimated** (runs on the UI thread); use Reanimated layout animations instead of `LayoutAnimation`. Haptic feedback on important actions. |

Adding a new animation library is a `teknik` decision; ask.

## 3D

1. **Lazy load.** three.js does not go in the main bundle: load the scene with dynamic `import()` when it enters the viewport; `ssr: false` in Next.js. It does not wait on the first screen (LCP).
2. **Always have a fallback.** If WebGL is missing, the context is lost (`webglcontextlost`) or loading fails, show a static image in the same place. If the scene carries information, the same information also appears on the page as text.
3. **Reduced motion.** When `prefers-reduced-motion: reduce` is on, an auto-rotating camera and continuous animation stop; the scene stays as a still frame.
4. **Mobile GPU.** Pixel ratio `Math.min(devicePixelRatio, 2)`; shadows and post-processing effects start off on mobile. The render loop stops when the scene is not visible or the tab is in the background (prefer `frameloop="demand"` in R3F).
5. **Cleanup.** When the component is removed, `dispose()` the geometry, material, textures and renderer; remove event listeners. Test for memory leaks by mounting and unmounting twice in the DevTools memory panel.
6. **Measure.** 60 fps on desktop; never below 30 fps on a mid-range phone. If it drops, use the `threejs-performance` skill.

## Review

After a change, evaluate with `impeccable:impeccable` → `animate` and `audit`. As evidence:
- One screenshot each from the start, middle and end of the motion
- Behavior with reduced motion on
- A performance trace if needed (Chrome DevTools MCP; `docs/workflow/mcp-catalog.md`)
