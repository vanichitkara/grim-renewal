/**
 * Zombie draw function for one subscription slot.
 */

import type { DoorSlotState } from './door.ts';
import { getSprite, stripRect, frameIndex } from './sprites.ts';
import type { Sprite } from './sprites.ts';

const FLOOR = 184;

/** Sprite frame anchor: feet, body centre of the 24x40 frame. */
const ANCHOR_X = 17;
const ANCHOR_Y = 40;

type RGB = [number, number, number];

function mixRGB(a: string, b: string, t: number): RGB {
  const A = hex(a);
  const B = hex(b);
  return A.map((v, i) => Math.round(v + (B[i]! - v) * t)) as RGB;
}

// Marker colours in zombie_idle.png (see scripts/make-sprites.ts).
const M_SKIN = '8fc25a', M_DARK = '5f8a35', M_SHIRT = 'a59cbc', M_EYE = 'f5e663';
const M_HEAD_SPOT = '5d7a35', M_BODY_SPOT = '4b5530';

const tintCache = new Map<string, HTMLCanvasElement>();

/**
 * Recolour the zombie strip: shirt colour, rot (skin goes sickly, spots appear),
 * eye colour, or all-white for the hit flash. Cached by quantised rot level.
 */
function tintedZombie(
  s: Sprite,
  shirt: string,
  forgotten: number,
  eye: string,
  flash: boolean,
): HTMLCanvasElement | null {
  const level = Math.round(Math.min(1, Math.max(0, forgotten)) * 10);
  const key = `${flash ? 'flash' : `${shirt}|${level}|${eye}`}`;
  const hit = tintCache.get(key);
  if (hit) return hit;

  const cv = document.createElement('canvas');
  cv.width = s.bitmap.width;
  cv.height = s.bitmap.height;
  const c = cv.getContext('2d');
  if (!c) return null;
  c.drawImage(s.bitmap, 0, 0);
  const img = c.getImageData(0, 0, cv.width, cv.height);
  const d = img.data;

  const f = level / 10;
  const skin = mixRGB('#8fc25a', '#7d8b4a', f);
  const dark = mixRGB('#5f8a35', '#4b5530', f);
  const shirtRGB = hex(shirt);
  const eyeRGB = hex(eye);
  const spots = Math.round(f * 5);
  const to = (n: string): RGB => hex(`#${n}`);
  const SK = to(M_SKIN), DK = to(M_DARK), SH = to(M_SHIRT), EY = to(M_EYE);
  const HS = to(M_HEAD_SPOT), BS = to(M_BODY_SPOT);
  const eq = (a: RGB, r: number, g: number, b: number) => a[0] === r && a[1] === g && a[2] === b;

  for (let p = 0; p < d.length; p += 4) {
    if (d[p + 3] === 0) continue;
    const r = d[p]!, g = d[p + 1]!, b = d[p + 2]!;
    const px = (p / 4) % cv.width, py = Math.floor(p / 4 / cv.width);
    const spotOn = (px * 7 + py * 3) % 5 < spots;
    let out: RGB | null = null;
    if (flash) out = [255, 255, 255];
    else if (eq(SK, r, g, b)) out = skin;
    else if (eq(DK, r, g, b)) out = dark;
    else if (eq(SH, r, g, b)) out = shirtRGB;
    else if (eq(EY, r, g, b)) out = eyeRGB;
    else if (eq(HS, r, g, b)) out = spotOn ? dark : skin;
    else if (eq(BS, r, g, b)) out = spotOn ? dark : shirtRGB;
    if (out) { d[p] = out[0]; d[p + 1] = out[1]; d[p + 2] = out[2]; }
  }
  c.putImageData(img, 0, 0);
  tintCache.set(key, cv);
  return cv;
}

function hex(c: string): [number, number, number] {
  const n = parseInt(c.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(a: string, b: string, t: number): string {
  const A = hex(a);
  const B = hex(b);
  return (
    'rgb(' +
    A.map((v, i) => Math.round(v + (B[i]! - v) * t)).join(',') +
    ')'
  );
}

export interface ZombieConfig {
  forgotten: number;   // 0–1; more forgotten = more decayed
  shirt: string;       // hex colour for shirt
  phoneOnly?: boolean;
}

/** Draw the zombie for one slot. No-op when z.alive is false. */
export function drawZombieFor(
  ctx: CanvasRenderingContext2D,
  cx: number,
  slot: DoorSlotState,
  config: ZombieConfig,
  t: number,
): void {
  const { z } = slot;
  if (!z.alive) return;

  const { forgotten, shirt } = config;
  const sc = z.scale * z.grow;
  const skin = mix('#8fc25a', '#7d8b4a', forgotten);
  const dark = mix('#5f8a35', '#4b5530', forgotten);

  ctx.save();
  ctx.globalAlpha = 1 - z.dissolve;
  ctx.translate(cx + 2 - z.out * 9, FLOOR);
  ctx.scale(sc, sc * (1 - 0.35 * z.dissolve));
  ctx.rotate(Math.sin(t * 2.2 + cx) * 0.035 * (1 + forgotten));

  const flashColor = z.hit > 0.4 ? '#ffffff' : null;

  const sheet = getSprite('zombie_idle');
  if (sheet) {
    const eye = config.phoneOnly && slot.status === 'boss' ? '#ff4040' : '#f5e663';
    const img = tintedZombie(sheet, shirt, forgotten, eye, flashColor !== null);
    if (img) {
      ctx.imageSmoothingEnabled = false;
      const r = stripRect(sheet.def, frameIndex(t + cx / 50, 2.5, sheet.def.frames, true));
      ctx.drawImage(img, r.sx, r.sy, r.sw, r.sh, -ANCHOR_X, -ANCHOR_Y, r.sw, r.sh);
      ctx.restore();
      return;
    }
  }

  const fill = (x: number, y: number, w: number, h: number, c: string) => {
    ctx.fillStyle = flashColor ?? c;
    ctx.fillRect(x, y, w, h);
  };

  const step = Math.sin(t * 3 + cx);

  // Legs
  fill(-6, -12, 4, 12, '#3d3550');
  fill(2, -12, 4, 12, '#3d3550');
  fill(-7, -1, 5, 1, '#241f30');
  fill(1, -1, 5, 1, '#241f30');

  // Torso
  fill(-7, -26, 14, 14, shirt);

  // Shirt peek / detail
  fill(-7, -14, 3, 2, skin);
  fill(3, -16, 2, 3, skin);
  fill(-2, -20, 2, 2, skin);

  // Arms (alternating bob)
  const ab = Math.round(step);
  fill(-18, -24 + ab, 12, 3, skin);
  fill(-18, -19 - ab, 12, 3, skin);
  fill(-20, -24 + ab, 2, 3, dark);
  fill(-20, -19 - ab, 2, 3, dark);

  // Head
  fill(-6, -36, 12, 10, skin);
  fill(-6, -37, 12, 2, dark);
  fill(3, -36, 3, 1, dark);

  // Eyes — red when boss/phone-only
  const eye =
    config.phoneOnly && slot.status === 'boss' ? '#ff4040' : '#f5e663';
  fill(-4, -33, 2, 2, eye);
  fill(1, -33, 2, 2, eye);

  // Mouth
  fill(-3, -29, 6, 1, '#2a1a1a');
  fill(-2, -30, 1, 1, '#e9e9e9');
  fill(1, -30, 1, 1, '#e9e9e9');

  // Rot spots (count scales with forgotten)
  const spots: [number, number][] = [[3, -31], [-5, -28], [4, -22], [-4, -18], [0, -35]];
  for (let k = 0; k < Math.round(forgotten * spots.length); k++) {
    fill(spots[k]![0], spots[k]![1], 2, 2, dark);
  }

  ctx.restore();
}
