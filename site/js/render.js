/* Sky Hoppers — everything on screen is drawn here with canvas primitives.
 * No image, font or sprite files: characters, bridges and sky are all code. */
(function (root) {
  'use strict';
  const SH = (root.SH = root.SH || {});
  const W = 640, H = 360;
  const TAU = Math.PI * 2;
  const FONT = '"Trebuchet MS", "Segoe UI", system-ui, sans-serif';

  function hash(i) { const s = Math.sin(i * 12.9898 + 78.233) * 43758.5453; return s - Math.floor(s); }

  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function text(ctx, s, x, y, size, color, align, outline) {
    ctx.font = 'bold ' + size + 'px ' + FONT;
    ctx.textAlign = align || 'center';
    ctx.textBaseline = 'middle';
    if (outline) {
      ctx.lineWidth = Math.max(3, size / 6);
      ctx.strokeStyle = outline;
      ctx.lineJoin = 'round';
      ctx.strokeText(s, x, y);
    }
    ctx.fillStyle = color;
    ctx.fillText(s, x, y);
  }

  // ---------- sky ----------
  const skyCache = {};
  function sky(ctx, theme, camX, t) {
    let g = skyCache[theme.top];
    if (!g) {
      g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, theme.top);
      g.addColorStop(1, theme.bottom);
      skyCache[theme.top] = g;
    }
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    if (theme.night) {
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      for (let i = 0; i < 40; i++) {
        const x = ((hash(i) * 900 - camX * 0.05) % 900 + 900) % 900 - 100;
        const y = hash(i + 50) * 170;
        const tw = 0.6 + 0.4 * Math.sin(t * 0.05 + i);
        ctx.globalAlpha = tw;
        ctx.fillRect(x, y, 1.5, 1.5);
      }
      ctx.globalAlpha = 1;
      // occasional distant lightning flash
      if (t % 400 < 6 && t % 400 !== 2) {
        ctx.fillStyle = 'rgba(220,220,255,0.18)';
        ctx.fillRect(0, 0, W, H);
      }
    }
    // sun / moon
    ctx.fillStyle = theme.sun;
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    ctx.arc(520 - camX * 0.02, 70, theme.night ? 22 : 34, 0, TAU);
    ctx.fill();
    if (theme.night) {
      ctx.fillStyle = theme.top;
      ctx.beginPath();
      ctx.arc(530 - camX * 0.02, 62, 20, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;

    // far floating islands
    ctx.fillStyle = theme.hills;
    for (let i = 0; i < 8; i++) {
      const x = ((i * 260 - camX * 0.15) % 2080 + 2080) % 2080 - 200;
      const y = 250 + hash(i) * 50;
      const w = 90 + hash(i + 9) * 80;
      ctx.beginPath();
      ctx.ellipse(x, y, w / 2, 14, 0, Math.PI, TAU);
      ctx.lineTo(x + w * 0.3, y + 10);
      ctx.lineTo(x, y + 30);
      ctx.lineTo(x - w * 0.3, y + 10);
      ctx.closePath();
      ctx.fill();
    }
    // two parallax cloud layers
    for (let layer = 0; layer < 2; layer++) {
      const speed = layer ? 0.5 : 0.3;
      const alpha = theme.night ? 0.25 : layer ? 0.85 : 0.55;
      ctx.fillStyle = theme.night ? '#9aa0d0' : '#ffffff';
      ctx.globalAlpha = alpha;
      for (let i = 0; i < 9; i++) {
        const span = 1500;
        const x = ((i * 170 + hash(i + layer * 20) * 120 - camX * speed - t * 0.1 * (layer + 1)) % span + span) % span - 120;
        const y = 40 + hash(i * 3 + layer) * 140 + layer * 30;
        const s = 0.7 + hash(i + 7 + layer) * 0.7;
        cloud(ctx, x, y, s);
      }
    }
    ctx.globalAlpha = 1;
  }

  function cloud(ctx, x, y, s) {
    ctx.beginPath();
    ctx.arc(x, y, 14 * s, 0, TAU);
    ctx.arc(x + 16 * s, y - 8 * s, 18 * s, 0, TAU);
    ctx.arc(x + 36 * s, y, 14 * s, 0, TAU);
    ctx.rect(x, y, 36 * s, 14 * s);
    ctx.fill();
  }

  // ---------- world pieces ----------
  function bridge(ctx, b, r, t) {
    const x = r.x + r.shake, y = r.y, w = r.w;
    if (b.type === 'crumble') {
      const n = Math.max(2, Math.round(w / 18));
      const sw = w / n;
      for (let i = 0; i < n; i++) {
        const dy = r.solid ? 0 : (i % 2 ? 4 : -2) * (1 + (y - b.y) / 40);
        ctx.fillStyle = i % 2 ? '#a9a39b' : '#bdb6ad';
        rr(ctx, x + i * sw + 0.5, y + dy, sw - 1, 12, 3);
        ctx.fill();
        // irregular hairline cracks, so stones never read as conveyor arrows
        ctx.strokeStyle = '#6f6860';
        ctx.lineWidth = 1;
        const sx = x + i * sw, k = hash(i + b.x);
        ctx.beginPath();
        ctx.moveTo(sx + sw * (0.2 + k * 0.3), y + dy + 1);
        ctx.lineTo(sx + sw * (0.45 + k * 0.2), y + dy + 5);
        ctx.lineTo(sx + sw * (0.35 + k * 0.1), y + dy + 6);
        ctx.lineTo(sx + sw * (0.6 + k * 0.2), y + dy + 11);
        ctx.stroke();
      }
      return;
    }
    if (b.type === 'conveyor') {
      ctx.fillStyle = '#3b3f52';
      rr(ctx, x, y, w, 12, 6);
      ctx.fill();
      ctx.save();
      rr(ctx, x + 2, y + 2, w - 4, 8, 4);
      ctx.clip();
      ctx.strokeStyle = '#ffd166';
      ctx.lineWidth = 2;
      const dir = b.speed > 0 ? 1 : -1;
      const off = ((t * b.speed) % 14 + 14) % 14;
      for (let cx = x - 14 + off; cx < x + w + 14; cx += 14) {
        ctx.beginPath();
        ctx.moveTo(cx - 3 * dir, y + 3);
        ctx.lineTo(cx + 2 * dir, y + 6);
        ctx.lineTo(cx - 3 * dir, y + 9);
        ctx.stroke();
      }
      ctx.restore();
      ctx.fillStyle = '#20232f';
      ctx.beginPath(); ctx.arc(x + 6, y + 6, 4, 0, TAU); ctx.arc(x + w - 6, y + 6, 4, 0, TAU); ctx.fill();
      return;
    }
    const moving = b.ax || b.ay;
    // little propeller puffs keep moving bridges aloft
    if (moving) {
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      const bob = Math.sin(t * 0.3) * 1.5;
      ctx.beginPath();
      ctx.arc(x + 12, y + 18 + bob, 6, 0, TAU);
      ctx.arc(x + w - 12, y + 18 - bob, 6, 0, TAU);
      ctx.fill();
    }
    // rope rail
    ctx.strokeStyle = moving ? '#2f6f8f' : '#7a5230';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let px = x + 4; px <= x + w - 4; px += Math.max(30, (w - 8) / Math.max(1, Math.round((w - 8) / 40)))) {
      ctx.moveTo(px, y);
      ctx.lineTo(px, y - 12);
    }
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x + 4, y - 12);
    ctx.quadraticCurveTo(x + w / 2, y - 6, x + w - 4, y - 12);
    ctx.stroke();
    // planks
    const plank = 12;
    for (let px = 0; px < w; px += plank) {
      const pw = Math.min(plank, w - px);
      ctx.fillStyle = moving ? ((px / plank) % 2 ? '#5fb3d9' : '#79c3e3') : ((px / plank) % 2 ? '#b07a45' : '#c48a52');
      ctx.fillRect(x + px, y, pw - 1, 9);
    }
    ctx.fillStyle = moving ? '#2f6f8f' : '#7a5230';
    ctx.fillRect(x, y + 9, w, 3);
  }

  function star(ctx, x, y, t, i) {
    const s = 7 + Math.sin(t * 0.1 + i) * 0.8;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.sin(t * 0.04 + i) * 0.3);
    ctx.beginPath();
    for (let k = 0; k < 10; k++) {
      const a = -Math.PI / 2 + (k * Math.PI) / 5;
      const rad = k % 2 ? s * 0.45 : s;
      ctx.lineTo(Math.cos(a) * rad, Math.sin(a) * rad);
    }
    ctx.closePath();
    ctx.fillStyle = '#ffd23f';
    ctx.fill();
    ctx.strokeStyle = '#e89a00';
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.restore();
  }

  function ball(ctx, b, t) {
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.rotate((b.x / b.r) % TAU);
    const g = ctx.createRadialGradient(-3, -3, 2, 0, 0, b.r);
    g.addColorStop(0, '#8a7cff');
    g.addColorStop(1, '#2d2266');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, b.r, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = t % 10 < 5 ? '#fff27a' : '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-2, -b.r + 2);
    ctx.lineTo(3, -2);
    ctx.lineTo(-3, 1);
    ctx.lineTo(2, b.r - 2);
    ctx.stroke();
    ctx.restore();
  }

  function bird(ctx, b, t) {
    ctx.save();
    ctx.translate(b.x, b.y);
    ctx.scale(b.dir, 1);
    const flap = Math.sin(t * 0.4) * 7;
    // spikes
    ctx.fillStyle = '#e0e4ff';
    for (let k = 0; k < 7; k++) {
      const a = -Math.PI * 0.9 + k * 0.3;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * 7, Math.sin(a) * 7);
      ctx.lineTo(Math.cos(a + 0.12) * 13, Math.sin(a + 0.12) * 13);
      ctx.lineTo(Math.cos(a + 0.25) * 7, Math.sin(a + 0.25) * 7);
      ctx.fill();
    }
    ctx.fillStyle = '#5a5f7d';
    ctx.beginPath();
    ctx.ellipse(0, 0, 10, 8, 0, 0, TAU);
    ctx.fill();
    // wing
    ctx.fillStyle = '#41455f';
    ctx.beginPath();
    ctx.moveTo(-3, -1);
    ctx.lineTo(-12, -4 - flap);
    ctx.lineTo(4, -2);
    ctx.fill();
    // beak & eye
    ctx.fillStyle = '#ffb703';
    ctx.beginPath();
    ctx.moveTo(9, -1); ctx.lineTo(15, 1); ctx.lineTo(9, 3); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(5, -2, 2.6, 0, TAU); ctx.fill();
    ctx.fillStyle = '#d00000';
    ctx.beginPath(); ctx.arc(5.8, -2, 1.3, 0, TAU); ctx.fill();
    ctx.restore();
  }

  function gust(ctx, g, t, active) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(g.x, g.y, g.w, g.h);
    ctx.clip();
    ctx.strokeStyle = active ? 'rgba(255,255,255,0.75)' : 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    const dir = g.fx > 0 ? 1 : -1;
    for (let i = 0; i < 9; i++) {
      const len = 18 + hash(i) * 22;
      const y = g.y + 10 + hash(i + 3) * (g.h - 20);
      const travel = g.w + len + 40;
      let x = ((t * (active ? 4 : 0.6) + hash(i + 7) * travel) % travel);
      x = dir > 0 ? g.x - len + x : g.x + g.w + len - x;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.quadraticCurveTo(x + (len / 2) * dir, y - 3, x + len * dir, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function gate(ctx, gt, t) {
    const cols = ['#ff595e', '#ff924c', '#ffca3a', '#8ac926', '#1982c4', '#6a4c93'];
    const cx = gt.x + 24, cy = gt.y;
    ctx.lineWidth = 5;
    for (let i = 0; i < cols.length; i++) {
      ctx.strokeStyle = cols[i];
      ctx.beginPath();
      ctx.arc(cx, cy, 52 - i * 5, Math.PI, TAU);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(255,255,255,' + (0.25 + 0.15 * Math.sin(t * 0.1)) + ')';
    ctx.beginPath();
    ctx.arc(cx, cy, 24, Math.PI, TAU);
    ctx.fill();
    // cloud feet
    ctx.fillStyle = '#ffffff';
    cloud(ctx, cx - 64, cy - 4, 0.55);
    cloud(ctx, cx + 42, cy - 4, 0.55);
  }

  function flag(ctx, c, reached, t) {
    ctx.fillStyle = '#6b4f2a';
    ctx.fillRect(c.x, c.y - 40, 3, 40);
    ctx.fillStyle = reached ? '#8ac926' : '#e6e6e6';
    const wave = Math.sin(t * 0.15) * 2;
    ctx.beginPath();
    ctx.moveTo(c.x + 3, c.y - 40);
    ctx.lineTo(c.x + 22, c.y - 34 + wave);
    ctx.lineTo(c.x + 3, c.y - 27);
    ctx.fill();
  }

  // ---------- characters ----------
  // Drawn around the bottom-centre of the 18×24 hit box.
  function character(ctx, id, cx, by, o) {
    o = o || {};
    const t = o.t || 0, facing = o.facing || 1;
    const running = Math.abs(o.vx || 0) > 0.3 && o.grounded;
    ctx.save();
    ctx.translate(cx, by);
    if (o.scale) ctx.scale(o.scale, o.scale);
    // squash & stretch from vertical speed
    const vy = o.vy || 0;
    const st = o.grounded ? 1 : Math.max(0.85, Math.min(1.15, 1 - vy * 0.02));
    ctx.scale((1 / st) * facing, st);
    if (id === 'puff') drawPuff(ctx, t, running);
    else if (id === 'tock') drawTock(ctx, t, running);
    else drawMira(ctx, t, running, o.gliding);
    ctx.restore();
  }

  function eyes(ctx, x1, x2, y, r, blink) {
    ctx.fillStyle = '#1d2433';
    if (blink) {
      ctx.fillRect(x1 - r, y, r * 2, 1.2);
      ctx.fillRect(x2 - r, y, r * 2, 1.2);
      return;
    }
    ctx.beginPath(); ctx.arc(x1, y, r, 0, TAU); ctx.arc(x2, y, r, 0, TAU); ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.beginPath(); ctx.arc(x1 + r * 0.35, y - r * 0.35, r * 0.35, 0, TAU); ctx.arc(x2 + r * 0.35, y - r * 0.35, r * 0.35, 0, TAU); ctx.fill();
  }

  function drawPuff(ctx, t, running) {
    const bob = running ? Math.abs(Math.sin(t * 0.3)) * -2 : Math.sin(t * 0.08) * 1;
    ctx.translate(0, bob);
    // tiny feet
    ctx.fillStyle = '#9fc7e8';
    const step = running ? Math.sin(t * 0.4) * 3 : 0;
    ctx.beginPath(); ctx.ellipse(-4 + step, -1.5, 3, 2, 0, 0, TAU); ctx.ellipse(4 - step, -1.5, 3, 2, 0, 0, TAU); ctx.fill();
    ctx.fillStyle = '#dbeaf7';
    ctx.beginPath();
    ctx.arc(-6, -9, 7, 0, TAU); ctx.arc(6, -9, 7, 0, TAU); ctx.arc(0, -15, 9, 0, TAU);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(-6, -10, 6, 0, TAU); ctx.arc(6, -10, 6, 0, TAU); ctx.arc(0, -16, 8, 0, TAU); ctx.arc(-9, -17, 4, 0, TAU);
    ctx.fill();
    eyes(ctx, 0, 6, -14, 1.8, t % 180 < 6);
    ctx.fillStyle = 'rgba(255,120,150,0.55)';
    ctx.beginPath(); ctx.arc(-2, -10, 2, 0, TAU); ctx.arc(9, -10, 2, 0, TAU); ctx.fill();
  }

  function drawTock(ctx, t, running) {
    const step = running ? Math.sin(t * 0.5) * 3 : 0;
    // legs
    ctx.fillStyle = '#5c6b7a';
    ctx.fillRect(-6 + step, -6, 4, 6);
    ctx.fillRect(2 - step, -6, 4, 6);
    // wind-up key on the back (rotates)
    ctx.save();
    ctx.translate(-10, -13);
    ctx.scale(Math.cos(t * 0.25), 1);
    ctx.fillStyle = '#d4a017';
    ctx.fillRect(-1, -2, 5, 4);
    ctx.beginPath(); ctx.ellipse(5, -4, 2.5, 3.5, 0, 0, TAU); ctx.ellipse(5, 4, 2.5, 3.5, 0, 0, TAU); ctx.fill();
    ctx.restore();
    // body
    ctx.fillStyle = '#9fb3c8';
    rr(ctx, -8, -17, 16, 12, 2); ctx.fill();
    ctx.fillStyle = '#7d93ab';
    ctx.fillRect(-8, -9, 16, 2);
    ctx.fillStyle = '#e63946';
    ctx.beginPath(); ctx.arc(0, -12, 1.6, 0, TAU); ctx.fill();
    // head
    ctx.fillStyle = '#b8c8d8';
    rr(ctx, -7, -26, 14, 10, 2); ctx.fill();
    ctx.strokeStyle = '#5c6b7a'; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(0, -26); ctx.lineTo(0, -31); ctx.stroke();
    ctx.fillStyle = t % 40 < 20 ? '#ff595e' : '#ffca3a';
    ctx.beginPath(); ctx.arc(0, -32, 1.8, 0, TAU); ctx.fill();
    ctx.fillStyle = '#1d2433';
    rr(ctx, -4, -23, 10, 4, 1.5); ctx.fill();
    ctx.fillStyle = '#7ef9ff';
    ctx.fillRect(-2, -22, 2, 2); ctx.fillRect(3, -22, 2, 2);
  }

  function drawMira(ctx, t, running, gliding) {
    const spread = gliding ? 1.35 : 1;
    // tail: a kite string with bows
    ctx.strokeStyle = '#7a4b2a'; ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-6, -8);
    for (let k = 1; k <= 4; k++) ctx.lineTo(-6 - k * 5, -6 + Math.sin(t * 0.25 + k) * 3);
    ctx.stroke();
    ctx.fillStyle = '#ff595e';
    for (let k = 2; k <= 4; k += 2) {
      const bx = -6 - k * 5, byy = -6 + Math.sin(t * 0.25 + k) * 3;
      ctx.beginPath(); ctx.moveTo(bx, byy); ctx.lineTo(bx - 3, byy - 2.5); ctx.lineTo(bx - 3, byy + 2.5); ctx.fill();
      ctx.beginPath(); ctx.moveTo(bx, byy); ctx.lineTo(bx + 3, byy - 2.5); ctx.lineTo(bx + 3, byy + 2.5); ctx.fill();
    }
    // legs
    const step = running ? Math.sin(t * 0.45) * 2.5 : 0;
    ctx.fillStyle = '#5a3a22';
    ctx.fillRect(-4 + step, -4, 3, 4); ctx.fillRect(2 - step, -4, 3, 4);
    // kite body (diamond)
    ctx.save();
    ctx.translate(0, -13);
    ctx.scale(spread, 1);
    ctx.fillStyle = '#ff8a3d';
    ctx.beginPath(); ctx.moveTo(0, -11); ctx.lineTo(10, 0); ctx.lineTo(0, 10); ctx.lineTo(-10, 0); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#fff1d6';
    ctx.beginPath(); ctx.moveTo(0, -11); ctx.lineTo(10, 0); ctx.lineTo(0, 0); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(0, 10); ctx.lineTo(-10, 0); ctx.lineTo(0, 0); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = '#a0522d'; ctx.lineWidth = 0.8;
    ctx.beginPath(); ctx.moveTo(0, -11); ctx.lineTo(0, 10); ctx.moveTo(-10, 0); ctx.lineTo(10, 0); ctx.stroke();
    ctx.restore();
    // ears
    ctx.fillStyle = '#ff8a3d';
    ctx.beginPath(); ctx.moveTo(-3, -22); ctx.lineTo(-1, -29); ctx.lineTo(1, -23); ctx.fill();
    ctx.beginPath(); ctx.moveTo(3, -23); ctx.lineTo(6, -29); ctx.lineTo(7, -21); ctx.fill();
    // face
    eyes(ctx, 1, 6, -15, 1.5, t % 200 < 6);
    ctx.fillStyle = '#1d2433';
    ctx.beginPath(); ctx.arc(9, -11, 1.3, 0, TAU); ctx.fill();
  }

  // ---------- frames ----------
  function camera(world) {
    const L = world.level;
    const target = world.player.x + world.player.w / 2 - 240;
    return Math.max(0, Math.min(L.length - W, target));
  }

  function drawWorld(ctx, world, camX) {
    const L = world.level, t = world.t, p = world.player;
    sky(ctx, L.theme, camX, t);
    ctx.save();
    ctx.translate(-Math.round(camX), 0);
    const x0 = camX - 80, x1 = camX + W + 80;
    for (let i = 0; i < L.gusts.length; i++) {
      const g = L.gusts[i];
      if (g.x + g.w < x0 || g.x > x1) continue;
      gust(ctx, g, t, SH.gustActive(g, t));
    }
    if (L.gate.x > x0 - 100 && L.gate.x < x1) gate(ctx, L.gate, t);
    for (let i = 0; i < L.checkpoints.length; i++) {
      const c = L.checkpoints[i];
      if (c.x > x0 && c.x < x1) flag(ctx, c, i <= world.cpIndex, t);
    }
    for (let i = 0; i < L.bridges.length; i++) {
      const b = L.bridges[i];
      const r = SH.bridgeRect(b, t, world.crumble[i]);
      if (r.x + r.w < x0 || r.x > x1 || r.y > H + 40) continue;
      bridge(ctx, b, r, t);
    }
    for (let i = 0; i < L.stars.length; i++) {
      if (world.starsTaken[i]) continue;
      const s = L.stars[i];
      if (s.x > x0 && s.x < x1) star(ctx, s.x, s.y, t, i);
    }
    for (let i = 0; i < L.balls.length; i++) {
      const b = SH.ballPos(L.balls[i], t);
      if (b.x > x0 && b.x < x1) ball(ctx, b, t);
    }
    for (let i = 0; i < L.birds.length; i++) {
      const b = SH.birdPos(L.birds[i], t);
      if (b.x > x0 && b.x < x1) bird(ctx, b, t);
    }
    if (!(p.invuln > 0 && t % 8 < 4)) {
      character(ctx, world.char.id, p.x + p.w / 2, p.y + p.h, {
        t: t, facing: p.facing, vx: p.vx, vy: p.vy, grounded: p.ground >= 0, gliding: p.gliding,
      });
    }
    ctx.restore();
  }

  function heart(ctx, x, y, full) {
    ctx.fillStyle = full ? '#ff4d6d' : 'rgba(0,0,0,0.25)';
    ctx.beginPath();
    ctx.moveTo(x, y + 4);
    ctx.bezierCurveTo(x, y, x - 7, y - 1, x - 7, y + 4);
    ctx.bezierCurveTo(x - 7, y + 8, x - 2, y + 10, x, y + 13);
    ctx.bezierCurveTo(x + 2, y + 10, x + 7, y + 8, x + 7, y + 4);
    ctx.bezierCurveTo(x + 7, y - 1, x, y, x, y + 4);
    ctx.fill();
  }

  function hud(ctx, G) {
    const w = G.world;
    ctx.fillStyle = 'rgba(15,25,50,0.35)';
    rr(ctx, 8, 8, 390, 26, 13);
    ctx.fill();
    for (let i = 0; i < 3; i++) heart(ctx, 26 + i * 18, 13, i < w.lives);
    star(ctx, 92, 21, 0, 0);
    text(ctx, String(w.starCount), 104, 21, 13, '#fff', 'left');
    text(ctx, 'Score ' + w.score, 140, 21, 13, '#fff', 'left');
    text(ctx, 'L' + (w.levelIndex + 1) + ' · ' + w.level.name, 384, 21, 11, 'rgba(255,255,255,0.85)', 'right');
    if (G.autopilot) text(ctx, 'AUTOPILOT', W / 2, 50, 12, '#fff', 'center', 'rgba(0,0,0,0.4)');
  }

  function panel(ctx, title, lines, color) {
    ctx.fillStyle = 'rgba(10,18,40,0.55)';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,255,255,0.95)';
    rr(ctx, W / 2 - 180, H / 2 - 80, 360, 160, 18);
    ctx.fill();
    text(ctx, title, W / 2, H / 2 - 44, 30, color || '#ff7b54', 'center', '#fff');
    for (let i = 0; i < lines.length; i++) text(ctx, lines[i], W / 2, H / 2 - 4 + i * 24, 15, '#33415c');
  }

  // Title card layout, shared with game.js for tap hit-testing.
  const CARDS = SH.CHAR_ORDER.map(function (id, i) { return { id: id, x: 80 + i * 170, y: 118, w: 140, h: 160 }; });

  function title(ctx, G) {
    const t = G.frame;
    const theme = SH.LEVELS[0].theme;
    sky(ctx, theme, t * 0.6, t);
    text(ctx, 'Sky Hoppers', W / 2, 52, 46, '#ffffff', 'center', '#3a86ff');
    text(ctx, G.touch ? 'Tap a hopper to start' : '← → choose · Space / Enter to start', W / 2, 92, 14, '#1d3557');
    const names = [];
    for (let i = 0; i < CARDS.length; i++) {
      const c = CARDS[i], ch = SH.CHARACTERS[c.id];
      const sel = i === G.sel;
      ctx.fillStyle = sel ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.6)';
      rr(ctx, c.x, c.y, c.w, c.h, 16);
      ctx.fill();
      if (sel) { ctx.strokeStyle = '#ff7b54'; ctx.lineWidth = 4; ctx.stroke(); }
      const hop = sel ? Math.abs(Math.sin(t * 0.08)) * -10 : 0;
      character(ctx, c.id, c.x + c.w / 2, c.y + 96 + hop, { t: t, facing: 1, grounded: !sel, vx: sel ? 1 : 0, scale: 2.6, gliding: sel && c.id === 'mira' });
      text(ctx, ch.name, c.x + c.w / 2, c.y + 120, 20, '#1d3557');
      text(ctx, ch.blurb, c.x + c.w / 2, c.y + 143, 10.5, '#4a5a78');
      names.push(ch.name);
    }
    G.titleCards = names;
    text(ctx, 'Best ' + G.best, W / 2, 310, 14, '#1d3557');
    text(ctx, G.touch ? '' : 'A/D or ←/→ move · Space jump · P pause · M sound', W / 2, 336, 11, 'rgba(29,53,87,0.75)');
  }

  function frame(ctx, G) {
    if (G.screen === 'title') { title(ctx, G); return; }
    const w = G.world;
    drawWorld(ctx, w, camera(w));
    hud(ctx, G);
    if (G.screen === 'playing' && G.paused) {
      panel(ctx, 'Paused', [G.touch ? 'Tap to resume' : 'Press P or Esc to resume'], '#3a86ff');
    } else if (G.screen === 'levelComplete') {
      panel(ctx, 'Level clear!', ['Stars ' + w.starCount + '/' + w.level.stars.length + ' · Score ' + w.score,
        G.touch ? 'Tap to continue' : 'Press Space to continue'], '#8ac926');
    } else if (G.screen === 'gameOver') {
      panel(ctx, 'Game over', ['Score ' + w.score + ' · Best ' + G.best, G.touch ? 'Tap to try again' : 'Press Space to try again'], '#ff595e');
    } else if (G.screen === 'victory') {
      panel(ctx, 'Over the rainbow!', ['All 3 skies cleared · Score ' + w.score, 'Best ' + G.best + (G.touch ? ' · Tap for title' : ' · Space for title')], '#6a4c93');
    }
  }

  SH.Render = { frame: frame, CARDS: CARDS, W: W, H: H };
})(typeof window !== 'undefined' ? window : globalThis);
