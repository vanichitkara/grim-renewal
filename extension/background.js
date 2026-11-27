// Service worker. Talks only to the Grim Renewal app origins listed in the manifest.
// Privacy: never logs page text or URLs; never types; one tab, the one it opened.
import { originAllowed, cancelSiteOrigin } from './origins.js';

const VERSION = chrome.runtime.getManifest().version;
const APP_ORIGINS = chrome.runtime.getManifest().externally_connectable.matches;
const LOAD_TIMEOUT_MS = 20000;
const PERMISSION_TIMEOUT_MS = 120000;
const KEY = 'reaperTabId';
// One-use approval token: the app sends {cmd:'approve', ref, name} before each click.
// The token is stored here and consumed by the next 'click' command.
// A new 'approve' replaces any unused one (belt-and-suspenders; adapter always approves first).
const APPROVE_KEY = 'reaperApproveToken';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getTabId() {
  return (await chrome.storage.session.get(KEY))[KEY] ?? null;
}
async function setTabId(id) {
  if (id === null) await chrome.storage.session.remove(KEY);
  else await chrome.storage.session.set({ [KEY]: id });
}

async function getToken() {
  return (await chrome.storage.session.get(APPROVE_KEY))[APPROVE_KEY] ?? null;
}
async function setToken(t) {
  if (t === null) await chrome.storage.session.remove(APPROVE_KEY);
  else await chrome.storage.session.set({ [APPROVE_KEY]: t });
}

/** Wait for status:'complete' via onUpdated, falling back to polling if needed. */
async function waitComplete(tabId) {
  const tab = await chrome.tabs.get(tabId).catch(() => null);
  if (!tab) throw new Error('tab_closed');
  if (tab.status === 'complete') return;

  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(onUpdated);
      reject(new Error('browser_timeout'));
    }, LOAD_TIMEOUT_MS);

    function onUpdated(id, info) {
      if (id !== tabId) return;
      if (info.status === 'complete') {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(onUpdated);
        resolve();
      }
    }
    chrome.tabs.onUpdated.addListener(onUpdated);
  });
}

/** Wait for 'loading' then 'complete' — detects a real navigation after a click. */
async function waitNavigation(tabId) {
  await new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(onUpdated);
      resolve(); // navigation may not have happened; fall through to waitComplete
    }, 2000);

    let sawLoading = false;
    function onUpdated(id, info) {
      if (id !== tabId) return;
      if (!sawLoading && info.status === 'loading') { sawLoading = true; }
      if (sawLoading && info.status === 'complete') {
        clearTimeout(timer);
        chrome.tabs.onUpdated.removeListener(onUpdated);
        resolve();
      }
    }
    chrome.tabs.onUpdated.addListener(onUpdated);
  });

  await waitComplete(tabId);
}

/** Shows our own small window with an Allow button and the requesting app origin.
 *  chrome.permissions.request needs a click in an extension page. */
async function askPermission(origin, appOrigin) {
  const url = chrome.runtime.getURL('permission.html')
    + '?origin=' + encodeURIComponent(origin)
    + '&app=' + encodeURIComponent(appOrigin || '');
  const win = await chrome.windows.create({ url, type: 'popup', width: 440, height: 320, focused: true });
  return new Promise((resolve) => {
    let done = false;
    const finish = (granted) => {
      if (done) return;
      done = true;
      chrome.runtime.onMessage.removeListener(onMsg);
      chrome.windows.onRemoved.removeListener(onGone);
      clearTimeout(timer);
      if (win.id !== undefined) chrome.windows.remove(win.id).catch(() => {});
      resolve(granted);
    };
    const onMsg = (m, sender) => {
      if (sender.id === chrome.runtime.id && m && m.type === 'permission_result' && m.origin === origin) finish(m.granted === true);
    };
    const onGone = (id) => { if (id === win.id) finish(false); };
    const timer = setTimeout(() => finish(false), PERMISSION_TIMEOUT_MS);
    chrome.runtime.onMessage.addListener(onMsg);
    chrome.windows.onRemoved.addListener(onGone);
  });
}

/** Remove the host permission for this origin (called on close). */
async function removePermission(origin) {
  if (!origin) return;
  try {
    await chrome.permissions.remove({ origins: [origin + '/*'] });
  } catch {
    // Best-effort; not fatal.
  }
}

async function navigate(url, appOrigin) {
  const origin = cancelSiteOrigin(url);
  if (!origin) throw new Error('bad_url');
  if (!(await chrome.permissions.contains({ origins: [origin + '/*'] }))) {
    if (!(await askPermission(origin, appOrigin))) throw new Error('permission_denied');
  }
  const old = await getTabId();
  if (old !== null) await chrome.tabs.remove(old).catch(() => {});
  const tab = await chrome.tabs.create({ url, active: true });
  await setTabId(tab.id);
  // Wait for first load to complete.
  await waitComplete(tab.id);
}

async function liveTab() {
  const id = await getTabId();
  if (id === null) throw new Error('tab_closed');
  try {
    await chrome.tabs.get(id);
  } catch {
    await setTabId(null);
    throw new Error('tab_closed');
  }
  return id;
}

async function inject(tabId, details) {
  try {
    return await chrome.scripting.executeScript({ target: { tabId }, ...details });
  } catch {
    throw new Error('permission_denied');
  }
}

async function snapshot() {
  const tabId = await liveTab();
  await waitComplete(tabId);
  const res = await inject(tabId, { files: ['reader.js'] });
  const out = res[0] && res[0].result;
  if (!out || !Array.isArray(out.elements)) throw new Error('browser_error');
  return out;
}

async function approve(ref, name) {
  // Store a one-use token so the next 'click' call knows the user approved it.
  await setToken({ ref, name });
}

async function click(ref) {
  if (typeof ref !== 'string') throw new Error('bad_args');
  // Consume the approval token; refuse if none or if it's for a different ref.
  const token = await getToken();
  await setToken(null);
  if (!token || token.ref !== ref) throw new Error('click_not_approved');
  const tabId = await liveTab();
  const res = await inject(tabId, {
    func: (r) => (window.__grimReaper ? window.__grimReaper.click(document, r) : 'stale_ref'),
    args: [ref],
  });
  const code = res[0] && res[0].result;
  if (code !== 'ok') throw new Error(code === 'password_refused' ? 'password_refused' : 'stale_ref');
  // SHOULD 4: wait for a real navigation (loading→complete) with 2 s grace, then confirm complete.
  await waitNavigation(tabId);
}

async function close() {
  const id = await getTabId();
  // SHOULD 3: remove the host permission for the tab's origin before closing.
  if (id !== null) {
    const tab = await chrome.tabs.get(id).catch(() => null);
    if (tab && tab.url) {
      const origin = cancelSiteOrigin(tab.url);
      await removePermission(origin);
    }
    await chrome.tabs.remove(id).catch(() => {});
  }
  await setTabId(null);
  await setToken(null);
}

async function handle(msg, senderOrigin) {
  switch (msg && msg.cmd) {
    case 'ping': return { version: VERSION };
    case 'navigate': await navigate(msg.url, senderOrigin); return {};
    case 'approve': await approve(msg.ref, msg.name); return {};
    case 'snapshot': return await snapshot();
    case 'click': await click(msg.ref); return {};
    case 'close': await close(); return {};
    // Test-only: used by check-extension.mts to verify permission state.
    case 'has_permission': {
      const has = msg.origin
        ? await chrome.permissions.contains({ origins: [msg.origin + '/*'] })
        : false;
      return { has };
    }
    default: throw new Error('tool_not_allowed');
  }
}

chrome.runtime.onMessageExternal.addListener((msg, sender, reply) => {
  if (!originAllowed(sender.origin || '', APP_ORIGINS)) {
    reply({ ok: false, error: 'unauthorized' });
    return false;
  }
  handle(msg, sender.origin || '').then(
    (r) => reply({ ok: true, ...r }),
    (e) => reply({ ok: false, error: e instanceof Error && /^[a-z_]{3,40}$/.test(e.message) ? e.message : 'browser_error' }),
  );
  return true; // async reply
});

// The user closed our tab by hand: forget the tab AND remove the host permission.
chrome.tabs.onRemoved.addListener(async (id) => {
  if ((await getTabId()) !== id) return;
  const tab = await chrome.tabs.get(id).catch(() => null);
  if (tab && tab.url) {
    const origin = cancelSiteOrigin(tab.url);
    await removePermission(origin);
  }
  await setTabId(null);
  await setToken(null);
});
