# Tasks: Reaper Chrome Extension

- [x] 1. Extension
  - [x] 1.1 Manifest with key, optional hosts, `externally_connectable` (`extension/manifest.json`)
  - [x] 1.2 Service worker commands and origin check (`extension/background.js`)
  - [x] 1.3 Page reader and guarded click (`extension/reader.js`)
  - [x] 1.4 Permission window (`extension/permission.html`, `permission.js`)
  - [x] 1.5 Pixel reaper icons (`scripts/make-extension-icons.mts`)
- [x] 2. App
  - [x] 2.1 `src/pipeline/extension-client.ts`
  - [x] 2.2 Header chip, `?bridgetest` wiring in `src/ui/app.html`
  - [x] 2.3 Extra error codes in `src/agents/adapters/browser.ts`
- [x] 3. Tests
  - [x] 3.1 Unit tests for the client and the reader
  - [x] 3.2 Real Chromium check `scripts/check-extension.mts`
  - [ ] 3.3 A person presses "Allow" in the real permission prompt (not automatable)
- [x] 4. Package and docs
  - [x] 4.1 `npm run extension:zip`
  - [x] 4.2 README "Browser cancels", video script, Devpost
