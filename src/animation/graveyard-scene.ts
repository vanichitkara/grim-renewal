/**
 * Graveyard scene: graves, the zombie climbing out, fog, and the pure helpers
 * that drive them. Spec: docs/reference/graveyard-prototype-excerpt.md.
 * Pixel colours below are sprite art, not UI palette.
 */

import type { ZombieState } from './door.ts';
import { drawZombieFor } from './zombie.ts';

const FLOOR = 184;

/** Per-grave mutable state tracked by hallway.ts. */
export interface GraveState {
  x: number;
  idx: number;            // picks the headstone shape
  shirt: string;
  rise: number;           // 0-1 how far the grave has cracked open
  slab: number;           // 0-1 stone slab dropping on a buried grave
  status: string;
  z: ZombieState & { up: number }; // up: 0 = underground, 1 = standing
}

/** How far the grave has cracked open: 0 at 10+ days left, 1 at 0. */
export function riseFor(days: number): number {
  return Math.max(0, Math.min(1, 1 - days / 10));
}

/** How far the zombie has climbed out. Only peeks out once the grave is nearly open. */
export function upFor(rise: number): number {
  return rise >= 0.85 ? 0.6 : 0;
}

export type View = 'house' | 'yard';

export interface CameraInput {
  focus: number | null;   // world x a scene wants centred
  reaperX: number;
  reaperBusy: boolean;
  view: View;
  /** Width of the mansion front. The yard is the next viewW pixels of the world. */
  hallW: number;
  viewW: number;
  /** False when there are no trials: then the camera never leaves the mansion. */
  hasYard: boolean;
}

/**
 * World x of the camera's left edge. The camera shows exactly one scene, edge to edge:
 * the mansion front (0) or the yard (hallW). It never rests between them, so no doors show in
 * the yard and no yard shows at the mansion. Priority: focus point, busy reaper, chosen view.
 */
export function cameraTarget(i: CameraInput): number {
  if (!i.hasYard) return 0;
  const at =
    i.focus !== null ? i.focus
    : i.reaperBusy ? i.reaperX
    : i.view === 'yard' ? i.hallW
    : 0;
  return at >= i.hallW ? i.hallW : 0;
}

const rect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, c: string) => {
  ctx.fillStyle = c;
  ctx.fillRect(x, y, w, h);
};

/** The zombie climbing out: only the part above the floor shows. */
function drawRising(ctx: CanvasRenderingContext2D, g: GraveState, t: number): void {
  const { z } = g;
  if (!z.alive || z.up <= 0.01) return;
  const sc = z.scale * z.grow;
  const x = g.x - 4;
  ctx.save();
  ctx.beginPath();
  ctx.rect(x - 90, 0, 180, FLOOR);
  ctx.clip();
  ctx.translate(0, (1 - z.up) * 39 * sc);
  drawZombieFor(
    ctx,
    x,
    { door: { open: 0, shake: 0 }, z, tomb: 0, status: g.status },
    { forgotten: 0.6, shirt: g.shirt },
    t,
  );
  ctx.restore();
}

export function drawGrave(ctx: CanvasRenderingContext2D, g: GraveState, t: number): void {
  const gx = g.x;
  const hx = gx + 10;
  const r = (x: number, y: number, w: number, h: number, c: string) => rect(ctx, x, y, w, h, c);
  const stone = '#5d5870', lite = '#777190', etch = '#3f3b4f';

  // Three headstone shapes by index.
  if (g.idx % 3 === 1) {
    r(hx - 2, FLOOR - 24, 5, 24, stone); r(hx - 7, FLOOR - 19, 15, 5, stone); r(hx - 2, FLOOR - 24, 1, 24, lite);
  } else {
    r(hx - 6, FLOOR - 20, 13, 20, stone); r(hx - 4, FLOOR - 22, 9, 2, stone);
    if (g.idx % 3 === 0) r(hx - 2, FLOOR - 23, 5, 1, stone);
    r(hx - 5, FLOOR - 19, 1, 18, lite);
    r(hx - 3, FLOOR - 16, 7, 1, etch); r(hx - 3, FLOOR - 13, 7, 1, etch); r(hx - 3, FLOOR - 10, 5, 1, etch);
  }

  drawRising(ctx, g, t);

  // A hand pokes out once the trial is close.
  const showHand = g.status !== 'buried' && g.z.alive && g.rise >= 0.55 && g.z.up < 0.1;
  if (showHand) {
    const wv = Math.round(Math.sin(t * 5 + gx) * 1.5);
    const hy = FLOOR - (g.rise >= 0.75 ? 13 : 10);
    const skin = '#86ad55';
    r(gx - 8 + wv, hy, 4, FLOOR - hy, skin); r(gx - 8 + wv, FLOOR - 6, 4, 1, '#5f7d3a');
    r(gx - 9 + wv, hy - 3, 1, 3, skin); r(gx - 7 + wv, hy - 4, 1, 4, skin);
    r(gx - 5 + wv, hy - 3, 1, 3, skin); r(gx - 10 + wv, hy, 1, 2, skin);
  }

  // Mound.
  const m = '#3b2a1f';
  r(gx - 18, FLOOR - 4, 28, 4, m); r(gx - 15, FLOOR - 6, 22, 2, m); r(gx - 15, FLOOR - 6, 22, 1, '#4d3828');

  // Cracks widen with rise.
  if (g.status !== 'buried' && g.status !== 'dead' && g.slab < 0.05) {
    const c = '#120d0a';
    if (g.rise > 0.25) { r(gx - 11, FLOOR - 5, 1, 2, c); r(gx - 10, FLOOR - 4, 2, 1, c); }
    if (g.rise > 0.45) { r(gx - 2, FLOOR - 6, 1, 2, c); r(gx - 1, FLOOR - 4, 1, 2, c); r(gx + 4, FLOOR - 5, 2, 1, c); }
    if (g.rise > 0.65) { r(gx - 14, FLOOR - 3, 2, 1, c); r(gx + 6, FLOOR - 3, 1, 2, c); }
  }

  // Stone slab drops on a buried grave.
  if (g.slab > 0) {
    const y = Math.round(FLOOR - 8 - (1 - g.slab) * 70);
    r(gx - 19, y, 30, 5, '#7c778f'); r(gx - 19, y, 30, 1, '#9a95ad'); r(gx - 19, y + 4, 30, 1, '#55506a');
    r(gx - 15, y + 1, 1, 3, '#b8a26a'); r(gx + 6, y + 1, 1, 3, '#b8a26a');
    r(gx - 6, y + 1, 4, 3, '#d9b25a'); r(gx - 5, y + 2, 2, 1, '#6e5a2a');
  }
}

/** Low drifting mist over the yard (world x0..x0+480). */
export function drawFog(ctx: CanvasRenderingContext2D, t: number, x0 = 480): void {
  ctx.save();
  ctx.fillStyle = '#c8c8e0';
  for (let k = 0; k < 5; k++) {
    const x = x0 + 40 + ((t * (6 + k * 2) + k * 61) % 400);
    ctx.globalAlpha = 0.05 + 0.02 * Math.sin(t + k);
    ctx.beginPath();
    ctx.ellipse(x, FLOOR - 3 - (k % 2) * 3, 34, 4, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
