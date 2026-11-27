/**
 * Guide ghost: one short next-step hint, chosen from the app's real state.
 * pickHint() is pure (state -> {text, action}). mountGhost() is the small DOM part.
 * Names come from email: callers and this file use textContent only.
 */

export type GhostAction =
  | { kind: 'connect'; label: string }
  | { kind: 'reap'; id: string; label: string }
  | { kind: 'bury'; id: string; label: string }
  | { kind: 'kit'; id: string; label: string }
  | { kind: 'list'; label: string }
  | { kind: 'dismiss'; label: string }
  | { kind: 'none'; label: string };

export interface Hint { text: string; action: GhostAction }

export interface GhostSub {
  id: string;
  merchant: string;
  /** Status word from the Cancel kit view model, e.g. 'Found', 'Cancel failed', 'Waiting to verify'. */
  status: string;
  forgottenScore: number;
  chargeCount: number;
  billingCycle: 'monthly' | 'annual' | string;
}
export interface GhostTrial { id: string; merchant: string; days: number; status: string }
export interface GhostState {
  locked: boolean;
  scanning: boolean;
  scanError: boolean;
  subs: readonly GhostSub[];
  trials: readonly GhostTrial[];
}

const FORGOTTEN_AT = 0.5; // same bar as the results header
const TRIAL_NEAR_DAYS = 3;
const NAME_MAX = 22;

const nm = (s: string): string => {
  const n = s.replace(/\s+/g, ' ').trim() || 'This one';
  return n.length > NAME_MAX ? n.slice(0, NAME_MAX - 1) + '…' : n;
};
const when = (d: number): string => (d <= 0 ? 'today' : d === 1 ? 'tomorrow' : `in ${d} days`);
const months = (s: GhostSub): number => (s.billingCycle === 'annual' ? s.chargeCount * 12 : s.chargeCount);

export function pickHint(st: GhostState): Hint {
  if (st.locked) return { text: 'Psst. Connect Gmail. I only read receipts.', action: { kind: 'connect', label: 'Connect Gmail' } };
  if (st.scanError) return { text: 'The scan fizzled. Tap Connect Gmail to try again.', action: { kind: 'connect', label: 'Connect Gmail' } };
  if (st.scanning) return { text: 'The cauldron is bubbling. Hold tight, souls are coming.', action: { kind: 'none', label: '' } };

  const failed = st.subs.find((s) => s.status === 'Cancel failed');
  if (failed) return { text: `The Reaper got spooked by ${nm(failed.merchant)}. The Cancel kit has a script.`, action: { kind: 'kit', id: failed.id, label: 'Open Cancel kit' } };

  const back = st.subs.find((s) => s.status === 'Came back');
  if (back) return { text: `${nm(back.merchant)} rose from the grave. Send the Reaper again?`, action: { kind: 'reap', id: back.id, label: 'Send the Reaper' } };

  const near = st.trials.filter((t) => t.status === 'idle' && t.days <= TRIAL_NEAR_DAYS).sort((a, b) => a.days - b.days)[0];
  if (near) return { text: `${nm(near.merchant)} trial wakes up ${when(near.days)}. Bury it?`, action: { kind: 'bury', id: near.id, label: 'Bury it' } };

  const zombie = st.subs
    .filter((s) => s.status === 'Found' && s.forgottenScore >= FORGOTTEN_AT)
    .sort((a, b) => b.forgottenScore - a.forgottenScore)[0];
  if (zombie) {
    const m = months(zombie);
    const how = m > 1 ? `has been charging you for ${m} months` : 'is charging you';
    return { text: `${nm(zombie.merchant)} ${how}. Send the Reaper?`, action: { kind: 'reap', id: zombie.id, label: 'Send the Reaper' } };
  }

  if (st.subs.some((s) => s.status === 'Waiting to verify')) {
    return { text: "I'll watch for the next bill. Go have a snack.", action: { kind: 'list', label: 'See the list' } };
  }
  const trial = st.trials.find((t) => t.status === 'idle');
  if (trial) return { text: `${nm(trial.merchant)} trial wakes up ${when(trial.days)}. Bury it?`, action: { kind: 'bury', id: trial.id, label: 'Bury it' } };

  return { text: 'All quiet. The dead stay dead.', action: { kind: 'dismiss', label: 'Thanks, ghost' } };
}

// ── DOM ──────────────────────────────────────────────────────────────────────

export const GHOST_OFF_KEY = 'grim_ghost_off';

// 12 x 12 pixel ghost. # body, e eye, m mouth. Original art, drawn as SVG rects (no image files).
const ART = [
  '....####....',
  '..########..',
  '.##########.',
  '.##ee##ee##.',
  '.##ee##ee##.',
  '.##########.',
  '.####mm####.',
  '.##########.',
  '.##########.',
  '.##########.',
  '.##.####.##.',
  '..#..##..#..',
];

function sprite(): SVGSVGElement {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 12 12');
  svg.setAttribute('width', '36');
  svg.setAttribute('height', '36');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('shape-rendering', 'crispEdges');
  ART.forEach((row, y) => [...row].forEach((c, x) => {
    if (c === '.') return;
    const r = document.createElementNS(NS, 'rect');
    r.setAttribute('x', String(x)); r.setAttribute('y', String(y));
    r.setAttribute('width', '1'); r.setAttribute('height', '1');
    r.setAttribute('class', c === '#' ? 'gg-body' : 'gg-dark');
    svg.append(r);
  }));
  return svg;
}

export interface GhostHandle { update: (st: GhostState) => void; current: () => Hint | null }

/** Mounts the ghost into `host`. onAction runs when the bubble button is pressed. */
export function mountGhost(host: HTMLElement, live: HTMLElement, onAction: (a: GhostAction) => void, store: Storage = sessionStorage): GhostHandle {
  const off = (): boolean => { try { return store.getItem(GHOST_OFF_KEY) === '1'; } catch { return false; } };
  host.className = 'guide-ghost';
  host.setAttribute('role', 'region');
  host.setAttribute('aria-label', 'Guide ghost');
  const body = document.createElement('div'); body.className = 'gg-sprite'; body.append(sprite());
  const bubble = document.createElement('div'); bubble.className = 'gg-bubble';
  const text = document.createElement('p'); text.className = 'gg-text';
  const go = document.createElement('button'); go.type = 'button'; go.className = 'gg-go';
  const x = document.createElement('button'); x.type = 'button'; x.className = 'gg-x ghost';
  x.textContent = '×'; x.setAttribute('aria-label', 'Hide the ghost for this visit');
  bubble.append(text, go);
  host.append(body, bubble, x);
  let hint: Hint | null = null;
  let lastText = '';

  go.addEventListener('click', () => { if (hint) onAction(hint.action); });
  x.addEventListener('click', () => {
    try { store.setItem(GHOST_OFF_KEY, '1'); } catch { /* blocked: hidden until reload */ }
    host.hidden = true;
  });
  host.hidden = off();

  return {
    current: () => hint,
    update(st) {
      hint = pickHint(st);
      text.textContent = hint.text;
      go.hidden = hint.action.kind === 'none';
      go.textContent = hint.action.label;
      if (hint.text !== lastText) {
        lastText = hint.text;
        if (!host.hidden) { live.textContent = ''; live.textContent = hint.text; }
      }
    },
  };
}
