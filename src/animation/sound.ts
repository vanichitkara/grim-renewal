/**
 * Sound helpers for Grim Renewal.
 * Web Audio API — no external library. All audio is opt-in (muted by default
 * until a user gesture unlocks the AudioContext).
 */

let ac: AudioContext | null = null;
let muted = false;

function audio(): AudioContext | null {
  if (!ac) {
    try {
      ac = new (window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext)();
    } catch {
      ac = null;
    }
  }
  if (ac && ac.state === 'suspended') {
    ac.resume().catch(() => {});
  }
  return ac;
}

export function tone(
  freq: number,
  dur: number,
  type: OscillatorType = 'sine',
  vol = 0.2,
  slideTo?: number,
): void {
  const a = audio();
  if (!a || muted) return;
  const o = a.createOscillator();
  const g = a.createGain();
  const t = a.currentTime;
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo != null) {
    o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  }
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

export function noise(dur: number, vol = 0.25, freq = 1200): void {
  const a = audio();
  if (!a || muted) return;
  const len = Math.floor(a.sampleRate * dur);
  const buf = a.createBuffer(1, len, a.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = a.createBufferSource();
  const f = a.createBiquadFilter();
  const g = a.createGain();
  f.type = 'bandpass';
  f.frequency.value = freq;
  g.gain.value = vol;
  src.buffer = buf;
  src.connect(f).connect(g).connect(a.destination);
  src.start();
}

/** Returns true when user gesture has unlocked audio. */
export function unlockAudio(): boolean {
  return audio() !== null;
}

export function isMuted(): boolean {
  return muted;
}

export function setMuted(value: boolean): void {
  muted = value;
}

export const sfx = {
  knock:    () => { tone(120, 0.12, 'triangle', 0.4, 60); noise(0.05, 0.15, 400); },
  creak:    () => tone(320, 0.45, 'sawtooth', 0.04, 170),
  growl:    () => tone(85, 0.5, 'sawtooth', 0.08, 60),
  swing:    () => noise(0.22, 0.35, 2200),
  dissolve: () => tone(520, 0.7, 'square', 0.05, 70),
  coin:     () => { tone(988, 0.08, 'square', 0.07); setTimeout(() => tone(1319, 0.18, 'square', 0.07), 80); },
  roar:     () => { tone(70, 0.9, 'sawtooth', 0.16, 45); noise(0.6, 0.2, 300); },
  thud:     () => { tone(90, 0.18, 'triangle', 0.3, 40); noise(0.08, 0.2, 250); },
  yelp:     () => tone(420, 0.35, 'square', 0.08, 1400),
  crash:    () => { noise(0.35, 0.3, 4200); tone(1800, 0.12, 'square', 0.05, 600); },
  whoosh:   () => tone(260, 0.16, 'sine', 0.05, 900),
};
