/**
 * Reaper sprite drawing.
 */

import { getSprite, drawFrame, frameIndex } from './sprites.ts';

const FLOOR = 184;

/** Sprite frame anchor: feet-centre of the 32x48 frame. */
const ANCHOR_X = 14;
const ANCHOR_Y = 47;

export interface ReaperState {
  x: number;
  facing: number;   // 1 = right, -1 = left
  walk: number;     // walk cycle accumulator
  moving: boolean;
  knock: number;    // 0–1 arm reach
  swing: number;    // 0–1 scythe swing
  scared: boolean;
  run: boolean;
}

export function drawReaper(
  ctx: CanvasRenderingContext2D,
  reaper: ReaperState,
  t: number,
): void {
  const R = reaper;
  const bob = R.moving
    ? -Math.abs(Math.sin(R.walk)) * 2
    : Math.sin(t * 2) * 1.2;
  const jitter = R.scared ? (Math.random() - 0.5) * 2 : 0;

  ctx.save();
  ctx.translate(Math.round(R.x + jitter), Math.round(FLOOR - 2 + bob));
  ctx.scale(R.facing, 1);

  if (drawReaperSprite(ctx, R, t)) {
    ctx.restore();
    return;
  }

  // Scythe
  ctx.save();
  ctx.translate(-6, -26);
  ctx.rotate(-0.15 + R.swing * 2.1 + (R.run ? -0.5 : 0));
  ctx.fillStyle = '#6b4a2b';
  ctx.fillRect(-1, -24, 2, 44);
  for (let i = 0; i < 15; i++) {
    const yy = -26 + Math.round((i * i) / 26);
    ctx.fillStyle = '#cfd6de';
    ctx.fillRect(1 + i, yy, 1, i > 11 ? 1 : 3);
    ctx.fillStyle = '#7e8794';
    ctx.fillRect(1 + i, yy + (i > 11 ? 1 : 3), 1, 1);
  }
  ctx.restore();

  // Cloak
  for (let i = 0; i < 38; i++) {
    const w = Math.round(9 + i * 0.32);
    let hem = 0;
    if (i > 33) hem = (Math.floor(R.walk * 2) + i) % 2 ? 1 : -1;
    ctx.fillStyle = '#3a3152';
    ctx.fillRect(-Math.floor(w / 2) - 1 + hem, -38 + i, w + 2, 1);
    ctx.fillStyle = '#120d1a';
    ctx.fillRect(-Math.floor(w / 2) + hem, -38 + i, w, 1);
  }
  ctx.fillStyle = '#3a3152';
  ctx.fillRect(-7, -47, 14, 11);
  ctx.fillStyle = '#120d1a';
  ctx.fillRect(-6, -46, 12, 10);

  // Skull
  ctx.fillStyle = '#e8e2d0';
  ctx.fillRect(-1, -43, 6, 7);

  if (R.scared) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, -42, 2, 3);
    ctx.fillRect(3, -42, 2, 3);
    ctx.fillStyle = '#000000';
    ctx.fillRect(1, -41, 1, 1);
    ctx.fillRect(4, -41, 1, 1);
    ctx.fillStyle = '#120d1a';
    ctx.fillRect(1, -38, 3, 2);
  } else {
    ctx.fillStyle = '#120d1a';
    ctx.fillRect(0, -41, 2, 2);
    ctx.fillRect(3, -41, 2, 2);
    ctx.fillStyle = '#ff3b3b';
    ctx.fillRect(0, -41, 1, 1);
    ctx.fillRect(3, -41, 1, 1);
    ctx.fillStyle = '#120d1a';
    ctx.fillRect(0, -37, 5, 1);
    ctx.fillStyle = '#e8e2d0';
    ctx.fillRect(1, -37, 1, 1);
    ctx.fillRect(3, -37, 1, 1);
  }

  // Knocking arm
  const reach = Math.round(3 + R.knock * 8);
  ctx.fillStyle = '#120d1a';
  ctx.fillRect(4, -29, reach, 3);
  ctx.fillStyle = '#e8e2d0';
  ctx.fillRect(4 + reach, -30, 3, 3);

  ctx.restore();
}

/**
 * Sprite path. Called with the ctx already translated/flipped to the feet.
 * Returns false (nothing drawn) when the sheets are not loaded.
 */
function drawReaperSprite(
  ctx: CanvasRenderingContext2D,
  R: ReaperState,
  t: number,
): boolean {
  const scythe = getSprite('scythe');
  const quarter = (v: number) => Math.min(3, Math.max(0, Math.floor(v * 4)));
  let body = null;
  let i = 0;
  if (R.scared) {
    body = getSprite('reaper_scared');
  } else if (R.swing > 0.02) {
    body = getSprite('reaper_swing');
    i = quarter(R.swing);
  } else if (R.knock > 0.02) {
    body = getSprite('reaper_knock');
    i = quarter(R.knock);
  } else if (R.moving) {
    body = getSprite('reaper_walk');
    i = ((Math.floor((R.walk * 6) / Math.PI) % 6) + 6) % 6;
  } else {
    body = getSprite('reaper_idle');
    i = frameIndex(t, 2, 2, true);
  }
  if (!body || !scythe) return false;

  // Scythe behind the body; same pivot and angle as the rectangle version,
  // so the swing still follows the 'swing' tween.
  ctx.save();
  ctx.translate(-6, -26);
  ctx.rotate(-0.15 + R.swing * 2.1 + (R.run ? -0.5 : 0));
  drawFrame(ctx, scythe, 0, -2, -26);
  ctx.restore();

  drawFrame(ctx, body, i, -ANCHOR_X, -ANCHOR_Y);
  return true;
}
