# Chrome extension: done

The live site can now cancel in the user's own Chrome through an MV3 extension, "Grim Renewal Reaper". No terminal. The bridge is unchanged and is the fallback.

## Files
- `extension/`: `manifest.json`, `background.js` (service worker), `reader.js` (page reader and guarded click), `origins.js` (pure origin checks), `permission.html/js` (Allow window), `popup.html`, `ui.css`, `icons/icon{16,48,128}.png`.
- `src/pipeline/extension-client.ts`: `EXTENSION_ID`, `detectExtension`, `createExtensionDriver`, `getExtensionAdapter`, `connectExtension`.
- `src/ui/app.html`: `refreshBridge` tries the extension first (chip "Browser: Reaper extension"), then the bridge. `?bridgetest` uses whichever is connected and says "Extension test" or "Bridge test".
- `src/agents/adapters/browser.ts`: one line, five more short error codes are passed through (`permission_denied`, `tab_closed`, `stale_ref`, `extension_missing`, `bad_url`). This file was not on the owned list; the change is needed for `permission_denied`.
- Scripts: `scripts/make-extension-icons.mts` (draws the icons), `scripts/pack-extension.mts` (`npm run extension:zip` gives `dist-extension/grim-renewal-reaper.zip`, git-ignored), `scripts/check-extension.mts` (`npm run extension:check`).
- Tests: `src/pipeline/extension-client.test.ts` (8), `src/pipeline/extension-reader.test.ts` (9).
- Docs: `.kiro/specs/chrome-extension/{requirements,design,tasks}.md`, README "Browser cancels", one line in `docs/video-script.md`, one bullet in `docs/devpost.md`.

## Permissions and why
| Permission | Why |
|---|---|
| `scripting` | Inject the reader and the click into the one cancel tab |
| `storage` | `storage.session` only: the service worker sleeps and must remember its tab id. Found by the check script (without it navigate failed). |
| `optional_host_permissions` http/https | Asked at run time for ONE site, from an Allow click in the extension's own window |
| `externally_connectable` | The live site, `localhost`, `127.0.0.1` (any port). The worker checks `sender.origin` again. |
| `tabs` (the brief listed it) | Not declared. `tabs.create/get/remove` do not need it, and it adds a "browsing history" warning. |

Stable ID `fjpgbjijbglfogifpmloiangmfjogfcj` comes from the manifest `key` (public key only; the private key was discarded).

Permission design note: `chrome.permissions.request` needs a click inside an extension page, and a click in the web page does not reach it. So `navigate` opens a small extension window with an Allow button, right after the user's approve click and before the tab opens. Refusing gives `permission_denied`, then the Reaper's normal fallback to the Cancel kit.

## Results (run 2026-11-27)
- `npm test`: 38 files, 366 tests passed (17 new).
- `npx tsc --noEmit --skipLibCheck`: clean.
- `npx vite build`: built.
- `npm run extension:check` (real Chromium, new headless, extension loaded unpacked), all 18 lines PASS:
  - extension ID equals `EXTENSION_ID`
  - ping works from the app origin; from another origin (`https://evil.test`) the page gets no `chrome.runtime`, so no ping is possible
  - header chip says "Browser: Reaper extension"
  - the shipped manifest opens the permission window for a new site; "Not now" gives `permission_denied`
  - `type` returns `tool_not_allowed`
  - mock cloudbox (4 approved clicks) and designhub (2) cancel end to end through the app's `createBrowserAdapter`, on a second origin; `confirm()` asked before every click
  - `test-cancel.html` cancels in 2 clicks; `?login=1` stops with `login_required`; declining gives `user_declined`
  - the password input has no ref; a forged click fails
  - the app's `?bridgetest` button shows "Extension test: PASS"
  - no console errors from the app

## Not verified
- The real Chrome permission prompt ("Allow" then the browser bubble). Automation cannot click it, so run 2 of the check uses a temp copy of the manifest with http hosts already granted. A person must do it once: load unpacked, open the app with `?bridgetest`, press Allow.
- The origin check inside the service worker for a refused origin is covered by the pure unit test only. Chrome blocks non-matching origins before the worker sees them.
- The live GitHub Pages site and a real merchant. Only mock pages and the test page were used.
- Pages that hide buttons in iframes or shadow DOM (the reader reads the top frame only).
- Not on the Chrome Web Store (load unpacked only).
- No git commands were run; nothing is committed.
