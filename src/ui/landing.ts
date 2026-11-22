// Landing hero scene: 480x220 canvas, drawn from the original sprites.
// Falls back to simple shapes if a sprite fails to load. No sound.

import { initCarousel } from './carousel.ts';

const W = 480, H = 220, FLOOR = 190;
const canvas = document.getElementById('scene') as HTMLCanvasElement | null;
const ctx = canvas?.getContext('2d') ?? null;

function load(src: string): Promise<HTMLImageElement | null> {
  return new Promise((res) => {
    const i = new Image();
    i.onload = () => res(i);
    i.onerror = () => res(null);
    i.src = src;
  });
}

const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

async function main(): Promise<void> {
  if (!ctx) return;
  ctx.imageSmoothingEnabled = false;
  const [walk, idle, ghost, door] = await Promise.all([
    load('/assets/sprites/reaper_walk.png'),
    load('/assets/sprites/reaper_idle.png'),
    load('/assets/sprites/ghost.png'),
    load('/assets/sprites/door_frame.png'),
  ]);

  const stars = Array.from({ length: 40 }, (_, i) => ({ x: (i * 97) % W, y: (i * 53) % 110, p: i }));
  const ghosts = [0, 1, 2].map((i) => ({ x: 80 + i * 150, y: 60 + i * 20, p: i * 2 }));
  const bats = [0, 1, 2].map((i) => ({ x: i * 170, y: 30 + i * 22, p: i }));

  function draw(t: number): void {
    const c = ctx!;
    // sky
    const g = c.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#120e1c'); g.addColorStop(1, '#2a2240');
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    for (const s of stars) {
      c.fillStyle = Math.sin(t * 2 + s.p) > 0.2 ? '#ece6d6' : '#a59cbc';
      c.fillRect(s.x, s.y, 1, 1);
    }
    // moon
    c.fillStyle = '#ece6d6'; c.beginPath(); c.arc(400, 46, 22, 0, Math.PI * 2); c.fill();
    c.fillStyle = '#a59cbc'; c.fillRect(392, 40, 4, 4); c.fillRect(404, 52, 5, 5);
    // ground
    c.fillStyle = '#1c162b'; c.fillRect(0, FLOOR, W, H - FLOOR);
    c.fillStyle = '#2a2240'; c.fillRect(0, FLOOR, W, 2);

    // door
    const dx = 330, dh = 62;
    if (door) c.drawImage(door, dx, FLOOR - dh + 2);
    else { c.fillStyle = '#2a2240'; c.fillRect(dx, FLOOR - dh, 40, dh); c.fillStyle = '#120e1c'; c.fillRect(dx + 6, FLOOR - dh + 6, 28, dh - 6); }

    // torch glow (flicker)
    for (const tx of [60, 300, 400]) {
      const f = 0.75 + 0.25 * Math.sin(t * 9 + tx);
      const r = c.createRadialGradient(tx, 150, 2, tx, 150, 60 * f);
      r.addColorStop(0, 'rgba(255,154,60,0.55)'); r.addColorStop(1, 'rgba(255,154,60,0)');
      c.fillStyle = r; c.fillRect(tx - 70, 80, 140, 140);
      c.fillStyle = '#5a3a1a'; c.fillRect(tx - 1, 152, 3, 10);
      c.fillStyle = '#ff9a3c'; c.fillRect(tx - 2, 146 - (f > 0.9 ? 1 : 0), 5, 6);
      c.fillStyle = '#f2b84b'; c.fillRect(tx - 1, 148, 3, 3);
    }

    // reaper: walks in from the left, then idles beside the door
    const walkEnd = 285;
    const walkT = reduced ? 1e9 : t * 40;
    const rx = reduced ? walkEnd : Math.min(-40 + (walkT % 700), walkEnd);
    const walking = !reduced && rx < walkEnd;
    const sprite = walking ? walk : idle;
    const frames = walking ? 6 : 2;
    const fi = Math.floor(t * (walking ? 10 : 2)) % frames;
    if (sprite) c.drawImage(sprite, fi * 32, 0, 32, 48, Math.round(rx), FLOOR - 48 + 2, 32, 48);
    else { c.fillStyle = '#120e1c'; c.fillRect(rx + 8, FLOOR - 40, 16, 40); c.fillStyle = '#ece6d6'; c.fillRect(rx + 12, FLOOR - 36, 8, 8); }

    // ghosts drift with a sine wobble
    for (const o of ghosts) {
      const gx = (o.x + t * 14) % (W + 40) - 20;
      const gy = o.y + Math.sin(t * 1.5 + o.p) * 8;
      c.globalAlpha = 0.7;
      if (ghost) c.drawImage(ghost, (Math.floor(t * 3 + o.p) % 2) * 7, 0, 7, 7, Math.round(gx), Math.round(gy), 14, 14);
      else { c.fillStyle = '#c99bff'; c.fillRect(gx, gy, 8, 8); }
      c.globalAlpha = 1;
    }
    // bats
    c.fillStyle = '#120e1c';
    for (const b of bats) {
      const bx = W - ((b.x + t * 45) % (W + 30));
      const by = b.y + Math.sin(t * 3 + b.p) * 10;
      const up = Math.sin(t * 16 + b.p) > 0;
      c.fillRect(bx, by, 4, 2);
      c.fillRect(bx - 3, by + (up ? -2 : 1), 3, 2);
      c.fillRect(bx + 4, by + (up ? -2 : 1), 3, 2);
    }
    // fog
    for (let i = 0; i < 3; i++) {
      const fx = ((t * (6 + i * 3) + i * 200) % (W + 200)) - 200;
      c.fillStyle = 'rgba(165,156,188,0.10)';
      c.fillRect(fx, FLOOR - 12 + i * 6, 200, 10);
    }
  }

  if (reduced) { draw(0.6); return; }
  let last = performance.now(), t = 0;
  function frame(now: number): void {
    t += Math.min((now - last) / 1000, 0.05);
    last = now;
    draw(t);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}

initCarousel(document.getElementById('featCarousel'));
void main();
