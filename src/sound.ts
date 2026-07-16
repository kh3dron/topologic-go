// Tiny WebAudio effects, synthesized so no audio assets ship. Browsers only
// allow audio after a user gesture: initSound() installs a one-time unlock so
// opponent moves arriving over Realtime can be heard once the player has
// interacted with the tab at all.

let ctx: AudioContext | null = null;

function ensureCtx(): AudioContext | null {
  if (!ctx) {
    if (typeof AudioContext === 'undefined') return null;
    ctx = new AudioContext();
  }
  if (ctx.state === 'suspended') ctx.resume().catch(() => {});
  return ctx;
}

export function initSound(): void {
  document.addEventListener('pointerdown', () => ensureCtx(), { once: true });
}

// Stone-on-board clack: a bandpassed noise burst plus a low thump.
export function playStoneSound(): void {
  const c = ensureCtx();
  if (!c || c.state !== 'running') return;
  const t = c.currentTime;

  const dur = 0.06;
  const buf = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const noise = c.createBufferSource();
  noise.buffer = buf;
  const band = c.createBiquadFilter();
  band.type = 'bandpass';
  band.frequency.value = 2200;
  band.Q.value = 1.2;
  const noiseGain = c.createGain();
  noiseGain.gain.setValueAtTime(0.4, t);
  noiseGain.gain.exponentialRampToValueAtTime(0.001, t + dur);
  noise.connect(band).connect(noiseGain).connect(c.destination);
  noise.start(t);

  const thump = c.createOscillator();
  thump.type = 'sine';
  thump.frequency.setValueAtTime(220, t);
  thump.frequency.exponentialRampToValueAtTime(90, t + 0.08);
  const thumpGain = c.createGain();
  thumpGain.gain.setValueAtTime(0.2, t);
  thumpGain.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
  thump.connect(thumpGain).connect(c.destination);
  thump.start(t);
  thump.stop(t + 0.1);
}
