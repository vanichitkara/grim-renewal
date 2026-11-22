/**
 * Approval dialog — shown before the Reaper is allowed to cancel anything.
 *
 * Spec: cancellation-state-machine.md § User Approval Gate.
 * The caller emits `approved` ONLY from onApprove; skip / Escape / backdrop do not.
 * Same focus-trap and Escape pattern as consent-banner.ts.
 * All text is set with textContent (merchant names come from email).
 */

import type { Subscription } from '../types.ts';

const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/** Human label for the cancel method the Reaper will use. Pure; unit-tested. */
export function cancelMethodLabel(sub: Pick<Subscription, 'phoneOnly' | 'cancelUrl'>): string {
  if (sub.phoneOnly) return 'Boss Door: phone call plan';
  if (sub.cancelUrl) return 'Browser, you approve each step';
  return 'Not automatable, guided plan';
}

function btnStyle(bg: string, color: string, border: string): string {
  return [
    'padding:0.5rem 1.25rem',
    `border:${border}`,
    'border-radius:4px',
    `background:${bg}`,
    `color:${color}`,
    'cursor:pointer',
    'font-weight:600',
    'font-size:0.95rem',
    'outline-offset:2px',
  ].join(';');
}

/**
 * @param onApprove - "Approve cancellation" clicked.
 * @param onSkip    - "Skip for now", Escape, or backdrop click.
 */
export function showApprovalDialog(
  sub: Subscription,
  onApprove: () => void,
  onSkip: () => void,
): void {
  const previousFocus = document.activeElement as HTMLElement | null;

  const overlay = document.createElement('div');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'approval-title');
  overlay.setAttribute('aria-describedby', 'approval-desc');
  overlay.style.cssText =
    'position:fixed;inset:0;display:flex;align-items:center;justify-content:center;' +
    'background:rgba(18,14,28,0.85);z-index:9999';

  const dialog = document.createElement('div');
  dialog.style.cssText =
    'background:#1c162b;border:1px solid #2a2240;border-radius:8px;padding:2rem;' +
    'max-width:28rem;width:calc(100% - 2rem);color:#ece6d6;font-family:system-ui,sans-serif';

  const title = document.createElement('h2');
  title.id = 'approval-title';
  title.textContent = 'Send the Reaper?';
  title.style.cssText = 'margin:0 0 1rem;font-size:1.1rem;color:#ece6d6';

  const desc = document.createElement('p');
  desc.id = 'approval-desc';
  desc.textContent = 'Nothing happens until you approve. Here is what the Reaper will do.';
  desc.style.cssText = 'margin:0 0 1rem;line-height:1.5;color:#a59cbc;font-size:0.95rem';

  const rows: Array<[string, string]> = [
    ['Merchant', sub.merchant],
    ['Plan', sub.plan ?? 'Unknown'],
    ['Monthly amount', '$' + sub.monthlyAmount.toFixed(2)],
    ['Cancel method', cancelMethodLabel(sub)],
  ];
  const list = document.createElement('dl');
  list.style.cssText = 'margin:0 0 1.5rem;display:grid;grid-template-columns:auto 1fr;gap:0.4rem 1rem';
  for (const [k, v] of rows) {
    const dt = document.createElement('dt');
    dt.textContent = k;
    dt.style.cssText = 'color:#a59cbc';
    const dd = document.createElement('dd');
    dd.textContent = v;
    dd.style.cssText = 'margin:0;color:#ece6d6;overflow-wrap:anywhere';
    list.append(dt, dd);
  }

  const buttonRow = document.createElement('div');
  buttonRow.style.cssText = 'display:flex;gap:0.75rem;justify-content:flex-end';

  const skipBtn = document.createElement('button');
  skipBtn.type = 'button';
  skipBtn.textContent = 'Skip for now';
  skipBtn.style.cssText = btnStyle('transparent', '#a59cbc', '1px solid #2a2240');

  const approveBtn = document.createElement('button');
  approveBtn.type = 'button';
  approveBtn.textContent = 'Approve cancellation';
  approveBtn.style.cssText = btnStyle('#e0574f', '#120e1c', 'none');

  for (const b of [skipBtn, approveBtn]) {
    b.addEventListener('focus', () => { b.style.outline = '2px solid #f2b84b'; });
    b.addEventListener('blur', () => { b.style.outline = ''; });
  }

  buttonRow.append(skipBtn, approveBtn);
  dialog.append(title, desc, list, buttonRow);
  overlay.appendChild(dialog);

  function close(): void {
    overlay.remove();
    previousFocus?.focus();
  }

  approveBtn.addEventListener('click', () => { close(); onApprove(); });
  skipBtn.addEventListener('click', () => { close(); onSkip(); });

  overlay.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      onSkip();
    }
    if (e.key === 'Tab') {
      const focusable = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE))
        .filter((el) => !el.hasAttribute('disabled'));
      if (focusable.length === 0) { e.preventDefault(); return; }
      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    }
  });

  overlay.addEventListener('click', (e: MouseEvent) => {
    if (e.target === overlay) { close(); onSkip(); }
  });

  document.body.appendChild(overlay);
  // Focus the safe choice: destructive action needs a deliberate Tab or click.
  skipBtn.focus();
}
