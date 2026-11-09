// Node unit tests for the deterministic core: rules + every level beatable by every hopper.
'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
require('../site/js/levels.js');
require('../site/js/sim.js');
const SH = globalThis.SH;

function run(w, input, frames) { for (let i = 0; i < frames; i++) SH.step(w, input); return w; }

test('three original characters', () => {
  assert.deepEqual(SH.CHAR_ORDER, ['puff', 'tock', 'mira']);
  assert.deepEqual(SH.CHAR_ORDER.map((c) => SH.CHARACTERS[c].name), ['Puff', 'Tock', 'Mira']);
});

test('level data is sane', () => {
  assert.equal(SH.LEVELS.length, 3);
  for (const L of SH.LEVELS) {
    const types = new Set(L.bridges.map((b) => b.type || (b.ax ? 'slide' : b.ay ? 'bob' : 'static')));
    assert.ok(L.gate.x < L.length, `${L.name}: gate inside level`);
    assert.ok(L.stars.length >= 10, `${L.name}: has stars`);
    assert.ok(types.has('static') && types.has('crumble') && types.has('conveyor'), `${L.name}: bridge variety`);
  }
  // Difficulty rises: more hazards each level.
  const hazards = SH.LEVELS.map((L) => L.balls.length + L.birds.length + L.gusts.length);
  assert.ok(hazards[0] < hazards[1] && hazards[1] < hazards[2], `hazards rise: ${hazards}`);
});

test('holding right moves right; stars score; walking off the left edge costs a life', () => {
  const w = SH.createWorld(0, 'puff');
  const x0 = w.player.x;
  run(w, SH.RIGHT, 60);
  assert.ok(w.player.x > x0 + 50, 'moved right');
  assert.ok(w.score >= 100 && w.starCount >= 1, 'collected a star');
  const w2 = SH.createWorld(0, 'tock');
  run(w2, SH.LEFT, 60);
  assert.equal(w2.lives, 2);
  assert.equal(w2.deaths, 1);
});

test('crumbling bridge falls after you land on it', () => {
  const L = SH.LEVELS[0];
  const idx = L.bridges.findIndex((b) => b.type === 'crumble');
  const w = SH.createWorld(0, 'puff');
  w.player.x = L.bridges[idx].x + 30; w.player.y = L.bridges[idx].y - 40; w.player.vy = 0;
  run(w, 0, 10);
  assert.equal(w.player.ground, idx, 'landed');
  run(w, 0, 40);
  assert.equal(w.crumble[idx].state, 2, 'crumbling');
  assert.notEqual(w.player.ground, idx, 'no longer standing on it');
});

test('simulation is deterministic', () => {
  const a = SH.createWorld(1, 'mira'), b = SH.createWorld(1, 'mira');
  const seq = (i) => ((i * 7919) % 11 < 6 ? SH.RIGHT : 0) | ((i % 37) < 9 ? SH.JUMP : 0);
  for (let i = 0; i < 1500; i++) { SH.step(a, seq(i)); SH.step(b, seq(i)); }
  assert.deepEqual([a.player.x, a.player.y, a.score, a.lives], [b.player.x, b.player.y, b.score, b.lives]);
});

for (let li = 0; li < 3; li++) {
  for (const c of ['puff', 'tock', 'mira']) {
    test(`level ${li + 1} is beatable by ${c} without losing a life`, () => {
      const plan = SH.solve(li, c);
      assert.ok(plan.ok, `solver stuck near x=${plan.maxX}`);
      // Replaying the plan from scratch reaches the gate.
      const w = SH.createWorld(li, c);
      for (const inp of plan.inputs) SH.step(w, inp);
      assert.ok(w.complete, 'replay completes the level');
      assert.equal(w.lives, 3);
    });
  }
}
