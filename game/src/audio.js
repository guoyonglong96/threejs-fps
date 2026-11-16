// Synthesised sound effects on WebAudio: no audio files, no network.
// Everything is built from oscillators and filtered noise at boot.
export function createAudio() {
  let ctx = null;
  let master = null;
  let noiseBuf = null;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      const len = ctx.sampleRate;
      noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = noiseBuf.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    } catch {
      ctx = null;
    }
    return !!ctx;
  }

  function noise(dur, filterFreq, gain, type = 'lowpass', when = 0) {
    if (!ensure()) return;
    const t = ctx.currentTime + when;
    const src = ctx.createBufferSource();
    src.buffer = noiseBuf;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = filterFreq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start(t);
    src.stop(t + dur + 0.05);
  }

  function tone(freq, dur, gain, type = 'square', slideTo = 0, when = 0) {
    if (!ensure()) return;
    const t = ctx.currentTime + when;
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(1, slideTo), t + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    o.connect(g);
    g.connect(master);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  // distance 0..1 attenuates and dulls distant shots.
  function shot(kind, dist = 0) {
    if (!ensure()) return;
    const att = 1 - Math.min(0.85, dist);
    if (kind === 'sniper') {
      noise(0.28, 900 + 2200 * att, 0.5 * att, 'lowpass');
      tone(140, 0.22, 0.25 * att, 'sawtooth', 40);
    } else if (kind === 'smg') {
      noise(0.09, 2600, 0.28 * att, 'bandpass');
      tone(220, 0.07, 0.14 * att, 'square', 90);
    } else if (kind === 'pistol') {
      noise(0.12, 1800, 0.32 * att, 'bandpass');
      tone(180, 0.09, 0.16 * att, 'square', 70);
    } else {
      noise(0.14, 1400, 0.4 * att, 'lowpass');
      tone(150, 0.11, 0.2 * att, 'sawtooth', 55);
    }
  }

  return {
    unlock() { ensure(); },
    shot,
    dry() { tone(1400, 0.03, 0.08, 'square'); },
    reload() {
      tone(700, 0.05, 0.12, 'square');
      tone(500, 0.05, 0.12, 'square', 0, 0.28);
      tone(900, 0.06, 0.14, 'square', 0, 0.55);
    },
    hit() { tone(1250, 0.06, 0.16, 'sine'); },
    kill() {
      tone(880, 0.09, 0.16, 'sine');
      tone(1318, 0.14, 0.16, 'sine', 0, 0.08);
    },
    hurt() { noise(0.12, 500, 0.25, 'lowpass'); tone(90, 0.15, 0.2, 'sine', 50); },
    beep(final = false) { tone(final ? 1560 : 1040, final ? 0.22 : 0.09, 0.14, 'sine'); },
    plant() {
      tone(1040, 0.1, 0.14, 'sine');
      tone(1040, 0.1, 0.14, 'sine', 0, 0.18);
    },
    defuse() { tone(740, 0.08, 0.12, 'sine'); tone(740, 0.08, 0.12, 'sine', 0, 0.15); },
    explosion() {
      noise(1.4, 320, 0.9, 'lowpass');
      tone(70, 1.1, 0.55, 'sine', 28);
      noise(0.5, 4000, 0.3, 'highpass');
    },
    win() {
      [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.22, 0.14, 'triangle', 0, i * 0.11));
    },
    lose() {
      [392, 330, 262, 196].forEach((f, i) => tone(f, 0.26, 0.13, 'triangle', 0, i * 0.13));
    },
    buy() { tone(1200, 0.05, 0.1, 'sine'); tone(1600, 0.07, 0.1, 'sine', 0, 0.06); },
    click() { tone(900, 0.04, 0.08, 'square'); },
    round() { tone(660, 0.12, 0.12, 'triangle'); tone(990, 0.18, 0.12, 'triangle', 0, 0.12); },
  };
}
