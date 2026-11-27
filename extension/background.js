// Service worker. Talks only to the Grim Renewal app origins listed in the manifest.
// Privacy: never logs page text or URLs; never types; one tab, the one it opened.
import { originAllowed, cancelSiteOrigin } from './origins.js';

const VERSION = chrome.runtime.getManifest().version;
const APP_ORIGINS = chrome.runtime.getManifest().externally_connectable.matches;
const LOAD_TIMEOUT_MS = 20000;
const PERMISSION_TIMEOUT_MS = 120000;
const KEY = 'reaperTabId';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getTabId() {
  return (await chrome.storage.session.get(KEY))[KEY] ?? null;
}
async function setTabId(id) {
  if (id === null) await chrome.storage.session.remove(KEY);
  else await chrome.storage.session.set({ [KEY]: id });
}

async function waitComplete(tabId) {
  const end = Date.now() + LOAD_TIMEOUT_MS;
  while (Date.now() < end) {
    const t = await chrome.tabs.get(tabId);
    if (t.status === 'complete') return;
    await sleep(150);
  }
  throw new Error('browser_timeout');
}

/** Shows our own small window with an Allow button: chrome.permissions.request needs a click in an extension page. */
async function askPermission(origin) {
  const url = chrome.runtime.getURL('permission.html') + '?origin=' + encodeURIComponent(origin);
  const win = await chrome.windows.create({ url, type: 'popup', width: 440, height: 300, focused: true });
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

async function navigate(url) {
  const origin = cancelSiteOrigin(url);
  if (!origin) throw new Error('bad_url');
  if (!(await chrome.permissions.contains({ origins: [origin + '/*'] }))) {
    if (!(await askPermission(origin))) throw new Error('permission_denied');
  }
  const old = await getTabId();
  if (old !== null) await chrome.tabs.remove(old).catch(() => {});
  const tab = await chrome.tabs.create({ url, active: true });
  await setTabId(tab.id);
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
    // Most often: the page moved to a site the user did not allow.
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

async function click(ref) {
  if (typeof ref !== 'string') throw new Error('bad_args');
  const tabId = await liveTab();
  const res = await inject(tabId, {
    func: (r) => (window.__grimReaper ? window.__grimReaper.click(document, r) : 'stale_ref'),
    args: [ref],
  });
  const code = res[0] && res[0].result;
  if (code !== 'ok') throw new Error(code === 'password_refused' ? 'password_refused' : 'stale_ref');
  await sleep(300); // let a click that navigates start loading
}

async function close() {
  const id = await getTabId();
  if (id !== null) await chrome.tabs.remove(id).catch(() => {});
  await setTabId(null);
}

async function handle(msg) {
  switch (msg && msg.cmd) {
    case 'ping': return { version: VERSION };
    case 'navigate': await navigate(msg.url); return {};
    case 'snapshot': return await snapshot();
    case 'click': await click(msg.ref); return {};
    case 'close': await close(); return {};
    default: throw new Error('tool_not_allowed'); // includes "type": the extension never types
  }
}

chrome.runtime.onMessageExternal.addListener((msg, sender, reply) => {
  if (!originAllowed(sender.origin || '', APP_ORIGINS)) {
    reply({ ok: false, error: 'unauthorized' });
    return false;
  }
  handle(msg).then(
    (r) => reply({ ok: true, ...r }),
    (e) => reply({ ok: false, error: e instanceof Error && /^[a-z_]{3,40}$/.test(e.message) ? e.message : 'browser_error' }),
  );
  return true; // async reply
});

// The user closed our tab by hand: forget it.
chrome.tabs.onRemoved.addListener(async (id) => {
  if ((await getTabId()) === id) await setTabId(null);
});
