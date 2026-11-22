/**
 * Pre-rendered background canvas for the hallway scene.
 * Call paintBg() once; blit the returned canvas every frame with drawImage().
 */

/** Hallway spans x 0..HALL; the world (hallway + archway + yard) is WORLD wide. */
const HALL = 500;
const WORLD = 800;
const H = 220;
const FLOOR = 184;

export function paintBg(): HTMLCanvasElement {
  const bg = document.createElement('canvas');
  bg.width = WORLD;
  bg.height = H;
  const b = bg.getContext('2d')!;

  // Upper wall — brick tiles
  b.fillStyle = '#1b1529';
  b.fillRect(0, 0, HALL, FLOOR);
  b.fillStyle = '#211a33';
  for (let row = 0, y = 0; y < FLOOR - 30; y += 8, row++) {
    const off = (row % 2) * 8;
    for (let x = -16; x < HALL; x += 16) {
      b.fillRect(x + off + 1, y + 1, 14, 6);
    }
  }

  // Floor edge
  b.fillStyle = '#271e3a';
  b.fillRect(0, FLOOR - 28, HALL, 28);
  b.fillStyle = '#3a2d52';
  b.fillRect(0, FLOOR - 30, HALL, 2);

  // Floor tiles
  b.fillStyle = '#21192f';
  for (let x = 4; x < HALL; x += 28) {
    b.fillRect(x, FLOOR - 24, 22, 20);
  }

  // Ground below floor
  b.fillStyle = '#140f1e';
  b.fillRect(0, FLOOR, HALL, H - FLOOR);
  b.fillStyle = '#1c1529';
  for (let y = FLOOR + 6; y < H; y += 7) {
    b.fillRect(0, y, HALL, 1);
  }
  b.fillStyle = '#2e2442';
  b.fillRect(0, FLOOR, HALL, 1);

  // Moonlit window
  b.fillStyle = '#3a2d52';
  b.fillRect(20, 34, 56, 70);
  b.fillStyle = '#0c1530';
  b.fillRect(24, 38, 48, 62);
  b.fillStyle = '#e9e4c9';
  b.beginPath();
  b.arc(46, 60, 11, 0, Math.PI * 2);
  b.fill();
  b.fillStyle = '#0c1530';
  b.beginPath();
  b.arc(51, 56, 10, 0, Math.PI * 2);
  b.fill();
  b.fillStyle = '#3a2d52';
  b.fillRect(46, 38, 3, 62);
  b.fillRect(24, 68, 48, 3);

  // Moonlight shaft
  b.fillStyle = 'rgba(200,210,255,0.06)';
  b.beginPath();
  b.moveTo(24, FLOOR);
  b.lineTo(72, FLOOR);
  b.lineTo(110, H);
  b.lineTo(10, H);
  b.fill();

  // Cobweb top-left corner
  b.strokeStyle = 'rgba(200,190,220,0.25)';
  b.lineWidth = 1;
  for (let k = 1; k <= 3; k++) {
    b.beginPath();
    b.arc(0, 0, k * 9, 0, Math.PI / 2);
    b.stroke();
  }
  b.beginPath();
  b.moveTo(0, 0); b.lineTo(30, 10);
  b.moveTo(0, 0); b.lineTo(18, 24);
  b.moveTo(0, 0); b.lineTo(6, 30);
  b.stroke();

  paintYard(b);
  paintArch(b);
  return bg;
}

/** Moonlit graveyard, world x HALL..WORLD. */
function paintYard(b: CanvasRenderingContext2D): void {
  const x0 = HALL;
  const sky = b.createLinearGradient(0, 0, 0, FLOOR);
  sky.addColorStop(0, '#080c22');
  sky.addColorStop(1, '#231d3d');
  b.fillStyle = sky;
  b.fillRect(x0, 0, WORLD - x0, FLOOR);

  for (let k = 0; k < 40; k++) {
    b.fillStyle = `rgba(236,230,214,${0.3 + Math.random() * 0.6})`;
    b.fillRect(x0 + Math.floor(Math.random() * (WORLD - x0)), Math.floor(Math.random() * (FLOOR - 60)), 1, 1);
  }

  // Moon with glow and craters.
  const glow = b.createRadialGradient(705, 40, 8, 705, 40, 50);
  glow.addColorStop(0, 'rgba(233,228,201,0.28)');
  glow.addColorStop(1, 'rgba(233,228,201,0)');
  b.fillStyle = glow;
  b.fillRect(655, 0, 100, 100);
  b.fillStyle = '#e9e4c9';
  b.beginPath();
  b.arc(705, 40, 15, 0, Math.PI * 2);
  b.fill();
  b.fillStyle = 'rgba(120,115,100,0.35)';
  b.fillRect(699, 34, 4, 3);
  b.fillRect(709, 43, 3, 3);
  b.fillRect(703, 47, 2, 2);

  // Hills.
  b.fillStyle = '#16132a';
  for (let x = x0; x < WORLD; x++) {
    const top = Math.round(FLOOR - 44 - 14 * Math.sin(x * 0.025) - 8 * Math.cos(x * 0.06));
    b.fillRect(x, top, 1, FLOOR - top);
  }

  // Bare tree.
  b.fillStyle = '#0d0b17';
  b.fillRect(566, FLOOR - 92, 5, 92);
  b.fillRect(556, FLOOR - 78, 12, 2); b.fillRect(554, FLOOR - 84, 2, 8);
  b.fillRect(570, FLOOR - 70, 14, 2); b.fillRect(582, FLOOR - 78, 2, 10);
  b.fillRect(560, FLOOR - 60, 8, 2); b.fillRect(558, FLOOR - 66, 2, 8);
  b.fillRect(566, FLOOR - 98, 2, 8); b.fillRect(572, FLOOR - 92, 2, 6);

  // Iron fence: two rails, pickets every 7 px.
  b.fillStyle = '#0f0d1a';
  b.fillRect(x0, FLOOR - 28, WORLD - x0, 2);
  b.fillRect(x0, FLOOR - 16, WORLD - x0, 2);
  for (let x = x0 + 4; x < WORLD; x += 7) {
    b.fillRect(x, FLOOR - 34, 2, 34);
    b.fillRect(x, FLOOR - 36, 2, 2);
  }

  // Ground with grass ticks.
  b.fillStyle = '#15190f';
  b.fillRect(x0, FLOOR, WORLD - x0, H - FLOOR);
  b.fillStyle = '#243020';
  b.fillRect(x0, FLOOR, WORLD - x0, 1);
  b.fillStyle = '#1f2a1a';
  for (let x = x0 + 3; x < WORLD; x += 9) {
    b.fillRect(x, FLOOR - 2 + (x % 3), 1, 2);
  }
}

/** End wall with an archway between hallway and yard, x 498..524. */
function paintArch(b: CanvasRenderingContext2D): void {
  b.fillStyle = '#2f2645';
  b.fillRect(498, 0, 6, FLOOR);
  b.fillRect(518, 0, 6, FLOOR);
  b.fillStyle = '#3a2d52';
  b.fillRect(498, 0, 26, 52);
  b.fillStyle = '#151129';
  b.fillRect(498, 52, 6, 2);
  b.fillRect(518, 52, 6, 2);
}
