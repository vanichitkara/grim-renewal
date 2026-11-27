/**
 * Sound helpers for Grim Renewal.
 * Web Audio API — no external library. All audio is opt-in (muted by default
 * until a user gesture unlocks the AudioContext).
 */

let ac: AudioContext | null = null;
let muted = false;
/** 0..1, multiplies every sound. */
let volume = 1;

export const SOUND_KEY = 'grim_sound';
type Listener = (s: { muted: boolean; volume: number }) => void;
const listeners = new Set<Listener>();

function store(): Storage | null {
  try { return typeof localStorage !== 'undefined' ? localStorage : null; } catch { return null; }
}

/** Parse saved sound settings. Junk falls back to the defaults (sound on, full volume). */
export function parseSoundPrefs(raw: string | null): { muted: boolean; volume: number } {
  try {
    const o = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    const v = typeof o['volume'] === 'number' && Number.isFinite(o['volume']) ? Math.min(1, Math.max(0, o['volume'])) : 1;
    return { muted: o['muted'] === true, volume: v };
  } catch {
    return { muted: false, volume: 1 };
  }
}

{
  const p = parseSoundPrefs(store()?.getItem(SOUND_KEY) ?? null);
  muted = p.muted;
  volume = p.volume;
}

function changed(): void {
  try { store()?.setItem(SOUND_KEY, JSON.stringify({ muted, volume })); } catch { /* private mode */ }
  listeners.forEach((f) => f({ muted, volume }));
}

/** Called on every change to mute or volume, so every control stays in step. */
export function onSoundChange(f: Listener): () => void {
  listeners.add(f);
  return () => listeners.delete(f);
}

export function getVolume(): number {
  return volume;
}

export function setVolume(v: number): void {
  volume = Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 1;
  changed();
}

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
  if (volume <= 0) return;
  g.gain.setValueAtTime(vol * volume, t);
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
  if (volume <= 0) return;
  g.gain.value = vol * volume;
  src.buffer = buf;
  src.connect(f).connect(g).connect(a.destination);
  src.start();
}

/**
 * Settings "Play a test sound": wait until the browser has really started audio, then play a
 * clear knock and coin at the chosen volume. Says what happened, so a silent click is never a mystery.
 */
export async function playTestSound(): Promise<'played' | 'muted' | 'blocked'> {
  if (muted) return 'muted';
  const a = audio();
  if (!a) return 'blocked';
  try { if (a.state !== 'running') await a.resume(); } catch { /* reported below */ }
  if (a.state !== 'running') return 'blocked';
  tone(140, 0.16, 'triangle', 0.5, 70);
  setTimeout(() => tone(140, 0.16, 'triangle', 0.5, 70), 180);
  setTimeout(() => { tone(988, 0.1, 'square', 0.12); setTimeout(() => tone(1319, 0.25, 'square', 0.12), 100); }, 420);
  return 'played';
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
  changed();
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
