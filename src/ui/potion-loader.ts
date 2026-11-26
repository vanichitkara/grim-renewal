/**
 * Potion loader: a pixel cauldron that brews while receipts are read.
 * Canvas is decorative (aria-hidden); the aria-live region carries the status.
 * Reduced motion: one still frame, text updates only. The rAF loop stops on destroy().
 */
import { MSG } from './messages.ts';
import { ease } from '../animation/ease.ts';

// ── Text (pure, tested) ──────────────────────────────────────────────────────

export function progressText(p?: { read: number; total: number }): string {
  if (!p || p.read <= 0 && !p.total) return 'Brewing...';
  if (!p.total) return `Brewing... ${p.read} receipts read`;
  return `Brewing... ${p.read} of ${p.total} receipts read`;
}

export function doneText(count: number): string {
  if (count <= 0) return MSG.scanEmpty;
  return count === 1 ? '1 soul found' : `${count} souls found`;
}

// ── Drawing ──────────────────────────────────────────────────────────────────

const W = 480;
const H = 220;
const C = { night: '#120e1c', crypt: '#1c162b', stone: '#2a2240', bone: '#ece6d6', mist: '#a59cbc', coin: '#f2b84b', rot: '#8fc25a', blood: '#e0574f', spirit: '#c99bff' };
const POT_X = 160, POT_W = 160, POT_TOP = 90, POT_BOT = 170;
const SURFACE_Y = POT_TOP + 10;

interface Bubble { x: number; y: number; r: number; vy: number; life: number; max: number }
interface Wisp { x: number; y: number; life: number; max: number; phase: number }
interface Envelope { x: number; y: number; t: number }

export function createPotionLoader(container: HTMLElement): {
  update: (p: { read: number; total: number; found?: number }) => void;
  done: (count: number) => void;
  fail: (message: string) => void;
  destroy: () => void;
} {
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const root = document.createElement('div');
  root.style.cssText = 'text-align:center;margin:0 0 12px';
  const canvas = document.createElement('canvas');
  canvas.width = W;
  canvas.height = H;
  canvas.setAttribute('aria-hidden', 'true');
  // Scale with CSS only.
  canvas.style.cssText = 'width:100%;max-width:480px;height:auto;image-rendering:pixelated;display:block;margin:0 auto';
  const status = document.createElement('p');
  status.setAttribute('aria-live', 'polite');
  status.style.cssText = 'margin:6px 0 0;font-size:13px;color:#a59cbc;letter-spacing:1px;text-transform:uppercase';
  status.textContent = progressText();
  root.append(canvas, status);
  container.appendChild(root);

  const g = canvas.getContext('2d')!;
  const bubbles: Bubble[] = [];
  const wisps: Wisp[] = [];
  const envelopes: Envelope[] = [];
  let lastRead = 0;
  let raf = 0;
  let last = 0;
  let stopped = false;
  let finished = false;
  let ghost = false;

  const rnd = (a: number, b: number): number => a + Math.random() * (b - a);

  function step(now: number, dt: number): void {
    if (!finished && Math.random() < dt * 9) {
      bubbles.push({ x: rnd(POT_X + 14, POT_X + POT_W - 14), y: SURFACE_Y + 8, r: rnd(2, 5), vy: rnd(14, 30), life: 0, max: rnd(0.8, 1.6) });
    }
    if (Math.random() < dt * 3) {
      wisps.push({ x: rnd(POT_X + 30, POT_X + POT_W - 30), y: SURFACE_Y - 4, life: 0, max: rnd(1.6, 2.6), phase: rnd(0, 6) });
    }
    for (const b of bubbles) { b.life += dt; b.y -= b.vy * dt; }
    for (const w of wisps) { w.life += dt; w.y -= 22 * dt; }
    for (const e of envelopes) e.t += dt / 0.7;
    for (const arr of [bubbles, wisps]) {
      for (let i = arr.length - 1; i >= 0; i--) if (arr[i]!.life > arr[i]!.max) arr.splice(i, 1);
    }
    for (let i = envelopes.length - 1; i >= 0; i--) {
      if (envelopes[i]!.t >= 1) {
        // Splash: a burst of bubbles where it lands.
        bubbles.push({ x: envelopes[i]!.x, y: SURFACE_Y + 2, r: 3, vy: 24, life: 0, max: 0.5 });
        envelopes.splice(i, 1);
      }
    }
    void now;
  }

  function draw(now: number): void {
    g.clearRect(0, 0, W, H);
    g.fillStyle = C.night;
    g.fillRect(0, 0, W, H);

    // Fire: flickering tongues under the pot.
    const tongues = [-50, -25, 0, 25, 50];
    tongues.forEach((dx, i) => {
      const h = 22 + (reduced ? 4 : 8 * Math.sin(now / 90 + i * 1.7) + 4 * Math.sin(now / 47 + i));
      const x = POT_X + POT_W / 2 + dx - 8;
      g.fillStyle = C.blood;
      g.fillRect(x, POT_BOT + 30 - h, 16, h);
      g.fillStyle = C.coin;
      g.fillRect(x + 4, POT_BOT + 30 - h * 0.6, 8, h * 0.6);
    });
    g.fillStyle = C.stone; // logs
    g.fillRect(POT_X + 10, POT_BOT + 28, POT_W - 20, 8);

    // Pot body: stacked rects approximate a round belly.
    g.fillStyle = C.stone;
    g.fillRect(POT_X, POT_TOP, POT_W, 6);
    for (let y = POT_TOP + 6; y < POT_BOT; y += 4) {
      const t = (y - POT_TOP) / (POT_BOT - POT_TOP);
      const inset = t > 0.6 ? Math.round((t - 0.6) * 60) : 0;
      g.fillRect(POT_X + inset, y, POT_W - 2 * inset, 4);
    }
    g.fillStyle = C.crypt;
    g.fillRect(POT_X + 12, POT_TOP + 14, 6, POT_BOT - POT_TOP - 40); // shine
    // Potion surface
    g.fillStyle = C.rot;
    g.fillRect(POT_X + 8, SURFACE_Y, POT_W - 16, 10);
    g.fillStyle = C.bone;
    g.globalAlpha = 0.25;
    g.fillRect(POT_X + 8, SURFACE_Y, POT_W - 16, 2);
    g.globalAlpha = 1;
    // Rim
    g.fillStyle = C.mist;
    g.fillRect(POT_X - 4, POT_TOP - 4, POT_W + 8, 4);

    for (const b of bubbles) {
      const p = b.life / b.max;
      if (p > 0.85) { // pop: small ring
        g.fillStyle = C.bone;
        g.fillRect(Math.round(b.x - b.r - 1), Math.round(b.y), 2, 2);
        g.fillRect(Math.round(b.x + b.r), Math.round(b.y), 2, 2);
      } else {
        g.fillStyle = C.rot;
        g.fillRect(Math.round(b.x - b.r), Math.round(b.y - b.r), b.r * 2, b.r * 2);
        g.fillStyle = C.bone;
        g.fillRect(Math.round(b.x - b.r), Math.round(b.y - b.r), 2, 2);
      }
    }

    g.fillStyle = C.mist;
    for (const w of wisps) {
      const p = w.life / w.max;
      g.globalAlpha = 0.5 * (1 - p);
      g.fillRect(Math.round(w.x + Math.sin(w.phase + w.life * 3) * 8), Math.round(w.y), 6, 4);
    }
    g.globalAlpha = 1;

    for (const e of envelopes) {
      const y = -14 + (SURFACE_Y - 6 + 14) * ease.in!(Math.min(1, e.t));
      g.fillStyle = C.bone;
      g.fillRect(Math.round(e.x - 7), Math.round(y), 14, 10);
      g.fillStyle = C.mist;
      g.fillRect(Math.round(e.x - 7), Math.round(y), 14, 2);
      g.fillRect(Math.round(e.x - 1), Math.round(y + 4), 2, 2);
    }

    if (ghost) {
      // A ghost rises from the pot when the brew ends.
      g.fillStyle = C.spirit;
      g.globalAlpha = 0.8;
      const y = POT_TOP - 30 - 6 * Math.sin(now / 400);
      g.fillRect(POT_X + POT_W / 2 - 8, y, 16, 20);
      g.fillStyle = C.night;
      g.fillRect(POT_X + POT_W / 2 - 4, y + 6, 3, 3);
      g.fillRect(POT_X + POT_W / 2 + 2, y + 6, 3, 3);
      g.globalAlpha = 1;
    }
  }

  function loop(now: number): void {
    if (stopped) return;
    const dt = Math.min(0.05, last ? (now - last) / 1000 : 0.016);
    last = now;
    step(now, dt);
    draw(now);
    raf = requestAnimationFrame(loop);
  }

  if (reduced) {
    // One still frame: a few bubbles frozen in place.
    bubbles.push({ x: POT_X + 50, y: SURFACE_Y + 4, r: 4, vy: 0, life: 0, max: 5 }, { x: POT_X + 100, y: SURFACE_Y + 2, r: 3, vy: 0, life: 0, max: 5 });
    draw(0);
  } else {
    raf = requestAnimationFrame(loop);
  }

  /** Show the final text for a moment, fade the pot out, then remove it from the page. */
  function dismissAfter(ms: number): void {
    setTimeout(() => {
      if (stopped) return;
      if (reduced) { api.destroy(); return; }
      root.style.transition = 'opacity .5s ease';
      root.style.opacity = '0';
      setTimeout(() => api.destroy(), 520);
    }, ms);
  }

  const api = {
    update(p: { read: number; total: number; found?: number }) {
      if (finished) return;
      status.textContent = progressText(p);
      if (!reduced && p.read > lastRead) {
        // At most a few envelopes in flight; the text carries the exact count.
        const n = Math.min(p.read - lastRead, 2);
        for (let i = 0; i < n && envelopes.length < 8; i++) envelopes.push({ x: rnd(POT_X + 30, POT_X + POT_W - 30), y: 0, t: 0 });
      }
      lastRead = p.read;
    },
    done(count: number) {
      finished = true;
      ghost = count > 0;
      status.textContent = doneText(count);
      if (reduced) draw(0);
      dismissAfter(2200); // the pot leaves the page once the receipts are in
    },
    fail(message: string) {
      finished = true;
      status.textContent = message;
      if (reduced) draw(0);
      dismissAfter(4000); // the header status line keeps the message after this
    },
    destroy() {
      stopped = true;
      cancelAnimationFrame(raf);
      root.remove();
    },
  };
  return api;
}
