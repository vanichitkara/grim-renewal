/**
 * Hallway orchestrator — owns the rAF loop and the animation state machine.
 *
 * Rules (animation.md):
 * - State transitions fire ONLY in response to AgentEvents from the bus.
 * - Every tween is interruptible via tween.ts cancel().
 * - dt capped at 50 ms.
 * - All durations ÷ tune.speed.
 * - prefers-reduced-motion skips particles and camera shake.
 */

import { subscribe } from '../agents/event-bus.ts';
import type { AgentEvent, Subscription } from '../types.ts';
import { ease } from './ease.ts';
import { tween as mkTween, tickTweens, wait } from './tween.ts';
import { paintBg } from './background.ts';
import { drawTorch, drawDoor } from './door.ts';
import type { DoorSlotState } from './door.ts';
import { drawZombieFor } from './zombie.ts';
import { drawGrave, drawFog, riseFor, upFor, cameraTarget } from './graveyard-scene.ts';
import type { GraveState, View } from './graveyard-scene.ts';
import { daysLeft } from '../pipeline/graveyard.ts';
import type { ZombieConfig } from './zombie.ts';
import { drawReaper } from './reaper.ts';
import { loadSprites } from './sprites.ts';
import type { ReaperState } from './reaper.ts';
import {
  spawnDissolve,
  spawnCoins,
  spawnSoul,
  spawnDirt,
  updateParticles,
  drawParticles,
} from './particles.ts';
import type { Particle } from './particles.ts';
import { sfx, setMuted, isMuted, unlockAudio } from './sound.ts';

// Canvas constants — 480×220, never scaled on the element itself.
const W = 480;
const H = 220;
const WORLD = 800;
const FLOOR = 184;
const DOORS = [175, 260, 345, 430] as const;
const GRAVES = [604, 684, 764] as const;
const TORCH_X = [132, 217, 302, 387, 472] as const;
const DAY_MS = 86_400_000;
const START_X = 50;

const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;

// ---------- tune knobs (driven by tuning panel) ----------
export const tune = {
  speed: 1,
  knocks: 3,
  dissolve: 900,
  latency: 1200,
  fail: false,
};

// ---------- DOM refs ----------
let cv!: HTMLCanvasElement;
let ctx!: CanvasRenderingContext2D;
let wrapEl!: HTMLElement;
let bubbleEl!: HTMLElement;
let ariaLive!: HTMLElement;
let bg!: HTMLCanvasElement;

// ---------- world state ----------
interface SubSlot {
  sub: Subscription;
  config: ZombieConfig;
  slot: DoorSlotState;
  queued: boolean;
}

let slots: SubSlot[] = [];
/** Subs that did not fit on the 4 doors; promoted when a door's zombie is dead. */
let overflow: Subscription[] = [];
/** Every sub ever added (visible, overflow, dead-and-replaced). Used for stats and reset. */
let known: Subscription[] = [];
const cfgs = new Map<string, ZombieConfig>();
/** Last cancel result per id, so a result that lands before the animation asks for it is not lost. */
const results = new Map<string, { ok: boolean; reason?: string }>();
let wired = false;
let looping = false;
let reaper: ReaperState;
let particles: Particle[];
let cam: { s: number; x: number; focus: number | null };
let view: View = 'house';
/** Simulated days added to the real clock (demo "Advance one day"). Real app: always 0. */
let dayOffset = 0;
let extraEaten = 0;
let trials: TrialSlot[] = [];
let flash: number;
let savedTarget: number;
let savedShown: number;
let queue: Array<() => Promise<void>>;
let busy: boolean;
let tags: Record<string, HTMLElement>;
let unsub: (() => void) | null = null;

// Shirt colours reused from demo-data CONFIGS for dynamically added zombies.
const SHIRTS = ['#a8343a', '#33609e', '#a3762e', '#5f3aa0'] as const;

/** A free trial counting down at a grave. */
interface TrialSlot {
  sub: Subscription;
  g: GraveState;
  days: number;
  queued: boolean;
}

/** What the UI needs to draw one trial card. */
export interface TrialView {
  sub: Subscription;
  days: number;
  status: string;
}

export interface HordeView {
  /** Subs with a door, in door order. */
  visible: Subscription[];
  /** Subs waiting for a free door ("more in the horde"). */
  overflow: Subscription[];
  /** Free trials at graves (at most 3 fit; shortcut: extra trials are ignored, add graves when needed). */
  trials: TrialView[];
}
let onChange: ((v: HordeView) => void) | null = null;

/** UI hook: called whenever doors, overflow or scores change. */
export function onHordeChange(fn: (v: HordeView) => void): void {
  onChange = fn;
}

function notify(): void {
  renderStats();
  onChange?.({
    visible: slots.map((s) => s.sub),
    overflow: [...overflow],
    trials: trials.map((t) => ({ sub: t.sub, days: t.days, status: t.g.status })),
  });
}

const spentOf = (s: Subscription) => s.monthlyAmount * s.chargeCount;

function makeSlot(sub: Subscription, maxSpent: number): SubSlot {
  return {
    sub,
    config: cfgs.get(sub.id) ?? {
      forgotten: sub.forgottenScore,
      shirt: SHIRTS[known.indexOf(sub) % SHIRTS.length]!,
      phoneOnly: sub.phoneOnly,
    },
    slot: {
      door: { open: 0, shake: 0 },
      z: {
        out: 0,
        scale: 0.8 + 0.75 * (maxSpent > 0 ? spentOf(sub) / maxSpent : 0),
        grow: 1,
        dissolve: 0,
        hit: 0,
        alive: true,
      },
      tomb: 0,
      status: 'idle',
    },
    queued: false,
  };
}

/**
 * Add a discovered subscription: a door/zombie if one of the 4 doors is free,
 * otherwise it waits in the overflow list. Idempotent per id.
 */
export function addSubscription(sub: Subscription, config?: ZombieConfig): void {
  if (known.some((k) => k.id === sub.id) || trials.some((t) => t.sub.id === sub.id)) return;
  if (config) cfgs.set(sub.id, config);
  if (isTrial(sub)) {
    addTrial(sub);
    return;
  }
  known.push(sub);
  if (slots.length < DOORS.length) {
    slots.push(makeSlot(sub, Math.max(...known.map(spentOf))));
    buildTags();
  } else {
    overflow.push(sub);
  }
  notify();
}

const isTrial = (s: Subscription) =>
  s.trialEndDate !== null && Date.parse(s.trialEndDate) > Date.now();

const trialsNow = () => new Date(Date.now() + dayOffset * DAY_MS);

function addTrial(sub: Subscription): void {
  if (trials.length >= GRAVES.length) return;
  const idx = trials.length;
  const days = Math.max(0, daysLeft(sub.trialEndDate!, trialsNow()));
  const rise = riseFor(days);
  trials.push({
    sub,
    days,
    queued: false,
    g: {
      x: GRAVES[idx]!,
      idx,
      shirt: cfgs.get(sub.id)?.shirt ?? SHIRTS[idx % SHIRTS.length]!,
      rise,
      slab: 0,
      status: 'idle',
      z: { out: 0, scale: 1, grow: 1, dissolve: 0, hit: 0, alive: true, up: upFor(rise) },
    },
  });
  buildTags();
  notify();
}

/** Swap dead zombies for waiting overflow subs. Called when the queue is idle. */
function promoteOverflow(): void {
  let changed = false;
  slots.forEach((s, i) => {
    if (s.slot.status === 'dead' && overflow.length) {
      slots[i] = makeSlot(overflow.shift()!, Math.max(...known.map(spentOf)));
      changed = true;
    }
  });
  if (changed) {
    buildTags();
    notify();
  }
}

// ---------- helpers ----------
const money = (n: number) =>
  '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const money0 = (n: number) =>
  '$' + Math.round(n).toLocaleString('en-US');

function tw(
  obj: Record<string, number>,
  key: string,
  to: number,
  ms: number,
  easeFn = ease.inOut,
) {
  return mkTween(obj, key, to, ms, easeFn, tune.speed).promise;
}

function waitMs(ms: number) {
  return wait(ms, tune.speed);
}

// ---------- DOM overlay helpers ----------
function buildTags(): void {
  wrapEl.querySelectorAll('.tag').forEach((t) => t.remove());
  tags = {};
  slots.forEach(({ sub }, i) => {
    const t = document.createElement('div');
    t.className = 'tag';
    t.dataset['x'] = String(DOORS[i]!);
    t.style.top = ((FLOOR - 66) / H * 100) + '%';
    wrapEl.appendChild(t);
    tags[sub.id] = t;
    renderTag(sub.id);
  });
  trials.forEach(({ sub, g }) => {
    const t = document.createElement('div');
    t.className = 'tag trial-tag';
    t.dataset['x'] = String(g.x);
    t.style.top = ((FLOOR - 66) / H * 100) + '%';
    wrapEl.appendChild(t);
    tags[sub.id] = t;
    renderTrialTag(sub.id);
  });
  positionTags();
}

/** Tags live in world space: slide them with the camera, hide the off-screen ones. */
function positionTags(): void {
  wrapEl.querySelectorAll<HTMLElement>('.tag').forEach((t) => {
    const sx = (Number(t.dataset['x']) - cam.x) / W;
    t.style.left = (sx * 100) + '%';
    t.hidden = sx < -0.15 || sx > 1.15;
  });
}

function trialStatusText(ts: TrialSlot): string {
  const { g, days } = ts;
  switch (g.status) {
    case 'queued':    return 'Reaper assigned';
    case 'walking':   return 'Reaper approaching';
    case 'burying':   return 'Burying\u2026';
    case 'buried':    return 'Buried before the first charge';
    case 'rising':    return 'Trial over. It\u2019s out.';
    case 'converted': return 'Now charging ' + money(ts.sub.monthlyAmount) + '/mo';
    case 'cancelling': return 'Cancelling\u2026';
    case 'reaping':   return 'Reaping';
    case 'dead':      return 'Cancelled \u00b7 +' + money0(ts.sub.monthlyAmount * 12) + '/yr';
    default:
      return days <= 0 ? 'Charges today' : days === 1 ? 'Charges tomorrow' : `Charges in ${days} days`;
  }
}

function renderTrialTag(id: string): void {
  const ts = trials.find((t) => t.sub.id === id);
  if (!ts || !tags[id]) return;
  const st = ts.g.status;
  tags[id]!.className =
    'tag trial-tag' +
    (st === 'idle' && ts.days <= 2 ? ' is-soon' : '') +
    (st === 'buried' ? ' is-buried' : '') +
    (st === 'converted' ? ' is-converted is-soon' : '');
  tags[id]!.replaceChildren(
    mk('b', ts.sub.merchant),
    mk('span', money(ts.sub.monthlyAmount) + '/mo', 'amt'),
    mk('span', trialStatusText(ts), 'st'),
  );
}

function setTrialStatus(ts: TrialSlot, st: string): void {
  ts.g.status = st;
  renderTrialTag(ts.sub.id);
  setMachineDisplay(st, ts.sub.merchant);
  announce(`${ts.sub.merchant}: ${trialStatusText(ts)}`);
  notify();
}

function mk(tag: string, text: string, cls?: string): HTMLElement {
  const el = document.createElement(tag);
  el.textContent = text;
  if (cls) el.className = cls;
  return el;
}

function statusText(slot: SubSlot): string {
  const { sub, slot: { status } } = slot;
  switch (status) {
    case 'queued':     return 'Reaper on the way';
    case 'walking':    return 'Reaper approaching';
    case 'knocking':   return 'Knock, knock…';
    case 'opening':    return 'Something stirs';
    case 'cancelling': return 'Cancelling…';
    case 'reaping':    return 'Reaping';
    case 'dead':       return 'Cancelled · +' + money0(sub.monthlyAmount * 12) + '/yr';
    case 'boss':       return 'Phone-only. Reaper fled.';
    default:           return 'Subscription active';
  }
}

function renderTag(id: string): void {
  const slot = slots.find((s) => s.sub.id === id);
  if (!slot || !tags[id]) return;
  const { sub, slot: { status } } = slot;
  const t = tags[id]!;
  t.className =
    'tag' +
    (status === 'dead' ? ' is-dead' : '') +
    (status === 'boss' ? ' is-boss' : '');
  // textContent only: merchant names come from email.
  t.replaceChildren(
    mk('b', sub.merchant),
    mk('span', money0(spentOf(sub)) + ' eaten', 'amt'),
    mk('span', statusText(slot), 'st'),
  );
}

function bubble(text: string | null): void {
  if (!text) { bubbleEl.hidden = true; return; }
  bubbleEl.textContent = text;
  bubbleEl.hidden = false;
}

function announce(text: string): void {
  ariaLive.textContent = '';
  // Double-set forces screen-reader re-announcement.
  requestAnimationFrame(() => { ariaLive.textContent = text; });
}

function floatText(x: number, y: number, text: string, bad = false): void {
  const f = document.createElement('div');
  f.className = bad ? 'float bad' : 'float';
  f.textContent = text;
  f.style.left = ((x - cam.x) / W * 100) + '%';
  f.style.top = (y / H * 100) + '%';
  wrapEl.appendChild(f);
  setTimeout(() => f.remove(), 2000);
}

function setStatus(id: string, st: string): void {
  const slot = slots.find((s) => s.sub.id === id)!;
  slot.slot.status = st;
  renderTag(id);
  setMachineDisplay(st, slot.sub.merchant);
  announce(statusText(slot));
}

function setMachineDisplay(st: string, name: string): void {
  const el = document.getElementById('stateName');
  const sub = document.getElementById('stateSub');
  if (el) el.textContent = st;
  if (sub) sub.textContent = name ? '· ' + name : '';
}

function renderStats(): void {
  const leftEl = document.getElementById('left');
  const savedEl = document.getElementById('saved');
  const eatenEl = document.getElementById('eaten');
  if (leftEl) leftEl.textContent = String(slots.filter((s) => s.slot.z.alive).length + overflow.length);
  if (eatenEl) eatenEl.textContent = money0(known.reduce((a, s) => a + s.totalSpent, 0) + extraEaten);
  if (savedEl) savedEl.textContent = money(savedShown);
}

// ---------- sequences — only fire after AgentEvent ----------

async function walkTo(x: number, pxPerSec = 70): Promise<void> {
  const d = Math.abs(x - reaper.x);
  if (d < 1) return;
  reaper.facing = x > reaper.x ? 1 : -1;
  reaper.moving = true;
  await tw(reaper as unknown as Record<string, number>, 'x', x, (d / pxPerSec) * 1000, ease.linear);
  reaper.moving = false;
}

async function knockKnock(slot: DoorSlotState): Promise<void> {
  for (let i = 0; i < tune.knocks; i++) {
    await tw(reaper as unknown as Record<string, number>, 'knock', 1, 90, ease.out);
    sfx.knock();
    slot.door.shake = 1;
    await tw(reaper as unknown as Record<string, number>, 'knock', 0, 120);
    await waitMs(170);
  }
}

async function kill(id: string, doorX: number): Promise<void> {
  const s = slots.find((sl) => sl.sub.id === id)!;
  const { slot, sub } = s;
  setStatus(id, 'reaping');
  bubble(null);
  await tw(reaper as unknown as Record<string, number>, 'swing', 1, 200, ease.in);
  sfx.swing();
  flash = 0.8;
  if (!reduceMotion) cam.s = 3;
  slot.z.hit = 1;
  spawnDissolve(particles, doorX, slot.z.scale * slot.z.grow, reduceMotion);
  sfx.dissolve();
  tw(slot.z as unknown as Record<string, number>, 'hit', 0, 250);
  await tw(slot.z as unknown as Record<string, number>, 'dissolve', 1, tune.dissolve, ease.out);
  slot.z.alive = false;
  spawnCoins(particles, doorX, reduceMotion);
  spawnSoul(particles, doorX);
  sfx.coin();
  const yearly = sub.monthlyAmount * 12;
  floatText(doorX, FLOOR - 70, '+' + money(yearly) + '/yr');
  savedTarget += yearly;
  renderStats();
  await tw(reaper as unknown as Record<string, number>, 'swing', 0, 220);
  sfx.creak();
  await tw(slot.door as unknown as Record<string, number>, 'open', 0, 320);
  await tw(slot as unknown as Record<string, number>, 'tomb', 1, 300, ease.back);
  setStatus(id, 'dead');
}

async function reapOne(id: string): Promise<void> {
  const s = slots.find((sl) => sl.sub.id === id)!;
  const { slot, sub } = s;
  const doorX = DOORS[slots.indexOf(s)]!;
  s.queued = false;

  setStatus(id, 'walking');
  await walkTo(doorX - 40);
  reaper.facing = 1;
  setStatus(id, 'knocking');
  bubble('Knock knock');

  await knockKnock(slot);
  bubble(null);
  setStatus(id, 'opening');
  sfx.creak();
  await tw(slot.door as unknown as Record<string, number>, 'open', 1, 380);
  sfx.growl();
  await tw(slot.z as unknown as Record<string, number>, 'out', 1, 420, ease.out);

  setStatus(id, 'cancelling');
  bubble('Cancelling ' + sub.merchant.split(' ')[0] + '…');

  // Demo only: the shim kicks off a fake cancel. In real mode cancelHandler is
  // null and reaper.ts emits cancel_ok / cancel_fail on its own.
  // Animation only advances once cancel_ok / cancel_fail arrives on the bus.
  cancelHandler?.(id);
  const result = await waitForCancelResult(id);

  if (result.ok) {
    await kill(id, doorX);
  } else {
    bubble(null);
    setStatus(id, 'boss');
    sfx.roar();
    if (!reduceMotion) cam.s = 5;
    await tw(slot.z as unknown as Record<string, number>, 'grow', 1.65, 520, ease.back);
    reaper.scared = true;
    bubble('!!!');
    sfx.yelp();
    await waitMs(650);
    bubble(null);
    reaper.run = true;
    await walkTo(-30, 260);
    reaper.run = false;
    showBoss(id, result.reason);
    await waitMs(900);
    reaper.scared = false;
    await walkTo(START_X);
    reaper.facing = 1;
  }
}

// ---------- trial sequences (graveyard) ----------

/** Resolves with the cancel result; demo path kicks off the fake backend first. */
async function cancelResult(id: string): Promise<{ ok: boolean; reason?: string }> {
  cancelHandler?.(id);
  return waitForCancelResult(id);
}

/** Back to the state the card can act on after a failed cancel. */
async function trialFailed(ts: TrialSlot, back: string, reason?: string): Promise<void> {
  bubble(null);
  ts.queued = false;
  setTrialStatus(ts, back);
  announce(`Could not cancel ${ts.sub.merchant}${reason ? ': ' + reason : ''}.`);
  await walkTo(START_X);
  reaper.facing = 1;
}

/** Bury a trial before it charges. Runs after `approved`; reaper.ts does the real cancel. */
async function buryTrial(ts: TrialSlot): Promise<void> {
  const { g, sub } = ts;
  const zr = g.z as unknown as Record<string, number>;
  const gr = g as unknown as Record<string, number>;
  setTrialStatus(ts, 'walking');
  await walkTo(g.x - 30);
  reaper.facing = 1;
  setTrialStatus(ts, 'burying');
  bubble('Not today.');
  const result = await cancelResult(sub.id);
  if (!result.ok) return trialFailed(ts, 'idle', result.reason);
  bubble(null);
  await tw(reaper as unknown as Record<string, number>, 'swing', 1, 200, ease.in);
  sfx.swing();
  sfx.thud();
  if (!reduceMotion) cam.s = 3;
  spawnDirt(particles, g.x - 4, reduceMotion);
  await Promise.all([tw(zr, 'up', 0, 300, ease.in), tw(gr, 'rise', 0, 300)]);
  await tw(reaper as unknown as Record<string, number>, 'swing', 0, 220);
  await tw(gr, 'slab', 1, 480, ease.in);
  sfx.thud();
  spawnDirt(particles, g.x - 4, reduceMotion);
  sfx.coin();
  const yearly = sub.monthlyAmount * 12;
  floatText(g.x, FLOOR - 70, '+' + money(yearly) + '/yr');
  savedTarget += yearly;
  ts.queued = false;
  setTrialStatus(ts, 'buried');
}

/** The trial ended and the first charge landed: the zombie climbs out. */
async function riseTrial(ts: TrialSlot): Promise<void> {
  const { g, sub } = ts;
  cam.focus = g.x;
  await waitMs(700);
  setTrialStatus(ts, 'rising');
  sfx.roar();
  if (!reduceMotion) cam.s = 4;
  spawnDirt(particles, g.x - 4, reduceMotion);
  g.rise = 1;
  await tw(g.z as unknown as Record<string, number>, 'up', 1, 900, ease.out);
  extraEaten += sub.monthlyAmount;
  renderStats();
  floatText(g.x, FLOOR - 70, '-' + money(sub.monthlyAmount) + ' charged', true);
  ts.queued = false;
  setTrialStatus(ts, 'converted');
  await waitMs(600);
  cam.focus = null;
}

/** Reap a trial that already converted. Runs after `approved`. */
async function reapTrial(ts: TrialSlot): Promise<void> {
  const { g, sub } = ts;
  const z = g.z as unknown as Record<string, number>;
  setTrialStatus(ts, 'walking');
  await walkTo(g.x - 36);
  reaper.facing = 1;
  setTrialStatus(ts, 'cancelling');
  bubble('Your trial is over.');
  const result = await cancelResult(sub.id);
  if (!result.ok) return trialFailed(ts, 'converted', result.reason);
  bubble(null);
  setTrialStatus(ts, 'reaping');
  await tw(reaper as unknown as Record<string, number>, 'swing', 1, 200, ease.in);
  sfx.swing();
  flash = 0.8;
  if (!reduceMotion) cam.s = 3;
  g.z.hit = 1;
  spawnDissolve(particles, g.x, g.z.scale, reduceMotion);
  sfx.dissolve();
  tw(z, 'hit', 0, 250);
  await tw(z, 'dissolve', 1, tune.dissolve, ease.out);
  g.z.alive = false;
  spawnCoins(particles, g.x, reduceMotion);
  spawnSoul(particles, g.x);
  sfx.coin();
  const yearly = sub.monthlyAmount * 12;
  floatText(g.x, FLOOR - 70, '+' + money(yearly) + '/yr');
  savedTarget += yearly;
  await tw(reaper as unknown as Record<string, number>, 'swing', 0, 220);
  await tw(g as unknown as Record<string, number>, 'slab', 1, 480, ease.in);
  sfx.thud();
  ts.queued = false;
  setTrialStatus(ts, 'dead');
}

/**
 * Recompute days left for idle trials from real dates (+ simulated offset).
 * Graves crack wider as the charge nears; at 0 days the zombie rises.
 */
function syncDays(): void {
  const now = trialsNow();
  for (const ts of trials) {
    if (ts.g.status !== 'idle' || ts.queued) continue;
    const d = Math.max(0, daysLeft(ts.sub.trialEndDate!, now));
    if (d === ts.days) continue;
    ts.days = d;
    if (d === 0) {
      ts.queued = true;
      queue.push(() => riseTrial(ts));
      void pump();
    } else {
      const r = riseFor(d);
      tw(ts.g as unknown as Record<string, number>, 'rise', r, 700);
      tw(ts.g.z as unknown as Record<string, number>, 'up', upFor(r), 700, ease.out);
      if (upFor(r) > 0) {
        sfx.growl();
        spawnDirt(particles, ts.g.x - 4, reduceMotion);
      }
    }
    renderTrialTag(ts.sub.id);
  }
  renderClock();
  notify();
}

/** Demo / ?debug only: move the simulated clock forward one day. */
export function advanceDay(): void {
  dayOffset++;
  syncDays();
}

export function setView(v: View): void {
  view = v;
  document.getElementById('viewHouse')?.setAttribute('aria-pressed', String(v === 'house'));
  document.getElementById('viewYard')?.setAttribute('aria-pressed', String(v === 'yard'));
}

function renderClock(): void {
  const el = document.getElementById('today');
  const sub = document.getElementById('todaySub');
  const d = trialsNow();
  if (el) el.textContent = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
  if (sub) sub.textContent = dayOffset ? `${dayOffset} day${dayOffset > 1 ? 's' : ''} ahead` : 'Today';
}

async function finishBoss(id: string): Promise<void> {
  const s = slots.find((sl) => sl.sub.id === id)!;
  const doorX = DOORS[slots.indexOf(s)]!;
  document.getElementById('boss')!.hidden = true;
  setStatus(id, 'walking');
  bubble("Oh, it\u2019s cancelled?");
  await walkTo(doorX - 40);
  reaper.facing = 1;
  bubble("Then you\u2019re mine.");
  await tw(s.slot.z as unknown as Record<string, number>, 'grow', 1, 500);
  await waitMs(400);
  await kill(id, doorX);
}

/** A charge came back: the tombstone sinks, the door opens, the zombie rises again. */
async function riseAgain(id: string): Promise<void> {
  const s = slots.find((sl) => sl.sub.id === id);
  if (!s || s.slot.status !== 'dead') return;
  const { slot, sub } = s;
  const z = slot.z as unknown as Record<string, number>;
  setStatus(id, 'opening');
  await tw(slot as unknown as Record<string, number>, 'tomb', 0, 300, ease.in);
  sfx.creak();
  await tw(slot.door as unknown as Record<string, number>, 'open', 1, 380);
  z['dissolve'] = 0;
  z['hit'] = 0;
  z['out'] = 0;
  slot.z.alive = true;
  sfx.growl();
  await tw(z, 'out', 1, 420, ease.out);
  await tw(z, 'grow', 1.3, 200, ease.back);
  await tw(z, 'grow', 1, 260);
  bubble('It came back.');
  announce(`${sub.merchant} came back from the dead.`);
  await waitMs(900);
  bubble(null);
  setStatus(id, 'idle');
  notify();
}

/**
 * Returns a promise that resolves when cancel_ok or cancel_fail arrives
 * for the given subscriptionId. The demo-data.ts shim emits these after a delay;
 * the real backend emits them when it's done.
 */
function waitForCancelResult(id: string): Promise<{ ok: boolean; reason?: string }> {
  const early = results.get(id);
  if (early) {
    results.delete(id);
    return Promise.resolve(early);
  }
  return new Promise((resolve) => {
    const off = subscribe((e: AgentEvent) => {
      if (!('subscriptionId' in e) || e.subscriptionId !== id) return;
      if (e.kind === 'cancel_ok') {
        off();
        results.delete(id);
        resolve({ ok: true });
      } else if (e.kind === 'cancel_fail') {
        off();
        results.delete(id);
        resolve({ ok: false, reason: e.reason });
      }
    });
  });
}

function showBoss(id: string, reason?: string): void {
  const s = slots.find((sl) => sl.sub.id === id)!;
  const { sub } = s;
  const lead = document.getElementById('bossLead');
  const phone = document.getElementById('bossPhone');
  const script = document.getElementById('bossScript');
  const box = document.getElementById('boss');
  if (!lead || !phone || !script || !box) return;
  const eaten = money(sub.monthlyAmount * sub.chargeCount);
  // Only say "phone-only" when it really is. Other failures get their own honest text.
  lead.textContent = reason === 'phone_only' || sub.phoneOnly
    ? `${sub.merchant} only cancels by phone, and it has eaten ${eaten} this year. The Reaper ran. Here is the plan instead.`
    : reason === 'user_declined'
      ? `You stopped the cancellation for ${sub.merchant}. Nothing was cancelled. Here is the manual plan if you want it.`
      : `The Reaper could not cancel ${sub.merchant} automatically (no cancel method is connected for it yet), and it has eaten ${eaten} this year. Nothing was cancelled. Here is the manual plan.${sub.cancelUrl ? ' Cancel page: ' + sub.cancelUrl : ''}`;
  phone.textContent = sub.phone ?? 'the support number on their website';
  script.textContent = `"I'm cancelling${sub.memberId ? ' membership ' + sub.memberId : ''}, effective today. I don't want a freeze or a discount. Please email me written confirmation of the cancellation."`;
  box.hidden = false;
  box.dataset['id'] = id;
}

// ---------- cancel handler (injected by demo or real backend) ----------

/**
 * Demo only (?demo). Called at the start of the cancelling step.
 * Real mode leaves this null: reaper.ts emits cancel_* events itself.
 */
let cancelHandler: ((id: string) => void) | null = null;

export function setCancelHandler(fn: (id: string) => void): void {
  cancelHandler = fn;
}

// ---------- queue ----------
export function enqueue(id: string): void {
  const ts = trials.find((t) => t.sub.id === id);
  if (ts) {
    const st = ts.g.status;
    if (ts.queued || (st !== 'idle' && st !== 'converted')) return;
    unlockAudio();
    ts.queued = true;
    queue.push(() => (st === 'idle' ? buryTrial(ts) : reapTrial(ts)));
    if (st === 'idle') setTrialStatus(ts, 'queued');
    void pump();
    return;
  }
  const s = slots.find((sl) => sl.sub.id === id);
  if (!s) return;
  if (s.queued || s.slot.status !== 'idle') return;
  unlockAudio();
  s.queued = true;
  s.slot.status = 'queued';
  renderTag(id);
  queue.push(() => reapOne(id));
  pump();
}

async function pump(): Promise<void> {
  if (busy) return;
  busy = true;
  while (queue.length) {
    await queue.shift()!();
  }
  busy = false;
  bubble(null);
  setMachineDisplay('idle', '');
  promoteOverflow();
}

// ---------- bus subscriptions ----------
function wireBus(): void {
  if (unsub) unsub();
  unsub = subscribe((e: AgentEvent) => {
    switch (e.kind) {
      case 'approved':
        enqueue(e.subscriptionId);
        break;
      case 'boss_resolved': {
        const box = document.getElementById('boss');
        const s = slots.find((sl) => sl.sub.id === e.subscriptionId);
        if (box && box.dataset['id'] === e.subscriptionId && s?.slot.status === 'boss') {
          queue.push(() => finishBoss(e.subscriptionId));
          pump();
        }
        break;
      }
      case 'revenant':
        queue.push(() => riseAgain(e.subscriptionId));
        pump();
        break;
      case 'discovered':
        addSubscription(e.data);
        break;
      case 'scored': {
        const k = known.find((s) => s.id === e.subscriptionId);
        if (k) k.forgottenScore = e.forgottenScore;
        const s = slots.find((sl) => sl.sub.id === e.subscriptionId);
        if (s) s.config = { ...s.config, forgotten: e.forgottenScore };
        notify();
        break;
      }
      case 'cancel_ok':
        results.set(e.subscriptionId, { ok: true });
        break;
      case 'cancel_fail':
        results.set(e.subscriptionId, { ok: false, reason: e.reason });
        break;
    }
  });
}

// ---------- rAF loop ----------
let last = performance.now();

function update(dt: number, now: number): void {
  tickTweens(now);
  if (reaper.moving) {
    reaper.walk += dt * (reaper.run ? 22 : 9) * tune.speed;
  }
  slots.forEach(({ slot }) => {
    slot.door.shake = Math.max(0, slot.door.shake - dt * 5);
  });
  cam.s = Math.max(0, cam.s - dt * 8);
  const target = cameraTarget({
    focus: cam.focus,
    reaperX: reaper.x,
    reaperBusy: busy,
    view,
    viewW: W,
    worldW: WORLD,
  });
  cam.x += (target - cam.x) * Math.min(1, dt * (reduceMotion ? 20 : 3.5));
  flash = Math.max(0, flash - dt * 3);
  updateParticles(particles, dt);
  savedShown += (savedTarget - savedShown) * Math.min(1, dt * 6);
  if (Math.abs(savedTarget - savedShown) < 0.01) savedShown = savedTarget;
}

function draw(t: number): void {
  ctx.save();
  if (cam.s > 0 && !reduceMotion) {
    ctx.translate(
      Math.round((Math.random() - 0.5) * cam.s),
      Math.round((Math.random() - 0.5) * cam.s),
    );
  }

  ctx.translate(-Math.round(cam.x), 0);
  ctx.drawImage(bg, 0, 0);

  TORCH_X.forEach((x) => drawTorch(ctx, x, t));

  // Door pass 1: frame + peek zombie
  slots.forEach((s, i) => {
    drawDoor(ctx, DOORS[i]!, s.slot, t, (cx, slot, time) => {
      drawZombieFor(ctx, cx, slot, s.config, time);
    });
  });

  // Door pass 2: fully emerged zombies (drawn above door)
  slots.forEach((s, i) => {
    if (s.slot.z.out > 0.5 && s.slot.z.alive) {
      drawZombieFor(ctx, DOORS[i]!, s.slot, s.config, t);
    }
  });

  trials.forEach(({ g }) => drawGrave(ctx, g, t));
  drawFog(ctx, t);

  drawReaper(ctx, reaper, t);
  drawParticles(ctx, particles, t);

  // Scythe arc flash
  if (reaper.swing > 0.35 && reaper.swing < 0.98) {
    ctx.strokeStyle = `rgba(236,230,214,${0.8 * (1 - reaper.swing)})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(reaper.x + 4 * reaper.facing, FLOOR - 26, 22, -1.2, 1.0);
    ctx.stroke();
  }

  ctx.restore();

  // Vignette
  const v = ctx.createRadialGradient(W / 2, H / 2, H * 0.4, W / 2, H / 2, W * 0.62);
  v.addColorStop(0, 'rgba(0,0,0,0)');
  v.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, W, H);

  if (flash > 0) {
    ctx.fillStyle = `rgba(255,255,255,${flash * 0.35})`;
    ctx.fillRect(0, 0, W, H);
  }
}

function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  update(dt, now);
  draw(now / 1000);

  // Bubble tracks reaper
  if (!bubbleEl.hidden) {
    bubbleEl.style.left = ((reaper.x - cam.x) / W * 100) + '%';
    bubbleEl.style.top = ((FLOOR - 52) / H * 100) + '%';
  }

  positionTags();

  const savedEl = document.getElementById('saved');
  if (savedEl) savedEl.textContent = money(savedShown);

  requestAnimationFrame(frame);
}

// ---------- public init ----------

/**
 * Call after the DOM is ready. Safe to call again to reset.
 * subs/configs: initial subscriptions (demo-data.ts), or [] in real mode where
 * `discovered` events add them via addSubscription().
 */
export function initHallway(
  subs: Subscription[],
  configs: Array<ZombieConfig | undefined>,
): void {
  cv = document.getElementById('stage') as HTMLCanvasElement;
  ctx = cv.getContext('2d')!;
  cv.width = W;
  cv.height = H;
  wrapEl = document.getElementById('stageWrap') as HTMLElement;
  bubbleEl = document.getElementById('bubble') as HTMLElement;

  // aria-live region — must be in the DOM already
  ariaLive = document.getElementById('ariaLive') as HTMLElement;
  if (!ariaLive) {
    ariaLive = document.createElement('div');
    ariaLive.id = 'ariaLive';
    ariaLive.setAttribute('aria-live', 'polite');
    ariaLive.setAttribute('aria-atomic', 'true');
    ariaLive.className = 'sr-only';
    document.body.appendChild(ariaLive);
  }

  void loadSprites(); // sprites swap in when ready; rectangles until then
  bg = paintBg();

  slots = [];
  overflow = [];
  known = [];
  cfgs.clear();
  results.clear();
  reaper = { x: START_X, facing: 1, walk: 0, moving: false, knock: 0, swing: 0, scared: false, run: false };
  particles = [];
  cam = { s: 0, x: 0, focus: null };
  view = 'house';
  dayOffset = 0;
  extraEaten = 0;
  trials = [];
  setView('house');
  flash = 0;
  savedTarget = 0;
  savedShown = 0;
  queue = [];
  busy = false;
  tags = {};
  const boss = document.getElementById('boss');
  if (boss) boss.hidden = true;

  // Pre-register all initial subs so zombie sizes are scaled against the largest.
  known = [...subs];
  subs.forEach((s, i) => { const c = configs[i]; if (c) cfgs.set(s.id, c); });
  // Free trials get graves, not doors.
  const trialSubs = subs.filter(isTrial);
  known = known.filter((k) => !trialSubs.includes(k));
  const doorSubs = known;
  const maxSpent = doorSubs.length ? Math.max(...doorSubs.map(spentOf)) : 0;
  doorSubs.forEach((sub) => {
    if (slots.length < DOORS.length) slots.push(makeSlot(sub, maxSpent));
    else overflow.push(sub);
  });
  trialSubs.forEach(addTrial);
  renderClock();

  buildTags();
  wireBus();
  notify();

  if (!wired) {
    wired = true;

    // Tuning panel controls
    bindTune('tSpeed',    'oSpeed',    'speed',    (v) => v.toFixed(1) + '×');
    bindTune('tKnocks',   'oKnocks',   'knocks',   (v) => String(v));
    bindTune('tDissolve', 'oDissolve', 'dissolve', (v) => v + ' ms');
    bindTune('tLatency',  'oLatency',  'latency',  (v) => v + ' ms');
    const failEl = document.getElementById('tFail') as HTMLInputElement | null;
    if (failEl) failEl.addEventListener('change', (e) => { tune.fail = (e.target as HTMLInputElement).checked; });

    setInterval(syncDays, 60_000); // real app: days come from real dates

    document.getElementById('reset')?.addEventListener('click', () => {
      if (busy) return;
      const snap = [...known, ...trials.map((t) => t.sub)];
      const cf = snap.map((s) => cfgs.get(s.id));
      initHallway(snap, cf);
    });

    const muteBtn = document.getElementById('mute') as HTMLButtonElement | null;
    muteBtn?.addEventListener('click', () => {
      const next = !isMuted();
      setMuted(next);
      muteBtn.textContent = next ? 'Sound off' : 'Sound on';
      muteBtn.setAttribute('aria-pressed', String(next));
    });

    document.getElementById('copyScript')?.addEventListener('click', () => {
      const txt = document.getElementById('bossScript');
      const btn = document.getElementById('copyScript') as HTMLButtonElement | null;
      if (!txt || !btn) return;
      const done = () => {
        btn.textContent = 'Copied ✓';
        setTimeout(() => { btn.textContent = 'Copy call script'; }, 1500);
      };
      navigator.clipboard?.writeText(txt.textContent ?? '').then(done, () => selectText(txt));
    });

    // Hide tuning panel unless ?debug
    const panel = document.getElementById('tuningPanel');
    if (panel) {
      const isDebug = new URLSearchParams(location.search).has('debug');
      if (!isDebug) panel.hidden = true;
      document.addEventListener('keydown', (e) => {
        if (e.ctrlKey && e.shiftKey && e.key === 'D') {
          panel.hidden = !panel.hidden;
        }
      });
    }
  }

  last = performance.now();
  if (!looping) {
    looping = true;
    requestAnimationFrame(frame);
  }
}

function bindTune(
  inputId: string,
  outputId: string,
  key: keyof typeof tune,
  fmt: (v: number) => string,
): void {
  const el = document.getElementById(inputId) as HTMLInputElement | null;
  const o = document.getElementById(outputId);
  if (!el || !o) return;
  const set = () => {
    (tune as Record<string, number | boolean>)[key] = parseFloat(el.value);
    o.textContent = fmt(parseFloat(el.value));
  };
  el.addEventListener('input', set);
  set();
}

function selectText(el: HTMLElement): void {
  const rg = document.createRange();
  rg.selectNodeContents(el);
  const sel = getSelection();
  sel?.removeAllRanges();
  sel?.addRange(rg);
}
