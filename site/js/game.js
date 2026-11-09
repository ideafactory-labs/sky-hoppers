/* Sky Hoppers — screens, input, fixed-step loop and the test hook (window.SkyHoppers). */
(function (root) {
  'use strict';
  const SH = root.SH;
  const STEP_MS = 1000 / 60;
  const BEST_KEY = 'skyhoppers.best';
  const MUTE_KEY = 'skyhoppers.muted';

  const params = new URLSearchParams(root.location.search);
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  function store(k, v) { try { if (v === undefined) return root.localStorage.getItem(k); root.localStorage.setItem(k, v); } catch (e) { /* storage blocked */ } return null; }

  const touch = params.get('touch') === '1' || (params.get('touch') !== '0' &&
    (root.matchMedia && root.matchMedia('(pointer: coarse)').matches));

  const G = {
    screen: 'title',
    sel: 0,
    frame: 0,
    world: null,
    paused: false,
    touch: touch,
    best: parseInt(store(BEST_KEY), 10) || 0,
    autopilot: null, // {inputs, i} while replaying a solved plan
    manual: false, // tests drive frames themselves via debug.advance
    titleCards: [],
  };
  const storedMute = store(MUTE_KEY);
  SH.Audio.setMuted(storedMute == null ? touch : storedMute === '1');

  // ---------- input ----------
  const held = { left: false, right: false, jump: false };
  const touchHeld = { left: false, right: false, jump: false };
  // A tap shorter than one frame still counts: presses latch until the next update.
  const latched = { left: false, right: false, jump: false };
  let prevMenuJump = false, prevMenuLeft = false, prevMenuRight = false;
  let pendingTap = null; // logical {x,y} of a tap on the canvas

  const KEYMAP = {
    ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right',
    Space: 'jump', ArrowUp: 'jump', KeyW: 'jump', KeyZ: 'jump', Enter: 'jump',
  };

  root.addEventListener('keydown', function (e) {
    SH.Audio.unlock();
    if (e.code === 'KeyP' || e.code === 'Escape') { togglePause(); e.preventDefault(); return; }
    if (e.code === 'KeyM') { toggleMute(); e.preventDefault(); return; }
    const k = KEYMAP[e.code];
    if (k) { held[k] = true; latched[k] = true; e.preventDefault(); }
  });
  root.addEventListener('keyup', function (e) {
    const k = KEYMAP[e.code];
    if (k) { held[k] = false; e.preventDefault(); }
  });

  function releaseAll() {
    held.left = held.right = held.jump = false;
    touchHeld.left = touchHeld.right = touchHeld.jump = false;
    latched.left = latched.right = latched.jump = false;
    document.querySelectorAll('.pad button').forEach(function (b) { b.classList.remove('down'); });
  }

  // Pause whenever the tab loses focus.
  root.addEventListener('blur', function () { pauseIfPlaying(); releaseAll(); });
  document.addEventListener('visibilitychange', function () { if (document.hidden) { pauseIfPlaying(); releaseAll(); } });

  function pauseIfPlaying() { if (G.screen === 'playing') G.paused = true; }
  function togglePause() { if (G.screen === 'playing') { G.paused = !G.paused; releaseAll(); syncButtons(); } }
  function toggleMute() {
    SH.Audio.setMuted(!SH.Audio.isMuted());
    store(MUTE_KEY, SH.Audio.isMuted() ? '1' : '0');
    syncButtons();
  }

  // On-screen pad: multi-touch friendly pointer events.
  document.querySelectorAll('.pad button').forEach(function (btn) {
    const k = btn.dataset.key;
    function down(e) { e.preventDefault(); SH.Audio.unlock(); touchHeld[k] = true; latched[k] = true; btn.classList.add('down'); if (btn.setPointerCapture && e.pointerId != null) { try { btn.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ } } }
    function up(e) { e.preventDefault(); touchHeld[k] = false; btn.classList.remove('down'); }
    btn.addEventListener('pointerdown', down);
    btn.addEventListener('pointerup', up);
    btn.addEventListener('pointercancel', up);
    btn.addEventListener('lostpointercapture', up);
    btn.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  });

  canvas.addEventListener('pointerdown', function (e) {
    SH.Audio.unlock();
    const r = canvas.getBoundingClientRect();
    pendingTap = { x: ((e.clientX - r.left) / r.width) * SH.VIEW_W, y: ((e.clientY - r.top) / r.height) * SH.VIEW_H };
  });

  document.getElementById('btn-pause').addEventListener('click', function () {
    if (G.screen === 'playing') togglePause();
  });
  document.getElementById('btn-mute').addEventListener('click', toggleMute);

  function syncButtons() {
    const m = document.getElementById('btn-mute');
    m.textContent = SH.Audio.isMuted() ? '🔇' : '🔊';
    m.setAttribute('aria-label', SH.Audio.isMuted() ? 'Sound off (tap to turn on)' : 'Sound on (tap to mute)');
    m.setAttribute('aria-pressed', SH.Audio.isMuted() ? 'false' : 'true');
    const p = document.getElementById('btn-pause');
    p.textContent = G.paused ? '▶' : '⏸';
    p.setAttribute('aria-label', G.paused ? 'Resume' : 'Pause');
    p.hidden = G.screen !== 'playing';
    document.body.classList.toggle('touch', G.touch);
    document.body.classList.toggle('playing', G.screen === 'playing');
  }

  function liveInput() {
    let m = 0;
    if (held.left || touchHeld.left || latched.left) m |= SH.LEFT;
    if (held.right || touchHeld.right || latched.right) m |= SH.RIGHT;
    if (held.jump || touchHeld.jump || latched.jump) m |= SH.JUMP;
    latched.left = latched.right = latched.jump = false;
    return m;
  }

  // ---------- game flow ----------
  function startGame(charId) {
    G.charId = charId;
    G.world = SH.createWorld(0, charId);
    // The press that started the game must not also make the hopper jump.
    if (params.get('autopilot') !== '1') G.world.player.prevJump = true;
    G.screen = 'playing';
    G.paused = false;
    syncButtons();
    SH.Audio.play('select');
    if (params.get('autopilot') === '1') engageAutopilot();
  }

  function engageAutopilot() {
    const w = G.world;
    const plan = SH.solve(w.levelIndex, w.char.id);
    G.autopilot = plan.ok ? { inputs: plan.inputs, i: 0 } : null;
    return plan;
  }

  function saveBest() {
    if (G.world && G.world.score > G.best) {
      G.best = G.world.score;
      store(BEST_KEY, String(G.best));
    }
  }

  function update(forcedInput) {
    G.frame++;
    const input = forcedInput != null ? forcedInput : liveInput();
    const jumpEdge = (input & SH.JUMP) && !prevMenuJump;
    const leftEdge = (input & SH.LEFT) && !prevMenuLeft;
    const rightEdge = (input & SH.RIGHT) && !prevMenuRight;
    prevMenuJump = !!(input & SH.JUMP);
    prevMenuLeft = !!(input & SH.LEFT);
    prevMenuRight = !!(input & SH.RIGHT);
    const tap = pendingTap;
    pendingTap = null;

    if (G.screen === 'title') {
      if (leftEdge) { G.sel = (G.sel + 2) % 3; SH.Audio.play('select'); }
      if (rightEdge) { G.sel = (G.sel + 1) % 3; SH.Audio.play('select'); }
      if (tap) {
        const cards = SH.Render.CARDS;
        for (let i = 0; i < cards.length; i++) {
          const c = cards[i];
          if (tap.x >= c.x && tap.x <= c.x + c.w && tap.y >= c.y && tap.y <= c.y + c.h) { G.sel = i; startGame(c.id); return; }
        }
      }
      if (jumpEdge) startGame(SH.CHAR_ORDER[G.sel]);
      return;
    }

    if (G.screen === 'playing') {
      if (G.paused) {
        if (tap) { G.paused = false; syncButtons(); }
        return;
      }
      let stepInput = input;
      if (G.autopilot) {
        stepInput = G.autopilot.inputs[G.autopilot.i++] || 0;
        if (G.autopilot.i > G.autopilot.inputs.length) G.autopilot = null;
      }
      const w = G.world;
      SH.step(w, stepInput);
      for (let i = 0; i < w.events.length; i++) SH.Audio.play(w.events[i]);
      if (w.complete) {
        G.autopilot = null;
        saveBest();
        G.screen = 'levelComplete';
        prevMenuJump = true; // require a fresh press to continue
        syncButtons();
      } else if (w.over) {
        G.autopilot = null;
        saveBest();
        G.screen = 'gameOver';
        prevMenuJump = true;
        syncButtons();
      }
      return;
    }

    if (jumpEdge || tap) {
      const w = G.world;
      if (G.screen === 'levelComplete') {
        if (w.levelIndex + 1 < SH.LEVELS.length) {
          G.world = SH.createWorld(w.levelIndex + 1, w.char.id, { lives: w.lives, score: w.score });
          G.screen = 'playing';
          if (params.get('autopilot') === '1') engageAutopilot();
        } else {
          G.screen = 'victory';
          saveBest();
        }
      } else {
        G.screen = 'title';
      }
      syncButtons();
    }
  }

  // ---------- canvas sizing ----------
  function resize() {
    const dpr = Math.min(root.devicePixelRatio || 1, 2);
    const r = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width * dpr)), h = Math.max(1, Math.round(r.height * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  }
  root.addEventListener('resize', resize);

  // ---------- loop ----------
  const perf = { work: [], maxSamples: 600 };
  function render() {
    resize();
    ctx.setTransform(canvas.width / SH.VIEW_W, 0, 0, canvas.height / SH.VIEW_H, 0, 0);
    SH.Render.frame(ctx, G);
  }

  let last = null, acc = 0;
  function loop(ts) {
    root.requestAnimationFrame(loop);
    if (G.manual) { last = null; return; }
    if (last == null) last = ts;
    acc += Math.min(250, ts - last);
    last = ts;
    const t0 = root.performance.now();
    let n = 0;
    while (acc >= STEP_MS && n < 5) { update(); acc -= STEP_MS; n++; }
    if (n === 5) acc = 0;
    render();
    const dt = root.performance.now() - t0;
    perf.work.push(dt);
    if (perf.work.length > perf.maxSamples) perf.work.shift();
  }

  syncButtons();
  render();
  root.requestAnimationFrame(loop);

  // ---------- test / debug hook ----------
  root.SkyHoppers = {
    snapshot: function () {
      const w = G.world;
      return {
        screen: G.screen, paused: G.paused, touch: G.touch, best: G.best, muted: SH.Audio.isMuted(),
        selected: SH.CHAR_ORDER[G.sel], titleCards: G.titleCards.slice(),
        character: w ? w.char.id : null, level: w ? w.levelIndex + 1 : null,
        x: w ? w.player.x : null, y: w ? w.player.y : null, lives: w ? w.lives : null,
        score: w ? w.score : null, stars: w ? w.starCount : null, frame: w ? w.t : 0,
      };
    },
    perf: function () {
      const a = perf.work.slice().sort(function (x, y) { return x - y; });
      if (!a.length) return { samples: 0 };
      const avg = a.reduce(function (s, x) { return s + x; }, 0) / a.length;
      return { samples: a.length, avg: avg, p95: a[Math.floor(a.length * 0.95)], max: a[a.length - 1] };
    },
    resetPerf: function () { perf.work.length = 0; },
    debug: {
      setManual: function (on) { G.manual = !!on; },
      // Step n frames with a fixed input bitmask (or live input when omitted), rendering each.
      advance: function (n, input) {
        for (let i = 0; i < n; i++) { update(input); render(); }
        return root.SkyHoppers.snapshot();
      },
      // Solve the current level and replay the plan frame by frame through update().
      autopilot: function () {
        const plan = engageAutopilot();
        return { ok: plan.ok, frames: plan.inputs ? plan.inputs.length : 0 };
      },
      start: function (charId) { startGame(charId); return root.SkyHoppers.snapshot(); },
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
