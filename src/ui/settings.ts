/**
 * Settings panel: account (sign out) and sound (on/off, volume, test).
 * Opened from the header "Settings" button. A native <dialog>: Escape closes it, focus is trapped.
 * Text is set with textContent only (the email comes from the user or Google).
 */
import { isMuted, setMuted, getVolume, setVolume, onSoundChange, unlockAudio, playTestSound } from '../animation/sound.ts';

/** Keys that belong to the signed-in account. Sign out forgets them; device prefs (sound, view) stay. */
export const ACCOUNT_KEYS = ['grim_auth', 'grim_subs', 'grim_claims', 'grim_celebrated'] as const;

export interface SettingsOpts {
  /** The email shown under Account, or null when nobody is signed in (demo, locked page). */
  getEmail: () => string | null;
  /** Revoke and clear. The panel reloads the page after it resolves. */
  onSignOut: () => Promise<void>;
}

const mk = <K extends keyof HTMLElementTagNameMap>(tag: K, text?: string): HTMLElementTagNameMap[K] => {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  return e;
};

export function initSettings(openBtn: HTMLButtonElement, opts: SettingsOpts): HTMLDialogElement {
  const dlg = mk('dialog');
  dlg.id = 'settings';
  dlg.className = 'settings';
  dlg.setAttribute('aria-labelledby', 'settingsH');

  const head = mk('div'); head.className = 'settings-head';
  const h = mk('h2', 'Settings'); h.id = 'settingsH';
  const close = mk('button', 'Close'); close.type = 'button'; close.className = 'ghost';
  head.append(h, close);

  // Account
  const acct = mk('section'); acct.setAttribute('aria-labelledby', 'setAcctH');
  const acctH = mk('h3', 'Account'); acctH.id = 'setAcctH';
  const who = mk('p'); who.id = 'setWho'; who.className = 'note';
  const out = mk('button', 'Sign out'); out.type = 'button'; out.id = 'signOut';
  const outNote = mk('p', 'Signs you out of Grim Renewal and forgets the scan saved on this device.');
  outNote.className = 'note';
  acct.append(acctH, who, out, outNote);

  // Sound
  const snd = mk('section'); snd.setAttribute('aria-labelledby', 'setSndH');
  const sndH = mk('h3', 'Sound'); sndH.id = 'setSndH';
  const onLbl = mk('label'); onLbl.className = 'check'; onLbl.htmlFor = 'setSoundOn';
  const on = mk('input'); on.type = 'checkbox'; on.id = 'setSoundOn';
  onLbl.append(on, document.createTextNode(' Play sounds'));
  const volLbl = mk('label', 'Volume '); volLbl.htmlFor = 'setVolume';
  const volOut = mk('output'); volOut.id = 'setVolumeOut'; volOut.htmlFor.add('setVolume');
  const vol = mk('input'); vol.type = 'range'; vol.id = 'setVolume'; vol.min = '0'; vol.max = '100'; vol.step = '5';
  volLbl.append(volOut, vol);
  const test = mk('button', 'Play a test sound'); test.type = 'button'; test.className = 'ghost'; test.id = 'setTestSound';
  const testMsg = mk('p'); testMsg.className = 'note'; testMsg.id = 'setTestMsg'; testMsg.setAttribute('aria-live', 'polite');
  snd.append(sndH, onLbl, volLbl, test, testMsg);

  // Inner box carries the padding, so only a click outside it hits the dialog (the backdrop).
  const body = mk('div'); body.className = 'settings-body';
  body.append(head, acct, snd);
  dlg.append(body);
  document.body.append(dlg);

  const paintSound = (m: boolean, v: number): void => {
    on.checked = !m;
    vol.value = String(Math.round(v * 100));
    vol.disabled = m;
    test.disabled = m;
    volOut.textContent = `${Math.round(v * 100)}%`;
  };
  paintSound(isMuted(), getVolume());
  onSoundChange((s) => paintSound(s.muted, s.volume));

  on.addEventListener('change', () => { setMuted(!on.checked); if (on.checked) unlockAudio(); });
  vol.addEventListener('input', () => setVolume(Number(vol.value) / 100));
  test.addEventListener('click', async () => {
    const r = await playTestSound();
    testMsg.textContent = r === 'played'
      ? (getVolume() === 0 ? 'Volume is at 0%. Turn it up to hear it.' : 'Playing a knock and a coin.')
      : r === 'muted' ? 'Sound is off. Tick Play sounds first.'
      : 'The browser blocked sound. Check the tab is not muted, then try again.';
  });

  const paintAccount = (): void => {
    const email = opts.getEmail();
    who.textContent = email ? `Signed in as ${email}` : 'Not signed in.';
    out.hidden = !email;
    outNote.hidden = !email;
  };

  out.addEventListener('click', async () => {
    out.disabled = true;
    out.textContent = 'Signing out…';
    try { await opts.onSignOut(); } finally { location.reload(); }
  });

  close.addEventListener('click', () => dlg.close());
  // Click on the backdrop closes too.
  dlg.addEventListener('click', (e) => { if (e.target === dlg) dlg.close(); });
  dlg.addEventListener('close', () => openBtn.focus());
  openBtn.addEventListener('click', () => { paintAccount(); dlg.showModal(); close.focus(); });
  return dlg;
}

/** Forget everything that belongs to the account. */
export function forgetAccount(store: Pick<Storage, 'removeItem'>): void {
  ACCOUNT_KEYS.forEach((k) => store.removeItem(k));
}
