/**
 * script.js — Proposal Page Controller
 *
 * STRUCTURE (to be built out in later steps):
 *   1. Asset / ID registry         — central list of all element IDs
 *   2. State machine               — tracks which scene phase we're in
 *   3. Asteroid tap sequence       — whole → cracked → open
 *   4. Ring reveal                 — box closed → open → ring floats
 *   5. UI panel entrance           — text card + buttons slide in
 *   6. Button handlers             — accept (celebrate) / reject (run away)
 *   7. Particle system             — dust + sparkle emitter
 *   8. Idle animations             — float, pulse-glow CSS class toggles
 *   9. Debug / placeholder helpers — logs missing src attributes on load
 */

'use strict';

/* ── 1. ASSET / ELEMENT REGISTRY ─────────────────────────── */

/** All image element IDs declared in index.html */
const ASSET_IDS = [
  'bg-sky',
  'bg-stars-small',
  'bg-stars-large',
  'asteroid-whole',
  'asteroid-cracked',
  'asteroid-shell-open',
  'ring-box-closed',
  'ring-box-open',
  'ring',
  'character-idle',
  'character-reaching',
  'character-holding-box',
  'character-celebrating',
  'btn-accept-icon',
  'btn-reject-icon',
  'particle-dust',
  'particle-sparkle',
];

/** Grab all key DOM nodes once */
const DOM = {
  stage:              document.getElementById('stage'),

  // Backgrounds
  bgSky:              document.getElementById('bg-sky'),
  bgStarsSmall:       document.getElementById('bg-stars-small'),
  bgStarsLarge:       document.getElementById('bg-stars-large'),

  // Asteroid states
  asteroidGroup:      document.getElementById('asteroid-group'),
  asteroidWhole:      document.getElementById('asteroid-whole'),
  asteroidCracked:    document.getElementById('asteroid-cracked'),
  asteroidShellOpen:  document.getElementById('asteroid-shell-open'),

  // Ring box states
  ringBoxGroup:       document.getElementById('ring-box-group'),
  ringBoxClosed:      document.getElementById('ring-box-closed'),
  ringBoxOpen:        document.getElementById('ring-box-open'),
  ring:               document.getElementById('ring'),

  // Character states
  characterGroup:     document.getElementById('character-group'),
  characterIdle:      document.getElementById('character-idle'),
  characterReaching:  document.getElementById('character-reaching'),
  characterHolding:   document.getElementById('character-holding-box'),
  characterCelebrate: document.getElementById('character-celebrating'),

  // UI
  uiPanel:            document.getElementById('ui-panel'),
  textCard:           document.getElementById('text-card'),
  btnAccept:          document.getElementById('btn-accept'),
  btnReject:          document.getElementById('btn-reject'),
  proposalTitle:      document.getElementById('proposal-title'),
  proposalSubtitle:   document.getElementById('proposal-subtitle'),
  dodgeMessage:       document.getElementById('dodge-message'),

  // Particles
  particleContainer:  document.getElementById('particle-container'),
  particleDust:       document.getElementById('particle-dust'),
  particleSparkle:    document.getElementById('particle-sparkle'),

  // Intro overlay
  introOverlay:       document.getElementById('intro-overlay'),
  introStarsCanvas:   document.getElementById('intro-stars-canvas'),
  introPrompt:        document.getElementById('intro-prompt'),

  // Audio
  voiceAudio:         document.getElementById('voice-audio'),

  // Dodge arena
  dodgeArena:         document.getElementById('dodge-arena'),
};

/* ── 2. SCENE STATE MACHINE ───────────────────────────────── */

/**
 * Scene phases (in order):
 *   IDLE       → Character floats; asteroid sits; UI hidden
 *   TAP_1      → Asteroid shows cracked version
 *   TAP_2      → Asteroid shell opens; ring box appears
 *   REVEAL_BOX → Ring box lid opens
 *   REVEAL_RING→ Ring pops out of box; UI panel enters
 *   WAITING    → Waiting for button press
 *   ACCEPTED   → Celebration sequence
 *   REJECTED   → Reject animation (button runs away)
 */
const ALL_PHASES = Object.freeze({
  INTRO:       'INTRO',
  IDLE:        'IDLE',
  TAP_1:       'TAP_1',
  TAP_2:       'TAP_2',
  REVEAL_BOX:  'REVEAL_BOX',
  REVEAL_RING: 'REVEAL_RING',
  WAITING:     'WAITING',
  ACCEPTED:    'ACCEPTED',
  REJECTED:    'REJECTED',
});

let currentPhase = ALL_PHASES.INTRO;

function setPhase(phase) {
  console.log(`[Phase] ${currentPhase} → ${phase}`);
  currentPhase = phase;
}

/* ── 3. UTILITY HELPERS ───────────────────────────────────── */

/**
 * Cross-fade between two elements in the same "stack".
 * @param {HTMLElement} hideEl — element to fade out
 * @param {HTMLElement} showEl — element to fade in
 * @param {number} durationMs
 */
function crossFade(hideEl, showEl, durationMs = 400) {
  if (!hideEl || !showEl) return;
  hideEl.style.transition = `opacity ${durationMs}ms ease`;
  showEl.style.transition = `opacity ${durationMs}ms ease`;
  hideEl.style.opacity = '0';
  showEl.style.opacity = '1';
}

/**
 * Delay helper (Promise-based).
 * @param {number} ms
 * @returns {Promise<void>}
 */
function wait(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Toggle CSS animation class with auto-removal.
 * @param {HTMLElement} el
 * @param {string} className
 */
function triggerAnimation(el, className) {
  if (!el) return;
  el.classList.remove(className);
  // Force reflow so re-adding the class restarts the animation
  void el.offsetWidth;
  el.classList.add(className);
}

/* ── 4. ASTEROID TAP SEQUENCE ───────────────────────────────────── */

/**
 * Handles taps/clicks on the asteroid after it has landed.
 * Only fires in IDLE phase (set by asteroidFall after landing).
 * Immediately locks input by advancing the phase, then runs the full
 * open → box-lift → audio → ring reveal chain.
 */
async function handleAsteroidTap() {
  if (currentPhase !== ALL_PHASES.IDLE) return; // guard: only one tap
  DOM.asteroidGroup.style.cursor = 'default';
  const hint = document.getElementById('tap-asteroid-hint');
  if (hint) hint.classList.remove('show-hint');
  await openAsteroid();
}

/**
 * Full asteroid-open + ring-reveal orchestration.
 * Called by handleAsteroidTap after the landing is complete.
 *
 * Timeline:
 *  0ms      setPhase TAP_1
 *  0–400ms  crossFade cracked → shell-open
 *  0ms      liftRingBox() starts simultaneously (WAAPI, 700ms)
 *  700ms    liftRingBox settles → playProposalAudio()
 *  800ms    openRingBox() — lid crossfade (400ms)
 *  1200ms   revealRingWithSparkle() — ring scales in + sparkles loop
 *  1700ms   UI panel bounces in, phase → WAITING
 */
async function openAsteroid() {
  setPhase(ALL_PHASES.TAP_1);

  // 1. Crack opens: crossfade asteroid-cracked → asteroid-shell-open
  crossFade(DOM.asteroidCracked, DOM.asteroidShellOpen, 400);

  // 2. Simultaneously lift the ring box from inside the crack
  //    (liftRingBox handles its own timing and returns a promise)
  await liftRingBox();

  // 3. Let the asteroid open animation settle, then open the box lid
  await wait(150);
  setPhase(ALL_PHASES.REVEAL_BOX);
  await openRingBox();

  // 4. Audio unlocked by intro tap — safe to play now, lid has opened
  playProposalAudio();

  // 5. Ring appears with sparkle loop
  await wait(100);
  await revealRingWithSparkle();

  // 6. Bring in the proposal UI panel
  await wait(500);
  DOM.uiPanel?.classList.add('animate-in');

  // 7. Init the button arena — fades buttons in + starts dodge tracking
  //    Small delay so the panel bounce-in settles first
  await wait(300);
  initButtonArena();

  // 8. Done — scene waits for button press
  setPhase(ALL_PHASES.WAITING);
  DOM.asteroidGroup.style.cursor = 'default';
  console.log('%c[Phase] Ring revealed — waiting for response 💍', 'color:#FFAFCC;font-weight:bold');
}

/* ── 5. RING BOX REVEAL SEQUENCE ──────────────────────────────── */

/**
 * Plays #voice-audio.
 * Safe to call with empty src — the catch swallows AbortError.
 * The audio element was unlocked by the intro-overlay tap via audio.load().
 */
function playProposalAudio() {
  const audio = DOM.voiceAudio;
  if (!audio) return;

  // If no src has been assigned yet, skip gracefully
  if (!audio.src || audio.src === window.location.href) {
    console.log('%c[Audio] No src set on #voice-audio — skipping playback', 'color:#FFD166');
    return;
  }

  audio.currentTime = 0;
  audio.muted = false;
  audio.volume = 0.015; // Lower ambient music volume (half of 0.15)

  audio.play().then(() => {
    console.log('%c[Audio] Proposal audio playing 🎵', 'color:#FFD166;font-weight:bold');
  }).catch(err => {
    // AbortError is expected if the audio is interrupted; NotAllowedError means
    // the user gesture chain was broken. Log but don't crash.
    console.warn('[Audio] play() failed:', err.name, '—', err.message);
  });
}

/**
 * Animates #ring-box-group rising from inside the asteroid crack.
 *
 * Uses WAAPI so we can await it. The box starts at scale(0.2) opacity(0)
 * (set in CSS) and bounces up to full size — exactly as if being lifted
 * out by a clay character from within the asteroid.
 *
 * @returns {Promise} resolves when the lift animation is complete
 */
function liftRingBox() {
  const group = DOM.ringBoxGroup;
  if (!group) return Promise.resolve();

  // WAAPI keyframes — match the @keyframes box-lift reference in CSS
  const anim = group.animate(
    [
      { transform: 'translateX(-50%) scale(0.2) translateY(60px)', opacity: 0 },
      { transform: 'translateX(-50%) scale(1.05) translateY(-10px)', opacity: 1, offset: 0.65,
        easing: 'cubic-bezier(0.34, 1.56, 0.64, 1)' },
      { transform: 'translateX(-50%) scale(0.98) translateY(2px)', opacity: 1, offset: 0.85 },
      { transform: 'translateX(-50%) scale(1.0) translateY(0px)',  opacity: 1 },
    ],
    {
      duration: 800,
      easing:   'cubic-bezier(0.34, 1.56, 0.64, 1)',
      fill:     'forwards',
    }
  );

  // After animation, pin the inline style so CSS doesn't snap it back
  return anim.finished.then(() => {
    group.style.transform = 'translateX(-50%) scale(1)';
    group.style.opacity   = '1';
    // Add pulse-glow so the box glows while we wait for the lid to open
    group.classList.add('pulse-glow');
    console.log('%c[RingBox] Lifted out of asteroid ✨', 'color:#FFD166');
  });
}

/**
 * Opens the ring-box lid.
 *
 * Strategy:
 *  a) If a #ring-box-lid child element exists inside #ring-box-closed,
 *     apply the .lid-opening CSS class for a 3D rotateX tilt.
 *  b) Otherwise (single flat image), cross-fade closed → open.
 *
 * @returns {Promise} resolves after the open transition completes
 */
function openRingBox() {
  // Remove pulse-glow now that the action starts
  DOM.ringBoxGroup?.classList.remove('pulse-glow');

  // Option A: split lid element
  const lid = document.getElementById('ring-box-lid');
  if (lid) {
    lid.classList.add('lid-opening');
    return wait(520); // let the CSS animation finish
  }

  // Option B: single flat image crossfade
  crossFade(DOM.ringBoxClosed, DOM.ringBoxOpen, 400);
  return wait(450);
}

/**
 * Fades/scales the ring in with a bounce, then starts the ambient sparkle loop.
 * @returns {Promise} resolves after ring finishes its entrance
 */
async function revealRingWithSparkle() {
  setPhase(ALL_PHASES.REVEAL_RING);

  const ring = DOM.ring;
  if (ring) {
    // Make ring visible and apply the scale-in animation
    ring.style.opacity = '1';
    ring.classList.add('ring-reveal');

    // Also pulse-glow the ring continuously after reveal
    ring.addEventListener('animationend', () => {
      ring.classList.remove('ring-reveal');
      ring.classList.add('pulse-glow');
    }, { once: true });
  }

  // Start ambient sparkle particles around the ring box
  spawnAmbientSparkles();

  // Simultaneously swap character to holding-box pose
  crossFade(DOM.characterReaching, DOM.characterHolding, 500);

  await wait(550); // wait for ring entrance
}

/**
 * Spawns a small cluster of looping ambient sparkle images around #ring-box-group.
 * Each sparkle clone uses CSS custom properties for staggered delay/duration
 * so they never all pulse at once.
 *
 * Safe to call with empty #particle-sparkle src — gracefully skips cloning
 * if the image hasn't loaded, but still places emoji fallbacks.
 */
function spawnAmbientSparkles() {
  const boxGroup  = DOM.ringBoxGroup;
  const template  = DOM.particleSparkle;
  const container = DOM.particleContainer;
  if (!boxGroup || !container) return;

  // Compute position of ring-box-group center relative to the viewport
  const rect   = boxGroup.getBoundingClientRect();
  const cx     = rect.left + rect.width  / 2;  // px from left
  const cy     = rect.top  + rect.height / 2;  // px from top

  const SPARKLE_COUNT = 6;
  const hasSrc = template && template.src && template.src !== window.location.href;

  // Scatter positions relative to box center
  const positions = [
    { rx: -0.55, ry: -0.60 },  // top-left
    { rx:  0.60, ry: -0.55 },  // top-right
    { rx: -0.70, ry:  0.10 },  // mid-left
    { rx:  0.70, ry:  0.15 },  // mid-right
    { rx:  0.00, ry: -0.80 },  // top-center
    { rx:  0.05, ry:  0.50 },  // bottom
  ];

  const halfW = rect.width  / 2;
  const halfH = rect.height / 2;

  positions.forEach((pos, i) => {
    const dur   = (1.8 + Math.random() * 1.2).toFixed(2); // 1.8 – 3.0 s
    const delay = (i * 0.28).toFixed(2);                  // stagger 0 – 1.4 s
    const size  = 16 + Math.random() * 14;                 // 16 – 30 px

    let node;
    if (hasSrc) {
      node = template.cloneNode(true);
      node.id = '';
      node.style.display = 'block';
    } else {
      // Fallback: emoji span
      node = document.createElement('span');
      node.textContent = '✨';
      node.style.fontSize = `${size}px`;
      node.style.lineHeight = '1';
    }

    node.classList.add('sparkle-ambient');
    node.style.setProperty('--sparkle-dur',   `${dur}s`);
    node.style.setProperty('--sparkle-delay', `${delay}s`);

    node.style.position = 'fixed';
    node.style.width    = `${size}px`;
    node.style.height   = `${size}px`;
    node.style.objectFit = 'contain';
    node.style.pointerEvents = 'none';
    node.style.zIndex = String(Number(getComputedStyle(document.documentElement)
      .getPropertyValue('--z-particles').trim()) + 1);

    // Position: center of ring-box-group + scaled offset
    node.style.left = `${cx + pos.rx * halfW * 2.2 - size / 2}px`;
    node.style.top  = `${cy + pos.ry * halfH * 2.2 - size / 2}px`;

    container.appendChild(node);

    // Store reference for cleanup if needed
    node.dataset.ambientSparkle = 'true';
  });

  console.log('%c[Sparkle] Ambient sparkles started ✨', 'color:#FFAFCC');
}

/* ── 6. BUTTON HANDLERS & DODGE SYSTEM ───────────────────────── */

/* ── 6a. CELEBRATION SEQUENCE ────────────────────────────── */

/**
 * Fades the dodge-arena (both buttons) out over 400ms then hides it.
 */
function fadeOutButtons() {
  const arena = DOM.dodgeArena;
  if (!arena) return;
  arena.style.transition = 'opacity 400ms ease';
  arena.style.opacity    = '0';
  setTimeout(() => { arena.style.display = 'none'; }, 420);
}

/**
 * Creates and animates the #celebration-message card into the scene.
 * Placeholder text: "She said YES! 💍✨"
 */
function showCelebrationMessage() {
  // Build the card dynamically so it doesn't block the DOM before accepted
  const card = document.createElement('div');
  card.id = 'celebration-message';
  card.className = 'clay clay--glass';
  card.setAttribute('role', 'status');
  card.setAttribute('aria-live', 'polite');

  const headline = document.createElement('p');
  headline.id = 'celebration-yes-text';
  headline.textContent = 'She said YES! 💍✨';

  const sub = document.createElement('p');
  sub.id = 'celebration-sub-text';
  sub.textContent = 'Best asteroid discovery ever 🌟';

  card.appendChild(headline);
  card.appendChild(sub);

  // Insert into #stage (z-index positions it correctly via CSS)
  DOM.stage.appendChild(card);

  // Trigger entrance animation on next frame
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      card.classList.add('visible');
    });
  });

  console.log('%c[Celebration] Message shown 💍', 'color:#FFD166;font-weight:bold');
}

/**
 * Spawns 24–28 confetti + heart particles that burst upward from the
 * center-bottom of the screen and fall with rotation and fade-out.
 *
 * Particle types (no external library):
 *   a) Clones of #particle-sparkle (if src is set)
 *   b) CSS-drawn filled circles in palette colors
 *   c) Heart-shaped divs using CSS clip-path
 *
 * Each particle is animated with WAAPI:
 *   – Launched upward at a random angle (mostly 250°–290° from right)
 *   – Falls under simulated gravity (quadratic y interpolation)
 *   – Rotates 120°–360° over its lifetime
 *   – Fades out in the final 30% of its arc
 */
function burstConfetti() {
  const container = DOM.particleContainer;
  if (!container) return;

  const template = DOM.particleSparkle;
  const hasSrc   = template && template.src && template.src !== window.location.href;

  // Palette for pure-CSS particles
  const colors = [
    'var(--color-glow-gold)',
    'var(--color-accent-pink)',
    'var(--color-asteroid-pink)',
    'var(--color-asteroid-blue)',
    '#fff',
  ];

  // Heart clip-path (CSS)
  const HEART_CLIP = 'polygon(50% 0%, 61% 11%, 100% 20%, 100% 50%, 85% 70%, 50% 100%, 15% 70%, 0% 50%, 0% 20%, 39% 11%)';

  const COUNT  = 26;
  const cx     = window.innerWidth  / 2;  // launch x: center of screen
  const cy     = window.innerHeight * 0.72; // launch y: approx asteroid base

  for (let i = 0; i < COUNT; i++) {
    /* — pick a particle shape — */
    const shapeRoll = Math.random();
    let node;

    if (hasSrc && shapeRoll < 0.4) {
      // Clone sparkle image
      node = template.cloneNode(true);
      node.id = '';
      node.style.display = 'block';
    } else if (shapeRoll < 0.7) {
      // Heart
      node = document.createElement('div');
      node.style.clipPath = HEART_CLIP;
      node.style.background = colors[Math.floor(Math.random() * colors.length)];
    } else {
      // Circle
      node = document.createElement('div');
      node.style.borderRadius = '50%';
      node.style.background   = colors[Math.floor(Math.random() * colors.length)];
    }

    node.classList.add('confetti-particle');

    const size = 14 + Math.random() * 20;   // 14–34 px
    node.style.width  = `${size}px`;
    node.style.height = `${size}px`;
    node.style.objectFit = 'contain';

    // Start at launch point
    node.style.left = `${cx - size / 2}px`;
    node.style.top  = `${cy - size / 2}px`;

    container.appendChild(node);

    /* — physics — */
    // Launch angle: biased upward (90° ± 60°), full fan for confetti feel
    const angleDeg  = -90 + (Math.random() - 0.5) * 140; // -160 to -20 deg
    const angleRad  = (angleDeg * Math.PI) / 180;
    const speed     = 180 + Math.random() * 260;          // px initial velocity
    const vx        = Math.cos(angleRad) * speed;
    const vy        = Math.sin(angleRad) * speed;

    const dur       = 1000 + Math.random() * 1000;        // 1.0–2.0 s
    const delay     = Math.random() * 200;                 // 0–200 ms stagger
    const rotEnd    = (Math.random() > 0.5 ? 1 : -1)
                      * (120 + Math.random() * 240);       // ±120°–360° rotation
    const gravity   = 380 + Math.random() * 160;          // px/s² simulated gravity

    // WAAPI keyframes: 5 steps to simulate projectile arc
    const STEPS  = 5;
    const frames = [];
    for (let s = 0; s <= STEPS; s++) {
      const t   = s / STEPS;
      const px  = vx * t * (dur / 1000);
      const py  = vy * t * (dur / 1000) + 0.5 * gravity * t * t * (dur / 1000) * (dur / 1000);
      const rot = rotEnd * t;
      const op  = t < 0.65 ? 1 : 1 - (t - 0.65) / 0.35; // fade last 35%

      frames.push({
        transform: `translate(${px.toFixed(1)}px, ${py.toFixed(1)}px) rotate(${rot.toFixed(1)}deg)`,
        opacity:   op.toFixed(3),
        offset:    t,
      });
    }

    node.animate(frames, {
      duration: dur,
      delay,
      easing:  'linear',
      fill:    'forwards',
    });

    // Remove after animation so DOM doesn't fill up
    setTimeout(() => node.remove(), dur + delay + 50);
  }

  console.log(`%c[Confetti] ${COUNT} particles launched 🎊`, 'color:#FFD166');
}

/**
 * handleAccept() — the YES handler.
 *
 * Orchestration:
 *  0ms      lock phase → ACCEPTED, stop dodge
 *  0ms      fade out arena (buttons disappear over 400ms)
 *  0ms      character crossfade: holding → celebrating
 *  350ms    .char-bounce on #character-group (happy bounce × 2)
 *  0ms      burstConfetti() — 26 particles fly upward
 *  400ms    showCelebrationMessage() — gold card slides in
 *  (hold)   scene stays in this state indefinitely — nothing auto-resets
 */
async function handleAccept() {
  if (currentPhase !== ALL_PHASES.WAITING) return;
  setPhase(ALL_PHASES.ACCEPTED);

  // 1. Stop dodge listeners immediately
  stopDodge();

  // 2. Fade the buttons out
  fadeOutButtons();

  // 3. Remove ambient ring sparkles (scene is about to be jubilant)
  document.querySelectorAll('[data-ambient-sparkle]').forEach(n => n.remove());

  // 4. Swap character to celebrating pose
  crossFade(DOM.characterHolding, DOM.characterCelebrate, 400);

  // 5. Happy bounce on character group after crossfade settles
  await wait(350);
  DOM.characterGroup?.classList.add('char-bounce');
  DOM.characterGroup?.addEventListener('animationend', () => {
    DOM.characterGroup.classList.remove('char-bounce');
  }, { once: true });

  // 6. Burst confetti + heart particles
  burstConfetti();

  // 7. Show the big celebration message card
  await wait(400);
  showCelebrationMessage();

  console.log('%c[Proposal] Accepted! 🎊 Scene is now in final calm state.', 'color:#FFD166;font-weight:bold;font-size:13px');
  // Nothing else happens — scene holds this state forever.
}

/**
 * Touch fallback for #btn-reject tap.
 * We NEVER process a rejection — instead always dodge with the big wobble.
 * This is the guaranteed "no escape" mechanic.
 */
function handleRejectTouch() {
  // Show a "nice try" escalating message, then dodge with big wobble
  const niceTryMessages = [
    'Nice try 😏',
    'Not so fast! 😉',
    'The ring says otherwise 💍',
    'You can’t escape destiny ✨',
    'I caught you! 🦹',
  ];
  const idx = Math.min(dodgeCount, niceTryMessages.length - 1);
  if (DOM.dodgeMessage) {
    DOM.dodgeMessage.textContent = niceTryMessages[idx];
    DOM.dodgeMessage.classList.add('visible');
  }

  // Dodge with the exaggerated "nice try" big wobble
  dodgeRejectButton(/* big = */ true);
}

/* ──────────────────────────────────────────────────────────────
 * DODGE SYSTEM
 * ────────────────────────────────────────────────────────────── */

/** How many times reject has dodged (drives message escalation) */
let dodgeCount = 0;

/**
 * Throttle timestamp — ensures dodge fires at most once per 150ms
 * regardless of how fast the mouse moves.
 */
let lastDodgeTime = 0;
const DODGE_THROTTLE_MS = 150;

/** Current reject button position within the arena (px from arena top-left) */
let rejectPos = { x: 0, y: 0 };

/** Cleanup reference for the mousemove/touchmove listeners */
let _dodgeCleanup = null;

/**
 * stopDodge() — removes proximity listeners and clears cleanup.
 */
function stopDodge() {
  if (_dodgeCleanup) { _dodgeCleanup(); _dodgeCleanup = null; }
}

/**
 * Picks a valid random position for #btn-reject inside the arena,
 * ensuring:
 *   • at least EDGE_PAD px from all four arena edges
 *   • at least ACCEPT_GAP px away from #btn-accept
 *
 * @returns {{ x: number, y: number }} pixel offsets from arena top-left
 */
function pickDodgePosition() {
  const isMobile = window.innerWidth <= 430;
  const EDGE_PAD   = isMobile ? 20 : 40;   // px from arena edges
  const ACCEPT_GAP = isMobile ? 85 : 100;  // min distance from accept button center
  const MAX_TRIES  = 40;   // bail-out cap

  const arena      = DOM.dodgeArena.getBoundingClientRect();
  const reject     = DOM.btnReject.getBoundingClientRect();
  const acceptEl   = DOM.btnAccept.getBoundingClientRect();

  // Accept button center in arena-local coordinates
  const acceptCx = acceptEl.left - arena.left + acceptEl.width  / 2;
  const acceptCy = acceptEl.top  - arena.top  + acceptEl.height / 2;

  const maxX = arena.width  - reject.width  - EDGE_PAD;
  const maxY = arena.height - reject.height - EDGE_PAD;

  for (let i = 0; i < MAX_TRIES; i++) {
    const x = EDGE_PAD + Math.random() * Math.max(0, maxX - EDGE_PAD);
    const y = EDGE_PAD + Math.random() * Math.max(0, maxY - EDGE_PAD);

    // Center of candidate reject position
    const rcx = x + reject.width  / 2;
    const rcy = y + reject.height / 2;

    const dist = Math.hypot(rcx - acceptCx, rcy - acceptCy);
    if (dist >= ACCEPT_GAP) return { x, y };
  }

  // Fallback: clamp to safe zone near arena bottom-right
  return {
    x: Math.max(EDGE_PAD, maxX * 0.75),
    y: Math.max(EDGE_PAD, maxY * 0.75),
  };
}

/**
 * Moves #btn-reject to a new random valid position and plays the wobble.
 * @param {boolean} [big=false] — true plays the larger "nice try" wobble
 */
function dodgeRejectButton(big = false) {
  dodgeCount++;

  const pos = pickDodgePosition();
  rejectPos = pos;

  const btn = DOM.btnReject;

  // Move via left/top (CSS transition handles the smooth glide)
  btn.style.left = `${pos.x}px`;
  btn.style.top  = `${pos.y}px`;

  // Wobble animation
  const wobbleClass = big ? 'btn-dodge-wobble-big' : 'btn-dodge-wobble';
  btn.classList.remove('btn-dodge-wobble', 'btn-dodge-wobble-big');
  void btn.offsetWidth; // reflow restart
  btn.classList.add(wobbleClass);
  btn.addEventListener('animationend', () => {
    btn.classList.remove(wobbleClass);
  }, { once: true });

  // Subtitle message carousel (normal dodge)
  if (!big) {
    const msgs = [
      'Are you sure? 🥺',
      'Think about it…',
      'Come on… 💕',
      'Pretty please? 🌸',
      'The ring is very sparkly ✨',
      'Almost there… just click Yes 💍',
    ];
    const idx = Math.min(dodgeCount - 1, msgs.length - 1);
    if (DOM.dodgeMessage) {
      DOM.dodgeMessage.textContent = msgs[idx];
      DOM.dodgeMessage.classList.add('visible');
    }
  }

  console.log(`%c[Dodge] #${dodgeCount}${big ? ' (BIG)' : ''} → (${pos.x.toFixed(0)}, ${pos.y.toFixed(0)})`, 'color:#BDE0FE');
}

/**
 * initButtonArena() — called after the ring reveal UI panel animates in.
 *
 * 1. Fades in both buttons (adds .btn-visible).
 * 2. Positions #btn-reject absolutely, to the right of #btn-accept.
 * 3. Attaches mousemove + touchmove listeners on #dodge-arena.
 *    • On proximity within 60px of reject bounding box → dodge.
 *    • Throttled to 150ms.
 * 4. Attaches click on #btn-accept → handleAccept.
 * 5. Attaches click on #btn-reject → handleRejectTouch (touch fallback — always dodges).
 */
function initButtonArena() {
  const arena  = DOM.dodgeArena;
  const accept = DOM.btnAccept;
  const reject = DOM.btnReject;
  if (!arena || !accept || !reject) return;

  // ─ 1. (Removed fixed minHeight from JS, using CSS instead for better mobile control)

  // ─ 2. Measure accept button and place reject to its right with a gap
  //    We need a frame so the browser has laid out the accept button.
  requestAnimationFrame(() => {
    const arenaRect  = arena.getBoundingClientRect();
    const acceptRect = accept.getBoundingClientRect();

    // Initial reject position: right of accept + 24px gap
    const initX = (acceptRect.right - arenaRect.left) + 24;
    const initY = (acceptRect.top  - arenaRect.top);

    reject.style.left = `${initX}px`;
    reject.style.top  = `${initY}px`;
    rejectPos = { x: initX, y: initY };

    // ─ 3. Fade both buttons in
    // Stagger: accept first, reject 80ms later for a nice entrance
    requestAnimationFrame(() => {
      accept.classList.add('btn-visible');
      setTimeout(() => reject.classList.add('btn-visible'), 80);
    });

    // ─ 4. Proximity tracking
    const PROXIMITY_PX = 60;

    function onPointerMove(e) {
      if (currentPhase !== ALL_PHASES.WAITING) return;

      const now = Date.now();
      if (now - lastDodgeTime < DODGE_THROTTLE_MS) return;

      // Get pointer position (supports both mouse and touch)
      const clientX = e.touches ? e.touches[0].clientX : e.clientX;
      const clientY = e.touches ? e.touches[0].clientY : e.clientY;

      // Reject button bounding box
      const rRect = reject.getBoundingClientRect();

      // Closest point on reject rect to cursor
      const nearX = Math.max(rRect.left, Math.min(clientX, rRect.right));
      const nearY = Math.max(rRect.top,  Math.min(clientY, rRect.bottom));
      const dist  = Math.hypot(clientX - nearX, clientY - nearY);

      if (dist < PROXIMITY_PX) {
        lastDodgeTime = now;
        dodgeRejectButton(false);
      }
    }

    arena.addEventListener('mousemove',  onPointerMove, { passive: true });
    arena.addEventListener('touchmove',  onPointerMove, { passive: true });

    // Store cleanup for later
    _dodgeCleanup = () => {
      arena.removeEventListener('mousemove', onPointerMove);
      arena.removeEventListener('touchmove', onPointerMove);
    };

    console.log('%c[DodgeArena] Initialised — tracking proximity 🎯', 'color:#BDE0FE;font-weight:bold');
  });

  // ─ 5. Click listeners
  // #btn-accept: normal accept handler
  accept.addEventListener('click', handleAccept);

  // #btn-reject: ALWAYS dodges on any click/tap (no rejection possible)
  reject.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    handleRejectTouch();
  });
  // Belt-and-suspenders: also trap touchend on reject
  reject.addEventListener('touchend', (e) => {
    e.preventDefault();
    e.stopPropagation();
    handleRejectTouch();
  }, { passive: false });
}

/* ── 7. PARTICLE SYSTEM ────────────────────────────────────── */

/**
 * Emits N particle clones from the template image.
 * @param {number} count
 * @param {'sparkle'|'dust'} type
 */
function burstParticles(count, type) {
  const template = type === 'sparkle' ? DOM.particleSparkle : DOM.particleDust;
  const container = DOM.particleContainer;
  if (!template || !container) return;

  for (let i = 0; i < count; i++) {
    const clone = template.cloneNode(true);
    clone.id = ''; // avoid duplicate IDs
    clone.classList.add('particle');
    clone.style.display = 'block';

    // Random start near center of screen
    const startX = 30 + Math.random() * 40;  // % from left
    const startY = 30 + Math.random() * 40;  // % from top
    clone.style.left = `${startX}vw`;
    clone.style.top  = `${startY}vh`;

    // Size
    const size = 24 + Math.random() * 40;
    clone.style.width  = `${size}px`;
    clone.style.height = `${size}px`;
    clone.style.objectFit = 'contain';

    container.appendChild(clone);

    // Animate with Web Animations API
    const angle    = Math.random() * 2 * Math.PI;
    const distance = 80 + Math.random() * 200;
    const dx = Math.cos(angle) * distance;
    const dy = Math.sin(angle) * distance - 60; // upward bias

    clone.animate(
      [
        { opacity: 1,   transform: 'translate(0,0) rotate(0deg) scale(1)' },
        { opacity: 0.8, transform: `translate(${dx * 0.4}px, ${dy * 0.4}px) rotate(${Math.random()*180}deg) scale(1.2)`, offset: 0.4 },
        { opacity: 0,   transform: `translate(${dx}px, ${dy}px) rotate(${Math.random()*360}deg) scale(0.2)` },
      ],
      {
        duration: 900 + Math.random() * 800,
        delay:    Math.random() * 300,
        easing:   'cubic-bezier(0.25, 0.46, 0.45, 0.94)',
        fill:     'forwards',
      }
    ).onfinish = () => clone.remove();
  }
}

/* ── 8. IDLE ANIMATIONS ───────────────────────────────────────── */

function startIdleAnimations() {
  // Character gently floats — asteroid bob is handled separately post-landing
  DOM.characterGroup?.classList.add('float');
}

/**
 * Starts the gentle idle bob on the asteroid AFTER it has landed.
 * We apply it via inline style (not the .float class) so it doesn't
 * conflict with the fall animation's transform.
 */
function startAsteroidIdleBob() {
  if (!DOM.asteroidGroup) return;
  DOM.asteroidGroup.style.animation = 'float 4s ease-in-out 0.5s infinite';
}

/* ── 9. DEBUG — PLACEHOLDER CHECKER ───────────────────────── */

/**
 * On load, log which image IDs have empty src so you know what to fill in.
 * Adds a tooltip-style title attr so you can identify broken imgs on hover.
 */
function auditPlaceholders() {
  const all = document.querySelectorAll('img');
  const missing = [];

  all.forEach(img => {
    if (!img.src || img.src === window.location.href) {
      // Browser treats src="" as current page URL in img.src
      missing.push(img.id || img.alt || '(unnamed img)');
      if (img.id) {
        img.setAttribute('title', `[placeholder] id="${img.id}" — src not yet set`);
      }
    }
  });

  if (missing.length) {
    console.group('%c[Proposal Page] Placeholder images (fill in src= to activate)', 'color:#FFD166;font-weight:bold');
    missing.forEach(id => console.log(`  • ${id}`));
    console.groupEnd();
  } else {
    console.log('%c[Proposal Page] All images have src values ✔', 'color:#BDE0FE');
  }
}

/* ── A. INTRO OVERLAY MODULE ─────────────────────────────── */

/**
 * Draws and animates twinkling star particles on the intro canvas.
 * Stars are plain white circles that pulse in opacity with staggered delays.
 * This runs entirely in JS (requestAnimationFrame) so no extra assets needed.
 */
function startIntroStarCanvas() {
  const canvas = DOM.introStarsCanvas;
  if (!canvas) return;

  const ctx = canvas.getContext('2d');

  // Size the canvas to fill the overlay
  function resizeCanvas() {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  resizeCanvas();
  window.addEventListener('resize', resizeCanvas, { passive: true });

  // Generate star data
  const STAR_COUNT = 120;
  const stars = Array.from({ length: STAR_COUNT }, (_, i) => ({
    x:        Math.random(),          // 0-1 fractional position
    y:        Math.random(),
    r:        0.6 + Math.random() * 2.0,   // radius 0.6–2.6 px
    baseAlpha:0.3 + Math.random() * 0.55,  // resting opacity 0.3–0.85
    phase:    Math.random() * Math.PI * 2, // stagger offset
    speed:    0.0006 + Math.random() * 0.0014, // pulse speed
  }));

  let rafId;
  let startTime = null;

  function draw(timestamp) {
    if (!startTime) startTime = timestamp;
    const t = timestamp - startTime;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    stars.forEach(star => {
      // Opacity oscillates between ~20% of baseAlpha and 100%
      const wave  = Math.sin(t * star.speed * 1000 + star.phase);
      const alpha = star.baseAlpha * (0.35 + 0.65 * (wave * 0.5 + 0.5));

      ctx.beginPath();
      ctx.arc(
        star.x * canvas.width,
        star.y * canvas.height,
        star.r,
        0, Math.PI * 2
      );
      ctx.fillStyle = `rgba(255, 255, 255, ${alpha.toFixed(3)})`;
      ctx.fill();
    });

    rafId = requestAnimationFrame(draw);
  }

  rafId = requestAnimationFrame(draw);

  // Return a stop handle so we can clean up after the overlay is gone
  return () => {
    cancelAnimationFrame(rafId);
    window.removeEventListener('resize', resizeCanvas);
  };
}

/**
 * Unlocks the audio element without playing it.
 * Calling .load() inside a user-gesture handler satisfies browser
 * autoplay policies — the element is now "unlocked" for future .play() calls.
 */
function unlockAudio() {
  const audio = DOM.voiceAudio;
  if (!audio) return;
  // .load() resets and re-fetches; safe to call even with src=""
  try { audio.load(); } catch (e) { /* no src yet — that's fine */ }
  console.log('%c[Audio] Unlocked for future playback ✓', 'color:#FFD166');
}

/* ── B. ASTEROID FALL SEQUENCE ───────────────────────────────── */

/**
 * Triggers the #stage screen-shake CSS animation.
 * Removes the class after the animation completes so it can retrigger.
 */
function screenShake() {
  const stage = DOM.stage;
  if (!stage) return;
  stage.classList.remove('shake');
  void stage.offsetWidth;           // force reflow to restart animation
  stage.classList.add('shake');
  stage.addEventListener('animationend', () => stage.classList.remove('shake'), { once: true });
}

/**
 * Spawns impact dust:
 *  • Always: CSS gradient radial puff divs at the asteroid base.
 *  • Additionally: image particle clones if #particle-dust has a src.
 * @param {number} [x=50]   - horizontal center of burst, in vw units
 * @param {number} [y=70]   - vertical center of burst, in vh units
 */
function spawnImpactDust(x = 50, y = 70) {
  const container = DOM.particleContainer;
  if (!container) return;

  /* —— A. CSS gradient puffs (always shown, no image needed) —— */
  const PUFF_COUNT = 8;
  for (let i = 0; i < PUFF_COUNT; i++) {
    const puff = document.createElement('div');
    puff.classList.add('impact-dust-puff');

    // Spread puffs in a wide horizontal arc at the base of the asteroid
    const angle   = (Math.PI * 0.8) + (Math.random() * Math.PI * 0.4); // mostly sideways/upward arc
    const dist    = 60 + Math.random() * 140;   // px travel distance
    const size    = 60 + Math.random() * 120;   // px diameter
    const delay   = Math.random() * 120;         // ms stagger
    const durBase = 550 + Math.random() * 250;  // ms animation duration

    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist;

    // Start position: near the asteroid landing point
    puff.style.cssText = `
      left: calc(${x}vw + ${dx * 0.1}px - ${size / 2}px);
      top:  calc(${y}vh - ${size * 0.1}px);
      width:  ${size}px;
      height: ${size * 0.55}px;
      animation-duration: ${durBase}ms;
      animation-delay: ${delay}ms;
      animation-fill-mode: both;
    `;

    container.appendChild(puff);

    // Translate the puff outward while CSS handles scale+opacity
    puff.animate(
      [
        { transform: `translate(0, 0)`                   },
        { transform: `translate(${dx}px, ${dy * 0.6}px)` },
      ],
      { duration: durBase, delay, easing: 'ease-out', fill: 'forwards' }
    );

    setTimeout(() => puff.remove(), durBase + delay + 50);
  }

  /* —— B. Image particle clones (only if src is set) —— */
  const template = DOM.particleDust;
  if (template && template.src && template.src !== window.location.href) {
    burstParticles(16, 'dust');
  }
}

/**
 * Triggers the clay impact-squash animation on the asteroid group.
 */
function impactSquash() {
  const el = DOM.asteroidGroup;
  if (!el) return;
  el.classList.remove('impact-squash');
  void el.offsetWidth;
  el.classList.add('impact-squash');
  el.addEventListener('animationend', () => el.classList.remove('impact-squash'), { once: true });
}

/**
 * Animates #asteroid-group falling from above the viewport to its landed
 * position at the center-lower-third of the screen.
 *
 * Fall physics:
 *  • Start: -120% of its own height (fully off-screen above)
 *  • End:    0px translateY (bottom:0 in CSS places it at lower edge)
 *  • Easing: cubic-bezier(0.55, 0, 1, 1) — pure ease-in, no deceleration.
 *            This approximates gravitational acceleration.
 *  • Duration: 1200ms
 *
 * Motion-trail glow is provided by .is-falling CSS class (drop-shadow filter).
 *
 * Returns a Promise that resolves when the asteroid has LANDED.
 */
async function asteroidFall() {
  const group = DOM.asteroidGroup;
  if (!group) return;

  // ── Compute fall distance ──────────────────────────────────
  // The group starts completely above the viewport.
  // translateY start = -(viewport height + a bit extra) relative to final resting spot.
  const vh = window.innerHeight;
  const startY = -(vh * 1.15); // 115% of viewport height above landing spot

  // ── Show the asteroid and add the motion-trail glow class ──
  group.classList.add('is-falling');

  // ── Web Animations API fall ────────────────────────────────
  // We use WAAPI instead of CSS @keyframes so we can await completion and
  // compose the transform without specificity wars.
  const fallAnim = group.animate(
    [
      {
        transform: `translateX(-50%) translateY(${startY}px) rotate(15deg)`,
        opacity:   1,
        easing:    'cubic-bezier(0.65, 0, 1, 1)', // strong ease-in
      },
      {
        transform: `translateX(-50%) translateY(0px) rotate(0deg)`,
        opacity:   1,
        easing:    'cubic-bezier(0.34, 1.56, 0.64, 1)',
      },
    ],
    {
      duration: 1000,
      fill:     'forwards',
    }
  );

  // Wait for the fall animation to complete
  await fallAnim.finished;

  // ── LANDING ────────────────────────────────────────────────
  console.log('%c[Asteroid] Landed 💥', 'color:#FFD166;font-weight:bold');

  // 1. Swap state class: remove falling glow, add landed (glow fades via CSS transition)
  group.classList.remove('is-falling');
  group.classList.add('has-landed');

  // 2. Compute impact point (center-bottom of screen, where asteroid base sits)
  //    burstParticles uses vw/vh units; asteroid is anchored at bottom: 0
  const impactX = window.innerWidth <= 768 ? 45 : 15;  // vw (matches CSS left)
  const impactY = 96;  // vh — base of the asteroid on screen

  // 3. Fire all landing effects simultaneously
  screenShake();
  spawnImpactDust(impactX, impactY);
  impactSquash();

  // 4. After squash settles, swap asteroid-whole → asteroid-cracked
  await wait(300);
  crossFade(DOM.asteroidWhole, DOM.asteroidCracked, 250);

  // 5. After cracked swap, fade in character-reaching (500ms crossfade)
  await wait(350);
  crossFade(DOM.characterIdle, DOM.characterReaching, 500);

  // 6. Now start asteroid's idle bob (separate from character float)
  startAsteroidIdleBob();

  // 7. *** 1-second pause after character-reaching animation settles ***
  //    Gives the character time to "arrive" before the asteroid becomes tappable.
  //    The 500ms crossfade + 1000ms pause = ~1.5s of visible reaching pose.
  await wait(1000);

  // 8. Transition to IDLE — asteroid is now tappable for next steps
  setPhase(ALL_PHASES.IDLE);
  group.style.cursor = 'pointer';
  group.addEventListener('click', handleAsteroidTap);

  const hint = document.getElementById('tap-asteroid-hint');
  if (hint) {
    hint.classList.add('show-hint');
  }

  console.log('%c[Phase] Landing complete — tap the asteroid to open it! 🪙', 'color:#FFAFCC');
}

/**
 * startProposal() — called once the intro overlay is fully dismissed.
 * Kicks off the asteroid-fall animation and the full scene sequence.
 */
function startProposal() {
  console.log('%c[Proposal] startProposal() — overlay cleared, scene is live 🚀', 'color:#FFAFCC;font-weight:bold');

  // Phase: asteroid is in flight, not yet interactive
  currentPhase = ALL_PHASES.INTRO; // stays in INTRO until landing sets IDLE

  // Character idles while asteroid falls
  startIdleAnimations();

  // Run the asteroid fall sequence (async, self-contained)
  asteroidFall();

  // TODO (next steps): start background music score here
}

/**
 * Initialises the intro overlay:
 *   1. Starts the canvas star animation.
 *   2. Attaches a one-time click/touchend listener to the overlay.
 *   3. On tap: fades overlay out over 600ms → unlocks audio → calls startProposal().
 */
function initIntroOverlay() {
  const stopStars = startIntroStarCanvas();

  // One-time handler — removes itself immediately so it can't fire twice
  function onFirstTap(e) {
    e.stopPropagation();

    DOM.introOverlay.removeEventListener('click',      onFirstTap);
    DOM.introOverlay.removeEventListener('touchend',   onFirstTap);

    // Step 1 — start CSS fade-out (600ms, driven by .dismissed class in CSS)
    DOM.introOverlay.classList.add('dismissed');

    // Step 2 — unlock audio immediately inside this user-gesture call stack
    unlockAudio();

    // Step 3 — once the overlay has faded, fire startProposal()
    setTimeout(() => {
      stopStars?.();                    // stop the canvas RAF loop
      DOM.introOverlay.style.display = 'none'; // remove from paint tree
      startProposal();
    }, 620); // 20ms buffer after the 600ms CSS transition
  }

  // Listen on both click (desktop) and touchend (mobile)
  DOM.introOverlay.addEventListener('click',    onFirstTap, { once: false });
  DOM.introOverlay.addEventListener('touchend', onFirstTap, { once: false, passive: true });

  console.log('%c[Intro] Overlay ready — waiting for first tap ⭐', 'color:#BDE0FE;font-weight:bold');
}

/* ── 10. INIT ─────────────────────────────────────────────── */

/* ── Media Sync logic for synced video & audio voice ── */
function initMediaSync() {
  const audioVoice = document.getElementById('audio-voice');
  const syncVideo = document.getElementById('sync-video');
  if (!audioVoice || !syncVideo) return;

  // Use Web Audio API to boost volume to 400%
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    const audioCtx = new AudioContext();
    const source = audioCtx.createMediaElementSource(audioVoice);
    const gainNode = audioCtx.createGain();
    gainNode.gain.value = 10.0; // 1000% volume
    source.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    // Ensure AudioContext resumes if it was suspended (browser autoplay policy)
    audioVoice.addEventListener('play', () => {
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }
    });
  } catch(e) {
    console.warn("Web Audio API not supported or failed to init", e);
  }
  
  // Base element volume should be maxed
  audioVoice.volume = 1.0;

  // Play/pause sync
  audioVoice.addEventListener('play', () => {
    syncVideo.play().catch(err => console.log('Video play failed:', err));
  });
  audioVoice.addEventListener('pause', () => {
    syncVideo.pause();
  });

  // Stop video when audio finishes
  audioVoice.addEventListener('ended', () => {
    syncVideo.pause();
  });

  // Time sync (allowing the video to loop smoothly while audio continues)
  audioVoice.addEventListener('timeupdate', () => {
    if (!syncVideo.duration) return;
    const targetVideoTime = audioVoice.currentTime % syncVideo.duration;
    const diff = Math.abs(syncVideo.currentTime - targetVideoTime);
    
    // Force sync only if drifting significantly (e.g., user scrubs audio timeline)
    if (diff > 0.5 && diff < syncVideo.duration - 0.5) {
      syncVideo.currentTime = targetVideoTime;
    }
  });

  // Trigger autoplay for video (needs to be muted, which is set in HTML)
  syncVideo.play().catch(err => console.log('Video autoplay failed:', err));
}

function init() {
  auditPlaceholders();

  // IMPORTANT: Do NOT start idle animations or arm asteroid here.
  // Everything waits behind the intro overlay tap gate.
  // startProposal() handles that after the overlay is dismissed.
  // initButtonArena() handles button listeners — called from openAsteroid().

  // Prevent context-menu on long-press (mobile feel)
  document.addEventListener('contextmenu', e => e.preventDefault());

  // Launch the intro overlay sequence
  initIntroOverlay();

  // Initialize Media Sync
  initMediaSync();

  console.log('%c[Proposal Page] Initialised — showing intro overlay ✨', 'color:#FFAFCC;font-weight:bold;font-size:14px');
}

// Run after DOM is fully parsed
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
