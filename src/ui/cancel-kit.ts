/**
 * Cancel kit: a modal with Online / Email / Phone tabs (and Dispute when a charge came back),
 * the "I cancelled it" date, and the "What worked?" prompt with the opt-in box.
 *
 * PRIVACY: merchant names come from email, so everything is set with textContent.
 * The share box is OFF by default and its text is fixed. submitOutcome sends nothing unless it is ticked.
 * Focus trap and Escape work like consent-banner.ts.
 */
import type { Subscription } from '../types.ts';
import type { Assessment } from '../savings/assess.ts';
import type { MethodKind, TipSummary } from '../community/types.ts';
import { getTips as realGetTips, submitOutcome as realSubmit } from '../community/client.ts';
import { merchantKeyFor } from '../community/merchant-key.ts';
import { saveClaim as realSaveClaim } from '../state/claims.ts';
import { chooseMethod, type Tab } from '../kit/choose-method.ts';
import { emailDraft, mailtoUrl, callScript, CALL_TIPS, disputeLetter, searchUrl } from '../kit/drafts.ts';
import { formatMoney } from '../kit/view-model.ts';
import type { Status } from '../kit/status.ts';

/** Exact text required next to the share box (spec section A). Do not reword. */
export const SHARE_TEXT =
  "Share anonymously that this worked. We send only the company's website name, the method, and yes or no. No name, email, amount or date.";

export interface KitDeps {
  getTips: (key: string) => Promise<TipSummary>;
  submitOutcome: (o: { merchantKey: string; method: MethodKind; worked: boolean; consented: boolean }) => Promise<boolean>;
  saveClaim: (id: string, iso: string) => void;
  today: () => string;
  /** When set, the share box is off and this says why (demo: fake companies must never reach the shared list). */
  shareDisabledReason?: string;
}

export const defaultDeps: KitDeps = {
  getTips: realGetTips,
  submitOutcome: realSubmit,
  saveClaim: (id, iso) => realSaveClaim(id, iso),
  today: () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  },
};

export interface KitInput {
  sub: Subscription;
  status: Status;
  assessment: Assessment;
  /** ISO day the user said they cancelled, if any. */
  claimedOn?: string | null;
  /** Called after the claim is saved; returns the new status to show. */
  onClaimed?: (iso: string) => Status | void;
}

const FOCUSABLE = 'button:not([disabled]), [href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])';

function el<K extends keyof HTMLElementTagNameMap>(tag: K, cls?: string, text?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}

const isHttp = (u: string | null): u is string => {
  if (!u) return false;
  try {
    const p = new URL(u).protocol;
    return p === 'https:' || p === 'http:';
  } catch {
    return false;
  }
};

const TAB_LABEL: Record<string, string> = { online: 'Online', email: 'Email', phone: 'Phone', dispute: 'Dispute' };

async function copyText(text: string, from?: HTMLTextAreaElement): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    if (!from) return false;
    from.select();
    try {
      return document.execCommand('copy');
    } catch {
      return false;
    }
  }
}

function textBox(text: string, label: string): HTMLTextAreaElement {
  const t = el('textarea', 'kit-text');
  t.readOnly = true;
  t.value = text;
  t.rows = Math.min(14, text.split("\n").length + 3);
  t.setAttribute('aria-label', label);
  return t;
}

export async function openCancelKit(input: KitInput, deps: KitDeps = defaultDeps): Promise<void> {
  const { sub } = input;
  const previousFocus = document.activeElement as HTMLElement | null;

  const overlay = el('div', 'kit-overlay');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'kit-title');
  const box = el('div', 'kit-box');
  const head = el('div', 'kit-head');
  const title = el('h2', '', `Cancel ${sub.merchant}`);
  title.id = 'kit-title';
  const closeBtn = el('button', 'ghost', 'Close');
  closeBtn.type = 'button';
  head.append(title, closeBtn);
  const why = el('p', 'kit-why', 'Checking what worked for other people…');
  const live = el('p', 'sr-only');
  live.setAttribute('role', 'status');
  live.setAttribute('aria-live', 'polite');
  const body = el('div', 'kit-body');
  box.append(head, why, body, live);
  overlay.append(box);

  // Escape works even when focus was lost (a button that replaced itself).
  const onEsc = (e: KeyboardEvent): void => { if (e.key === 'Escape') { e.preventDefault(); close(); } };
  document.addEventListener('keydown', onEsc);
  const close = (): void => {
    document.removeEventListener('keydown', onEsc);
    overlay.remove();
    previousFocus?.focus?.();
  };
  closeBtn.addEventListener('click', close);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  overlay.addEventListener('keydown', (e) => {
    if (e.key !== 'Tab') return;
    const f = Array.from(box.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((x) => !x.hidden && x.offsetParent !== null);
    if (!f.length) { e.preventDefault(); return; }
    const first = f[0]!, last = f[f.length - 1]!;
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
  document.body.appendChild(overlay);
  closeBtn.focus();

  // What did other people say? Never throws; falls back to the starter list.
  const key = merchantKeyFor(sub.senderDomain ?? sub.merchant);
  const summary = key ? await deps.getTips(key).catch(() => null) : null;
  if (!overlay.isConnected) return; // closed while waiting
  const choice = chooseMethod(sub, summary);
  why.textContent = '';
  why.append(el('b', '', 'Start here: '), choice.why);
  if (choice.source !== 'unknown') why.append(el('span', 'kit-src', ` Source: ${choice.source}.`));

  // ── Tabs ───────────────────────────────────────────────────────────────
  const tabs: string[] = [...choice.order];
  const showDispute = input.status.word === 'Came back';
  if (showDispute) tabs.push('dispute');
  const list = el('div', 'kit-tabs');
  list.setAttribute('role', 'tablist');
  list.setAttribute('aria-label', 'Ways to cancel');
  const panels = new Map<string, HTMLElement>();
  const btns = new Map<string, HTMLButtonElement>();

  const select = (name: string, focus = false): void => {
    for (const t of tabs) {
      const on = t === name;
      btns.get(t)!.setAttribute('aria-selected', String(on));
      btns.get(t)!.tabIndex = on ? 0 : -1;
      panels.get(t)!.hidden = !on;
    }
    if (focus) btns.get(name)!.focus();
  };

  const copyRow = (text: string, from: HTMLTextAreaElement, label: string): HTMLButtonElement => {
    const b = el('button', 'ghost', label);
    b.type = 'button';
    b.addEventListener('click', async () => { live.textContent = (await copyText(text, from)) ? 'Copied.' : 'Could not copy. Select the text and copy it yourself.'; });
    return b;
  };

  const online = el('div');
  if (isHttp(sub.cancelUrl)) {
    const a = el('a', 'btn', 'Open the cancel page');
    a.href = sub.cancelUrl; a.target = '_blank'; a.rel = 'noopener noreferrer';
    online.append(el('p', '', 'The link comes from your receipt.'), a);
  } else {
    online.append(el('p', '', 'Your receipt had no cancel link. Try these in order:'));
    const ol = el('ol');
    for (const s of ['Sign in on the company website.', 'Open Account, Billing or Membership.', 'Choose Cancel and finish every step.', 'Save the confirmation page or email.']) ol.append(el('li', '', s));
    online.append(ol);
  }
  const search = el('a', 'btn ghost', 'Search for how to cancel');
  search.href = searchUrl(sub.merchant); search.target = '_blank'; search.rel = 'noopener noreferrer';
  online.append(el('p', 'note', 'Never type your password into anything except the company\'s own site.'), search);

  const draft = emailDraft({ merchant: sub.merchant, plan: sub.plan, memberId: sub.memberId });
  const email = el('div');
  const ebox = textBox(draft.body, 'Email text');
  const mail = el('a', 'btn', 'Open in my mail app');
  mail.href = mailtoUrl(draft);
  email.append(el('p', 'note', `Subject: ${draft.subject}. Add the company's support address as the recipient.`), ebox, el('div', 'btnrow'));
  email.lastElementChild!.append(mail, copyRow(`${draft.subject}\n\n${draft.body}`, ebox, 'Copy'));

  const phone = el('div');
  const script = callScript({ merchant: sub.merchant, memberId: sub.memberId });
  const sbox = textBox(script, 'Call script');
  if (sub.phone) {
    const digits = sub.phone.replace(/[^\d+]/g, '');
    const a = el('a', 'btn', `Call ${sub.phone}`);
    a.href = `tel:${digits}`;
    phone.append(a);
  } else {
    phone.append(el('p', '', 'No phone number on your receipt. Look for the support number on the company website.'));
  }
  phone.append(el('p', 'note', 'Read this:'), sbox);
  const ul = el('ul');
  for (const t of CALL_TIPS) ul.append(el('li', '', t));
  phone.append(ul, copyRow(script, sbox, 'Copy script'));

  const parts: Record<string, HTMLElement> = { online, email, phone };
  if (showDispute) {
    const perCharge = sub.monthlyAmount * (sub.billingCycle === 'annual' ? 12 : 1);
    const letter = disputeLetter({
      merchant: sub.merchant,
      cancelledOn: input.claimedOn ?? null,
      newChargeDate: input.assessment.level === 'came_back' ? input.assessment.since ?? null : null,
      amountText: formatMoney(perCharge, sub.currency),
    });
    const d = el('div');
    const lbox = textBox(letter, 'Dispute letter');
    d.append(el('p', '', 'A charge appeared after you cancelled. Ask the company to refund it first. If they do not, send this to your card issuer.'), lbox, copyRow(letter, lbox, 'Copy letter'));
    parts['dispute'] = d;
  }

  tabs.forEach((name, i) => {
    const b = el('button', 'kit-tab', TAB_LABEL[name]);
    b.type = 'button'; b.id = `kit-tab-${name}`;
    b.setAttribute('role', 'tab'); b.setAttribute('aria-controls', `kit-panel-${name}`);
    b.addEventListener('click', () => select(name));
    b.addEventListener('keydown', (e) => {
      const d = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
      if (!d) return;
      e.preventDefault();
      select(tabs[(i + d + tabs.length) % tabs.length]!, true);
    });
    btns.set(name, b); list.append(b);
    const p = parts[name]!;
    p.className = 'kit-panel'; p.id = `kit-panel-${name}`;
    p.setAttribute('role', 'tabpanel'); p.setAttribute('aria-labelledby', b.id);
    panels.set(name, p);
  });
  body.append(list, ...tabs.map((t) => panels.get(t)!));
  select(choice.first);

  // ── I cancelled it → What worked? ──────────────────────────────────────
  const done = el('section', 'kit-done');
  done.setAttribute('aria-label', 'After you cancel');
  const doneBody = el('div');
  done.append(el('h3', '', 'Finished cancelling?'), doneBody);
  body.append(done);

  const showClaimForm = (): void => {
    doneBody.replaceChildren();
    const lab = el('label', 'kit-date', 'Date you cancelled ');
    const date = el('input'); date.type = 'date'; date.id = 'kit-claim-date';
    const today = deps.today();
    date.value = today; date.max = today;
    lab.append(date);
    const go = el('button', '', 'I cancelled it'); go.type = 'button'; go.id = 'kit-claimed';
    go.addEventListener('click', () => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date.value) || date.value > today) { live.textContent = 'Pick a date that is not in the future.'; date.focus(); return; }
      try { deps.saveClaim(sub.id, date.value); } catch { live.textContent = 'Could not save that date.'; return; }
      const st = input.onClaimed?.(date.value) ?? input.status;
      showWhatWorked(date.value, st);
    });
    doneBody.append(lab, go);
  };

  const showWhatWorked = (iso: string, st: Status): void => {
    doneBody.replaceChildren();
    const msg = el('p', 'kit-ok', `Saved: you cancelled on ${iso}. Status: ${st.word}${st.detail ? ` (${st.detail})` : ''}.`);
    msg.id = 'kit-claim-msg';
    const fs = el('fieldset', 'kit-what');
    fs.append(el('legend', '', 'What worked?'));
    const radio = (name: string, value: string, text: string, checked = false): HTMLLabelElement => {
      const l = el('label', 'kit-radio');
      const r = el('input'); r.type = 'radio'; r.name = name; r.value = value; r.checked = checked;
      l.append(r, ` ${text}`);
      return l;
    };
    const methods = el('div', 'kit-row');
    methods.append(el('span', '', 'How did you cancel?'),
      radio('kit-method', 'online', 'Online', choice.first === 'online'), radio('kit-method', 'email', 'Email', choice.first === 'email'),
      radio('kit-method', 'phone', 'Phone', choice.first === 'phone'), radio('kit-method', 'other', 'Other'));
    const worked = el('div', 'kit-row');
    worked.append(el('span', '', 'Did it work?'), radio('kit-worked', 'yes', 'Yes', true), radio('kit-worked', 'no', 'No'));
    // Opt-in: OFF by default, never pre-ticked.
    const share = el('label', 'kit-share');
    const cb = el('input'); cb.type = 'checkbox'; cb.id = 'kit-share'; cb.checked = false;
    share.append(cb, ` ${SHARE_TEXT}`);
    if (!key) { cb.disabled = true; share.append(el('span', 'note', ' (We could not find this company\'s website name, so there is nothing to share.)')); }
    else if (deps.shareDisabledReason) { cb.disabled = true; share.append(el('span', 'note', ` (${deps.shareDisabledReason})`)); }
    const send = el('button', '', 'Done'); send.type = 'button'; send.id = 'kit-whatworked-done';
    send.addEventListener('click', async () => {
      const method = (fs.querySelector<HTMLInputElement>('input[name="kit-method"]:checked')?.value ?? 'other') as MethodKind;
      const ok = fs.querySelector<HTMLInputElement>('input[name="kit-worked"]:checked')?.value === 'yes';
      send.disabled = true;
      const sent = key && !deps.shareDisabledReason ? await deps.submitOutcome({ merchantKey: key, method, worked: ok, consented: cb.checked }) : false;
      fs.replaceChildren(el('p', 'kit-ok', cb.checked ? (sent ? 'Thank you. Your answer was shared anonymously.' : 'Could not share it right now. Nothing else was sent.') : 'Done. Nothing was shared.'));
      live.textContent = fs.textContent ?? '';
      const okEl = fs.querySelector<HTMLElement>('.kit-ok');
      if (okEl) { okEl.tabIndex = -1; okEl.focus(); }
    });
    fs.append(methods, worked, share, send);
    doneBody.append(msg, fs);
    live.textContent = msg.textContent ?? '';
    msg.tabIndex = -1;
    msg.focus();
  };

  if (input.claimedOn) {
    doneBody.append(el('p', 'kit-ok', `You marked this cancelled on ${input.claimedOn}. Status: ${input.status.word}.`));
    const again = el('button', 'ghost', 'Change the date or answer What worked?'); again.type = 'button';
    again.addEventListener('click', showClaimForm);
    doneBody.append(again);
  } else {
    showClaimForm();
  }
  btns.get(choice.first as Tab)?.focus();
}
