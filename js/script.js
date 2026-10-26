/**
 * Sound Canvas — Paint with Sound
 *
 * An interactive generative-art experience where mouse movements on a canvas
 * produce both visual trails and musical notes. Canvas Y-position maps to a
 * pentatonic scale (top = high pitch, bottom = low pitch), brush speed maps
 * to volume, and three brush modes offer distinct visual + audio characters.
 *
 * Architecture:
 *   - AudioEngine:     Web Audio API wrapper, maps canvas position to notes
 *   - ParticleSystem:  Animated particle bursts for "particle" brush mode
 *   - SoundCanvas:     Main controller — canvases, strokes, rendering, playback
 *
 * No external dependencies. Pure HTML/CSS/JS.
 */
(function () {
  'use strict';

  // ===== Configuration =====

  /**
   * C major pentatonic across 3 octaves, ordered HIGH to LOW.
   * Top of canvas (y=0) maps to index 0 (highest note).
   * Pentatonic = always harmonious, no matter what you paint.
   */
  var PENTATONIC = [
    // Octave 6 (highest)
    1760.00, 1567.98, 1318.51, 1174.66, 1046.50,
    // Octave 5
    880.00, 783.99, 659.25, 587.33, 523.25,
    // Octave 4 (lowest)
    440.00, 392.00, 329.63, 293.66, 261.63
  ];

  /**
   * Each brush mode has a distinct waveform + envelope.
   * These shape both the sound character and the visual style.
   */
  var BRUSH_CONFIG = {
    glow: {
      wave: 'sine',
      attack: 0.01,
      release: 0.40
    },
    particle: {
      wave: 'triangle',
      attack: 0.005,
      release: 0.15
    },
    ribbon: {
      wave: 'sawtooth',
      attack: 0.02,
      release: 0.30
    }
  };

  /** Minimum time between consecutive notes (ms) — prevents audio spam. */
  var NOTE_THROTTLE = 60;

  // ===== AudioEngine =====

  /**
   * Wraps the Web Audio API. Lazily creates an AudioContext on first user
   * interaction (required by browser autoplay policies). Falls back gracefully
   * if the API is unavailable.
   */
  function AudioEngine() {
    this.ctx = null;
    this.available = !!(window.AudioContext || window.webkitAudioContext);
  }

  AudioEngine.prototype.init = function () {
    if (!this.available) return false;
    if (!this.ctx) {
      var AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return true;
  };

  /**
   * Play a single note.
   * @param {number} y        - Canvas Y position
   * @param {number} height   - Canvas height
   * @param {string} mode     - Brush mode key
   * @param {number} volume   - 0–1, derived from brush speed
   */
  AudioEngine.prototype.playNote = function (y, height, mode, volume) {
    if (!this.available || !this.ctx) return;

    var cfg = BRUSH_CONFIG[mode] || BRUSH_CONFIG.glow;

    // Map Y to pentatonic index (top = high pitch)
    var ratio = Math.max(0, Math.min(1, 1 - y / height));
    var idx = Math.floor(ratio * (PENTATONIC.length - 1));
    var freq = PENTATONIC[idx];

    // Oscillator
    var osc = this.ctx.createOscillator();
    osc.type = cfg.wave;
    osc.frequency.value = freq;

    // Gain envelope: attack → sustain → exponential decay
    var gain = this.ctx.createGain();
    var now = this.ctx.currentTime;
    var vol = Math.max(0.02, Math.min(0.22, volume));

    gain.gain.setValueAtTime(0, now);
    gain.gain.linearRampToValueAtTime(vol, now + cfg.attack);
    gain.gain.exponentialRampToValueAtTime(0.001, now + cfg.attack + cfg.release);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + cfg.attack + cfg.release + 0.05);
  };

  // ===== ParticleSystem =====

  /**
   * Lightweight particle system for the "particle" brush mode.
   * Particles spawn at the cursor, drift with gravity, and fade out.
   */
  function ParticleSystem() {
    this.particles = [];
  }

  ParticleSystem.prototype.spawn = function (x, y, hue) {
    var count = 3 + Math.floor(Math.random() * 3);
    for (var i = 0; i < count; i++) {
      var angle = Math.random() * Math.PI * 2;
      var speed = 0.5 + Math.random() * 2.5;
      this.particles.push({
        x: x,
        y: y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 0.5,
        life: 1.0,
        decay: 0.012 + Math.random() * 0.018,
        size: 2 + Math.random() * 4,
        hue: hue
      });
    }
  };

  ParticleSystem.prototype.update = function () {
    for (var i = this.particles.length - 1; i >= 0; i--) {
      var p = this.particles[i];
      p.x += p.vx;
      p.y += p.vy;
      p.vy += 0.04; // gravity
      p.vx *= 0.99; // air resistance
      p.life -= p.decay;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
      }
    }
  };

  ParticleSystem.prototype.render = function (ctx) {
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < this.particles.length; i++) {
      var p = this.particles[i];
      ctx.fillStyle = 'hsla(' + p.hue + ', 90%, 65%, ' + p.life + ')';
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalCompositeOperation = 'source-over';
  };

  ParticleSystem.prototype.clear = function () {
    this.particles = [];
  };

  // ===== SoundCanvas (main controller) =====

  function SoundCanvas() {
    var self = this;

    this.canvas = document.getElementById('canvas');
    this.overlay = document.getElementById('overlay');
    this.ctx = this.canvas.getContext('2d');
    this.octx = this.overlay.getContext('2d');
    this.statusEl = document.getElementById('status');
    this.audioNotice = document.getElementById('audio-notice');

    this.audio = new AudioEngine();
    this.particles = new ParticleSystem();

    // State
    this.strokes = [];          // completed strokes: { mode, points: [{x,y,t,hue,speed}] }
    this.currentStroke = null;  // active stroke being drawn
    this.mode = 'glow';
    this.isDrawing = false;
    this.lastPoint = null;
    this.lastNoteTime = 0;

    // Playback state
    this.playing = false;
    this.playbackStrokes = [];  // strokes being replayed
    this.playbackPointIdx = 0;
    this.playbackStrokeIdx = 0;
    this.playbackStartTime = 0;

    // Check audio support
    if (!this.audio.available) {
      this.audioNotice.classList.remove('hidden');
    }

    this.resize();
    this.bindEvents();
    this.render();
  }

  // --- Sizing ---

  SoundCanvas.prototype.resize = function () {
    var dpr = window.devicePixelRatio || 1;
    var w = window.innerWidth;
    var h = window.innerHeight;
    var self = this;

    [this.canvas, this.overlay].forEach(function (c) {
      c.width = w * dpr;
      c.height = h * dpr;
      c.style.width = w + 'px';
      c.style.height = h + 'px';
    });

    // Reset transform after resize, then apply DPR scale
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.scale(dpr, dpr);
    this.octx.setTransform(1, 0, 0, 1, 0, 0);
    this.octx.scale(dpr, dpr);

    this.width = w;
    this.height = h;
    this.redraw();
  };

  // --- Color mapping ---

  /**
   * Map canvas Y to an HSL hue. Top of canvas = warm (red/orange),
   * bottom = cool (blue/purple). This creates a visual-audio synesthesia:
   * high notes are warm, low notes are cool.
   */
  SoundCanvas.prototype.yToHue = function (y) {
    var ratio = Math.max(0, Math.min(1, 1 - y / this.height));
    return ratio * 300; // 0° (red) to 300° (purple)
  };

  // --- Drawing: starting, adding points, ending strokes ---

  SoundCanvas.prototype.startStroke = function (x, y) {
    this.audio.init();
    this.isDrawing = true;
    this.currentStroke = {
      mode: this.mode,
      points: [{
        x: x,
        y: y,
        t: performance.now(),
        hue: this.yToHue(y),
        speed: 0
      }]
    };
    this.lastPoint = { x: x, y: y, t: performance.now() };
    this.lastNoteTime = 0;
    this.setStatus('Painting...');
  };

  SoundCanvas.prototype.addPoint = function (x, y) {
    if (!this.isDrawing || !this.currentStroke) return;

    var now = performance.now();
    var dx = x - this.lastPoint.x;
    var dy = y - this.lastPoint.y;
    var dist = Math.sqrt(dx * dx + dy * dy);
    var dt = now - this.lastPoint.t;
    var speed = dt > 0 ? dist / dt : 0; // pixels per ms

    var hue = this.yToHue(y);

    this.currentStroke.points.push({
      x: x,
      y: y,
      t: now,
      hue: hue,
      speed: speed
    });

    // Audio: play a note if enough time has passed (throttle)
    if (now - this.lastNoteTime > NOTE_THROTTLE) {
      var volume = Math.min(0.22, 0.05 + speed * 0.15);
      this.audio.playNote(y, this.height, this.mode, volume);
      this.lastNoteTime = now;
    }

    // Particles for particle mode
    if (this.mode === 'particle') {
      this.particles.spawn(x, y, hue);
    }

    this.lastPoint = { x: x, y: y, t: now };
  };

  SoundCanvas.prototype.endStroke = function () {
    if (!this.isDrawing) return;
    this.isDrawing = false;

    if (this.currentStroke && this.currentStroke.points.length > 1) {
      this.strokes.push(this.currentStroke);
    }
    this.currentStroke = null;
    this.setStatus(this.strokes.length > 0
      ? 'Ready — ' + this.strokes.length + ' stroke' + (this.strokes.length > 1 ? 's' : '') + ' painted. Press Play to hear.'
      : 'Ready — click and drag to paint');
  };

  // --- Rendering ---

  /**
   * Main render loop. Runs at ~60fps via requestAnimationFrame.
   * Redraws all strokes + active stroke on the main canvas,
   * and updates/draws particles on the overlay canvas.
   */
  SoundCanvas.prototype.render = function () {
    var self = this;

    // Clear both canvases
    this.ctx.clearRect(0, 0, this.width, this.height);
    this.octx.clearRect(0, 0, this.width, this.height);

    // Determine which strokes to render
    var strokesToRender = this.strokes;
    var activeStroke = this.currentStroke;

    if (this.playing) {
      // During playback, render only the strokes revealed so far
      strokesToRender = this.playbackStrokes;
      activeStroke = null;
    }

    // Render all visible strokes
    for (var i = 0; i < strokesToRender.length; i++) {
      this.renderStroke(strokesToRender[i]);
    }

    // Render active in-progress stroke
    if (activeStroke && activeStroke.points.length > 1) {
      this.renderStroke(activeStroke);
    }

    // Update + render particles on overlay
    this.particles.update();
    this.particles.render(this.octx);

    // Advance playback if playing
    if (this.playing) {
      this.advancePlayback();
    }

    requestAnimationFrame(function () {
      self.render();
    });
  };

  /**
   * Render a single stroke using its brush mode's visual style.
   */
  SoundCanvas.prototype.renderStroke = function (stroke) {
    var points = stroke.points;
    if (points.length < 2) return;

    for (var i = 1; i < points.length; i++) {
      var p1 = points[i - 1];
      var p2 = points[i];
      this.renderSegment(p1, p2, stroke.mode);
    }
  };

  /**
   * Render a single line segment between two points.
   * Dispatches to the appropriate brush-mode renderer.
   */
  SoundCanvas.prototype.renderSegment = function (p1, p2, mode) {
    switch (mode) {
      case 'glow':
        this.renderGlow(p1, p2);
        break;
      case 'particle':
        this.renderGlow(p1, p2); // particle mode also draws a faint trail
        break;
      case 'ribbon':
        this.renderRibbon(p1, p2);
        break;
    }
  };

  /**
   * Glow brush: wide semi-transparent halo + narrow bright core.
   * Uses additive blending (lighter) so overlaps glow naturally.
   */
  SoundCanvas.prototype.renderGlow = function (p1, p2) {
    var ctx = this.ctx;
    ctx.globalCompositeOperation = 'lighter';

    // Halo — wide, very transparent
    ctx.strokeStyle = 'hsla(' + p2.hue + ', 90%, 55%, 0.06)';
    ctx.lineWidth = 24;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();

    // Mid layer
    ctx.strokeStyle = 'hsla(' + p2.hue + ', 95%, 60%, 0.15)';
    ctx.lineWidth = 10;
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();

    // Core — narrow, bright
    ctx.strokeStyle = 'hsla(' + p2.hue + ', 100%, 75%, 0.6)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();

    ctx.globalCompositeOperation = 'source-over';
  };

  /**
   * Ribbon brush: flowing lines with width tied to speed.
   * Fast movements = thin, sharp ribbons; slow = thick, soft ribbons.
   */
  SoundCanvas.prototype.renderRibbon = function (p1, p2) {
    var ctx = this.ctx;
    ctx.globalCompositeOperation = 'lighter';

    var speed = p2.speed || 0;
    var width = Math.max(2, 18 - speed * 8);

    // Gradient along the segment for a flowing look
    var grad = ctx.createLinearGradient(p1.x, p1.y, p2.x, p2.y);
    grad.addColorStop(0, 'hsla(' + p1.hue + ', 80%, 55%, 0.5)');
    grad.addColorStop(1, 'hsla(' + p2.hue + ', 80%, 60%, 0.5)');

    ctx.strokeStyle = grad;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();

    // Highlight stripe
    ctx.strokeStyle = 'hsla(' + p2.hue + ', 100%, 80%, 0.3)';
    ctx.lineWidth = Math.max(1, width * 0.3);
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();

    ctx.globalCompositeOperation = 'source-over';
  };

  /**
   * Full redraw of all strokes (used after resize or clear).
   */
  SoundCanvas.prototype.redraw = function () {
    this.ctx.clearRect(0, 0, this.width, this.height);
    for (var i = 0; i < this.strokes.length; i++) {
      this.renderStroke(this.strokes[i]);
    }
  };

  // --- Playback ---

  /**
   * Start playback: replays all strokes in chronological order,
   * redrawing them on screen while playing their associated notes.
   */
  SoundCanvas.prototype.startPlayback = function () {
    if (this.strokes.length === 0) {
      this.setStatus('Nothing to play yet — paint something first!');
      return;
    }

    this.audio.init();
    this.playing = true;
    this.playbackStrokes = [];
    this.playbackStrokeIdx = 0;
    this.playbackPointIdx = 1; // start from 2nd point of first stroke
    this.playbackStartTime = performance.now();

    // Record the start time of the first stroke for relative timing
    this.playbackBaseTime = this.strokes[0].points[0].t;

    // Add the first stroke to playback (with just its first point)
    var firstStroke = {
      mode: this.strokes[0].mode,
      points: [this.strokes[0].points[0]]
    };
    this.playbackStrokes.push(firstStroke);

    // Disable controls during playback
    this.setControlsEnabled(false);
    this.setStatus('Playing back...');
  };

  SoundCanvas.prototype.stopPlayback = function () {
    this.playing = false;
    this.playbackStrokes = [];
    this.setControlsEnabled(true);

    var count = this.strokes.length;
    this.setStatus('Ready — ' + count + ' stroke' + (count > 1 ? 's' : '') + ' painted. Press Play to hear again.');
  };

  /**
   * Advance playback by one frame. Reveals points from the original
   * strokes based on elapsed time, and triggers their associated audio.
   */
  SoundCanvas.prototype.advancePlayback = function () {
    var elapsed = performance.now() - this.playbackStartTime;
    var playbackTime = this.playbackBaseTime + elapsed;

    var currentOrigStroke = this.strokes[this.playbackStrokeIdx];
    if (!currentOrigStroke) {
      // All strokes replayed
      var self = this;
      setTimeout(function () {
        self.stopPlayback();
      }, 500);
      return;
    }

    var playbackStroke = this.playbackStrokes[this.playbackStrokes.length - 1];

    // Reveal points whose original timestamp has been reached
    while (this.playbackPointIdx < currentOrigStroke.points.length) {
      var pt = currentOrigStroke.points[this.playbackPointIdx];

      if (pt.t <= playbackTime) {
        // Add this point to the playback stroke
        playbackStroke.points.push(pt);

        // Play the note
        if (pt.t - this.lastNoteTime > NOTE_THROTTLE) {
          var speed = pt.speed || 0;
          var volume = Math.min(0.22, 0.05 + speed * 0.15);
          this.audio.playNote(pt.y, this.height, currentOrigStroke.mode, volume);
          this.lastNoteTime = pt.t;
        }

        // Spawn particles for particle mode
        if (currentOrigStroke.mode === 'particle') {
          this.particles.spawn(pt.x, pt.y, pt.hue);
        }

        this.playbackPointIdx++;
      } else {
        break; // wait for the next frame
      }
    }

    // Move to next stroke if current one is done
    if (this.playbackPointIdx >= currentOrigStroke.points.length) {
      this.playbackStrokeIdx++;
      this.playbackPointIdx = 1; // skip first point (already in playback)

      if (this.playbackStrokeIdx < this.strokes.length) {
        var nextStroke = this.strokes[this.playbackStrokeIdx];
        this.playbackStrokes.push({
          mode: nextStroke.mode,
          points: [nextStroke.points[0]]
        });
      }
    }
  };

  // --- Clear ---

  SoundCanvas.prototype.clear = function () {
    if (this.playing) {
      this.stopPlayback();
    }
    this.strokes = [];
    this.currentStroke = null;
    this.particles.clear();
    this.ctx.clearRect(0, 0, this.width, this.height);
    this.octx.clearRect(0, 0, this.width, this.height);
    this.setStatus('Canvas cleared — click and drag to paint');
  };

  // --- Helpers ---

  SoundCanvas.prototype.setStatus = function (msg) {
    if (this.statusEl) {
      this.statusEl.textContent = msg;
    }
  };

  SoundCanvas.prototype.setControlsEnabled = function (enabled) {
    var playBtn = document.getElementById('play-btn');
    var clearBtn = document.getElementById('clear-btn');
    if (playBtn) playBtn.disabled = !enabled;
    if (clearBtn) clearBtn.disabled = !enabled;

    if (enabled) {
      var playBtn2 = document.getElementById('play-btn');
      if (playBtn2) playBtn2.classList.remove('playing');
    } else {
      var playBtn3 = document.getElementById('play-btn');
      if (playBtn3) playBtn3.classList.add('playing');
    }
  };

  SoundCanvas.prototype.setMode = function (mode) {
    this.mode = mode;
    var btns = document.querySelectorAll('.brush-btn');
    for (var i = 0; i < btns.length; i++) {
      btns[i].classList.toggle('active', btns[i].getAttribute('data-mode') === mode);
    }
  };

  // --- Event binding ---

  SoundCanvas.prototype.bindEvents = function () {
    var self = this;

    // --- Mouse events on canvas ---
    this.canvas.addEventListener('mousedown', function (e) {
      if (self.playing) return;
      self.startStroke(e.clientX, e.clientY);
    });

    this.canvas.addEventListener('mousemove', function (e) {
      if (self.isDrawing) {
        self.addPoint(e.clientX, e.clientY);
      }
    });

    window.addEventListener('mouseup', function () {
      self.endStroke();
    });

    // --- Touch events (mobile/tablet support) ---
    this.canvas.addEventListener('touchstart', function (e) {
      if (self.playing) return;
      e.preventDefault();
      var t = e.touches[0];
      self.startStroke(t.clientX, t.clientY);
    }, { passive: false });

    this.canvas.addEventListener('touchmove', function (e) {
      e.preventDefault();
      if (self.isDrawing) {
        var t = e.touches[0];
        self.addPoint(t.clientX, t.clientY);
      }
    } , { passive: false });

    this.canvas.addEventListener('touchend', function (e) {
      e.preventDefault();
      self.endStroke();
    }, { passive: false });

    // --- Brush mode buttons ---
    var btns = document.querySelectorAll('.brush-btn');
    for (var i = 0; i < btns.length; i++) {
      (function (btn) {
        btn.addEventListener('click', function () {
          if (self.playing) return;
          self.setMode(btn.getAttribute('data-mode'));
        });
      })(btns[i]);
    }

    // --- Play button ---
    var playBtn = document.getElementById('play-btn');
    if (playBtn) {
      playBtn.addEventListener('click', function () {
        if (self.playing) {
          self.stopPlayback();
        } else {
          self.startPlayback();
        }
      });
    }

    // --- Clear button ---
    var clearBtn = document.getElementById('clear-btn');
    if (clearBtn) {
      clearBtn.addEventListener('click', function () {
        self.clear();
      });
    }

    // --- Window resize ---
    window.addEventListener('resize', function () {
      self.resize();
    });

    // --- Keyboard shortcuts ---
    window.addEventListener('keydown', function (e) {
      if (self.playing) return;
      switch (e.key) {
        case '1': self.setMode('glow'); break;
        case '2': self.setMode('particle'); break;
        case '3': self.setMode('ribbon'); break;
        case ' ':
          e.preventDefault();
          self.startPlayback();
          break;
        case 'c':
        case 'C':
          self.clear();
          break;
      }
    });
  };

  // ===== Boot =====

  window.addEventListener('DOMContentLoaded', function () {
    new SoundCanvas();
  });

})();
