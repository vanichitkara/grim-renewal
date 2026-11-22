/**
 * Upper-floor window for one slot. Layers, back to front:
 * dark room, zombie (clipped to the pane), glass or smashed glass, boards, frame.
 * Rectangle fallbacks keep it working before the sprites load.
 */

import { getSprite, drawFrame } from './sprites.ts';
import type { DoorSlotState } from './door.ts';
import { PANE_W, PANE_H, WIN_W, WIN_H } from './layout.ts';

const PANE_X = 4;
const PANE_Y = 4;

/** Window-only state, kept on the slot next to the door fields. */
export interface PaneState {
  /** 0 intact glass, 1 smashed. */
  broken: number;
  /** 0 no boards, 1 boards nailed on. */
  boards: number;
}

export function newPane(): PaneState {
  return { broken: 0, boards: 0 };
}

/**
 * Draw a window whose frame is centred on cx with its top at `top`.
 * `drawInside(clipX, clipY, w, h)` draws the zombie; it is called with the pane clip already set.
 * `empty` windows (no subscription) show a dark, shuttered room with no eyes.
 */
export function drawWindow(
  ctx: CanvasRenderingContext2D,
  cx: number,
  top: number,
  slot: DoorSlotState,
  pane: PaneState,
  t: number,
  empty: boolean,
  drawInside: () => void,
): void {
  const sh = slot.door.shake > 0.02 ? Math.round(Math.sin(t * 90) * 2 * slot.door.shake) : 0;
  const x0 = Math.round(cx - WIN_W / 2) + sh;
  const px = x0 + PANE_X;
  const py = top + PANE_Y;

  // 1. the dark room behind the glass
  ctx.fillStyle = '#0c1530';
  ctx.fillRect(px, py, PANE_W, PANE_H);
  ctx.fillStyle = empty ? '#07050c' : '#1c162b';
  ctx.fillRect(px, py + PANE_H - 14, PANE_W, 14);

  // 2. zombie and eyes, clipped to the pane
  ctx.save();
  ctx.beginPath();
  ctx.rect(px, py, PANE_W, PANE_H);
  ctx.clip();
  if (!empty && slot.z.alive) {
    if (slot.z.out < 0.3 && slot.status !== 'dead' && slot.status !== 'reaping' && Math.sin(t * 1.7 + cx) > -0.9) {
      // two eyes in the dark: the sub is still in there
      ctx.fillStyle = slot.status === 'boss' ? '#ff4040' : '#f5e663';
      ctx.fillRect(px + 11, py + PANE_H - 10, 2, 2);
      ctx.fillRect(px + 19, py + PANE_H - 10, 2, 2);
    }
    drawInside();
  }
  ctx.restore();

  // 3. glass
  const glass = getSprite('window_glass');
  const broken = getSprite('window_broken');
  if (pane.broken < 1) {
    ctx.save();
    ctx.globalAlpha = 1 - pane.broken;
    if (glass) drawFrame(ctx, glass, 0, px, py);
    else {
      ctx.fillStyle = '#a59cbc';
      for (let i = 0; i < 7; i++) ctx.fillRect(px + 3 + i, py + 4 + i, 1, 1);
    }
    ctx.restore();
  }
  if (pane.broken > 0) {
    ctx.save();
    ctx.globalAlpha = pane.broken;
    if (broken) drawFrame(ctx, broken, 0, px, py);
    else {
      ctx.fillStyle = '#a59cbc';
      for (let i = 0; i < PANE_W; i += 3) { ctx.fillRect(px + i, py, 1, 3); ctx.fillRect(px + i, py + PANE_H - 3, 1, 3); }
    }
    ctx.restore();
  }

  // 4. boards slam down from above
  if (pane.boards > 0) {
    const boards = getSprite('window_boards');
    ctx.save();
    ctx.beginPath();
    ctx.rect(px, py, PANE_W, PANE_H);
    ctx.clip();
    const dy = -Math.round((1 - Math.min(1, pane.boards)) * 24);
    if (boards) drawFrame(ctx, boards, 0, px, py + dy);
    else {
      ctx.fillStyle = '#6e4a2f';
      for (const y0 of [4, 16, 28]) ctx.fillRect(px, py + y0 + dy, PANE_W, 5);
      ctx.fillStyle = '#4e3420';
      for (const y0 of [4, 16, 28]) ctx.fillRect(px, py + y0 + dy + 4, PANE_W, 1);
    }
    ctx.restore();
  }

  // 5. frame
  const fr = getSprite('window_frame');
  if (fr) drawFrame(ctx, fr, 0, x0, top);
  else {
    ctx.fillStyle = '#2a2240';
    ctx.fillRect(x0, top, WIN_W, PANE_Y);
    ctx.fillRect(x0, top + PANE_Y + PANE_H, WIN_W, WIN_H - PANE_Y - PANE_H);
    ctx.fillRect(x0, top, PANE_X, WIN_H);
    ctx.fillRect(x0 + PANE_X + PANE_W, top, WIN_W - PANE_X - PANE_W, WIN_H);
    ctx.fillStyle = '#3a3152';
    ctx.fillRect(x0 + 19, py, 2, PANE_H);
    ctx.fillRect(px, py + 18, PANE_W, 2);
  }
}

/** The pane rectangle (world coordinates) for a window centred on cx. */
export function paneRect(cx: number, top: number): { x: number; y: number; w: number; h: number } {
  return { x: Math.round(cx - WIN_W / 2) + PANE_X, y: top + PANE_Y, w: PANE_W, h: PANE_H };
}
