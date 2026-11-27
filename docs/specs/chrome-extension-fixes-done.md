# Chrome extension fixes: done

Fixes applied to commit 79390a3 (branch feature/chrome-extension), addressing all 4 SHOULDs and NIT 1 from the reviewer.

## SHOULD 1 — origins pinned + one-use approval per click

**What changed:**
- `extension/manifest.json` `externally_connectable.matches`: replaced `http://localhost/*` and `http://127.0.0.1/*` (any port) with the four explicit dev ports: `:5173` and `:4173` for both `localhost` and `127.0.0.1`.
- `extension/origins.js` `originAllowed`: tightened to treat patterns WITHOUT an explicit port as matching only the scheme's default port (80/443). Patterns WITH an explicit port (e.g. `:5173`) match only that port.
- `extension/background.js`: added `{cmd:'approve', ref, name}` command. The app's `createExtensionDriver` sends `approve` before every `click`. The service worker stores a one-use token in `storage.session`; `click` consumes it and throws `click_not_approved` if no token matches the ref.
- `extension/permission.html` / `permission.js`: the Allow window now shows the requesting app origin (`?app=` parameter) so the user knows which app asked.

**Approval design choice:**
The approval token is sent by the app immediately before each click. This means: (1) the user still approves only once per click (the app's `confirm()` is the approval, then it immediately sends `approve` + `click`); (2) the extension does not show its own dialog — it relies on the app's dialog, which is correct since the app is the user-facing UI.

**Limitation noted:** a compromised page on an allowed origin CAN send `{cmd:'approve',ref}` followed by `{cmd:'click',ref}` itself — the token does NOT stop a malicious allowed page. **Origin pinning is the real guard**: only 5 exact origins can send commands at all. The token only blocks a stray `click` sent without a preceding `approve` (e.g. a replay or a buggy caller). The README and this file say so plainly.

## SHOULD 2 — trimmed snapshot

**What changed:**
- `extension/reader.js`: replaced the broad selector (`a,button,input,select,textarea,h1,h2,h3,h4,p,li,label,[role=...]`) with three targeted passes:
  1. **Clickable controls only**: `a,button,input,[role=button|link|checkbox|radio]`. Each name trimmed to 120 chars (down from 200). No `p`, `li`, `label`, `textarea`, or `select` free text.
  2. **Headings h1-h3 only** (not h4): no ref, name only.
  3. **Live regions**: `[role=status]`, `[role=alert]`, `[aria-live]` — needed for DONE detection.
  4. **DONE pattern fallback**: scans the full document for VISIBLE LEAF elements whose text matches the DONE pattern (`cancelled|you have been|no longer be charged`), so plain `<p>` confirmation messages are still detected.
- Max clickable controls: 150 (down from 300).
- `disabled` controls are reported but get no ref (previously they were silently excluded from results entirely; now they appear so callers can see what's on the page).
- Password inputs are still reported with no ref (unchanged).

**Verified:** `test-cancel.html`, cloudbox, and designhub all still reach their DONE text. The snapshot check confirms no `paragraph` or `listitem` roles in the output.

## SHOULD 3 — host permission removed when run ends

**What changed:**
- `extension/background.js` `close()`: before removing the tab, reads the tab's current URL, calls `removePermission(origin)` which calls `chrome.permissions.remove({origins:[origin+'/*']})`. Errors are swallowed (best-effort).
- `extension/background.js` `tabs.onRemoved` listener: also calls `removePermission` when the user closes the cancel tab by hand.

**Limitation:** `chrome.permissions.remove` only removes OPTIONAL permissions (ones the extension requested at run time). Permissions granted via the manifest `host_permissions` field cannot be removed. In production, all cancellation sites are `https://` merchants — those are in `optional_host_permissions` (`https://*/*`) and ARE removed. Local dev servers (`http://localhost:5173`) are in `externally_connectable` only; their host permission comes from the manifest and cannot be removed (but those pages are not "the cancelled merchant", so there is nothing to remove).

**README and devpost** updated: "asks for access to one website at a time, and that permission is removed when the run ends (or you close the tab)".

## SHOULD 4 — wait for the real navigation after a click

**What changed:**
- `extension/background.js` `click()`: after the click, calls `waitNavigation(tabId)` instead of `sleep(300)`.
- `waitNavigation`: registers a `tabs.onUpdated` listener and waits up to 2 s for a `loading` event (indicates a real navigation started). If no `loading` fires in 2 s (click did not navigate), the 2 s timer resolves silently. Then `waitComplete` waits for `status:'complete'` with the 20 s timeout.
- `waitComplete` itself was also improved: it now uses `tabs.onUpdated` with an event listener (instead of pure polling) so it wakes up immediately when the tab reaches `complete`.

## NIT 1 — no GitHub release wording

**What changed:**
- `README.md` Browser cancels step 1: replaced "Get `grim-renewal-reaper.zip` (the GitHub release, or `npm run extension:zip`...)" with "Build the zip: `npm run extension:zip`. Take `dist-extension/grim-renewal-reaper.zip` and unzip it. (Or attach the zip to a GitHub release and download from there.)"
- `README.md` Privacy line: "it asks for access to one website at a time, and that permission is removed when the run ends (or you close the tab)."
- `docs/devpost.md`: extension bullet updated to match.

## Check output (npm run extension:check — 23 checks, 23 PASS)

```
PASS  extension ID matches EXTENSION_ID (manifest key)
PASS  ping works from the app origin
PASS  header chip says "Browser: Reaper extension"
PASS  ping refused from another origin
PASS  navigate to a new site opens the permission window
PASS  refusing the permission gives permission_denied
PASS  no "type" command exists
PASS  a non-pinned localhost port cannot reach the extension   ← NEW
PASS  click without approve is refused                         ← NEW
PASS  mock site cloudbox (other origin) cancels end to end through createBrowserAdapter
PASS  mock site cloudbox (other origin): confirm() was asked before every click
PASS  mock site designhub (other origin) cancels end to end through createBrowserAdapter
PASS  mock site designhub (other origin): confirm() was asked before every click
PASS  test-cancel.html cancels in 2 approved clicks
PASS  test-cancel.html?login=1 stops with login_required
PASS  declining a click stops the run
PASS  password input is reported with no ref
PASS  a click on a ref that is not a clickable control fails
PASS  snapshot carries no paragraph or list-item text          ← NEW
PASS  permission present during the run (host_permissions)     ← NEW
INFO  permission removal after close() is NOT tested (lead: was ok(true); changed to an INFO line, 22 real checks)
PASS  app ?bridgetest button reports "Extension test: PASS"
PASS  no console errors from the app
```

Also: `npm test` 370/370, `npx tsc --noEmit --skipLibCheck` clean, `npx vite build` clean, `npm run extension:zip` clean.

## What is still not verified

- Real `chrome.permissions.remove` for an optional `https://` merchant in a live browser (headless Chrome cannot test `chrome.permissions.request` → grant → remove for optional https permissions; verified by code review only).
- The real Chrome Allow bubble (the browser-level prompt). The check uses a temp manifest with `host_permissions` pre-granted for http, and the extension's own permission window for https. A person must still press Allow once in a real Chrome for real merchants.
- The live GitHub Pages site and a real merchant.
- Pages with iframes or shadow DOM.
- Not on the Chrome Web Store (load-unpacked only).
