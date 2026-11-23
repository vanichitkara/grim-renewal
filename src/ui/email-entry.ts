/**
 * Email entry step shown after the Google redirect.
 *
 * A real <input type="email"> does the work. Above it a decorative canvas
 * ("haunted screen") mirrors the text while a reaper's scythe blade taps the
 * matching key. The canvas is aria-hidden; the on-screen text always equals
 * the input value (fast typing drops intermediate taps, never lags).
 *
 * The reaper drawing lives in drawHand() only, so a witch-nails variant can
 * replace that one function.
 *
 * PRIVACY: the address is never logged or stored; it only resolves the promise.
 */
import { ease } from '../animation/ease.ts';
import { isMuted, tone } from '../animation/sound.ts';

// ── Pure helpers (tested) ────────────────────────────────────────────────────

export interface KeyDef { id: string; normal: string; shifted?: string | undefined }
export interface KeyPos { row: number; col: number; shift: boolean }

/** Drawn keyboard, left to right. 'bksp' and 'shift' are special keys. */
export const KEY_ROWS: KeyDef[][] = [
  [...'1234567890'].map((c, i) => ({ id: c, normal: c, shifted: ['!', '@', '#', '$', '%', '^', '&', '*', '(', ')'][i] })),
  [...'qwertyuiop'].map((c) => ({ id: c, normal: c, shifted: c.toUpperCase() })),
  [...'asdfghjkl'].map((c) => ({ id: c, normal: c, shifted: c.toUpperCase() })),
  [
    { id: 'shift', normal: '' },
    ...[...'zxcvbnm'].map((c) => ({ id: c, normal: c, shifted: c.toUpperCase() })),
    { id: '.', normal: '.', shifted: '>' },
  ],
];
// Row 0 also carries - / _ and + / = and backspace after the digits.
KEY_ROWS[0]!.push({ id: '-', normal: '-', shifted: '_' }, { id: '=', normal: '=', shifted: '+' }, { id: 'bksp', normal: '' });

/** Where to tap for a character, with shift for capitals and shifted symbols. null = no key drawn. */
export function keyForChar(ch: string): KeyPos | null {
  if (ch.length !== 1) return null;
  for (let row = 0; row < KEY_ROWS.length; row++) {
    const keys = KEY_ROWS[row]!;
    for (let col = 0; col < keys.length; col++) {
      const k = keys[col]!;
      if (!k.normal) continue;
      if (k.normal === ch) return { row, col, shift: false };
      if (k.shifted === ch) return { row, col, shift: true };
    }
  }
  return null;
}

export function keyForBackspace(): KeyPos {
  return { row: 0, col: KEY_ROWS[0]!.length - 1, shift: false };
}

export function isValidEmail(s: string): boolean {
  return s.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s);
}

export type TypedFrame =
  | { kind: 'none' }
  | { kind: 'added'; ch: string }
  | { kind: 'removed'; count: number };

/** What changed between two text states. Only the last added char is tapped. */
export function typedFrame(prev: string, next: string): TypedFrame {
  if (prev === next) return { kind: 'none' };
  if (next.length > prev.length) return { kind: 'added', ch: next.slice(-1) };
  return { kind: 'removed', count: prev.length - next.length };
}

// ── Drawing ──────────────────────────────────────────────────────────────────

const W = 480;
const H = 160;
const C = { night: '#120e1c', crypt: '#1c162b', stone: '#2a2240', bone: '#ece6d6', mist: '#a59cbc', coin: '#f2b84b', rot: '#8fc25a', spirit: '#c99bff' };
const KEY_W = 28, KEY_H = 15, KEY_GAP = 3, KB_Y = 86, KB_ROW = 18;
const TAP_MS = 140;

function keyRect(row: number, col: number): { x: number; y: number; w: number } {
  const n = KEY_ROWS[row]!.length;
  const w = KEY_W;
  const total = n * (w + KEY_GAP) - KEY_GAP;
  const stagger = row === 3 ? 0 : row * 6;
  return { x: Math.round((W - total) / 2 + stagger + col * (w + KEY_GAP)), y: KB_Y + row * KB_ROW, w };
}

interface Scene {
  shown: string;
  popAt: number;      // time the last char appeared
  tapAt: number;      // time the current tap began (-1 none)
  tap: KeyPos | null;
  handX: number;
  handY: number;
}

function drawScene(g: CanvasRenderingContext2D, s: Scene, now: number, reduced: boolean): void {
  g.clearRect(0, 0, W, H);
  g.fillStyle = C.night;
  g.fillRect(0, 0, W, H);

  // Monitor
  g.fillStyle = C.stone;
  g.fillRect(70, 4, 340, 74);
  g.fillStyle = C.night;
  g.fillRect(76, 10, 328, 62);
  g.fillStyle = C.crypt;
  g.fillRect(76, 10, 328, 62);
  g.font = '15px "Atkinson Hyperlegible", system-ui, sans-serif'; // readable: no look-alike letters
  g.textBaseline = 'middle';
  const text = s.shown.length > 36 ? s.shown.slice(-36) : s.shown;
  const tw = g.measureText(text).width;
  const tx = 84;
  g.fillStyle = C.rot;
  g.fillText(text, tx, 41);
  // Tiny pop on the newest letter.
  if (!reduced && s.shown.length && now - s.popAt < 120) {
    const p = ease.out!((now - s.popAt) / 120);
    g.fillStyle = C.bone;
    g.globalAlpha = 1 - p;
    g.fillRect(tx + tw - 8, 41 - 10 - 4 * (1 - p), 8, 3);
    g.globalAlpha = 1;
  }
  // Cursor (static when reduced).
  if (reduced || Math.floor(now / 500) % 2 === 0) {
    g.fillStyle = C.coin;
    g.fillRect(tx + tw + 2, 33, 7, 16);
  }

  // Keyboard
  g.font = 'bold 10px "Atkinson Hyperlegible", system-ui, sans-serif';
  g.textAlign = 'center';
  const hot = s.tap && s.tapAt >= 0 && now - s.tapAt < TAP_MS * 2 ? s.tap : null;
  for (let r = 0; r < KEY_ROWS.length; r++) {
    KEY_ROWS[r]!.forEach((k, c) => {
      const { x, y, w } = keyRect(r, c);
      const lit = hot && ((hot.row === r && hot.col === c) || (hot.shift && k.id === 'shift'));
      g.fillStyle = lit ? C.coin : C.stone;
      g.fillRect(x, y, w, KEY_H);
      g.fillStyle = lit ? C.night : C.mist;
      const label = k.id === 'bksp' ? '<-' : k.id === 'shift' ? '^' : k.normal;
      g.fillText(label, x + w / 2, y + KEY_H / 2 + 1);
    });
  }
  g.textAlign = 'left';

  if (!reduced) drawHand(g, s, now);
}

/** Reaper variant: bony hand on a scythe handle; the blade tip taps the key. Swap this for a witch. */
function drawHand(g: CanvasRenderingContext2D, s: Scene, now: number): void {
  let tipX = s.handX;
  let tipY = s.handY;
  if (s.tap && s.tapAt >= 0) {
    const p = (now - s.tapAt) / TAP_MS;
    if (p < 1) {
      const k = keyRect(s.tap.row, s.tap.col);
      const down = p < 0.5 ? ease.in!(p * 2) : 1 - ease.out!((p - 0.5) * 2);
      tipY = s.handY + (k.y + 6 - s.handY) * down;
    }
  }
  // Handle: pixel line from tip up and to the right.
  g.fillStyle = C.mist;
  for (let i = 0; i < 70; i += 2) g.fillRect(Math.round(tipX + 6 + i * 0.6), Math.round(tipY - 4 - i), 2, 2);
  // Blade: a small crescent hooking down to the tip.
  g.fillStyle = C.bone;
  g.fillRect(tipX - 2, tipY - 2, 4, 4);
  g.fillRect(tipX - 6, tipY - 6, 6, 3);
  g.fillRect(tipX - 2, tipY - 10, 10, 3);
  // Bony hand gripping the handle.
  const hx = Math.round(tipX + 6 + 24 * 0.6), hy = Math.round(tipY - 4 - 24);
  g.fillStyle = C.bone;
  g.fillRect(hx - 4, hy - 3, 9, 7);
  g.fillStyle = C.night;
  g.fillRect(hx - 3, hy, 7, 1);
  g.fillStyle = C.bone;
  for (let f = 0; f < 3; f++) g.fillRect(hx - 5 + f * 4, hy + 4, 2, 4);
}

// ── Panel ────────────────────────────────────────────────────────────────────

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

export function showEmailEntry(opts: { suggested?: string } = {}): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const previousFocus = document.activeElement as HTMLElement | null;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

    const overlay = document.createElement('div');
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'email-title');
    overlay.style.cssText = 'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(18,14,28,0.85);z-index:9999';

    const dialog = document.createElement('form');
    dialog.noValidate = true;
    dialog.style.cssText = 'background:#1c162b;border:1px solid #2a2240;border-radius:8px;padding:1.5rem;max-width:32rem;width:calc(100% - 2rem);color:#ece6d6;font-family:system-ui,sans-serif';

    const title = document.createElement('h2');
    title.id = 'email-title';
    title.textContent = 'Whose inbox is this?';
    title.style.cssText = 'margin:0 0 0.75rem;font-size:1.1rem';

    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    canvas.setAttribute('aria-hidden', 'true');
    // Scale with CSS only; never resize the canvas element's pixel grid.
    canvas.style.cssText = 'width:100%;height:auto;image-rendering:pixelated;display:block;border-radius:4px;margin-bottom:0.75rem';

    const label = document.createElement('label');
    label.htmlFor = 'email-entry-input';
    label.textContent = 'Which inbox is this? Only used as a label.';
    label.style.cssText = 'display:block;margin-bottom:0.4rem;color:#a59cbc;font-size:0.95rem';

    const input = document.createElement('input');
    input.id = 'email-entry-input';
    input.type = 'email';
    input.autocomplete = 'email';
    input.spellcheck = false;
    input.setAttribute('aria-describedby', 'email-entry-error');
    input.style.cssText = 'width:100%;box-sizing:border-box;padding:0.5rem;background:#120e1c;color:#ece6d6;border:1px solid #2a2240;border-radius:4px;font-size:1rem';

    const error = document.createElement('p');
    error.id = 'email-entry-error';
    error.style.cssText = 'margin:0.4rem 0 0;min-height:1.2em;color:#e0574f;font-size:0.9rem';

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:0.75rem;justify-content:flex-end;margin-top:1rem';
    const mk = (text: string, css: string, type: 'button' | 'submit') => {
      const b = document.createElement('button');
      b.type = type;
      b.textContent = text;
      b.style.cssText = `padding:0.5rem 1.25rem;border-radius:4px;cursor:pointer;font-size:0.95rem;outline-offset:2px;${css}`;
      b.addEventListener('focus', () => { b.style.outline = '2px solid #f2b84b'; });
      b.addEventListener('blur', () => { b.style.outline = ''; });
      return b;
    };
    const cancelBtn = mk('Cancel', 'border:1px solid #2a2240;background:transparent;color:#a59cbc', 'button');
    const goBtn = mk('Continue', 'border:none;background:#8fc25a;color:#120e1c;font-weight:600', 'submit');
    row.append(cancelBtn, goBtn);
    dialog.append(title, canvas, label, input, error, row);
    overlay.appendChild(dialog);

    // ── Animation state ───────────────────────────────────────────────────────
    const g = canvas.getContext('2d')!;
    const scene: Scene = { shown: '', popAt: -1e9, tapAt: -1, tap: null, handX: W / 2, handY: KB_Y - 18 };
    let raf = 0;
    let closed = false;
    let autoTimer = 0;

    const frame = (now: number): void => {
      if (closed) return;
      if (scene.tap && !reduced) {
        const k = keyRect(scene.tap.row, scene.tap.col);
        // Glide toward the key, framerate independent.
        scene.handX += (k.x + k.w / 2 - scene.handX) * 0.3;
      }
      drawScene(g, scene, now, reduced);
      raf = requestAnimationFrame(frame);
    };
    if (reduced) drawScene(g, scene, 0, true);
    else raf = requestAnimationFrame(frame);

    const redrawStill = (): void => { if (reduced) drawScene(g, scene, 0, true); };

    /** Move the screen to `value`, tapping the key for the latest change only. */
    const syncTo = (value: string): void => {
      const f = typedFrame(scene.shown, value);
      scene.shown = value;
      if (f.kind !== 'none' && !reduced) {
        const pos = f.kind === 'added' ? keyForChar(f.ch) : keyForBackspace();
        if (pos) {
          const now = performance.now();
          scene.tap = pos;
          scene.tapAt = now;
          scene.popAt = now;
          if (!isMuted()) tone(f.kind === 'added' ? 220 : 160, 0.05, 'square', 0.04);
        }
      }
      redrawStill();
    };

    input.addEventListener('input', () => {
      clearInterval(autoTimer);
      error.textContent = '';
      input.removeAttribute('aria-invalid');
      syncTo(input.value);
    });

    // Suggested address: placed in the input, typed onto the screen automatically.
    const suggested = opts.suggested ?? '';
    if (suggested) {
      input.value = suggested;
      if (reduced) {
        syncTo(suggested);
      } else {
        let i = 0;
        autoTimer = window.setInterval(() => {
          i++;
          // Stop if the user edited meanwhile (the input handler also clears this).
          if (input.value !== suggested || i > suggested.length) { clearInterval(autoTimer); return; }
          syncTo(suggested.slice(0, i));
        }, 70);
      }
    }

    // ── Close paths ───────────────────────────────────────────────────────────
    const close = (): void => {
      closed = true;
      clearInterval(autoTimer);
      cancelAnimationFrame(raf);
      overlay.remove();
      previousFocus?.focus();
    };
    const cancel = (): void => { close(); reject(new Error('cancelled')); };

    dialog.addEventListener('submit', (e) => {
      e.preventDefault();
      const v = input.value.trim();
      if (!isValidEmail(v)) {
        error.textContent = 'That does not look like an email address. Try name@example.com.';
        input.setAttribute('aria-invalid', 'true');
        input.focus();
        return;
      }
      close();
      resolve(v);
    });
    cancelBtn.addEventListener('click', cancel);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) cancel(); });
    overlay.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); cancel(); return; }
      if (e.key === 'Tab') {
        const f = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => !el.hasAttribute('disabled'));
        const first = f[0]!, last = f[f.length - 1]!;
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    });

    document.body.appendChild(overlay);
    input.focus();
  });
}
