/**
 * Draws the extension icons (pixel reaper) as PNG files. No dependencies: zlib + a tiny PNG writer.
 * Run: npx tsx scripts/make-extension-icons.mts   -> extension/icons/icon{16,48,128}.png
 */
import { deflateSync } from 'node:zlib';
import { mkdirSync, writeFileSync } from 'node:fs';

// Palette from .kiro/steering/animation.md. '.' is transparent.
const COLORS: Record<string, [number, number, number]> = {
  n: [0x12, 0x0e, 0x1c], // night
  s: [0x2a, 0x22, 0x40], // stone
  b: [0xec, 0xe6, 0xd6], // bone
  m: [0xa5, 0x9c, 0xbc], // mist
  c: [0xf2, 0xb8, 0x4b], // coin
  p: [0xc9, 0x9b, 0xff], // spirit
};

// 16 x 16: hooded reaper with a scythe, on a night tile.
const ART = [
  'nnnnnnnnnnnnnnnn',
  'nnnnnnnsssnnnncn',
  'nnnnnnssssssnccn',
  'nnnnnssssssssccn',
  'nnnnnssnnnnssnnn',
  'nnnnnssnppnnsnnn',
  'nnnnnssnbbnnsnnn',
  'nnnnnnsssssssnnn',
  'nnnnnnssssssssnn',
  'nnnnnsssssmsssnn',
  'nnnnnsssssmsssnn',
  'nnnnssssssmssssn',
  'nnnnssssssssssnn',
  'nnnsssssssssssnn',
  'nnnnssnsnnsnssnn',
  'nnnnnnnnnnnnnnnn',
];

const CRC = new Uint32Array(256).map((_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const c = Buffer.alloc(4);
  c.writeUInt32BE(crc(td));
  return Buffer.concat([len, td, c]);
}

function png(size: number): Buffer {
  const scale = size / 16;
  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0;
    for (let x = 0; x < size; x++) {
      const ch = ART[Math.floor(y / scale)]![Math.floor(x / scale)]!;
      const rgb = COLORS[ch] ?? COLORS.n!;
      const o = y * (size * 4 + 1) + 1 + x * 4;
      raw[o] = rgb[0];
      raw[o + 1] = rgb[1];
      raw[o + 2] = rgb[2];
      raw[o + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6; // RGBA
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

mkdirSync('extension/icons', { recursive: true });
for (const s of [16, 48, 128]) writeFileSync(`extension/icons/icon${s}.png`, png(s));
console.log('icons written');
