// Merapi Sky Run — synthesised sound, no audio files.
// A WebAudio engine hum that follows the throttle, wind noise that follows the speed, a
// two-note chime for a ring and a low thud for a crash. Everything is generated; nothing
// is fetched. Audio starts only after the first key or click (browser policy).

export function createAudio() {
  let ctx = null;
  let engineOsc = null;
  let engineGain = null;
  let windGain = null;
  let started = false;

  function ensure() {
    if (started) return;
    try {
      const AC = window.AudioContext ?? window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      // Engine: two detuned saws through a low-pass filter.
      engineOsc = ctx.createOscillator();
      engineOsc.type = 'sawtooth';
      engineOsc.frequency.value = 55;
      const engineOsc2 = ctx.createOscillator();
      engineOsc2.type = 'sawtooth';
      engineOsc2.frequency.value = 55 * 1.5;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      engineGain = ctx.createGain();
      engineGain.gain.value = 0;
      engineOsc.connect(filter);
      engineOsc2.connect(filter);
      filter.connect(engineGain);
      engineGain.connect(ctx.destination);
      engineOsc.start();
      engineOsc2.start();
      // Wind: looped noise through a band-pass.
      const len = ctx.sampleRate * 2;
      const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = Math.random() * 2 - 1;
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      noise.loop = true;
      const band = ctx.createBiquadFilter();
      band.type = 'bandpass';
      band.frequency.value = 700;
      band.Q.value = 0.6;
      windGain = ctx.createGain();
      windGain.gain.value = 0;
      noise.connect(band);
      band.connect(windGain);
      windGain.connect(ctx.destination);
      noise.start();
      started = true;
    } catch {
      // Sound is garnish: a failure here never stops the game.
      started = false;
    }
  }

  function blip(freq, delay, duration, volume) {
    if (!ctx || !started) return;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, ctx.currentTime + delay);
    gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + delay + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + delay + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(ctx.currentTime + delay);
    osc.stop(ctx.currentTime + delay + duration + 0.05);
  }

  return {
    /** Call from a user gesture; also safe to call every frame. */
    unlock() {
      ensure();
      if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {});
    },
    /** Continuous engine + wind, from the flight state. */
    update(flight) {
      if (!ctx || !started) return;
      const t = ctx.currentTime;
      const throttle = flight.throttle;
      engineGain.gain.setTargetAtTime(flight.phase === 'flying' ? 0.03 + throttle * 0.06 : 0.015, t, 0.1);
      engineOsc.frequency.setTargetAtTime(48 + throttle * 70 + flight.speed * 0.35, t, 0.1);
      windGain.gain.setTargetAtTime(Math.min(0.12, flight.speed * 0.0011), t, 0.15);
    },
    ring() {
      blip(880, 0, 0.25, 0.22);
      blip(1318, 0.09, 0.35, 0.2);
    },
    land() {
      blip(523, 0, 0.3, 0.2);
      blip(659, 0.1, 0.3, 0.2);
      blip(784, 0.2, 0.5, 0.22);
    },
    crash() {
      if (!ctx || !started) return;
      const len = ctx.sampleRate * 0.5;
      const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      const gain = ctx.createGain();
      gain.gain.value = 0.5;
      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 300;
      src.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);
      src.start();
    },
  };
}
