// Tiny synthesized sound effects (no audio files). Starts only after a user gesture.
export function createAudio() {
  let ctx = null, master = null, muted = false;
  try { muted = localStorage.getItem('vexora.muted') === '1'; } catch {}

  function ensure() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC(); master = ctx.createGain(); master.gain.value = muted ? 0 : 0.35; master.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }
  function tone(f0, f1, dur, type = 'sine', vol = 0.5, delay = 0) {
    const c = ensure(); if (!c) return;
    const t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, vol, freq, delay = 0) {
    const c = ensure(); if (!c) return;
    const n = Math.floor(c.sampleRate * dur), buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain(), t = c.currentTime + delay;
    src.buffer = buf; f.type = 'bandpass'; f.frequency.value = freq; g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f); f.connect(g); g.connect(master); src.start(t);
  }
  const SOUNDS = {
    punch() { tone(160, 70, 0.09, 'triangle', 0.5); noise(0.05, 0.25, 900); },
    break() { noise(0.22, 0.6, 500); tone(220, 60, 0.18, 'sawtooth', 0.25); },
    place() { tone(330, 220, 0.09, 'square', 0.18); },
    plant() { tone(300, 600, 0.14, 'sine', 0.35); },
    harvest() { [523, 659, 784, 1047].forEach((f, i) => tone(f, f * 1.01, 0.16, 'triangle', 0.3, i * 0.07)); },
    coin() { tone(988, 988, 0.08, 'square', 0.15); tone(1319, 1319, 0.18, 'square', 0.15, 0.07); },
    error() { tone(140, 100, 0.14, 'sawtooth', 0.2); },
    pickup() { tone(660, 990, 0.07, 'sine', 0.22); },
    splice() { [392, 523, 659, 784, 1047].forEach((f, i) => tone(f, f * 1.02, 0.2, 'triangle', 0.3, i * 0.08)); },
    jump() { tone(260, 520, 0.12, 'sine', 0.2); },
  };
  return {
    unlock: ensure,
    play(name) { if (!muted) SOUNDS[name]?.(); },
    toggle() {
      muted = !muted;
      try { localStorage.setItem('vexora.muted', muted ? '1' : '0'); } catch {}
      if (master) master.gain.value = muted ? 0 : 0.35;
      return muted;
    },
    get muted() { return muted; },
  };
}
