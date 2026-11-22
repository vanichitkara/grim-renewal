/**
 * Sprite sheet loader. Sheets are horizontal strips (animation.md):
 * frame i sits at x = i * frameW. Loaded as ImageBitmap.
 * Callers use getSprite(name) and fall back to rectangles when it is null.
 */

export interface SpriteDef {
  name: string;
  file: string;
  frameW: number;
  frameH: number;
  frames: number;
}

export interface Sprite {
  def: SpriteDef;
  bitmap: ImageBitmap;
}

export type SpriteSet = ReadonlyMap<string, Sprite>;

const def = (name: string, frameW: number, frameH: number, frames: number): SpriteDef =>
  ({ name, file: `${name}.png`, frameW, frameH, frames });

/** Keep in sync with scripts/make-sprites.ts (sprites.test.ts checks PNG sizes). */
export const MANIFEST: readonly SpriteDef[] = [
  def('reaper_idle', 32, 48, 2),
  def('reaper_walk', 32, 48, 6),
  def('reaper_knock', 32, 48, 4),
  def('reaper_swing', 32, 48, 4),
  def('reaper_scared', 32, 48, 1),
  def('scythe', 18, 48, 1),
  def('zombie_idle', 24, 40, 2),
  def('door_frame', 40, 62, 1),
  def('door_panel', 34, 58, 1),
  def('tombstone', 14, 16, 1),
  def('coin', 4, 4, 4),
  def('ghost', 7, 7, 2),
];

/** Frame to show at time t (seconds). Always in [0, frames-1]. */
export function frameIndex(t: number, fps: number, frames: number, loop: boolean): number {
  if (!(frames >= 1) || !Number.isFinite(t) || !Number.isFinite(fps)) return 0;
  const n = Math.floor(frames);
  const i = Math.floor(t * fps);
  return loop ? ((i % n) + n) % n : Math.min(n - 1, Math.max(0, i));
}

/** Source rectangle of frame i in its strip (i is clamped into range). */
export function stripRect(d: SpriteDef, i: number) {
  const f = Math.min(d.frames - 1, Math.max(0, Math.floor(i) || 0));
  return { sx: f * d.frameW, sy: 0, sw: d.frameW, sh: d.frameH };
}

/** Returns a list of problems; empty means the manifest is valid. */
export function validateManifest(m: readonly SpriteDef[]): string[] {
  const errs: string[] = [];
  const seen = new Set<string>();
  for (const d of m) {
    if (!d.name) errs.push('empty name');
    if (seen.has(d.name)) errs.push(`duplicate name ${d.name}`);
    seen.add(d.name);
    if (!d.file.endsWith('.png')) errs.push(`${d.name}: file must be .png`);
    for (const k of ['frameW', 'frameH', 'frames'] as const) {
      if (!Number.isInteger(d[k]) || d[k] < 1) errs.push(`${d.name}: ${k} must be a positive integer`);
    }
  }
  return errs;
}

let set = new Map<string, Sprite>();
let loading: Promise<SpriteSet> | null = null;

/** Loads all sheets once. A sheet that fails to load is skipped (callers fall back). */
// Relative on purpose: the site may live under a sub-path (GitHub Pages: /grim-renewal/).
export function loadSprites(base = './assets/sprites/'): Promise<SpriteSet> {
  loading ??= (async () => {
    const next = new Map<string, Sprite>();
    await Promise.all(MANIFEST.map(async (d) => {
      try {
        const res = await fetch(base + d.file);
        if (!res.ok) return;
        next.set(d.name, { def: d, bitmap: await createImageBitmap(await res.blob()) });
      } catch {
        // missing or undecodable sheet: leave it out
      }
    }));
    set = next;
    return set as SpriteSet;
  })();
  return loading;
}

/** The loaded sprite, or null (not loaded yet, or failed). */
export function getSprite(name: string): Sprite | null {
  return set.get(name) ?? null;
}

/** Draw frame i with its top-left at (dx, dy). Pixel art: no smoothing. */
export function drawFrame(
  ctx: CanvasRenderingContext2D,
  s: Sprite,
  i: number,
  dx: number,
  dy: number,
): void {
  const r = stripRect(s.def, i);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(s.bitmap, r.sx, r.sy, r.sw, r.sh, Math.round(dx), Math.round(dy), r.sw, r.sh);
}
