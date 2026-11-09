# sky-hoppers

> **Stage: experiment.** Created by [factory](https://github.com/krmayankk/factory) from
> [its idea file](https://github.com/krmayankk/factory/blob/main/ideas/sky-hoppers.md). Built by agents behind CI and human approval gates;
> expect rough edges until the stage changes.

## What it is

**Sky Hoppers** is a free, original browser platformer: hop across bridges floating in
the sky, dodge storms, collect stars and reach the rainbow gate. Open the link and play,
on a desktop or a phone. There's nothing to install, no account and no ads.

**Play:** https://ideafactory-labs.github.io/sky-hoppers/ (published by the `pages`
workflow from `site/` on every push to `main`).

- **Three original hoppers**, all drawn in code: **Puff**, a cloud sprite with a floaty
  jump; **Tock**, a wind-up tin robot who is fast but heavy; and **Mira**, a paper-kite
  fox who can glide for a moment if you hold jump while falling.
- **Three skies, each harder than the last:** *Morning Breeze*, *Sunset Drift* and
  *Thunderhead*. Bridges can be static, slide side to side, bob up and down, crumble
  after you land on them, or carry you along as conveyors.
- **Hazards:** rolling thunderballs, gusts of wind that push you, and spiky storm birds
  that fly patrol paths. Falling off the bottom costs a life. You have 3 lives, and
  checkpoint flags set where you respawn.
- **Scoring:** 100 points per star and 1000 per gate. Your best score is kept in
  `localStorage`.
- **Controls:** ←/→ or A/D to move, Space/↑/W to jump, P or Esc to pause, M for sound. On
  touch screens you get on-screen ◀ ▶ JUMP buttons and tap a hopper to start. The game
  pauses when the tab loses focus.
- **Sound** effects are synthesised with WebAudio. Sound starts off on phones.

### How it's built

Plain HTML5 canvas and JavaScript, with no build step and no asset files.

| File | Role |
|---|---|
| `site/js/sim.js` | Deterministic rules: physics, bridges, hazards and scoring, with no DOM or clock. It also holds the beam-search **autopilot solver** |
| `site/js/levels.js` | The three levels as data |
| `site/js/render.js` | All drawing: characters, sky, bridges, HUD and screens |
| `site/js/audio.js` | WebAudio sound effects |
| `site/js/game.js` | Screens, keyboard/touch input, the fixed 60 Hz loop and the `window.SkyHoppers` test hook |

The simulation depends only on the frame number and the input at each frame. That lets
the solver search the real rules for a route through a level, and the browser can then
replay that route through its normal update path. `?autopilot=1` shows this in the game.

### How we know it works

- `tests/sim.test.js` runs in Node. It checks the rules and proves that **every level can
  be beaten by every character without losing a life**: it solves each level, then
  replays the solution from scratch.
- `tests/e2e.mjs` runs Playwright in headless Chromium and covers:
  - the title screen shows Puff, Tock and Mira with no console errors;
  - after you pick a hopper, holding right and jump moves the player right and a star
    raises the score;
  - falling off the bottom takes away a life;
  - frame time stays under 16 ms (it logs avg, p95 and max);
  - autopilot finishes level 1 with each hopper;
  - the best score survives a reload;
  - the game pauses on blur;
  - on a phone viewport, the touch controls work, tapping a hopper picks it and sound is
    off.
- CI uploads the screenshots and frame-time numbers as the `evidence` artifact.

## Working on it

| Command | Does |
|---|---|
| `make test` | the project's checks (CI runs the same): workflow policy, JS syntax, unit + browser tests |
| `make serve` | play locally at http://127.0.0.1:8000/ |
| `make up` / `make down` | no-ops: `cloud: none`, so nothing ever costs money |
| `make verify` | the browser checks against the deployed Pages URL (`VERIFY_URL=` to override) |
| `make evidence` | screenshots + frame-time + results into `evidence/` |

Setup for tests: `npm ci && npx playwright install --with-deps chromium`.

Guardrails this repository was born with are listed in [`CLAUDE.md`](CLAUDE.md).
