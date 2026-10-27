---
name: motion-video
description: Produces the product's promo video (SaaS demo loop, landing page video, social media clip) with code. A single HTML file and renderAt(t), a real cursor, closed-form springs, a 120 BPM rhythm; frames are captured one by one with Playwright and converted to MP4 with ffmpeg. Use when a "tanıtım videosu" (promo video), "demo video", "ürün animasyonu" (product animation) or "landing page loop" is requested. Not for in-app animation (use ui-motion for that).
---

# Promo video (with code)

> This skill is adapted from N01ennn's "UI motion design for Opus 5.5" prompt (October 2026).

**Core problem:** Claude cannot watch its own frames while they move. So every frame is computed from time `t`; a real cursor drives the story; still frames are checked before you say the work is done.

Ask decisions per `docs/workflow/decision-protocol.md`. Visual decisions (direction, frame choice) are asked with a preview.

## 0. Prerequisites

Check them; if one is missing, give the user the install command (install happens with the user's approval):

| Tool | Check | Install |
|---|---|---|
| Node 18+ | `node --version` | - |
| Playwright + Chromium | `npx playwright --version` | `npm i -D playwright` and `npx playwright install chromium` |
| ffmpeg | `ffmpeg -version` | Windows: `winget install Gyan.FFmpeg` · macOS: `brew install ffmpeg` · Linux: package manager |

**Remotion option:** If the project uses React and needs subtitles, audio mixing or a multi-scene video, Remotion may fit better. Ask this as a decision:
- Remotion's official plugin is defined in `.claude/settings.json` but off. If chosen, `node .claude/hooks/tools.mjs --enable video` turns it on on this machine (`/tools`; asks for approval) and `/remotion-best-practices` is used.
- Remotion requires a paid license for large companies. Tell the user to check their own case on the license page at remotion.dev.

## 1. Inputs (ask first)

Ask in one round (4 questions at most, with recommendations):

1. **States:** 8-12 interface states of the product. Source: routes of the running app (recommended), screenshots or components. List what each state shows in one sentence and get it confirmed.
2. **Color and typography:** Black, white and a single accent color (default: the main color in `DESIGN.md`), typefaces, logo (`public/brand/` or `assets/brand/`).
3. **Sound:** A 120 BPM music track (the user provides it; the license is the user's responsibility), or just a click track (generated automatically), or silent.
4. **Format and closing:** 1440×1440 (default, social media and landing page) or 1920×1080; the one-line text shown on the last frame (run it through `humanizer:humanizer`).

## 2. Direction

- **One continuous transformation (morph):** No cuts or fades between states. An element turns into an element of the next state.
- **Real cursor:** The cursor triggers every change (hover, click, drag, typing). The cursor never leaves the frame.
- **Camera:** In each state, it zooms in so that state fills the frame, then pulls back.
- **Springs:** Use springs with mass and a very small overshoot.
- **Forbidden:** bouncy curves, particle effects, glows, gradients in the interface, dead time, a template look.

## 3. Structure

- 120 BPM, **one action per beat**. Example flow: button → loading → confirmation → panel → list → chart → … → return to the opening frame.
- The hero state holds for 2 beats. No moment stays still for 4 beats.
- **Beat map:** In the `beats.json` file, for each beat: time (s), action, target element and camera info. If music is given, take the beats from the track; detect the first beat's time from the audio start with ffmpeg and snap the rest to a 0.5 s grid. If needed, run a short analysis with `uv run --with numpy`.

## 4. Build

Files go under `marketing/motion/<ad>/`: `index.html`, `beats.json`, `render.mjs`. Frames and output go under `frames/` and `out/` (these stay out of git).

**`index.html`**
- Expose the `renderAt(t)` and `seek(t)` functions.
- Every pixel is computed from `t`. No CSS `transition` or `animation`; no timing with `setTimeout`, `requestAnimationFrame` or `Date.now()`.

**Springs** are computed in closed form. If the target changes mid-flight, the new spring starts from the current position and velocity. `y` is the distance to the target, `ω` the natural frequency, `ζ` the damping ratio:

```js
// y0: başlangıçtaki uzaklık, v0: başlangıç hızı, t: geçen süre (s)
function yay(y0, v0, omega, zeta, t) {
  const e = Math.exp(-zeta * omega * t);
  if (zeta < 1) {
    const wd = omega * Math.sqrt(1 - zeta * zeta), c = Math.cos(wd * t), s = Math.sin(wd * t);
    return { y: e * (y0 * c + ((v0 + zeta * omega * y0) / wd) * s),
             v: e * (v0 * c - ((omega * omega * y0 + zeta * omega * v0) / wd) * s) };
  }
  return { y: (y0 + (v0 + omega * y0) * t) * e, v: (v0 - omega * (v0 + omega * y0) * t) * e }; // kritik sönüm
}
// Oturma süresi Ts (%2) ≈ 4 / (ζ·ω)  →  ω = 4 / (ζ·Ts)
// Arayüz: ζ 0.7-0.8, Ts 0.3-0.45 s · Kamera: ζ ≈ 1.0
```

**`render.mjs`** (Playwright)
- Open Chromium at the set size and call `seek(t)` on every frame.
- **Motion blur:** Capture 4 sub-frames per frame, that is 240 fps. ffmpeg blends them:

```bash
ffmpeg -y -framerate 240 -i frames/%06d.png -i track.wav \
  -vf "tmix=frames=4,fps=60" -shortest \
  -c:v libx264 -crf 14 -pix_fmt yuv420p out/loop.mp4
```

With no audio, remove `-i track.wav` and `-shortest`. If a click track is needed, generate it with ffmpeg's `aevalsrc` source, using short sine pulses at the beat times.

## 5. Pitfalls (check)

- **Loop seam:** Last frame = first frame, cursor included.
- **Blur:** No `will-change` on scaling elements; it blurs text. After every zoom, check the text at 1x.
- **Determinism:** Calling `seek(7.25)` twice must give a pixel-for-pixel identical result. Compare the screenshot buffers.
- **Fonts:** Load fonts from a local file and wait for `document.fonts.ready` before rendering starts.

## 6. Start order

1. Ask the inputs (§1).
2. Show the **beat map** as a table and produce **4 still frames**: the opening state, two middle states, the loop seam (last frame and first frame side by side).
3. Show the frames under `.previews/NN-motion/` and ask for approval with AskUserQuestion: Start / Change this. **Do not do a full render until the user says "başla" (start).**
4. Render, run the determinism and loop seam tests, and show screenshots of 3 frames of the video.
5. Write the decisions to `docs/decisions/log.md`. Write the video's path and how to reproduce it to `marketing/motion/<ad>/README.md`.
