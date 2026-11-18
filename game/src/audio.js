// Every sound is synthesized with WebAudio: oscillators and filtered noise, no audio files.
// The context is created on the first user gesture (browsers suspend it before that), and
// every call guards for a missing or suspended context, so headless play stays silent and
// never throws. A low ambient drone runs under play; M mutes everything.

const MASTER_GAIN = 0.5;

export function createAudio() {
  let context = null;
  let master = null;
  let muted = false;
  let drone = null;

  function ensure() {
    if (context) {
      if (context.state === 'suspended') context.resume().catch(() => {});
      return context;
    }
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      if (!AudioContext) return null;
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = MASTER_GAIN;
      master.connect(context.destination);
      return context;
    } catch {
      return null;
    }
  }

  function tone({ type = 'sine', from = 440, to = null, seconds = 0.15, gain = 0.2, delay = 0 }) {
    if (muted) return;
    const ctx = ensure();
    if (!ctx || !master) return;
    const start = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(from, start);
    if (to !== null) osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), start + seconds);
    amp.gain.setValueAtTime(0, start);
    amp.gain.linearRampToValueAtTime(gain, start + 0.01);
    amp.gain.exponentialRampToValueAtTime(0.001, start + seconds);
    osc.connect(amp);
    amp.connect(master);
    osc.start(start);
    osc.stop(start + seconds + 0.05);
  }

  function noise({ seconds = 0.2, gain = 0.2, frequency = 1200, type = 'lowpass', delay = 0 }) {
    if (muted) return;
    const ctx = ensure();
    if (!ctx || !master) return;
    const start = ctx.currentTime + delay;
    const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    const amp = ctx.createGain();
    amp.gain.setValueAtTime(gain, start);
    amp.gain.exponentialRampToValueAtTime(0.001, start + seconds);
    source.connect(filter);
    filter.connect(amp);
    amp.connect(master);
    source.start(start);
  }

  function startAmbient() {
    const ctx = ensure();
    if (!ctx || !master || drone) return;
    const low = ctx.createOscillator();
    low.type = 'sine';
    low.frequency.value = 55;
    const lowGain = ctx.createGain();
    lowGain.gain.value = 0.05;
    const slow = ctx.createOscillator();
    slow.type = 'sine';
    slow.frequency.value = 0.08;
    const slowGain = ctx.createGain();
    slowGain.gain.value = 0.025;
    slow.connect(slowGain);
    slowGain.connect(lowGain.gain);
    low.connect(lowGain);
    lowGain.connect(master);
    low.start();
    slow.start();
    drone = { low, slow };
  }

  function stopAmbient() {
    if (!drone) return;
    try {
      drone.low.stop();
      drone.slow.stop();
    } catch {
      // Already stopped.
    }
    drone = null;
  }

  return {
    ensure,
    startAmbient,
    stopAmbient,
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : MASTER_GAIN;
      return muted;
    },
    isMuted() {
      return muted;
    },
    ui() {
      tone({ type: 'triangle', from: 660, to: 880, seconds: 0.09, gain: 0.12 });
    },
    swing() {
      noise({ seconds: 0.12, gain: 0.12, frequency: 2600, type: 'bandpass' });
    },
    hit() {
      tone({ type: 'square', from: 190, to: 90, seconds: 0.1, gain: 0.16 });
      noise({ seconds: 0.08, gain: 0.1, frequency: 900 });
    },
    kill() {
      tone({ type: 'sawtooth', from: 320, to: 60, seconds: 0.22, gain: 0.14 });
    },
    hurt() {
      tone({ type: 'sawtooth', from: 220, to: 70, seconds: 0.25, gain: 0.2 });
    },
    dash() {
      noise({ seconds: 0.16, gain: 0.1, frequency: 1800, type: 'bandpass' });
    },
    bolt() {
      tone({ type: 'sine', from: 920, to: 320, seconds: 0.14, gain: 0.12 });
    },
    pickup() {
      tone({ type: 'triangle', from: 980, to: 1320, seconds: 0.1, gain: 0.12 });
    },
    relic() {
      tone({ type: 'triangle', from: 523, seconds: 0.14, gain: 0.14 });
      tone({ type: 'triangle', from: 659, seconds: 0.14, gain: 0.14, delay: 0.09 });
      tone({ type: 'triangle', from: 784, seconds: 0.22, gain: 0.16, delay: 0.18 });
    },
    stairs() {
      tone({ type: 'sine', from: 392, to: 196, seconds: 0.4, gain: 0.14 });
    },
    roar() {
      tone({ type: 'sawtooth', from: 90, to: 45, seconds: 0.7, gain: 0.22 });
      noise({ seconds: 0.5, gain: 0.12, frequency: 300 });
    },
    slam() {
      tone({ type: 'sine', from: 120, to: 35, seconds: 0.3, gain: 0.28 });
      noise({ seconds: 0.2, gain: 0.16, frequency: 400 });
    },
    fireball() {
      tone({ type: 'sawtooth', from: 180, to: 420, seconds: 0.18, gain: 0.08 });
    },
    victory() {
      const notes = [523, 659, 784, 1047];
      notes.forEach((note, i) => tone({ type: 'triangle', from: note, seconds: 0.3, gain: 0.16, delay: i * 0.13 }));
    },
    death() {
      const notes = [392, 330, 262, 196];
      notes.forEach((note, i) => tone({ type: 'sine', from: note, seconds: 0.4, gain: 0.14, delay: i * 0.18 }));
    },
  };
}
