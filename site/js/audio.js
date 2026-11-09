/* Sky Hoppers — sound effects synthesised with WebAudio. No audio files.
 * The AudioContext is created lazily on the first user gesture (browser autoplay rules). */
(function (root) {
  'use strict';
  const SH = (root.SH = root.SH || {});
  let ctx = null;
  let muted = true;

  function ensure() {
    if (muted) return null;
    if (!ctx) {
      const AC = root.AudioContext || root.webkitAudioContext;
      if (!AC) return null;
      try { ctx = new AC(); } catch (e) { return null; }
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function tone(freq, dur, opts) {
    const c = ensure();
    if (!c) return;
    opts = opts || {};
    const t0 = c.currentTime + (opts.delay || 0);
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = opts.type || 'square';
    osc.frequency.setValueAtTime(freq, t0);
    if (opts.to) osc.frequency.exponentialRampToValueAtTime(opts.to, t0 + dur);
    const vol = opts.vol || 0.08;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  const SFX = {
    jump: function () { tone(330, 0.14, { to: 660, type: 'square', vol: 0.05 }); },
    star: function () { tone(880, 0.08, { type: 'triangle', vol: 0.08 }); tone(1320, 0.12, { type: 'triangle', vol: 0.07, delay: 0.06 }); },
    hurt: function () { tone(300, 0.35, { to: 70, type: 'sawtooth', vol: 0.07 }); },
    fall: function () { tone(500, 0.5, { to: 60, type: 'triangle', vol: 0.09 }); },
    crumble: function () { tone(120, 0.18, { to: 60, type: 'sawtooth', vol: 0.04 }); },
    checkpoint: function () { tone(523, 0.1, { type: 'triangle' }); tone(784, 0.15, { type: 'triangle', delay: 0.08 }); },
    gate: function () { [523, 659, 784, 1047].forEach(function (f, i) { tone(f, 0.18, { type: 'triangle', vol: 0.08, delay: i * 0.09 }); }); },
    select: function () { tone(660, 0.06, { type: 'square', vol: 0.04 }); },
  };

  SH.Audio = {
    play: function (name) { if (!muted && SFX[name]) SFX[name](); },
    setMuted: function (m) { muted = !!m; if (!muted) ensure(); },
    isMuted: function () { return muted; },
    unlock: function () { if (!muted) ensure(); },
  };
})(typeof window !== 'undefined' ? window : globalThis);
