/**
 * Mansion layout and paging. Pure: no canvas, no DOM.
 *
 * The mansion front shows one page of slots at a time. Each column holds a
 * ground-floor door and an upper-floor window. Slot i (0-based, in the order
 * subscriptions were added) sits on page floor(i / PER_PAGE); inside a page the
 * slots fill column by column: door, window, door, window, ...
 * Page numbers here are 0-based. `pageInfo` returns the 1-based numbers the UI shows.
 */

/** Native canvas width (animation.md: 480x220, never scaled on the element). */
export const CANVAS_W = 480;
/** Y of the ground line. */
export const FLOOR = 184;
/** Columns per page. Two slots per column (door below, window above). */
export const COLS = 4;
export const PER_PAGE = COLS * 2;

/** Door frame sprite is 40x62, resting on FLOOR. */
export const DOOR_W = 40;
export const DOOR_H = 62;
/** Window frame sprite is 40x50; the glass pane inside it is 32x38 at offset (4, 4). */
export const WIN_W = 40;
export const WIN_H = 50;
export const WIN_TOP = 30;
export const PANE_W = 32;
export const PANE_H = 38;

export type SlotKind = 'door' | 'window';

export interface SlotPos {
  index: number;
  /** 0-based page this slot is drawn on. */
  page: number;
  /** 0..PER_PAGE-1 position inside the page. */
  local: number;
  col: number;
  kind: SlotKind;
  /** Horizontal centre of the door or window. */
  cx: number;
  /** Top of the frame sprite. */
  top: number;
  /** Y where the zombie's feet stand (door: the floor; window: bottom of the pane). */
  feetY: number;
  /** Where the reaper stops: x, and how many px above its ground pose it hovers. */
  reaperX: number;
  reaperLift: number;
  /** Bottom edge (canvas y) of the DOM name tag for this slot. */
  tagY: number;
  /** Centre of the thing that gets hit (zombie body), for particles and float text. */
  hitY: number;
}

const SPACING = CANVAS_W / COLS;

export function pageCount(total: number): number {
  return Math.max(1, Math.ceil(Math.max(0, total) / PER_PAGE));
}

export function pageOf(index: number): number {
  return Math.floor(Math.max(0, index) / PER_PAGE);
}

export function clampPage(page: number, total: number): number {
  if (!Number.isFinite(page)) return 0;
  return Math.min(pageCount(total) - 1, Math.max(0, Math.trunc(page)));
}

/** Slot indices drawn on a page. Never more than PER_PAGE. */
export function pageSlots(total: number, page: number): number[] {
  const p = clampPage(page, total);
  const out: number[] = [];
  for (let i = p * PER_PAGE; i < Math.min(total, (p + 1) * PER_PAGE); i++) out.push(i);
  return out;
}

export function slotPos(index: number): SlotPos {
  const local = ((index % PER_PAGE) + PER_PAGE) % PER_PAGE;
  const col = Math.floor(local / 2);
  const kind: SlotKind = local % 2 === 0 ? 'door' : 'window';
  const cx = Math.round(SPACING * (col + 0.5));
  if (kind === 'door') {
    return {
      index, page: pageOf(index), local, col, kind, cx,
      top: FLOOR - DOOR_H, feetY: FLOOR,
      reaperX: cx - 40, reaperLift: 0,
      tagY: FLOOR + 30, hitY: FLOOR - 20,
    };
  }
  const paneBottom = WIN_TOP + 4 + PANE_H;
  return {
    index, page: pageOf(index), local, col, kind, cx,
    top: WIN_TOP, feetY: paneBottom,
    reaperX: cx - 44, reaperLift: FLOOR - 2 - (WIN_TOP + WIN_H + 2),
    tagY: WIN_TOP + WIN_H + 26, hitY: paneBottom - 16,
  };
}

/** X positions of the wall torches between columns. */
export function torchXs(): number[] {
  return Array.from({ length: COLS }, (_, c) => Math.round(SPACING * (c + 1)));
}

export interface PageInfo {
  /** 1-based page shown. */
  page: number;
  pages: number;
  total: number;
  perPage: number;
  /** 1-based first and last slot on the page (0 and 0 when empty). */
  first: number;
  last: number;
}

export function pageInfo(total: number, page: number): PageInfo {
  const p = clampPage(page, total);
  const idx = pageSlots(total, p);
  return {
    page: p + 1,
    pages: pageCount(total),
    total: Math.max(0, total),
    perPage: PER_PAGE,
    first: idx.length ? idx[0]! + 1 : 0,
    last: idx.length ? idx[idx.length - 1]! + 1 : 0,
  };
}

/** Farther than this, the reaper blinks (smoke out, smoke in) instead of gliding. */
export const BLINK_DIST = 150;

export type Travel = 'none' | 'glide' | 'blink';

export function travelKind(fromX: number, fromLift: number, toX: number, toLift: number): Travel {
  const d = Math.hypot(toX - fromX, toLift - fromLift);
  if (d < 1) return 'none';
  return d > BLINK_DIST ? 'blink' : 'glide';
}

/** Glide duration in ms (before the global speed divides it). Short hops stay readable. */
export function glideMs(dist: number): number {
  return Math.round(Math.min(650, Math.max(220, 160 + dist * 2.2)));
}

export interface Pace {
  /** Knocks per slot. */
  knocks: number;
  /** Extra speed on top of tune.speed. */
  speed: number;
}

/**
 * Longer queues play faster so "send the reaper to every door" on 24
 * subscriptions takes seconds per slot, not a minute. Never below 1 knock,
 * never above 2.5x.
 */
export function pace(queueLen: number, baseKnocks: number): Pace {
  const k = Math.max(1, Math.round(baseKnocks));
  if (queueLen <= 4) return { knocks: k, speed: 1 };
  if (queueLen <= 8) return { knocks: Math.min(k, 2), speed: 1.3 };
  if (queueLen <= 16) return { knocks: 1, speed: 1.8 };
  return { knocks: 1, speed: 2.5 };
}
