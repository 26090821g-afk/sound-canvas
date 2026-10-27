# Process

## Starting Idea

I wanted to build something where the user's input genuinely shapes the output — not a button that triggers a pre-made animation, but a tool where every movement matters. The concept of synesthesia (seeing sound / hearing colour) felt like a rich design space: if I could make the same action produce both a visual and an auditory response, the relationship between action and result would be immediately obvious.

I considered several directions (a branching narrative, a task lottery, a rhythm game) but chose a generative art canvas because the interaction loop is the tightest: move mouse → see trail + hear note → decide where to paint next. No menus, no loading, no ambiguity.

## Design & Code Changes

### 1. Pentatonic scale instead of chromatic
Originally I mapped Y-position to a full chromatic scale. Testing in my head, random mouse movements would produce dissonant clusters. Switching to a **C major pentatonic** (only C, D, E, G, A — no semitone clashes) means every possible painting sounds harmonious. This was a deliberate constraint that improves the experience without limiting creative freedom.

### 2. Three-pass glow rendering
The first glow implementation used `shadowBlur` for the glow effect. This was expensive when redrawing the whole canvas each frame (the render loop clears and redraws everything for playback support). I replaced it with a **three-pass approach**: a wide very-transparent stroke (halo), a medium semi-transparent stroke (mid), and a narrow bright stroke (core). With `globalCompositeOperation = 'lighter'` (additive blending), overlapping strokes glow naturally. This is much cheaper and looks better.

### 3. Note throttling
Early on, rapid mouse movement spawned dozens of oscillators per second, creating a muddy wall of sound. I added a **60ms throttle** between consecutive notes. This ensures each brush stroke produces a melodic sequence of distinct notes rather than an amorphous drone, while still feeling responsive.

### 4. Two-canvas architecture
Particle mode needs per-frame animation (particles drift and fade), but glow/ribbon strokes should persist. Rather than clearing the canvas every frame and redrawing everything (which works but is wasteful), I use **two canvas layers**: a main canvas for persistent strokes and an overlay canvas (with `pointer-events: none`) for particles. During playback, the main canvas is cleared and progressively redrawn.

_(The render loop currently does clear + redraw the main canvas each frame for playback support. A future optimisation would only redraw when the stroke set changes, but for the expected usage scale this is not a bottleneck.)_

## User Trial

**Who tried it:** Xiuwei Zhao — a classmate unfamiliar with the project.

**What they tried first:** Upon opening the app, they immediately started doodling on the canvas with the Glow brush, without first noticing the UI buttons (brush selector, Play, Clear). The canvas itself drew their attention first.

**Where they hesitated:** After finishing a painting, they did not realise the painting could be replayed. They did not notice the Play button and only tried clicking it after I pointed it out. The playback feature was not self-discoverable for this user.

**Whether the response made sense:** Yes. They quickly noticed that their drawing actions produced synchronised sound, and understood that the visual trail and the audio were linked. The audio-visual connection was intuitive.

**What I changed based on the trial:** The Play button was not easily discoverable. Based on this observation, I made the Play button larger, gave it a more prominent colour, and added a pulsing hint animation that appears after the user finishes their first stroke. The goal is to draw attention to the playback feature without requiring an external explanation.

---

## AI Tools Used

I used an AI assistant (WorkBuddy AI) during development. Here's what it helped with and how I used its suggestions:

### Suggestions I kept
- **Two-canvas architecture (main + overlay):** The AI suggested separating persistent strokes from animated particles onto two canvas layers with the overlay set to `pointer-events: none`. This was a clean solution to the "particles need per-frame animation but strokes should persist" problem. I kept it.
- **Three-pass glow rendering:** The AI proposed replacing `shadowBlur` with layered semi-transparent strokes using additive blending. This was both faster and better-looking. I kept it.

### Suggestions I changed or rejected
- **Chromatic scale mapping:** The AI initially mapped Y-position to a full chromatic scale across 3 octaves. I changed this to a **pentatonic scale** because random mouse movements on a chromatic scale produce dissonant clusters. The pentatonic ensures everything sounds harmonious — a deliberate musical constraint the AI didn't consider.
- _[Add any other changes you made to AI suggestions, or note if you rejected a suggestion and why]_

### What I did myself
- The overall concept and design direction
- Brush mode selection and the specific visual/audio character of each mode
- Color mapping (Y-position → hue + pitch, creating visual-audio synesthesia)
- Keyboard shortcuts and touch support
- Error handling strategy (audio degradation, touch events, note throttling)

## Credits

- **Pentatonic scale** — standard music theory
- **Web Audio API documentation** — [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
- **Canvas 2D API documentation** — [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Canvas_API)
- No external code, libraries, fonts, images, or audio files were used
