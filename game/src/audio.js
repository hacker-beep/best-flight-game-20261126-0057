// Nusantara Skies — synthesised sound. One clear job: every sound the
// game makes is built here with WebAudio oscillators, so the game ships
// no audio files at all. All sounds are optional and start only after
// the player first interacts (browser autoplay policy).
export function createAudio() {
  let ctx = null;
  let engineOsc = null;
  let engineGain = null;
  let muted = false;
  let started = false;

  function ensure() {
    if (ctx) return true;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return false;
      ctx = new AudioContext();
    } catch {
      return false;
    }
    return true;
  }

  function tone(freq, dur, type, vol, when = 0, slideTo = null) {
    if (!ctx || muted) return;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain).connect(ctx.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  return {
    get muted() {
      return muted;
    },
    // Call on the first user gesture; also starts the engine hum.
    unlock() {
      if (!ensure()) return;
      if (ctx.state === 'suspended') ctx.resume();
      if (!started) {
        started = true;
        engineOsc = ctx.createOscillator();
        engineOsc.type = 'sawtooth';
        engineOsc.frequency.value = 52;
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.value = 320;
        engineGain = ctx.createGain();
        engineGain.gain.value = 0.0;
        engineOsc.connect(filter).connect(engineGain).connect(ctx.destination);
        engineOsc.start();
      }
      if (engineGain && !muted) engineGain.gain.value = 0.035;
    },
    setThrottle(amount) {
      if (engineOsc && !muted) {
        engineOsc.frequency.value = 46 + amount * 42;
        if (engineGain) engineGain.gain.value = 0.025 + amount * 0.03;
      }
    },
    ring(combo) {
      tone(660, 0.16, 'sine', 0.22);
      tone(880, 0.22, 'sine', 0.22, 0.07);
      tone(1320, 0.3, 'sine', 0.16, 0.14);
      if (combo >= 3) tone(1760, 0.35, 'sine', 0.14, 0.2);
    },
    fuel() {
      tone(520, 0.14, 'triangle', 0.2);
      tone(780, 0.2, 'triangle', 0.18, 0.08);
    },
    alarm() {
      tone(440, 0.12, 'square', 0.1);
      tone(440, 0.12, 'square', 0.1, 0.18);
    },
    thunder() {
      if (!ctx || muted) return;
      const dur = 0.7;
      const buffer = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      // Deterministic noise: a tiny LCG, never Math.random(), so the
      // sound buffer is identical on every run.
      let s = 123456789;
      for (let i = 0; i < data.length; i++) {
        s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
        data[i] = (s / 4294967296) * 2 - 1;
        data[i] *= 1 - i / data.length;
      }
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      const gain = ctx.createGain();
      gain.gain.value = 0.22;
      src.connect(filter).connect(gain).connect(ctx.destination);
      src.start();
    },
    fanfare() {
      [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.32, 'triangle', 0.22, i * 0.12));
    },
    crash() {
      tone(220, 0.5, 'sawtooth', 0.22, 0, 55);
      tone(110, 0.7, 'square', 0.14, 0.05, 40);
    },
    toggleMute() {
      muted = !muted;
      if (engineGain) engineGain.gain.value = muted ? 0 : 0.035;
      return muted;
    },
  };
}
