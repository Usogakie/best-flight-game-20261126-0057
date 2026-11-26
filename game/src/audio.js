// Synthesised sound for Kestrel Ridge: no audio files, everything is built
// with the Web Audio API. Engine hum follows throttle, rings chime, the
// ground thuds. Silent until the first gesture, and silent in a browser
// that has no audio.

export function createAudio() {
  let ctx = null;
  let engineOsc = null;
  let engineGain = null;
  let windGain = null;
  let windSrc = null;
  let enabled = false;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 320;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(filter);
      filter.connect(engineGain);
      engineGain.connect(ctx.destination);
      engineOsc.start();
      // Wind: looped filtered noise whose level follows airspeed.
      const len = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      windSrc = ctx.createBufferSource();
      windSrc.buffer = buf;
      windSrc.loop = true;
      const windFilter = ctx.createBiquadFilter();
      windFilter.type = 'bandpass';
      windFilter.frequency.value = 700;
      windFilter.Q.value = 0.6;
      windGain = ctx.createGain();
      windGain.gain.value = 0;
      windSrc.connect(windFilter);
      windFilter.connect(windGain);
      windGain.connect(ctx.destination);
      windSrc.start();
      enabled = true;
      return true;
    } catch (err) {
      return false;
    }
  }

  function resume() {
    if (ensure() && ctx.state === 'suspended') ctx.resume();
  }

  function tone(freq, dur, type, vol, when = 0) {
    if (!ensure()) return;
    try {
      const t0 = ctx.currentTime + when;
      const osc = ctx.createOscillator();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(vol, t0 + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g);
      g.connect(ctx.destination);
      osc.start(t0);
      osc.stop(t0 + dur + 0.05);
    } catch (err) {
      // Sound is garnish; never let it break the game.
    }
  }

  return {
    resume,
    // Call every frame while flying; throttle 0..1, speed in knots-ish units.
    engine(throttle, speed, flying) {
      if (!enabled || !ctx) return;
      const target = flying ? 0.02 + throttle * 0.05 : 0;
      engineGain.gain.setTargetAtTime(target, ctx.currentTime, 0.1);
      engineOsc.frequency.setTargetAtTime(48 + throttle * 90 + speed * 0.25, ctx.currentTime, 0.1);
      windGain.gain.setTargetAtTime(flying ? Math.min(0.06, speed * 0.0009) : 0, ctx.currentTime, 0.15);
    },
    ring() {
      tone(880, 0.35, 'sine', 0.16);
      tone(1318, 0.5, 'sine', 0.12, 0.07);
    },
    land() {
      tone(180, 0.25, 'triangle', 0.2);
      tone(120, 0.4, 'sine', 0.16, 0.05);
    },
    crash() {
      tone(90, 0.7, 'sawtooth', 0.22);
      tone(55, 0.9, 'square', 0.14, 0.08);
    },
    click() {
      tone(660, 0.08, 'square', 0.08);
    },
    warning() {
      tone(520, 0.16, 'square', 0.09);
      tone(520, 0.16, 'square', 0.09, 0.22);
    },
  };
}
