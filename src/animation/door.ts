/**
 * Door and tombstone drawing for one slot in the hallway.
 * Also draws the torch flame above each door position.
 */

import { getSprite, drawFrame, stripRect } from './sprites.ts';

const FLOOR = 184;

/** Per-door mutable state tracked by hallway.ts */
export interface DoorState {
  open: number;    // 0 = closed, 1 = fully open
  shake: number;   // 0–1 knock shake magnitude
}

/** Per-zombie mutable state tracked by hallway.ts */
export interface ZombieState {
  out: number;      // 0 = behind door, 1 = fully emerged
  scale: number;    // size relative to max
  grow: number;     // boss-swell multiplier (1 = normal)
  dissolve: number; // 0 = solid, 1 = fully dissolved
  hit: number;      // 0–1 flash intensity
  alive: boolean;
}

export interface DoorSlotState {
  door: DoorState;
  z: ZombieState;
  tomb: number;     // 0 = no tombstone, 1 = fully risen
  status: string;
}

/** Torch flicker drawn above a door position. */
export function drawTorch(
  ctx: CanvasRenderingContext2D,
  x: number,
  t: number,
  floor = FLOOR,
): void {
  const f =
    Math.sin(t * 13 + x) * 0.5 + Math.sin(t * 7.3 + x * 2) * 0.5;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(x, floor - 54, 2, x, floor - 54, 38);
  g.addColorStop(0, `rgba(255,160,70,${0.22 + 0.05 * f})`);
  g.addColorStop(1, 'rgba(255,160,70,0)');
  ctx.fillStyle = g;
  ctx.fillRect(x - 40, floor - 94, 80, 80);
  ctx.restore();

  // Bracket
  ctx.fillStyle = '#5a4630';
  ctx.fillRect(x - 2, floor - 48, 5, 2);
  ctx.fillStyle = '#4a3826';
  ctx.fillRect(x - 1, floor - 50, 3, 6);

  // Flame
  const fy = Math.round(f);
  ctx.fillStyle = '#ff9a3c';
  ctx.fillRect(x - 1, floor - 56 - fy, 3, 6 + fy);
  ctx.fillStyle = '#ffe08a';
  ctx.fillRect(x, floor - 58 - fy, 1, 4);
}

/**
 * Draw the door, zombie-reveal peek, and tombstone for one slot.
 * Zombie drawing is deferred to zombie.ts; pass a drawZombie callback
 * so this module stays independent.
 */
export function drawDoor(
  ctx: CanvasRenderingContext2D,
  cx: number,
  slot: DoorSlotState,
  t: number,
  drawZombieCallback: (cx: number, slot: DoorSlotState, t: number) => void,
  /** Y of the floor this door stands on (the ground line, or the upper landing). */
  floor = FLOOR,
): void {
  const { door, z, tomb } = slot;
  const sh = door.shake > 0.02
    ? Math.round(Math.sin(t * 90) * 2 * door.shake)
    : 0;
  const x0 = cx - 17 + sh;
  const y0 = floor - 58;

  const frameS = getSprite('door_frame');
  const panelS = getSprite('door_panel');
  const tombS = getSprite('tombstone');

  if (frameS) {
    // Frame + doorway void in one sprite
    drawFrame(ctx, frameS, 0, x0 - 3, y0 - 4);
  } else {
    // Door frame
    ctx.fillStyle = '#3b2a20';
    ctx.fillRect(x0 - 3, y0 - 4, 40, 62);
    ctx.fillStyle = '#4d382a';
    ctx.fillRect(x0 - 3, y0 - 4, 40, 2);

    // Doorway void
    ctx.fillStyle = '#07050c';
    ctx.fillRect(x0, y0, 34, 58);
  }

  // Zombie peek (behind door, only while partially open)
  if (door.open > 0.25 && z.out <= 0.5) {
    drawZombieCallback(cx, slot, t);
  }

  // Door panel (slides right as it opens)
  const w = Math.max(3, Math.round(34 * (1 - 0.9 * door.open)));
  const px = x0 + 34 - w;
  if (panelS) {
    // Squeezed horizontally as it slides open
    const r = stripRect(panelS.def, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(panelS.bitmap, r.sx, r.sy, r.sw, r.sh, px, y0, w, 58);
  } else {
  ctx.fillStyle = '#6e4a2f';
  ctx.fillRect(px, y0, w, 58);

  if (w > 10) {
    ctx.fillStyle = '#5e3f28';
    ctx.fillRect(px + 3, y0 + 4, w - 6, 20);
    ctx.fillRect(px + 3, y0 + 30, w - 6, 24);
    ctx.fillStyle = '#6e4a2f';
    ctx.fillRect(px + 4, y0 + 5, w - 8, 18);
    ctx.fillRect(px + 4, y0 + 31, w - 8, 22);
    // Doorknob
    ctx.fillStyle = '#d9b25a';
    ctx.fillRect(px + 4, y0 + 28, 2, 3);
  } else {
    // Door edge sliver
    ctx.fillStyle = '#4e3420';
    ctx.fillRect(px, y0, 1, 58);
  }
  }

  // Tombstone (rises after kill)
  if (tomb > 0) {
    const h = Math.round(16 * tomb);
    const tx = cx - 7;
    const ty = floor - h;
    if (tombS) {
      // Rises out of the floor: top h rows, bottom clipped at the floor line
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(tombS.bitmap, 0, 0, 14, h, tx, ty, 14, h);
    } else {
    ctx.fillStyle = '#6f6a80';
    ctx.fillRect(tx, ty + 2, 14, h - 2);
    ctx.fillRect(tx + 2, ty, 10, 2);
    ctx.fillStyle = '#8a85a0';
    ctx.fillRect(tx + 1, ty + 2, 1, h - 2);
    if (tomb > 0.8) {
      // Cross
      ctx.fillStyle = '#3f3b4f';
      ctx.fillRect(tx + 6, ty + 4, 2, 8);
      ctx.fillRect(tx + 4, ty + 6, 6, 2);
    }
    }
  }
}
