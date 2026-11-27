# Design: Reaper Chrome Extension

| Part | File | Job |
|---|---|---|
| Manifest | `extension/manifest.json` | MV3, `key` for a stable ID, `externally_connectable`, optional hosts |
| Service worker | `extension/background.js` | `ping`, `navigate`, `snapshot`, `click`, `close`; origin check; one tab id in `chrome.storage.session` |
| Reader | `extension/reader.js` | Injected into the tab. Returns `{elements:[{ref,role,name,inputType?,checked?}]}`; `click(doc, ref)` refuses passwords |
| Origins | `extension/origins.js` | Pure `originAllowed`, `cancelSiteOrigin` |
| Permission window | `extension/permission.html/js` | Allow button calls `chrome.permissions.request` (needs a click inside an extension page) |
| Client | `src/pipeline/extension-client.ts` | `detectExtension`, `createExtensionDriver` (a `BrowserDriver`), `connectExtension`, `EXTENSION_ID` |
| Wiring | `src/ui/app.html` | `refreshBridge` tries the extension first; `?bridgetest` uses whichever is connected and names it |
| Icons | `scripts/make-extension-icons.mts` | Draws the pixel reaper PNGs (16/48/128) |
| Pack | `scripts/pack-extension.mts` | `npm run extension:zip` |
| Check | `scripts/check-extension.mts` | Real Chromium with the unpacked extension |

Flow: approve click in app -> `createBrowserAdapter` -> `navigate` (permission window if needed) -> `snapshot` -> `confirm()` -> `click` -> repeat -> done text or a reason code.

Decisions:
- `tabs` is not declared: `tabs.create/get/remove` and `scripting` need no `tabs` permission, and it would add a "browsing history" warning.
- `storage` is declared because the service worker sleeps and must remember its tab (`storage.session`, never on disk).
- The permission request lives in an extension page because `chrome.permissions.request` needs a user gesture in the extension, and a gesture in the web page does not reach it.
- shortcut: reader sees the top frame only (no iframes or shadow DOM).

Tests: `src/pipeline/extension-client.test.ts`, `src/pipeline/extension-reader.test.ts`, `scripts/check-extension.mts`.
