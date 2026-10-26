# Sound Canvas — Paint with Sound

An interactive generative-art experience where your mouse movements on a canvas produce both visual trails and musical notes. Paint a picture, hear it sing.

![Sound Canvas screenshot](screenshot.png)

## The Idea

Sound Canvas turns painting into music. As you drag your mouse across the canvas, each movement draws a glowing trail **and** plays a note. Where you paint vertically determines the pitch (top = high, bottom = low), how fast you move determines the volume, and which brush you choose determines both the visual style and the sound character.

The result is a synesthetic loop: you see what you hear, and hear what you see. When you're done painting, press **Play** — the canvas replays every stroke in sequence, turning your painting into a short composition.

## Intended User

Anyone who enjoys playful, low-stakes creative tools — no musical knowledge or drawing skill needed. The pentatonic scale ensures everything sounds harmonious. It's for the person who doodles during meetings, the kid who bangs on a toy piano, the friend who needs a five-minute creative break.

## Main Interaction

| Action | Response | Feedback |
|---|---|---|
| Click + drag on canvas | Draws a trail + plays notes | Visual trail appears instantly; notes play in real-time |
| Switch brush (1/2/3 or click) | Changes visual + audio character | Button highlights; next stroke looks/sounds different |
| Press Play (spacebar) | Replays all strokes as a sequence | Canvas clears, redraws progressively, plays associated notes |
| Press Clear (C) | Erases everything | Canvas goes blank; status bar confirms |

### Three Brush Modes

- **Glow** — Smooth glowing lines with warm sine-wave tones
- **Particle** — Bursting particles with plucky triangle-wave tones
- **Ribbon** — Flowing ribbons (width varies with speed) with rich sawtooth tones

### Color Mapping

Canvas Y-position maps to both pitch and hue: high notes are warm (red/orange), low notes are cool (blue/purple). This visual-audio correspondence makes the relationship between what you see and what you hear immediately apparent.

## How to Run

No build tools, no dependencies, no installation required.

### Option 1: Open the file directly

Double-click `index.html` — it opens in any modern browser.

### Option 2: Serve locally (recommended for best audio behavior)

```bash
# Python 3
python3 -m http.server 8000

# Then open http://localhost:8000
```

Or with Node.js:

```bash
npx serve .
```

> **Note:** Browsers require a user interaction (click) before audio can play. The AudioContext is initialized on your first click on the canvas — this is expected behaviour, not a bug.

## Known Limitations

- **Audio requires a modern browser** with Web Audio API support. If unavailable, the app degrades to visual-only mode and displays a notice.
- **Playback timing** relies on `performance.now()` and `requestAnimationFrame`, so timing precision is frame-rate dependent (~16ms granularity).
- **No persistence** — refreshing the page clears the canvas. Strokes exist only in memory.
- **Performance** — very long sessions (hundreds of strokes) may slow down on low-end devices due to full-canvas redraw each frame.
- **Mobile** — touch is supported but the experience is designed for desktop with a mouse.

## Keyboard Shortcuts

| Key | Action |
|---|---|
| `1` | Select Glow brush |
| `2` | Select Particle brush |
| `3` | Select Ribbon brush |
| `Space` | Play / replay |
| `C` | Clear canvas |

## Credits

- **Pentatonic scale frequencies** — standard music theory reference
- **Web Audio API** — [MDN Web Docs](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
- **Canvas 2D API** — [MDN Web Docs](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API)
- No external libraries, fonts, images, or sound files are used

## Live Link

_(Add a live link here if deployed — e.g., GitHub Pages URL)_
