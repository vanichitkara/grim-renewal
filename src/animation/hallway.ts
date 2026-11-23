/**
 * Mansion orchestrator (file name kept: UI imports it) — owns the rAF loop and the
 * animation state machine. The scene is a haunted mansion front: doors on two floors
 * (ground, and an upper landing), 8 slots per page. The graveyard is a separate full-frame
 * scene, shown only when there are trials.
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
import type { TweenHandle } from './tween.ts';
import { paintBg } from './background.ts';
import { drawTorch, drawDoor } from './door.ts';
import type { DoorSlotState } from './door.ts';
import {
  FLOOR, UPPER_FLOOR, PER_PAGE, slotPos, torchXs, pageCount, pageOf, clampPage, pageInfo,
  travelKind, glideMs, pace,
} from './layout.ts';
import type { PageInfo } from './layout.ts';
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
  spawnPuff,
  updateParticles,
  drawParticles,
} from './particles.ts';
import type { Particle } from './particles.ts';
import { sfx, setMuted, isMuted, unlockAudio, onSoundChange } from './sound.ts';

// Canvas constants — 480×220, never scaled on the element itself.
const W = 480;
const H = 220;
/** The mansion front is world x 0..HALL, the yard the next 480 px. */
const HALL = 480;
const GRAVES = [640, 720, 800] as const;
const DAY_MS = 86_400_000;
/** Where the reaper rests between jobs. */
const START_X = 20;

export type { PageInfo };

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

/** One entry per non-trial subscription, in the order added. Index = slot number (see layout.ts). */
let slots: SubSlot[] = [];
/** Always empty now (every sub gets a slot on some page). Kept so HordeView keeps its shape. */
const overflow: Subscription[] = [];
/** Every sub ever added. Used for stats and reset. */
let known: Subscription[] = [];
const cfgs = new Map<string, ZombieConfig>();
/** Last cancel result per id, so a result that lands before the animation asks for it is not lost. */
const results = new Map<string, { ok: boolean; reason?: string }>();
let wired = false;
let looping = false;
let reaper: ReaperState;
let particles: Particle[];
/** 0-based page of the mansion being shown. */
let page = 0;
/** Page the user asked for while the reaper was busy; applied when the queue is idle. */
let pendingPage: number | null = null;
/** Extra speed for long queues (layout.pace). Divides every duration together with tune.speed. */
let paceMul = 1;
/** Page-turn fade, 0..1. */
const pageFx = { a: 0 };
/** Bumped by initHallway so a stale pump loop stops. */
let gen = 0;
let pagerEl: HTMLElement | null = null;
let cam: { s: number; x: number; focus: number | null };
let view: View = 'house';
/** True while the camera cuts between the mansion and the yard. */
let cutting = false;
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
  /** Every non-trial sub, in slot order, across all pages. */
  visible: Subscription[];
  /** Always empty: every sub has a slot on some page. Kept for older callers. */
  overflow: Subscription[];
  /** Free trials at graves (at most 3 fit; shortcut: extra trials are ignored, add graves when needed). */
  trials: TrialView[];
  /** Which page of the mansion is showing (1-based numbers). */
  page: PageInfo;
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
    page: pageInfo(slots.length, page),
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
 * Add a discovered subscription: it gets the next free slot (a ground or upper door,
 * 8 per page). Idempotent per id.
 */
export function addSubscription(sub: Subscription, config?: ZombieConfig): void {
  if (known.some((k) => k.id === sub.id) || trials.some((t) => t.sub.id === sub.id)) return;
  if (config) cfgs.set(sub.id, config);
  if (isTrial(sub)) {
    addTrial(sub);
    return;
  }
  known.push(sub);
  slots.push(makeSlot(sub, Math.max(...known.map(spentOf))));
  buildTags();
  updatePager();
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

const slotIndex = (id: string) => slots.findIndex((s) => s.sub.id === id);

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
  const h = mkTween(obj, key, to, ms, easeFn, tune.speed * paceMul);
  live.add(h);
  // Mark the promise handled so a cancelled tween nobody awaits is not an unhandled rejection.
  h.promise.then(() => live.delete(h), () => live.delete(h));
  return h.promise;
}

/** Tweens in flight. Every one can be cancelled (animation.md: interruptible). */
const live = new Set<TweenHandle>();

/** Cancel every running tween. Awaiting sequences reject with AbortError and stop. */
function cancelAllTweens(): void {
  live.forEach((h) => h.cancel());
}

const isAbort = (e: unknown) => e instanceof DOMException && e.name === 'AbortError';

function waitMs(ms: number) {
  return wait(ms, tune.speed * paceMul);
}

/** Resolves once no tween is running (max ~1 s). Pages only turn after this. */
async function settle(): Promise<void> {
  for (let i = 0; i < 60 && live.size > 0; i++) await new Promise((r) => setTimeout(r, 16));
}

// ---------- DOM overlay helpers ----------
function buildTags(): void {
  wrapEl.querySelectorAll('.tag').forEach((t) => t.remove());
  tags = {};
  slots.forEach(({ sub }, i) => {
    const pos = slotPos(i);
    const t = document.createElement('div');
    t.className = 'tag';
    t.dataset['x'] = String(pos.cx);
    t.dataset['page'] = String(pos.page);
    t.style.top = (pos.tagY / H * 100) + '%';
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

/** Tags live in world space: slide them with the camera, hide the off-screen ones and other pages. */
function positionTags(): void {
  wrapEl.querySelectorAll<HTMLElement>('.tag').forEach((t) => {
    const sx = (Number(t.dataset['x']) - cam.x) / W;
    t.style.left = (sx * 100) + '%';
    const otherPage = t.dataset['page'] !== undefined && Number(t.dataset['page']) !== page;
    // One scene at a time: slot tags belong to the mansion, trial tags to the yard.
    const wrongScene = t.classList.contains('trial-tag') !== (cam.x >= HALL / 2);
    t.hidden = otherPage || wrongScene || sx < -0.15 || sx > 1.15;
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
    case 'dead':      return 'Cancel sent. Waiting to verify';
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

/**
 * Status words the app gives the scene for a slot at rest (the same words as the card and the List).
 * The scene keeps its own words only while the Reaper is acting on that slot.
 */
const restingLabel = new Map<string, string>();

/**
 * Show the app's status on a slot's tag, so the scene, the card and the List never disagree.
 * Pass null to fall back to the scene's own words. Text only: it is set with textContent.
 */
export function setSlotLabel(id: string, label: string | null): void {
  if (label === null || label.trim() === '') restingLabel.delete(id);
  else restingLabel.set(id, label.slice(0, 80));
  renderTag(id);
}

function statusText(slot: SubSlot): string {
  const { sub, slot: { status } } = slot;
  const rest = restingLabel.get(sub.id);
  // At rest, or after a result, the app's words win. Action words ("Knock, knock") stay the scene's.
  if (rest && (status === 'idle' || status === 'dead' || status === 'boss')) return rest;
  switch (status) {
    case 'queued':     return 'Reaper on the way';
    case 'walking':    return 'Reaper approaching';
    case 'knocking':   return 'Knock, knock…';
    case 'opening':    return 'Something stirs';
    case 'cancelling': return 'Cancelling…';
    case 'reaping':    return 'Reaping';
    // No money here: savings count only when the evidence rules say so (the header shows them).
    case 'dead':       return 'Cancel sent. Waiting to verify';
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
  // The canvas label always says what is happening now (animation.md accessibility).
  cv.setAttribute('aria-label', `Haunted mansion, page ${page + 1} of ${pageCount(slots.length)}. ${text}`);
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
  if (leftEl) leftEl.textContent = String(slots.filter((s) => s.slot.z.alive).length);
  if (eatenEl) eatenEl.textContent = money0(known.reduce((a, s) => a + s.totalSpent, 0) + extraEaten);
  if (savedEl) savedEl.textContent = money(savedShown);
}

// ---------- sequences — only fire after AgentEvent ----------

const R = () => reaper as unknown as Record<string, number>;

/** Plain walk. Only used for the Boss Door flee now. */
async function walkTo(x: number, pxPerSec = 70): Promise<void> {
  const d = Math.abs(x - reaper.x);
  if (d < 1) return;
  reaper.facing = x > reaper.x ? 1 : -1;
  reaper.moving = true;
  await tw(R(), 'x', x, (d / pxPerSec) * 1000, ease.linear);
  reaper.moving = false;
}

/**
 * Get the reaper to (x, lift): a short glide, or for a far target a blink
 * (smoke out, smoke in). Both are tweens, so both can be cancelled.
 */
async function goTo(x: number, lift = 0): Promise<void> {
  const kind = travelKind(reaper.x, reaper.lift, x, lift);
  if (kind === 'none') return;
  if (kind === 'glide') {
    const d = Math.hypot(x - reaper.x, lift - reaper.lift);
    reaper.facing = x >= reaper.x ? 1 : -1;
    sfx.whoosh();
    const ms = glideMs(d);
    await Promise.all([tw(R(), 'x', x, ms, ease.out), tw(R(), 'lift', lift, ms, ease.out)]);
    reaper.facing = 1;
    return;
  }
  spawnPuff(particles, reaper.x, FLOOR - 24 - reaper.lift, reduceMotion);
  sfx.whoosh();
  await tw(R(), 'alpha', 0, 130, ease.in);
  reaper.x = x;
  reaper.lift = lift;
  reaper.facing = 1;
  spawnPuff(particles, x, FLOOR - 24 - lift, reduceMotion);
  await tw(R(), 'alpha', 1, 150, ease.out);
}

/** Cut the camera to the other scene (mansion or yard) through a fade. */
async function cutTo(x: number): Promise<void> {
  cutting = true;
  try {
    await tw(pageFx as unknown as Record<string, number>, 'a', 1, 110, ease.in);
    cam.x = x;
    await tw(pageFx as unknown as Record<string, number>, 'a', 0, 130, ease.out);
  } catch (e) {
    if (!isAbort(e)) throw e;
    pageFx.a = 0;
  } finally {
    cutting = false;
  }
}

/** Turn the mansion to `p` (0-based) between sequences: waits for running tweens, fades. */
async function turnPage(p: number): Promise<void> {
  const target = clampPage(p, slots.length);
  if (target === page) return;
  await settle();
  if (!reduceMotion) await tw(pageFx as unknown as Record<string, number>, 'a', 1, 110, ease.in);
  page = target;
  updatePager();
  buildTags();
  notify();
  const info = pageInfo(slots.length, page);
  announce(`Page ${info.page} of ${info.pages}. Subscriptions ${info.first} to ${info.last} of ${info.total}.`);
  if (!reduceMotion) await tw(pageFx as unknown as Record<string, number>, 'a', 0, 130, ease.out);
}

async function showSlotPage(index: number): Promise<void> {
  if (pageOf(index) !== page) await turnPage(pageOf(index));
}

async function knockKnock(slot: DoorSlotState, knocks: number): Promise<void> {
  for (let i = 0; i < knocks; i++) {
    await tw(R(), 'knock', 1, 90, ease.out);
    sfx.knock();
    slot.door.shake = 1;
    await tw(R(), 'knock', 0, 120);
    await waitMs(170);
  }
}

async function kill(id: string): Promise<void> {
  const i = slotIndex(id);
  const s = slots[i]!;
  const pos = slotPos(i);
  const { slot, sub } = s;
  setStatus(id, 'reaping');
  bubble(null);
  await tw(R(), 'swing', 1, 200, ease.in);
  sfx.swing();
  flash = 0.8;
  if (!reduceMotion) cam.s = 3;
  slot.z.hit = 1;
  spawnDissolve(particles, pos.cx, slot.z.scale * slot.z.grow, reduceMotion, pos.feetY);
  sfx.dissolve();
  tw(slot.z as unknown as Record<string, number>, 'hit', 0, 250);
  await tw(slot.z as unknown as Record<string, number>, 'dissolve', 1, tune.dissolve, ease.out);
  slot.z.alive = false;
  spawnCoins(particles, pos.cx, reduceMotion, pos.feetY - 16, pos.feetY);
  spawnSoul(particles, pos.cx, pos.feetY - 30);
  sfx.coin();
  const yearly = sub.monthlyAmount * 12;
  floatText(pos.cx, pos.feetY - 70, '+' + money(yearly) + '/yr');
  savedTarget += yearly;
  renderStats();
  await tw(R(), 'swing', 0, 220);
  sfx.creak();
  await tw(slot.door as unknown as Record<string, number>, 'open', 0, 320);
  await tw(slot as unknown as Record<string, number>, 'tomb', 1, 300, ease.back);
  setStatus(id, 'dead');
}

async function reapOne(id: string): Promise<void> {
  const i = slotIndex(id);
  const s = slots[i]!;
  const pos = slotPos(i);
  const { slot, sub } = s;
  s.queued = false;

  // Long queues play shorter and faster (layout.pace). The queue already lost this item.
  const pc = pace(queue.length + 1, tune.knocks);
  paceMul = pc.speed;

  // Approach starts here, on `approved` (the enqueue gate), never earlier.
  await showSlotPage(i);
  setStatus(id, 'walking');
  await goTo(pos.reaperX, pos.reaperLift);
  reaper.facing = 1;
  setStatus(id, 'knocking');
  bubble('Knock knock');

  await knockKnock(slot, pc.knocks);
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
    await kill(id);
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
    if (reaper.lift > 0) await tw(R(), 'lift', 0, 260, ease.in); // drops to the ground to run
    await walkTo(-30, 260);
    reaper.run = false;
    showBoss(id, result.reason);
    await waitMs(900);
    reaper.scared = false;
    await goTo(START_X, 0);
    reaper.facing = 1;
  }
}

/** Coins drop from a slot when its savings are verified. UI calls celebrateVerified(id). */
async function celebrate(id: string): Promise<void> {
  const i = slotIndex(id);
  if (i >= 0) {
    const pos = slotPos(i);
    const s = slots[i]!;
    await showSlotPage(i);
    sfx.coin();
    spawnCoins(particles, pos.cx, reduceMotion, pos.feetY - 40, pos.feetY);
    floatText(pos.cx, pos.feetY - 70, 'Verified');
    announce(`${s.sub.merchant}: savings verified.`);
    await waitMs(900);
    return;
  }
  const ts = trials.find((t) => t.sub.id === id);
  if (ts) {
    sfx.coin();
    spawnCoins(particles, ts.g.x, reduceMotion, FLOOR - 40);
    floatText(ts.g.x, FLOOR - 70, 'Verified');
    announce(`${ts.sub.merchant}: savings verified.`);
    await waitMs(900);
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
  await goTo(START_X, 0);
  reaper.facing = 1;
}

/** Bury a trial before it charges. Runs after `approved`; reaper.ts does the real cancel. */
async function buryTrial(ts: TrialSlot): Promise<void> {
  const { g, sub } = ts;
  const zr = g.z as unknown as Record<string, number>;
  const gr = g as unknown as Record<string, number>;
  paceMul = 1;
  setTrialStatus(ts, 'walking');
  await goTo(g.x - 30, 0);
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
  paceMul = 1;
  setTrialStatus(ts, 'walking');
  await goTo(g.x - 36, 0);
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

/** Show the mansion or the yard. With no trials there is no yard: asking for it does nothing. */
export function setView(v: View): void {
  if (v === 'yard' && trials.length === 0) return;
  view = v;
  updatePager();
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
  const i = slotIndex(id);
  const s = slots[i]!;
  const pos = slotPos(i);
  document.getElementById('boss')!.hidden = true;
  paceMul = 1;
  await showSlotPage(i);
  setStatus(id, 'walking');
  bubble("Oh, it\u2019s cancelled?");
  await goTo(pos.reaperX, pos.reaperLift);
  reaper.facing = 1;
  bubble("Then you\u2019re mine.");
  await tw(s.slot.z as unknown as Record<string, number>, 'grow', 1, 500);
  await waitMs(400);
  await kill(id);
}

/**
 * A charge came back: the tombstone sinks, the door opens, the zombie rises again (either floor).
 */
async function riseAgain(id: string): Promise<void> {
  const i = slotIndex(id);
  const s = slots[i];
  if (!s || s.slot.status !== 'dead') return;
  const { slot, sub } = s;
  const z = slot.z as unknown as Record<string, number>;
  paceMul = 1;
  await showSlotPage(i);
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
  const g = gen;
  while (queue.length && g === gen) {
    try {
      await queue.shift()!();
    } catch (e) {
      // A cancelled tween (Reset) ends its sequence quietly; anything else is a bug worth seeing.
      if (!isAbort(e)) console.error('[hallway] sequence failed', e);
    }
  }
  if (g !== gen) return; // the scene was reset under us; the new scene owns `busy` now
  busy = false;
  bubble(null);
  paceMul = 1;
  setMachineDisplay('idle', '');
  if (pendingPage !== null) {
    const p = pendingPage;
    pendingPage = null;
    await turnPage(p);
  }
}

// ---------- paging (public API) ----------

/** Which page is showing. Page numbers are 1-based. */
export function getPageInfo(): PageInfo {
  return pageInfo(slots.length, page);
}

/**
 * Show page n (1-based). While the reaper is working the turn waits until the queue is idle,
 * because the scene follows the reaper and never turns under a running tween.
 */
export function setPage(n: number): void {
  const target = clampPage(n - 1, slots.length);
  if (busy) {
    pendingPage = target;
    announce('The page will turn when the Reaper finishes.');
    return;
  }
  void turnPage(target);
}

/** Gold coins drop from this subscription's slot (the UI calls it when savings reach Verified). */
export function celebrateVerified(id: string): void {
  queue.push(() => celebrate(id));
  void pump();
}

const PAGER_CSS = `
.pager { position: absolute; left: 50%; top: 2px; transform: translateX(-50%); display: flex; gap: 6px; align-items: center;
  font-family: var(--display, monospace); font-size: clamp(9px, 1.5vw, 13px); color: var(--bone, #ece6d6);
  background: rgba(18, 14, 28, 0.82); border: 1px solid var(--stone, #2a2240); border-radius: 3px; padding: 1px 6px; }
.pager[hidden] { display: none; }
.pager button { min-width: 26px; padding: 0 6px; background: var(--crypt, #1c162b); color: var(--bone, #ece6d6);
  border: 1px solid var(--stone, #2a2240); border-radius: 2px; cursor: pointer; font: inherit; }
.pager button:disabled { opacity: 0.4; cursor: default; }
.pager button:focus-visible { outline: 2px solid var(--coin, #f2b84b); outline-offset: 1px; }`;

/** Prev / next arrows and a "Page 1 of 2" label on the stage. Built once, reused after a reset. */
function ensurePager(): void {
  if (!document.getElementById('pagerStyle')) {
    const st = document.createElement('style');
    st.id = 'pagerStyle';
    st.textContent = PAGER_CSS;
    document.head.appendChild(st);
  }
  pagerEl = document.getElementById('pager');
  if (pagerEl) return;
  const el = document.createElement('div');
  el.id = 'pager';
  el.className = 'pager';
  el.setAttribute('role', 'group');
  el.setAttribute('aria-label', 'Mansion pages');
  const mkBtn = (id: string, label: string, text: string, step: number) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.id = id;
    b.setAttribute('aria-label', label);
    b.textContent = text;
    b.addEventListener('click', () => setPage(page + 1 + step));
    return b;
  };
  const lab = document.createElement('span');
  lab.id = 'pagerLabel';
  el.append(mkBtn('pagerPrev', 'Previous page', '\u25c0', -1), lab, mkBtn('pagerNext', 'Next page', '\u25b6', 1));
  wrapEl.appendChild(el);
  pagerEl = el;
}

function updatePager(): void {
  if (!pagerEl) return;
  const pages = pageCount(slots.length);
  pagerEl.hidden = pages <= 1 || view === 'yard';
  const lab = document.getElementById('pagerLabel');
  if (lab) lab.textContent = `Page ${page + 1} of ${pages}`;
  (document.getElementById('pagerPrev') as HTMLButtonElement | null)?.toggleAttribute('disabled', page <= 0);
  (document.getElementById('pagerNext') as HTMLButtonElement | null)?.toggleAttribute('disabled', page >= pages - 1);
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
    hallW: HALL,
    viewW: W,
    hasYard: trials.length > 0,
  });
  // The camera never rests between the scenes: it cuts, through a short fade.
  if (target !== cam.x && !cutting) {
    if (reduceMotion) cam.x = target;
    else void cutTo(target);
  }
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

  // One scene fills the frame: clip to it so camera shake never shows the other one.
  ctx.translate(-Math.round(cam.x), 0);
  ctx.beginPath();
  ctx.rect(Math.round(cam.x), 0, W, H);
  ctx.clip();
  const yardScene = cam.x >= HALL / 2;
  // No trials, no yard: only the mansion half of the background is ever drawn.
  if (trials.length > 0) ctx.drawImage(bg, 0, 0);
  else ctx.drawImage(bg, 0, 0, HALL, H, 0, 0, HALL, H);

  if (!yardScene) {
    torchXs().forEach((x) => { drawTorch(ctx, x, t); drawTorch(ctx, x, t + 1.7, UPPER_FLOOR); });

    // The page's slots: a ground door and an upper door per column. At most PER_PAGE are drawn.
    const first = page * PER_PAGE;
    for (let local = 0; local < PER_PAGE; local++) {
      const s = slots[first + local];
      if (!s) continue;
      const pos = slotPos(first + local);
      // Door pass 1: frame + peek zombie
      drawDoor(ctx, pos.cx, s.slot, t, (cx, slot, time) => {
        drawZombieFor(ctx, cx, slot, s.config, time, { y: pos.feetY });
      }, pos.feetY);
    }
    // Door pass 2: fully emerged zombies (drawn above the door)
    for (let local = 0; local < PER_PAGE; local++) {
      const s = slots[first + local];
      if (s && s.slot.z.out > 0.5 && s.slot.z.alive) {
        const pos = slotPos(first + local);
        drawZombieFor(ctx, pos.cx, s.slot, s.config, t, { y: pos.feetY });
      }
    }
  } else {
    trials.forEach(({ g }) => drawGrave(ctx, g, t));
    drawFog(ctx, t, HALL);
  }

  drawReaper(ctx, reaper, t);
  drawParticles(ctx, particles, t);

  // Scythe arc flash
  if (reaper.swing > 0.35 && reaper.swing < 0.98) {
    ctx.strokeStyle = `rgba(236,230,214,${0.8 * (1 - reaper.swing)})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(reaper.x + 4 * reaper.facing, FLOOR - 26 - reaper.lift, 22, -1.2, 1.0);
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
  if (pageFx.a > 0.01) {
    ctx.fillStyle = `rgba(18,14,28,${pageFx.a})`; // --night, the page-turn fade
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
    // Keep the bubble on the stage even when the reaper stands at the left or right edge.
    const bx = Math.min(W - 70, Math.max(70, reaper.x - cam.x));
    bubbleEl.style.left = (bx / W * 100) + '%';
    bubbleEl.style.top = ((FLOOR - 52 - reaper.lift) / H * 100) + '%';
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

  // Stop whatever the old scene was doing before it is replaced.
  gen++;
  cancelAllTweens();
  void loadSprites().then(() => { bg = paintBg(); }); // sprites swap in when ready; rectangles until then
  bg = paintBg();

  slots = [];
  known = [];
  cfgs.clear();
  results.clear();
  page = 0;
  pendingPage = null;
  paceMul = 1;
  pageFx.a = 0;
  reaper = { x: START_X, facing: 1, walk: 0, moving: false, knock: 0, swing: 0, scared: false, run: false, lift: 0, alpha: 1 };
  particles = [];
  cam = { s: 0, x: 0, focus: null };
  cutting = false;
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
  doorSubs.forEach((sub) => slots.push(makeSlot(sub, maxSpent)));
  trialSubs.forEach(addTrial);
  renderClock();
  ensurePager();
  updatePager();

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
    const paintMute = (m: boolean): void => {
      if (!muteBtn) return;
      muteBtn.textContent = m ? 'Sound off' : 'Sound on';
      muteBtn.setAttribute('aria-pressed', String(m));
    };
    paintMute(isMuted()); // the saved setting from Settings
    onSoundChange((s) => paintMute(s.muted));
    muteBtn?.addEventListener('click', () => setMuted(!isMuted()));

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
