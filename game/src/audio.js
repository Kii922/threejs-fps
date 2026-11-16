// Sound: WebAudio-synthesised only — oscillator and noise bursts, no audio files,
// so the game stays offline and small. The context is created on the first user
// gesture; every call before that is a no-op.
export function createAudio() {
  let ctx = null;
  let master = null;

  function ensure() {
    if (ctx) return true;
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.25;
      master.connect(ctx.destination);
      return true;
    } catch {
      return false;
    }
  }

  function noiseBurst(duration, filterFreq, gainValue) {
    if (!ensure()) return;
    const length = Math.max(1, Math.floor(ctx.sampleRate * duration));
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = ctx.createGain();
    gain.gain.value = gainValue;
    src.connect(filter).connect(gain).connect(master);
    src.start();
  }

  function tone(freq, duration, type, gainValue, slideTo) {
    if (!ensure()) return;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, ctx.currentTime + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainValue, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
    osc.connect(gain).connect(master);
    osc.start();
    osc.stop(ctx.currentTime + duration);
  }

  return {
    unlock() { ensure(); if (ctx && ctx.state === 'suspended') ctx.resume(); },
    shot(kind) {
      if (kind === 'pistol') noiseBurst(0.09, 1800, 0.7);
      else if (kind === 'smg') noiseBurst(0.07, 2400, 0.5);
      else noiseBurst(0.11, 1400, 0.8);
      tone(160, 0.08, 'square', 0.25, 70);
    },
    enemyShot() { noiseBurst(0.08, 900, 0.25); },
    dryFire() { tone(1200, 0.04, 'square', 0.15); },
    reload() { tone(900, 0.05, 'square', 0.2); setTimeout(() => tone(700, 0.05, 'square', 0.2), 180); },
    hit() { tone(1400, 0.05, 'sine', 0.35); },
    kill() { tone(900, 0.1, 'sine', 0.4, 1400); },
    hurt() { tone(220, 0.15, 'sawtooth', 0.3, 110); },
    beep() { tone(1050, 0.09, 'sine', 0.35); },
    plant() { tone(880, 0.12, 'sine', 0.3); tone(1320, 0.12, 'sine', 0.25); },
    explosion() { noiseBurst(0.7, 500, 1.0); tone(60, 0.6, 'sine', 0.8, 30); },
    roundWin() { tone(523, 0.14, 'sine', 0.3); setTimeout(() => tone(784, 0.22, 'sine', 0.3), 140); },
    roundLose() { tone(392, 0.16, 'sine', 0.3); setTimeout(() => tone(262, 0.26, 'sine', 0.3), 160); },
  };
}
