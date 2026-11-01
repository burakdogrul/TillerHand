---
name: motion-video
description: Produces the product's promo video with code, in two modes. Demo loop: a landing page or SaaS demo with a real cursor, closed-form springs and a 120 BPM rhythm. Launch clip: a 20-second video of a finished project with generated music and share text. Frames are captured one by one with Playwright and converted to MP4 with ffmpeg. Use when a "promo video", "demo video", "launch video", "product animation" or "landing page loop" is requested. Not for in-app animation (use ui-motion for that).
---

# Promo video (with code)

> This skill is adapted from N01ennn's "UI motion design for Opus 5.5" prompt (October 2026). The launch clip ideas are adapted from `latent-spaces/brag` (MIT).

**Core problem:** Claude cannot watch its own frames while they move. So every frame is computed from time `t`; a real cursor drives the story; still frames are checked before you say the work is done.

Ask decisions per `docs/workflow/decision-protocol.md`. Visual decisions (direction, frame choice) are asked with a preview.

**Ask first which mode, demo loop or launch clip:**
- **Demo loop:** a seamless loop of the product in use, for a landing page. Sections 1-6 below.
- **Launch clip:** a 20-second video that tells a stranger what a finished project is, for sharing. The "Launch clip" section; it uses cuts.

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
3. **Sound:** Generated music (see "Generated sound"), a 120 BPM track the user gives (the license is the user's responsibility), just a click track (generated automatically), or silent.
4. **Format and closing:** 1440×1440 (default, social media and landing page) or 1920×1080; the one-line text shown on the last frame (run it through `humanizer:humanizer`).

## 2. Direction

- **One continuous transformation (morph):** The demo loop has no cuts or fades between states. An element turns into an element of the next state.
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
// y0: initial distance, v0: initial velocity, t: elapsed time (s)
function yay(y0, v0, omega, zeta, t) {
  const e = Math.exp(-zeta * omega * t);
  if (zeta < 1) {
    const wd = omega * Math.sqrt(1 - zeta * zeta), c = Math.cos(wd * t), s = Math.sin(wd * t);
    return { y: e * (y0 * c + ((v0 + zeta * omega * y0) / wd) * s),
             v: e * (v0 * c - ((omega * omega * y0 + zeta * omega * v0) / wd) * s) };
  }
  return { y: (y0 + (v0 + omega * y0) * t) * e, v: (v0 - omega * (v0 + omega * y0) * t) * e }; // critical damping
}
// Settling time Ts (2%) ≈ 4 / (ζ·ω)  →  ω = 4 / (ζ·Ts)
// UI: ζ 0.7-0.8, Ts 0.3-0.45 s · Camera: ζ ≈ 1.0
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
- **Determinism:** Calling `seek(7.25)`, seeking elsewhere, then `seek(7.25)` again must give a pixel-for-pixel identical result. Compare the screenshot buffers. A leftover `transform` on a settled element is a common cause of a difference: set it to `none`.
- **Fonts:** Load fonts from a local file and wait for `document.fonts.ready` before rendering starts. If the project loads them from a CDN, ask before downloading a local copy.

## 6. Start order

1. Ask the inputs (§1).
2. Show the **beat map** as a table and produce **4 still frames**: the opening state, two middle states, the loop seam (last frame and first frame side by side).
3. Show the frames under `.previews/NN-motion/` and ask for approval with AskUserQuestion: Start / Change this. **Do not do a full render until the user says "Start".**
4. Render, run the determinism and loop seam tests, and show screenshots of 3 frames of the video.
5. Write the decisions to `docs/decisions/log.md`. Write the video's path and how to reproduce it to `marketing/motion/<ad>/README.md`.

## Launch clip

About 20 seconds (15-25). After one viewing, a stranger knows what the project does, who it is for and how to get it. Scenes may use cuts. A plain crossfade between two busy layouts looks muddy, so take the old content out first, then bring the new content in.

**1. Read the project first.** Do not ask for a list of states. Read the main page, the styles (exact colors and fonts), the README, the routes and the key components, and find the real flow: entry, key action, result.

Do not read `.env` files, keys, credentials, build output or lock files.

**2. Ask** the tone (playful, polished, deadpan or the user's own), the format and the sound. Formats: landscape 1920×1080, vertical 1080×1920, square 1080×1080. If the user points at one feature or version, it becomes the focus.

**3. Plan** as hook (2-3 s), reveal (2-4 s), 2-3 highlights, punchline (2-4 s). Show the plan as a table with durations and every cut on a beat, and keep it in `beats.json`: the sound reads the same file. Then:

- **Reuse the real interface:** render the project's own components, styles, fonts and images instead of redrawing them. Prefer the working app over a page that describes it.
- **Nothing invented:** no made-up claims, numbers or testimonials. Small sample text inside a screen is fine (a file name, a toast).
- **Readable:** text the viewer must read stays settled on screen for about 0.3 seconds per word.
- **Specific:** use the project's own words. If a line could describe any product, rewrite it.
- **The first 2 seconds decide:** plan the hook first.

**4. Keep private data out.** The video and the share text are public. Secrets, tokens, internal URLs, real customer names, email addresses and other personal data never reach them. If such data shows on a real screen, replace it with made-up sample values before capture. Ask before showing something public but personal, such as a user name in a repository URL.

**5. Build and check** with the same files as the demo loop: `index.html` with `renderAt(t)` and `seek(t)`, `render.mjs`, and the determinism and font checks of §5. The cursor, the one-action-per-beat rule and the Remotion question are for the demo loop only.

Blending sub-frames with `fps` smears a cut into a grey frame. Capture each frame's sub-frames inside that frame, at `(n + (j + 0.5) / 4) / fps` for `j` from 0 to 3, then keep every fourth blended frame. At 30 fps:

```bash
ffmpeg -y -framerate 120 -i frames/%06d.png -i track.wav \
  -vf "tmix=frames=4,select='eq(mod(n,4),3)',setpts=N/(30*TB)" -r 30 -shortest \
  -c:v libx264 -crf 14 -pix_fmt yuv420p out/clip.mp4
```

Before the full render, look at stills from every scene, from mid-transition and from the frames on both sides of a cut, and fix overflow, collisions and low contrast. Show them under `.previews/NN-motion/` and ask with AskUserQuestion: Start / Change this. Do not do a full render until the user approves the stills.

**6. Deliver** to `marketing/motion/<name>/out/`: the video, a poster frame and `share-copy.txt` (1-3 sentences ready to post, run through `humanizer:humanizer`). The poster is the strongest settled frame. It replaces frame 0 only, so the thumbnail shows it and the hook still starts at once. Write the decisions and how to reproduce the video as in §6.

## Generated sound

No music or audio file ships with the kit. The model writes the sound itself with tools on the machine, for example a short Node script that writes a WAV file, or ffmpeg's `aevalsrc`:

- **One beat grid:** drums, bass, melody and effects play on the same grid as the video, counted from the first frame.
- **Effects under the music:** sound effects share the music's key and sit softly under it. Repeated small sounds stay in the background.
- **No clipping:** overlapping hits add up, so pass the mix through a soft limiter (`tanh`), keep peaks near -1 dB and check with ffmpeg's `volumedetect` filter. Write 44.1 kHz stereo.
- Listening is the user's job: you cannot hear it. Say so when you show the result, and offer another try.
