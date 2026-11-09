/* Sky Hoppers — deterministic simulation core.
 *
 * Pure game rules: no DOM, no clock, no randomness. Everything is a function of the
 * level data, the frame counter and the per-frame input, so a recorded input list
 * replays identically in the browser and in Node (tests/sim.test.js).
 *
 * Input is a bitmask per frame: LEFT=1, RIGHT=2, JUMP=4.
 */
(function (root) {
  'use strict';
  const SH = (root.SH = root.SH || {});

  const LEFT = 1, RIGHT = 2, JUMP = 4;
  const TAU = Math.PI * 2;
  const VIEW_W = 640, VIEW_H = 360;
  const DEATH_Y = 420;
  const PW = 18, PH = 24;
  const SHAKE_FRAMES = 36, CRUMBLE_RESET = 180;
  const INVULN_FRAMES = 90;
  const STAR_SCORE = 100;

  // Original characters. Similar reach on flat ground (~110-120 px per jump) so every
  // level is fair for all three; they differ in feel.
  const CHARACTERS = {
    puff: {
      id: 'puff', name: 'Puff', blurb: 'Cloud sprite · floaty jump',
      maxSpeed: 2.6, accel: 0.25, airAccel: 0.2, friction: 0.3,
      gravity: 0.32, jumpVel: 7.4, maxFall: 5, glideFall: 0, glideFrames: 0,
    },
    tock: {
      id: 'tock', name: 'Tock', blurb: 'Wind-up robot · fast, heavy',
      maxSpeed: 3.4, accel: 0.32, airAccel: 0.2, friction: 0.4,
      gravity: 0.62, jumpVel: 10.2, maxFall: 11, glideFall: 0, glideFrames: 0,
    },
    mira: {
      id: 'mira', name: 'Mira', blurb: 'Paper-kite fox · glides',
      maxSpeed: 2.9, accel: 0.28, airAccel: 0.22, friction: 0.3,
      gravity: 0.48, jumpVel: 9.0, maxFall: 8, glideFall: 1.1, glideFrames: 70,
    },
  };
  const CHAR_ORDER = ['puff', 'tock', 'mira'];

  function bridgeRect(b, t, cr) {
    const ph = b.phase || 0;
    let x = b.x, y = b.y, solid = true, shake = 0;
    if (b.ax) x += b.ax * Math.sin((TAU * t) / b.period + ph);
    if (b.ay) y += b.ay * Math.sin((TAU * t) / b.period + ph);
    if (cr) {
      if (cr.state === 1) {
        const k = t - cr.since;
        shake = k % 4 < 2 ? 1 : -1;
      } else if (cr.state === 2) {
        const k = t - cr.since;
        y += 0.2 * k * k;
        solid = false;
      }
    }
    return { x: x, y: y, w: b.w, solid: solid, shake: shake };
  }

  function ballPos(o, t) {
    const span = o.x2 - o.x1;
    const d = (((t * o.speed + (o.phase || 0)) % (2 * span)) + 2 * span) % (2 * span);
    const dir = d < span ? 1 : -1;
    return { x: o.x1 + (d < span ? d : 2 * span - d), y: o.y, r: o.r || 11, dir: dir };
  }

  function birdPos(o, t) {
    const u = (1 - Math.cos((TAU * t) / o.period + (o.phase || 0))) / 2;
    const s = Math.sin((TAU * t) / o.period + (o.phase || 0));
    return {
      x: o.x1 + (o.x2 - o.x1) * u,
      y: o.y1 + (o.y2 - o.y1) * u + 4 * Math.sin(t * 0.12),
      r: 10,
      dir: s >= 0 ? 1 : -1,
    };
  }

  function gustActive(g, t) {
    return ((t + (g.phase || 0)) % (g.on + g.off)) < g.on;
  }

  function createWorld(levelIndex, charId, carry) {
    const level = SH.LEVELS[levelIndex];
    if (!level) throw new Error('no level ' + levelIndex);
    const ch = CHARACTERS[charId];
    if (!ch) throw new Error('no character ' + charId);
    carry = carry || {};
    const w = {
      levelIndex: levelIndex,
      level: level,
      char: ch,
      t: 0,
      lives: carry.lives != null ? carry.lives : 3,
      score: carry.score || 0,
      starsTaken: level.stars.map(function () { return 0; }),
      starCount: 0,
      crumble: level.bridges.map(function (b) { return b.type === 'crumble' ? { state: 0, since: 0 } : null; }),
      checkpoint: { x: level.start.x, y: level.start.y },
      cpIndex: -1,
      deaths: 0,
      complete: false,
      over: false,
      events: [],
      player: null,
    };
    spawn(w);
    return w;
  }

  function spawn(w) {
    w.player = {
      x: w.checkpoint.x, y: w.checkpoint.y - PH, vx: 0, vy: 0, w: PW, h: PH,
      ground: -1, coyote: 0, jumpBuffer: 0, glideLeft: w.char.glideFrames,
      gliding: false, facing: 1, prevJump: false, invuln: w.deaths > 0 ? INVULN_FRAMES : 0,
    };
  }

  function cloneWorld(w) {
    const c = Object.assign({}, w);
    c.player = Object.assign({}, w.player);
    c.starsTaken = w.starsTaken.slice();
    c.crumble = w.crumble.map(function (x) { return x ? { state: x.state, since: x.since } : null; });
    c.checkpoint = { x: w.checkpoint.x, y: w.checkpoint.y };
    c.events = [];
    return c;
  }

  function hurt(w, kind) {
    w.deaths++;
    w.lives--;
    w.events.push(kind);
    if (w.lives <= 0) {
      w.over = true;
      return;
    }
    for (let i = 0; i < w.crumble.length; i++) if (w.crumble[i]) w.crumble[i].state = 0;
    spawn(w);
  }

  function circleHitsPlayer(c, p) {
    const inset = 3;
    const nx = Math.max(p.x + inset, Math.min(c.x, p.x + p.w - inset));
    const ny = Math.max(p.y + inset, Math.min(c.y, p.y + p.h - inset));
    const dx = c.x - nx, dy = c.y - ny;
    return dx * dx + dy * dy < c.r * c.r;
  }

  function step(w, input) {
    w.events.length = 0;
    if (w.complete || w.over) return w;
    const L = w.level, ch = w.char, p = w.player;
    const tPrev = w.t;
    w.t++;
    const t = w.t;
    const left = (input & LEFT) !== 0, right = (input & RIGHT) !== 0, jump = (input & JUMP) !== 0;

    // Crumbling bridges advance their own little state machine.
    for (let i = 0; i < w.crumble.length; i++) {
      const cr = w.crumble[i];
      if (!cr) continue;
      if (cr.state === 1 && t - cr.since >= SHAKE_FRAMES) { cr.state = 2; cr.since = t; w.events.push('crumble'); }
      else if (cr.state === 2 && t - cr.since >= CRUMBLE_RESET) { cr.state = 0; }
    }

    // Ride the bridge we stand on.
    if (p.ground >= 0) {
      const b = L.bridges[p.ground];
      const r0 = bridgeRect(b, tPrev, null), r1 = bridgeRect(b, t, w.crumble[p.ground]);
      if (!r1.solid) {
        p.ground = -1;
      } else {
        p.x += r1.x - r0.x;
        p.y = r1.y - p.h;
        if (b.type === 'conveyor') p.x += b.speed;
      }
    }

    // Horizontal control.
    const dir = (right ? 1 : 0) - (left ? 1 : 0);
    const onGround = p.ground >= 0;
    if (dir !== 0) {
      p.vx += dir * (onGround ? ch.accel : ch.airAccel);
      if (p.vx > ch.maxSpeed) p.vx = ch.maxSpeed;
      if (p.vx < -ch.maxSpeed) p.vx = -ch.maxSpeed;
      p.facing = dir;
    } else {
      const f = onGround ? ch.friction : 0.05;
      if (p.vx > f) p.vx -= f; else if (p.vx < -f) p.vx += f; else p.vx = 0;
    }

    // Jump: press buffer + coyote time make it forgiving.
    if (jump && !p.prevJump) p.jumpBuffer = 6;
    if (onGround) p.coyote = 6; else if (p.coyote > 0) p.coyote--;
    if (p.jumpBuffer > 0) {
      p.jumpBuffer--;
      if (p.ground >= 0 || p.coyote > 0) {
        p.vy = -ch.jumpVel;
        p.ground = -1;
        p.coyote = 0;
        p.jumpBuffer = 0;
        w.events.push('jump');
      }
    }
    p.prevJump = jump;

    p.gliding = false;
    if (p.ground < 0) {
      if (!jump && p.vy < -ch.jumpVel * 0.45) p.vy = -ch.jumpVel * 0.45;
      p.vy += ch.gravity;
      if (ch.glideFrames && jump && p.vy > 0 && p.glideLeft > 0) {
        if (p.vy > ch.glideFall) p.vy = ch.glideFall;
        p.glideLeft--;
        p.gliding = true;
      }
      if (p.vy > ch.maxFall) p.vy = ch.maxFall;
    }

    // Wind gusts push whoever is inside them.
    for (let i = 0; i < L.gusts.length; i++) {
      const g = L.gusts[i];
      if (gustActive(g, t) && p.x + p.w > g.x && p.x < g.x + g.w && p.y + p.h > g.y && p.y < g.y + g.h) p.x += g.fx;
    }

    const prevBottom = p.y + p.h;
    p.x += p.vx;
    if (p.ground < 0) p.y += p.vy;
    if (p.x < 0) { p.x = 0; if (p.vx < 0) p.vx = 0; }

    // Still standing? Walking off the edge starts a fall.
    if (p.ground >= 0) {
      const r = bridgeRect(L.bridges[p.ground], t, w.crumble[p.ground]);
      if (!(p.x + p.w > r.x && p.x < r.x + r.w)) p.ground = -1;
    }

    // One-way landing on bridge tops.
    if (p.ground < 0 && p.vy >= 0) {
      const bottom = p.y + p.h;
      for (let i = 0; i < L.bridges.length; i++) {
        const b = L.bridges[i];
        const r1 = bridgeRect(b, t, w.crumble[i]);
        if (!r1.solid) continue;
        if (!(p.x + p.w > r1.x && p.x < r1.x + r1.w)) continue;
        const r0 = bridgeRect(b, tPrev, null);
        if (prevBottom <= Math.max(r0.y, r1.y) + 1 && bottom >= r1.y) {
          p.y = r1.y - p.h;
          p.vy = 0;
          p.ground = i;
          p.glideLeft = ch.glideFrames;
          const cr = w.crumble[i];
          if (cr && cr.state === 0) { cr.state = 1; cr.since = t; }
          w.events.push('land');
          break;
        }
      }
    }
    if (p.ground >= 0) p.coyote = 6;

    // Stars.
    const cx = p.x + p.w / 2, cy = p.y + p.h / 2;
    for (let i = 0; i < L.stars.length; i++) {
      if (w.starsTaken[i]) continue;
      const s = L.stars[i];
      const dx = s.x - cx, dy = s.y - cy;
      if (dx * dx + dy * dy < 18 * 18) {
        w.starsTaken[i] = 1;
        w.starCount++;
        w.score += STAR_SCORE;
        w.events.push('star');
      }
    }

    // Checkpoints.
    for (let i = w.cpIndex + 1; i < L.checkpoints.length; i++) {
      const c = L.checkpoints[i];
      if (p.x >= c.x && p.ground >= 0) {
        w.cpIndex = i;
        w.checkpoint = { x: c.x, y: c.y };
        w.events.push('checkpoint');
      }
    }

    // Gate.
    const gt = L.gate;
    if (p.x + p.w > gt.x + 8 && p.x < gt.x + 40 && p.y + p.h > gt.y - 90 && p.y < gt.y) {
      w.complete = true;
      w.score += 1000;
      w.events.push('gate');
      return w;
    }

    // Hazards.
    if (p.invuln > 0) p.invuln--;
    else {
      for (let i = 0; i < L.balls.length; i++) {
        if (circleHitsPlayer(ballPos(L.balls[i], t), p)) { hurt(w, 'hurt'); return w; }
      }
      for (let i = 0; i < L.birds.length; i++) {
        if (circleHitsPlayer(birdPos(L.birds[i], t), p)) { hurt(w, 'hurt'); return w; }
      }
    }
    if (p.y > DEATH_Y) hurt(w, 'fall');
    return w;
  }

  /* Beam search over the real simulation: proves a level is beatable and produces a
   * deterministic per-frame input list (the "autopilot") that the browser replays
   * through its normal input path. Any life lost prunes that branch. */
  function solve(levelIndex, charId, opts) {
    opts = opts || {};
    const SEG = opts.seg || 6;
    const BEAM = opts.beam || 300;
    const PER = opts.perColumn || 4;
    const level = SH.LEVELS[levelIndex];
    const maxFrames = opts.maxFrames || Math.ceil(level.length * 3);
    const actions = [RIGHT, RIGHT | JUMP, 0, JUMP, LEFT, LEFT | JUMP];
    let beam = [{ w: createWorld(levelIndex, charId), parent: null, action: 0 }];
    let expanded = 0, maxX = 0;
    function plan(node, extra) {
      const segs = [];
      for (let n = node; n && n.parent; n = n.parent) segs.push(n.action);
      segs.reverse();
      const out = [];
      for (let i = 0; i < segs.length; i++) for (let k = 0; k < SEG; k++) out.push(segs[i]);
      return out.concat(extra);
    }
    for (let f = 0; f < maxFrames; f += SEG) {
      const best = new Map();
      for (let b = 0; b < beam.length; b++) {
        const node = beam[b];
        for (let a = 0; a < actions.length; a++) {
          const w = cloneWorld(node.w);
          const tail = [];
          let dead = false;
          for (let k = 0; k < SEG; k++) {
            step(w, actions[a]);
            tail.push(actions[a]);
            expanded++;
            if (w.deaths > 0) { dead = true; break; }
            if (w.complete) {
              return { ok: true, inputs: plan(node, tail), frames: w.t, score: w.score, expanded: expanded };
            }
          }
          if (dead) continue;
          const p = w.player;
          const key = ((p.x / 4) | 0) + ',' + ((p.y / 4) | 0) + ',' + (p.ground >= 0 ? 'g' : Math.round(p.vy)) + ',' + Math.round(p.vx * 2);
          const prev = best.get(key);
          if (!prev || w.starCount > prev.w.starCount) best.set(key, { w: w, parent: node, action: actions[a] });
        }
      }
      if (best.size === 0) return { ok: false, frames: f, expanded: expanded, maxX: maxX };
      const next = Array.from(best.values());
      // Prefer progress, but keep a few states per 16 px column (standing ones first)
      // so the beam still holds "wait for the bridge to come back" options while the
      // greedy leaders run off a ledge.
      next.sort(function (A, B) {
        const ga = A.w.player.ground >= 0 ? 1 : 0, gb = B.w.player.ground >= 0 ? 1 : 0;
        return gb - ga || B.w.player.x - A.w.player.x;
      });
      const perCol = new Map();
      const kept = [];
      for (let i = 0; i < next.length; i++) {
        const col = (next[i].w.player.x / 16) | 0;
        const n = perCol.get(col) || 0;
        if (n >= PER) continue;
        perCol.set(col, n + 1);
        kept.push(next[i]);
      }
      kept.sort(function (A, B) { return B.w.player.x - A.w.player.x; });
      next.sort(function (A, B) { return B.w.player.x - A.w.player.x; });
      const chosen = new Set(next.slice(0, BEAM >> 1));
      for (let i = 0; i < kept.length && chosen.size < BEAM; i++) chosen.add(kept[i]);
      beam = Array.from(chosen);
      if (next[0].w.player.x > maxX) maxX = next[0].w.player.x;
    }
    return { ok: false, frames: maxFrames, expanded: expanded, maxX: maxX };
  }

  SH.LEFT = LEFT; SH.RIGHT = RIGHT; SH.JUMP = JUMP;
  SH.VIEW_W = VIEW_W; SH.VIEW_H = VIEW_H;
  SH.CHARACTERS = CHARACTERS;
  SH.CHAR_ORDER = CHAR_ORDER;
  SH.bridgeRect = bridgeRect;
  SH.ballPos = ballPos;
  SH.birdPos = birdPos;
  SH.gustActive = gustActive;
  SH.createWorld = createWorld;
  SH.cloneWorld = cloneWorld;
  SH.step = step;
  SH.solve = solve;
})(typeof window !== 'undefined' ? window : globalThis);
