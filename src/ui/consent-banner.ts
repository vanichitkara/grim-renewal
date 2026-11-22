/**
 * OAuth consent banner — shown before the Gmail OAuth flow.
 *
 * PRIVACY rule: the exact consent text below is non-negotiable.
 * It must appear on the same screen as the "Connect Gmail" button.
 * Source: privacy.md § Consent UI.
 */

/** All focusable element selectors for the focus trap. */
const FOCUSABLE = 'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * Show the OAuth consent modal.
 * Inserts a modal into document.body. The modal is removed when the user
 * approves or denies, and focus returns to the element that was active before.
 *
 * @param onApprove - Called when the user clicks "Connect Gmail".
 * @param onDeny    - Called when the user clicks "Cancel" or presses Escape.
 */
export function showConsentBanner(onApprove: () => void, onDeny: () => void): void {
  // Remember where focus was so we can restore it on close.
  const previousFocus = document.activeElement as HTMLElement | null;

  // ── Build modal DOM ───────────────────────────────────────────────────────

  const overlay = document.createElement('div');
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-labelledby', 'consent-title');
  overlay.setAttribute('aria-describedby', 'consent-desc');
  overlay.style.cssText = [
    'position:fixed',
    'inset:0',
    'display:flex',
    'align-items:center',
    'justify-content:center',
    'background:rgba(18,14,28,0.85)',   // --night with alpha
    'z-index:9999',
  ].join(';');

  const dialog = document.createElement('div');
  dialog.style.cssText = [
    'background:#1c162b',               // --crypt
    'border:1px solid #2a2240',         // --stone
    'border-radius:8px',
    'padding:2rem',
    'max-width:28rem',
    'width:calc(100% - 2rem)',
    'color:#ece6d6',                     // --bone
    'font-family:system-ui,sans-serif',
  ].join(';');

  const title = document.createElement('h2');
  title.id = 'consent-title';
  title.textContent = 'Before we connect to Gmail';
  title.style.cssText = [
    'margin:0 0 1rem',
    'font-size:1.1rem',
    'color:#ece6d6',
  ].join(';');

  // PRIVACY: exact text required by privacy.md — do not alter.
  const desc = document.createElement('p');
  desc.id = 'consent-desc';
  desc.textContent =
    'The Reaper only reads receipts. We search your inbox for billing emails, ' +
    'extract the merchant name, amount, and date, and discard the rest. ' +
    'We never read your personal email, store message content, or share your data.';
  desc.style.cssText = [
    'margin:0 0 1.5rem',
    'line-height:1.5',
    'color:#a59cbc',                     // --mist
    'font-size:0.95rem',
  ].join(';');

  const buttonRow = document.createElement('div');
  buttonRow.style.cssText = 'display:flex;gap:0.75rem;justify-content:flex-end';

  const cancelBtn = document.createElement('button');
  cancelBtn.textContent = 'Cancel';
  cancelBtn.style.cssText = [
    'padding:0.5rem 1.25rem',
    'border:1px solid #2a2240',
    'border-radius:4px',
    'background:transparent',
    'color:#a59cbc',
    'cursor:pointer',
    'font-size:0.95rem',
    // Focus ring: 2px solid --coin (accessibility rule)
    'outline-offset:2px',
  ].join(';');
  cancelBtn.addEventListener('focus', () => {
    cancelBtn.style.outline = '2px solid #f2b84b';
  });
  cancelBtn.addEventListener('blur', () => {
    cancelBtn.style.outline = '';
  });

  const approveBtn = document.createElement('button');
  approveBtn.textContent = 'Connect Gmail';
  approveBtn.style.cssText = [
    'padding:0.5rem 1.25rem',
    'border:none',
    'border-radius:4px',
    'background:#8fc25a',               // --rot (action colour)
    'color:#120e1c',
    'cursor:pointer',
    'font-weight:600',
    'font-size:0.95rem',
    'outline-offset:2px',
  ].join(';');
  approveBtn.addEventListener('focus', () => {
    approveBtn.style.outline = '2px solid #f2b84b';
  });
  approveBtn.addEventListener('blur', () => {
    approveBtn.style.outline = '';
  });

  buttonRow.appendChild(cancelBtn);
  buttonRow.appendChild(approveBtn);

  dialog.appendChild(title);
  dialog.appendChild(desc);
  dialog.appendChild(buttonRow);
  overlay.appendChild(dialog);

  // ── Cleanup helper ────────────────────────────────────────────────────────

  function close(): void {
    overlay.remove();
    previousFocus?.focus();
  }

  // ── Event handlers ────────────────────────────────────────────────────────

  approveBtn.addEventListener('click', () => {
    close();
    onApprove();
  });

  cancelBtn.addEventListener('click', () => {
    close();
    onDeny();
  });

  // Escape key closes and denies.
  overlay.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      onDeny();
    }

    // Focus trap: Tab / Shift+Tab cycles within the dialog only.
    if (e.key === 'Tab') {
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(FOCUSABLE),
      ).filter((el) => !el.hasAttribute('disabled'));

      if (focusable.length === 0) {
        e.preventDefault();
        return;
      }

      const first = focusable[0]!;
      const last = focusable[focusable.length - 1]!;

      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    }
  });

  // Click on the overlay backdrop denies (but not on the dialog itself).
  overlay.addEventListener('click', (e: MouseEvent) => {
    if (e.target === overlay) {
      close();
      onDeny();
    }
  });

  // ── Mount and focus ───────────────────────────────────────────────────────

  document.body.appendChild(overlay);

  // Focus the approve button first so keyboard users can connect with one Enter.
  approveBtn.focus();
}
