/**
 * Dashboard glue: statuses and assessments for every subscription, the results-first header,
 * the Scene | List switch with its table, per-card status lines, and the Cancel kit and trial reminder.
 * The rules live in src/savings and src/kit; this file only places the results on the page.
 * Merchant names come from email, so everything is set with textContent.
 */
import type { Subscription } from '../types.ts';
import { assessCancellation, type Assessment } from '../savings/assess.ts';
import type { SweepResult } from '../savings/sweep.ts';
import { loadClaims } from '../state/claims.ts';
import { statusFor, type ReaperState, type Status } from '../kit/status.ts';
import { headerModel, listRows, type Row } from '../kit/view-model.ts';
import { makeIcs } from '../kit/ics.ts';
import { loadCelebrated, markCelebrated } from '../kit/last-scan.ts';
import { openCancelKit } from './cancel-kit.ts';

export interface TrialRow { sub: Subscription; days: number; status: string }

export interface DashboardOpts {
  /** Extra claims that are never saved (demo data). */
  extraClaims?: Record<string, string>;
  /** Called once when a subscription first reaches Verified. */
  onVerified?: (id: string) => void;
  /** Tells the scene the status word for a slot, so the scene, the cards and the List agree. */
  onStatus?: (id: string, label: string | null) => void;
  /** Demo mode remembers nothing between visits. */
  remember?: boolean;
  now?: () => Date;
}


/** The short text for a scene tag. Null means: let the scene show its own words. */
export function sceneLabel(st: { word: string; detail?: string | undefined }): string | null {
  switch (st.word) {
    case 'Found': return null;
    case 'Verified': return 'Verified cancelled';
    case 'Likely cancelled': return st.detail && /full cycle/i.test(st.detail) ? 'No charge for a full cycle' : 'Likely cancelled';
    case 'Waiting to verify': return 'Waiting to verify';
    case 'Came back': return 'Came back: charged again';
    case 'Cancel started': return null; // the Reaper is acting: the scene's own words are more precise
    default: return st.word;
  }
}

const VIEW_KEY = 'grim_view';
const $ = (id: string): HTMLElement => document.getElementById(id)!;
const mk = <K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
};

export function createDashboard(opts: DashboardOpts = {}) {
  const now = opts.now ?? (() => new Date());
  let subs: Subscription[] = [];
  let trials: TrialRow[] = [];
  const reaper = new Map<string, ReaperState>();
  let sweep = new Map<string, Assessment>();
  const celebrated = opts.remember === false ? new Set<string>() : loadCelebrated();
  let rows: Row[] = [];
  let lastListSig = '';

  const claims = (): Record<string, string> => ({ ...(opts.extraClaims ?? {}), ...loadClaims() });

  function compute(): void {
    const c = claims();
    rows = subs.map((sub) => {
      const assessment = sweep.get(sub.id) ?? assessCancellation({ sub, claim: c[sub.id] ? { claimedAt: c[sub.id]! } : null, now: now() });
      return { sub, assessment, status: statusFor({ reaper: reaper.get(sub.id) ?? 'none', assessment }) };
    });
  }

  const statusOf = (id: string): Status | undefined => rows.find((r) => r.sub.id === id)?.status;

  function renderHeader(): void {
    const h = headerModel(rows, trials);
    $('headline').textContent = h.headline;
    $('chips').replaceChildren(...h.chips.map((c) => mk('li', `chip ${c.kind}`, c.text)));
    $('avoidedLabel').textContent = h.avoidedLabel;
    $('avoidedVal').textContent = h.avoided;
    $('avoidedNote').textContent = h.avoidedNote;
    $('projectedLabel').textContent = h.projectedLabel;
    $('projectedVal').textContent = h.projected;
  }

  function renderCards(): void {
    document.querySelectorAll<HTMLElement>('#cards [data-id]').forEach((card) => {
      const st = statusOf(card.dataset['id']!);
      const line = card.querySelector<HTMLElement>('.status');
      if (!st || !line) return;
      line.textContent = '';
      line.append(mk('b', '', st.word));
      opts.onStatus?.(card.dataset['id']!, sceneLabel(st));
      // The detail often starts with the same word ("Verified: no charge seen..."). Say it once.
      const detail = st.detail && !st.detail.toLowerCase().startsWith(st.word.toLowerCase()) ? st.detail : st.detail?.replace(/^[A-Za-z ]+:\s*/, '');
      if (detail) line.append(` · ${detail}`);
      // Already cancelled (verified, or the user said so): do not offer the Reaper again. The Cancel kit stays.
      const reap = card.querySelector<HTMLButtonElement>('button:not(.ghost)');
      if (reap) {
        const done = st.word === 'Verified' || st.word === 'Waiting to verify';
        if (done) {
          reap.disabled = true;
          reap.dataset['statusLock'] = '1';
          reap.textContent = st.word === 'Verified' ? 'Cancelled and verified' : 'Waiting to verify';
        } else if (reap.dataset['statusLock'] === '1') {
          // undo only our own lock; never touch a button other code disabled
          reap.disabled = false;
          delete reap.dataset['statusLock'];
          reap.textContent = 'Send the Reaper';
        }
      }
    });
  }

  function renderList(): void {
    const data = listRows(rows, trials);
    const sig = JSON.stringify(data);
    if (sig === lastListSig) return; // nothing changed: keep focus where it is
    lastListSig = sig;
    const table = mk('table', 'list');
    table.id = 'listTable';
    table.append(mk('caption', 'sr-only', `All subscriptions: ${data.length}`));
    const hr = mk('tr');
    for (const h of ['Name', 'Price', 'How forgotten', 'Status', 'Actions']) { const th = mk('th', '', h); th.scope = 'col'; hr.append(th); }
    table.append(mk('thead')); table.tHead!.append(hr);
    const tb = mk('tbody');
    for (const r of data) {
      const tr = mk('tr'); tr.dataset['id'] = r.id;
      const name = mk('th', '', r.name); name.scope = 'row';
      const st = mk('td'); st.append(mk('b', '', r.status));
      if (r.statusDetail) st.append(mk('span', 'sub', r.statusDetail));
      const act = mk('td', 'acts');
      const kit = mk('button', 'ghost', 'Cancel kit'); kit.type = 'button';
      kit.setAttribute('aria-label', `Cancel kit for ${r.name}`);
      kit.addEventListener('click', () => openKit(r.id));
      act.append(kit);
      if (r.isTrial) act.append(remindButton(r.id, r.name));
      tr.append(name, mk('td', 'num', r.price), mk('td', '', r.forgotten), st, act);
      tb.append(tr);
    }
    table.append(tb);
    $('listView').replaceChildren(table);
  }

  function remindButton(id: string, name: string): HTMLButtonElement {
    const b = mk('button', 'ghost', 'Remind me'); b.type = 'button';
    b.setAttribute('aria-label', `Remind me before ${name} charges`);
    b.addEventListener('click', () => remind(id));
    return b;
  }

  /** Download an .ics reminder 2 days before the trial ends. Nothing is sent anywhere. */
  function remind(id: string): void {
    const t = trials.find((x) => x.sub.id === id);
    if (!t?.sub.trialEndDate) return;
    const ics = makeIcs({ title: `Trial ends soon: ${t.sub.merchant}`, dateISO: t.sub.trialEndDate, daysBefore: 2 });
    const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
    const a = mk('a'); a.href = url; a.download = `${t.sub.merchant.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}-trial-reminder.ics`;
    document.body.append(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    const live = document.getElementById('ariaLive');
    if (live) live.textContent = `Reminder file for ${t.sub.merchant} saved. It falls two days before the trial ends.`;
  }

  function celebrate(): void {
    for (const r of rows) {
      if (r.assessment.level === 'verified' && !celebrated.has(r.sub.id)) {
        celebrated.add(r.sub.id);
        if (opts.remember !== false) markCelebrated(r.sub.id);
        opts.onVerified?.(r.sub.id);
      }
    }
  }

  function refresh(): void {
    compute();
    renderHeader();
    renderCards();
    renderList();
    celebrate();
  }

  function openKit(id: string): void {
    const sub = subs.find((s) => s.id === id) ?? trials.find((t) => t.sub.id === id)?.sub;
    if (!sub) return;
    let row = rows.find((r) => r.sub.id === id);
    if (!row) { // a trial has no assessment of its own
      const assessment = assessCancellation({ sub, claim: null, now: now() });
      row = { sub, assessment, status: statusFor({ reaper: reaper.get(id) ?? 'none', assessment }) };
    }
    const claimedOn = claims()[id] ?? null;
    void openCancelKit({
      sub, status: row.status, assessment: row.assessment, claimedOn,
      onClaimed: () => { sweep.delete(id); refresh(); return statusOf(id); },
    });
  }

  function setView(v: 'scene' | 'list', persist = false): void {
    document.body.classList.toggle('view-list', v === 'list');
    $('showScene').setAttribute('aria-pressed', String(v === 'scene'));
    $('showList').setAttribute('aria-pressed', String(v === 'list'));
    $('listView').hidden = v !== 'list';
    if (persist) { try { localStorage.setItem(VIEW_KEY, v); } catch { /* blocked */ } }
  }
  $('showScene').addEventListener('click', () => setView('scene', true));
  $('showList').addEventListener('click', () => setView('list', true));
  try { if (localStorage.getItem(VIEW_KEY) === 'list') setView('list'); else setView('scene'); } catch { setView('scene'); }

  return {
    /** The scene reports its subscriptions and trials here. */
    setData(s: Subscription[], t: TrialRow[]): void { subs = s; trials = t; refresh(); },
    setReaper(id: string, st: ReaperState): void { reaper.set(id, st); refresh(); },
    /** After a scan: assessments from sweepForChanges win over a fresh calculation. */
    setSweep(results: readonly SweepResult[]): void { sweep = new Map(results.map((r) => [r.id, r.assessment])); refresh(); },
    statusOf, openKit, remind, refresh, setView,
  };
}

export type Dashboard = ReturnType<typeof createDashboard>;
