/**
 * Generates every sprite strip in public/assets/sprites/.
 * Run: npx tsx scripts/make-sprites.ts
 *
 * Each frame is a palette-indexed character grid ('.' = transparent).
 * PNG is encoded by hand with node:zlib; no libraries.
 * Keep SPRITES in sync with MANIFEST in src/animation/sprites.ts
 * (src/animation/sprites.test.ts checks the PNG sizes against it).
 */

import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

// ---------- palette (animation.md palette + dark tones already used in code) ----------
const PAL: Record<string, string> = {
  o: '#120d1a', k: '#1c162b', m: '#2a2240', c: '#3a3152', // outline, cloak fill/mid/rim
  b: '#e8e2d0', d: '#a59cbc', e: '#ff3b3b', w: '#ffffff', // bone, mist, eye red, white
  h: '#6b4a2b', l: '#cfd6de', s: '#7e8794',               // scythe pole, blade, blade shade
  S: '#8fc25a', D: '#5f8a35', R: '#5d7a35', F: '#4b5530', // zombie skin, dark, head-spot, torso-spot
  E: '#f5e663', M: '#2a1a1a', W: '#e9e9e9', P: '#3d3550', B: '#241f30',
  Y: '#f2b84b', H: '#fff3c4', y: '#d9b25a',               // coin gold, shine, shade
  G: '#6f6a80', L: '#8a85a0', X: '#3f3b4f',               // tombstone
  a: '#211a33', A: '#1b1529',                              // mansion brick, mortar
  n: '#3b2a20', N: '#4d382a', v: '#07050c', q: '#6e4a2f', Q: '#5e3f28', r: '#4e3420', // door
};
// 'T' = shirt marker. zombie.ts recolours it per subscription.
PAL['T'] = '#a59cbc';

type Grid = string[][];
const mk = (w: number, h: number): Grid => Array.from({ length: h }, () => Array<string>(w).fill('.'));
const px = (g: Grid, x: number, y: number, ch: string) => {
  if (g[y] && x >= 0 && x < g[y]!.length) g[y]![x] = ch;
};
const rect = (g: Grid, x: number, y: number, w: number, h: number, ch: string) => {
  for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) px(g, x + i, y + j, ch);
};
const blit = (g: Grid, rows: string[], x0: number, y0: number) =>
  rows.forEach((row, j) => [...row].forEach((ch, i) => { if (ch !== '.') px(g, x0 + i, y0 + j, ch); }));
const fromRows = (rows: string[]): Grid => rows.map((r) => [...r]);

// ---------- reaper (32x48, anchor x=14, y=47) ----------
const RW = 32, RH = 48, AX = 14;

function hood(scared: boolean): string[] {
  const rows = [
    '.....oooooo.....',
    '...ooccccccoo...',
    '..occkkkkkkkco..',
    '.ockkkkkkkkkkco.',
    '.ockkkbbbbbbkco.',
    scared ? '.ockkkwwbwwbkco.' : '.ockkkeobeobkco.',
    scared ? '.ockkkwobwobkco.' : '.ockkkooboobkco.',
    '.ockkkbbbbbbkco.',
    scared ? '.ockkkboooobkco.' : '.ockkkobobobkco.',
    '..ockkkbbbbkco..',
    '..ockkkkkkkkco..',
  ];
  return rows;
}

interface ReaperOpts { hem: number; scared?: boolean; reach?: number; armY?: number; sway?: number }

function reaperFrame(o: ReaperOpts): Grid {
  const g = mk(RW, RH);
  // cloak: widens toward the hem
  for (let y = 11; y <= 46; y++) {
    const w = 12 + Math.floor((y - 11) * 0.28);
    const l = AX - Math.floor(w / 2);
    const r = l + w - 1;
    for (let x = l; x <= r; x++) px(g, x, y, 'k');
    px(g, l, y, 'o'); px(g, r, y, 'o');
    px(g, l + 1, y, 'c');
    px(g, r - 1, y, 'm');
    if (y >= 22) px(g, AX - 3, y, 'm');
    if (y >= 26 && y % 5 !== 0) px(g, AX + 3, y, 'm');
    if (y === 45) for (let x = l + 1; x < r; x++) px(g, x, y, 'm');
    if (y === 46) {
      for (let x = l; x <= r; x++) px(g, x, y, (x + o.hem) % 4 < 2 ? 'o' : '.');
    }
  }
  blit(g, hood(!!o.scared), 6 + (o.sway ?? 0), 0);
  // arm + hand
  const reach = o.reach ?? 3;
  const ay = o.armY ?? 18;
  rect(g, 18, ay, reach, 1, 'c');
  rect(g, 18, ay + 1, reach, 1, 'm');
  rect(g, 18, ay + 2, reach, 1, 'o');
  blit(g, ['bbb', 'bbd', 'bdd'], 18 + reach, ay - 1);
  return g;
}

const reaperIdle = [0, 2].map((hem) => reaperFrame({ hem }));
const reaperWalk = [0, 1, 2, 3, 4, 5].map((i) => reaperFrame({ hem: i, sway: [0, 0, 1, 1, 0, 0][i]! }));
const reaperKnock = [3, 5, 8, 11].map((reach) => reaperFrame({ hem: 0, reach }));
const reaperSwing = [
  { armY: 18, reach: 3 }, { armY: 14, reach: 4 }, { armY: 11, reach: 5 }, { armY: 16, reach: 7 },
].map((a, i) => reaperFrame({ hem: i, ...a }));
const reaperScared = [reaperFrame({ hem: 1, scared: true })];

// ---------- scythe (18x48, pivot at 2,26) ----------
function scythe(): Grid {
  const g = mk(18, 48);
  rect(g, 1, 2, 2, 45, 'h');
  for (let i = 0; i < 15; i++) {
    const yy = Math.round((i * i) / 26);
    const tall = i > 11 ? 1 : 3;
    rect(g, 3 + i, yy, 1, tall, 'l');
    px(g, 3 + i, yy + tall, 's');
  }
  return g;
}

// ---------- zombie (24x40, anchor x=17, y=40) ----------
function zombie(ab: number): Grid {
  const g = mk(24, 40);
  // legs + shoes
  rect(g, 11, 28, 4, 12, 'P'); rect(g, 19, 28, 4, 12, 'P');
  rect(g, 10, 39, 5, 1, 'B'); rect(g, 18, 39, 5, 1, 'B');
  // torso (shirt) + skin peeking through tears
  rect(g, 10, 14, 14, 14, 'T');
  rect(g, 10, 26, 3, 2, 'S'); rect(g, 20, 24, 2, 3, 'S'); rect(g, 15, 20, 2, 2, 'S');
  rect(g, 14, 14, 6, 1, 'D'); // collar shadow
  // arms reach left, alternating bob
  rect(g, 0, 16 + ab, 12, 3, 'S'); rect(g, 0, 16 + ab, 2, 3, 'D');
  rect(g, 0, 21 - ab, 12, 3, 'S'); rect(g, 0, 21 - ab, 2, 3, 'D');
  // head
  rect(g, 11, 3, 12, 10, 'S');
  rect(g, 11, 3, 12, 2, 'D'); rect(g, 20, 4, 3, 1, 'D');
  px(g, 13, 2, 'D'); px(g, 16, 2, 'D'); px(g, 19, 2, 'D'); // tufts
  rect(g, 13, 7, 2, 2, 'E'); rect(g, 18, 7, 2, 2, 'E');
  px(g, 14, 8, 'M'); px(g, 19, 8, 'M');
  rect(g, 14, 11, 6, 1, 'M'); px(g, 15, 10, 'W'); px(g, 18, 10, 'W');
  // rot spots (drawn only as many as the forgotten score allows)
  rect(g, 20, 9, 2, 2, 'R'); rect(g, 12, 12, 2, 2, 'R'); rect(g, 17, 5, 2, 2, 'R');
  rect(g, 21, 18, 2, 2, 'F'); rect(g, 13, 22, 2, 2, 'F');
  return g;
}

// ---------- door (frame+void 40x62, panel 34x58) ----------
function doorFrame(): Grid {
  const g = mk(40, 62);
  rect(g, 0, 0, 40, 62, 'n');
  rect(g, 0, 0, 40, 2, 'N');
  rect(g, 0, 0, 1, 62, 'N');
  rect(g, 3, 4, 34, 58, 'v');
  return g;
}
function doorPanel(): Grid {
  const g = mk(34, 58);
  rect(g, 0, 0, 34, 58, 'q');
  for (let x = 6; x < 32; x += 7) for (let y = (x * 5) % 9; y < 58; y += 9) px(g, x, y, 'r');
  rect(g, 0, 0, 34, 1, 'r'); rect(g, 0, 0, 1, 58, 'r'); rect(g, 33, 0, 1, 58, 'r');
  rect(g, 3, 4, 28, 20, 'Q'); rect(g, 3, 30, 28, 24, 'Q');
  rect(g, 4, 5, 26, 18, 'q'); rect(g, 4, 31, 26, 22, 'q');
  rect(g, 4, 28, 2, 3, 'y'); px(g, 4, 28, 'H');
  return g;
}

// ---------- tombstone 14x16, coin 4x4 (4 frames), ghost 7x7 (2 frames) ----------
const tombstone = fromRows([
  '..LLLLLLLLLL..',
  '.LGGGGGGGGGGX.',
  'LGGGGGGGGGGGGX',
  'LGGGGGXXGGGGGX',
  'LGGGGGXXGGGGGX',
  'LGGGXXXXXXGGGX',
  'LGGGXXXXXXGGGX',
  'LGGGGGXXGGGGGX',
  'LGGGGGXXGGGGGX',
  'LGGGGGXXGGGGGX',
  'LGGGGGXXGGGGGX',
  'LGGGGGGGGGGGGX',
  'LGGGGGGGGGGGGX',
  'LGGGGGGGGGGGGX',
  'LGGGGGGGGGGGGX',
  'XXXXXXXXXXXXXX',
]);
const coin = [
  ['.YY.', 'YHYY', 'YYYy', '.yy.'],
  ['.YY.', '.HY.', '.Yy.', '.yy.'],
  ['..Y.', '..Y.', '..y.', '..y.'],
  ['.YY.', '.HY.', '.Yy.', '.yy.'],
].map(fromRows);
const ghost = [
  ['.bbbbb.', 'bbbbbbb', 'bbobobb', 'bbbbbbb', 'bbbbbbb', 'bdbdbdb', 'b.b.b.b'],
  ['.bbbbb.', 'bbbbbbb', 'bbobobb', 'bbbbbbb', 'bbbbbbb', 'dbdbdbd', '.b.b.b.'],
].map(fromRows);


// ---------- mansion: upper landing, wall tile, smoke ----------
/**
 * 16x22 tile of the upper landing, repeated across the wall. Rows 0-13: a balustrade
 * (top bar, two posts, see-through between). Rows 14-21: the stone ledge the upper doors stand on.
 * The ledge top (row 14) is the floor line of the upper floor.
 */
function landingTile(): Grid {
  const g = mk(16, 22);
  rect(g, 0, 0, 16, 2, 'c'); rect(g, 0, 2, 16, 1, 'm');         // handrail
  for (const x of [1, 9]) { rect(g, x, 3, 3, 11, 'm'); rect(g, x, 3, 1, 11, 'c'); rect(g, x + 2, 3, 1, 11, 'k'); }
  rect(g, 0, 14, 16, 1, 'c');                                    // lit top edge
  rect(g, 0, 15, 16, 4, 'm');
  for (let x = 0; x < 16; x += 8) rect(g, x + 7, 15, 1, 4, 'k'); // stone joints
  rect(g, 0, 19, 16, 1, 'k'); rect(g, 0, 20, 16, 2, 'o');       // shaded underside
  return g;
}
/** 16x16 brick tile (same look as the old hallway wall). */
function wallTile(): Grid {
  const g = mk(16, 16);
  rect(g, 0, 0, 16, 16, 'A');
  for (let row = 0; row < 2; row++) {
    const off = row * 8;
    for (let x = 0; x < 16; x++) {
      const bx = (x - off + 16) % 16;
      if (bx >= 1 && bx <= 14) for (let y = 1; y <= 6; y++) px(g, x, row * 8 + y, 'a');
    }
  }
  return g;
}
/** Blink smoke: four frames growing, then thinning out. */
function smoke(k: number): Grid {
  const g = mk(16, 16);
  const r = [3, 5, 7, 8][k]!;
  for (let y = 0; y < 16; y++) for (let x = 0; x < 16; x++) {
    const d = Math.hypot(x - 7.5, y - 7.5);
    if (d > r) continue;
    if (k >= 2 && (x * 3 + y * 5 + k) % (k === 2 ? 4 : 2) === 0) continue; // holes as it fades
    px(g, x, y, d > r - 1.5 ? 'c' : (x + y) % 5 === 0 ? 'b' : 'd');
  }
  return g;
}

// ---------- sprite list (file name -> frames) ----------
const SPRITES: Record<string, Grid[]> = {
  reaper_idle: reaperIdle,
  reaper_walk: reaperWalk,
  reaper_knock: reaperKnock,
  reaper_swing: reaperSwing,
  reaper_scared: reaperScared,
  scythe: [scythe()],
  zombie_idle: [zombie(1), zombie(-1)],
  door_frame: [doorFrame()],
  door_panel: [doorPanel()],
  tombstone: [tombstone],
  landing: [landingTile()],
  mansion_wall: [wallTile()],
  smoke: [0, 1, 2, 3].map(smoke),
  coin,
  ghost,
};

// ---------- PNG encoder ----------
const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 255]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function encodePng(frames: Grid[]): Buffer {
  const fh = frames[0]!.length, fw = frames[0]![0]!.length;
  const W = fw * frames.length, H = fh;
  const raw = Buffer.alloc((W * 4 + 1) * H);
  for (let y = 0; y < H; y++) {
    const row = y * (W * 4 + 1);
    raw[row] = 0; // filter: none
    frames.forEach((f, fi) => {
      if (f.length !== fh || f[y]!.length !== fw) throw new Error('frame size mismatch');
      for (let x = 0; x < fw; x++) {
        const ch = f[y]![x]!;
        if (ch === '.') continue;
        const hex = PAL[ch];
        if (!hex) throw new Error(`unknown palette char '${ch}'`);
        const n = parseInt(hex.slice(1), 16);
        const o = row + 1 + (fi * fw + x) * 4;
        raw[o] = (n >> 16) & 255; raw[o + 1] = (n >> 8) & 255; raw[o + 2] = n & 255; raw[o + 3] = 255;
      }
    });
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; ihdr[9] = 6; // 8-bit RGBA
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

const out = resolve(process.cwd(), 'public/assets/sprites');
mkdirSync(out, { recursive: true });
for (const [name, frames] of Object.entries(SPRITES)) {
  writeFileSync(resolve(out, `${name}.png`), encodePng(frames));
  console.log(`${name}.png  ${frames[0]![0]!.length}x${frames[0]!.length}  x${frames.length}`);
}
