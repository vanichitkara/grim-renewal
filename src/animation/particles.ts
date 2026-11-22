/**
 * Particle system: dissolve dust, coins, and soul ghost.
 * All counts respect prefers-reduced-motion.
 */

import { getSprite, drawFrame, frameIndex } from './sprites.ts';

const FLOOR = 184;

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  g: number;
  life: number;
  max: number;
  size: number;
  color: string;
  kind: 'dust' | 'coin' | 'soul' | 'dirt' | 'shard' | 'puff';
  bounced?: boolean;
  seed?: number;
}

export function spawnDissolve(
  particles: Particle[],
  cx: number,
  scale: number,
  reduceMotion: boolean,
  baseY = FLOOR,
): void {
  const n = reduceMotion ? 18 : 60;
  for (let k = 0; k < n; k++) {
    particles.push({
      x: cx - 8 + (Math.random() - 0.5) * 18 * scale,
      y: baseY - Math.random() * 34 * scale,
      vx: (Math.random() - 0.5) * 20,
      vy: -10 - Math.random() * 40,
      g: -15,
      life: 0,
      max: 0.8 + Math.random() * 0.8,
      size: Math.random() < 0.3 ? 2 : 1,
      color: Math.random() < 0.6 ? '#8fc25a' : '#5d7a35',
      kind: 'dust',
    });
  }
}

export function spawnCoins(
  particles: Particle[],
  cx: number,
  reduceMotion: boolean,
  y = FLOOR - 16,
): void {
  const n = reduceMotion ? 4 : 10;
  for (let k = 0; k < n; k++) {
    particles.push({
      x: cx - 6,
      y,
      vx: (Math.random() - 0.5) * 90,
      vy: -90 - Math.random() * 60,
      g: 320,
      life: 0,
      max: 1.8,
      size: 2,
      color: '#f2b84b',
      kind: 'coin',
      bounced: false,
    });
  }
}

/** Dirt thrown up from a grave. Bounces like coins. */
export function spawnDirt(particles: Particle[], cx: number, reduceMotion: boolean): void {
  const n = reduceMotion ? 6 : 22;
  for (let k = 0; k < n; k++) {
    particles.push({
      x: cx + (Math.random() - 0.5) * 20,
      y: FLOOR - 4,
      vx: (Math.random() - 0.5) * 70,
      vy: -40 - Math.random() * 70,
      g: 260,
      life: 0,
      max: 0.9,
      size: Math.random() < 0.4 ? 2 : 1,
      color: Math.random() < 0.5 ? '#4d3828' : '#3b2a1f',
      kind: 'dirt',
      bounced: false,
    });
  }
}

export function spawnSoul(particles: Particle[], cx: number, y = FLOOR - 30): void {
  particles.push({
    x: cx - 6,
    y,
    vx: 0,
    vy: -22,
    g: 0,
    life: 0,
    max: 2.2,
    size: 0,
    color: '#ece6d6',
    kind: 'soul',
    seed: Math.random() * 6,
  });
}

/** Glass shards from a smashed window. Skipped under reduced motion (animation.md). */
export function spawnGlass(particles: Particle[], cx: number, cy: number, reduceMotion: boolean): void {
  if (reduceMotion) return;
  for (let k = 0; k < 26; k++) {
    particles.push({
      x: cx + (Math.random() - 0.5) * 28,
      y: cy + (Math.random() - 0.5) * 32,
      vx: (Math.random() - 0.5) * 120,
      vy: -30 - Math.random() * 60,
      g: 340,
      life: 0,
      max: 0.9 + Math.random() * 0.5,
      size: Math.random() < 0.35 ? 2 : 1,
      color: Math.random() < 0.5 ? '#ece6d6' : '#a59cbc',
      kind: 'shard',
    });
  }
}

/** One smoke puff for the reaper's blink. Skipped under reduced motion. */
export function spawnPuff(particles: Particle[], x: number, y: number, reduceMotion: boolean): void {
  if (reduceMotion) return;
  particles.push({ x, y, vx: 0, vy: -6, g: 0, life: 0, max: 0.45, size: 0, color: '#a59cbc', kind: 'puff' });
}

/** Advance all particles one physics step. Removes expired entries in-place. */
export function updateParticles(particles: Particle[], dt: number): void {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]!;
    p.life += dt;
    p.vy += p.g * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if ((p.kind === 'coin' || p.kind === 'dirt') && p.y > FLOOR - 2) {
      p.y = FLOOR - 2;
      if (!p.bounced) {
        p.vy *= -0.45;
        p.vx *= 0.6;
        p.bounced = true;
      } else {
        p.vy = 0;
        p.vx *= 0.9;
      }
    }
    if (p.life > p.max) particles.splice(i, 1);
  }
}

/** Draw all particles onto ctx. Caller owns globalAlpha reset. */
export function drawParticles(
  ctx: CanvasRenderingContext2D,
  particles: Particle[],
  t: number,
): void {
  for (const p of particles) {
    const a = Math.max(0, 1 - p.life / p.max);
    ctx.globalAlpha = a;
    const ghostS = p.kind === 'soul' ? getSprite('ghost') : null;
    const coinS = p.kind === 'coin' ? getSprite('coin') : null;
    const smokeS = p.kind === 'puff' ? getSprite('smoke') : null;
    if (p.kind === 'puff') {
      if (smokeS) {
        drawFrame(ctx, smokeS, Math.min(smokeS.def.frames - 1, Math.floor((p.life / p.max) * smokeS.def.frames)), p.x - 8, p.y - 8);
      } else {
        const r = 3 + Math.round((p.life / p.max) * 5);
        ctx.fillStyle = p.color;
        ctx.fillRect(Math.round(p.x) - r, Math.round(p.y) - r, r * 2, r * 2);
      }
    } else if (ghostS) {
      const sx = Math.round(p.x + Math.sin(t * 4 + (p.seed ?? 0)) * 3);
      drawFrame(ctx, ghostS, frameIndex(t, 4, ghostS.def.frames, true), sx - 1, Math.round(p.y));
    } else if (coinS) {
      drawFrame(ctx, coinS, frameIndex(p.life, 12, coinS.def.frames, true), Math.round(p.x) - 1, Math.round(p.y) - 1);
    } else if (p.kind === 'soul') {
      const sx = Math.round(p.x + Math.sin(t * 4 + (p.seed ?? 0)) * 3);
      const sy = Math.round(p.y);
      ctx.fillStyle = p.color;
      ctx.fillRect(sx, sy, 5, 5);
      ctx.fillRect(sx - 1, sy + 1, 7, 3);
      ctx.fillRect(sx, sy + 5, 1, 2);
      ctx.fillRect(sx + 2, sy + 5, 1, 1);
      ctx.fillRect(sx + 4, sy + 5, 1, 2);
      ctx.fillStyle = '#120d1a';
      ctx.fillRect(sx + 1, sy + 1, 1, 1);
      ctx.fillRect(sx + 3, sy + 1, 1, 1);
    } else {
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
      if (p.kind === 'coin') {
        ctx.fillStyle = '#fff3c4';
        ctx.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
      }
    }
  }
  ctx.globalAlpha = 1;
}
