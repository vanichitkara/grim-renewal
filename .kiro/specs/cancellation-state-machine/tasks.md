# Tasks: Cancellation State Machine (Reaper)

- [x] 1. State machine core
  - [x] 1.1 Define `CancellationState`, `CancelMethod`, `AgentEvent` in `src/types.ts`
  - [x] 1.2 Event bus in `src/agents/event-bus.ts`
  - [x] 1.3 `requestCancel`, `run`, transition log in `src/agents/reaper.ts`
  - [x] 1.4 Tests in `src/agents/reaper.test.ts`
  - _Requirements: 1.1, 1.2, 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 3.1, 3.2, 3.3, 5.1, 5.2, 7.1_

- [x] 2. Approval dialog
  - [x] 2.1 `showApprovalDialog`, `cancelMethodLabel` in `src/ui/approval-dialog.ts`
  - [x] 2.2 Tests in `src/ui/approval-dialog.test.ts`
  - _Requirements: 1.3, 1.4_

- [ ] 3. Automatic cancel methods
  - [x] 3.1 Browser adapter with confirm before each step (`src/agents/adapters/browser.ts`)
  - [x] 3.2 Simulated adapter and mock merchant pages (`simulated.ts`, `mock-registry.ts`, `iframe-driver.ts`, `public/mock/`)
  - [x] 3.3 Cancel Player panel (`src/ui/cancel-player.ts`)
  - [x] 3.4 Local bridge to a real browser (`server/browser-bridge.ts`, `src/server/bridge-core.ts`, `src/pipeline/bridge-client.ts`)
  - [ ] 3.5 Direct API adapter (the `api` slot is `not_configured` by default; no adapter written)
  - [ ] 3.6 Unsubscribe-header adapter (the `unsubscribe_header` slot is `not_configured`; no adapter written)
  - [ ] 3.7 Resume the browser adapter after sign-in
  - _Requirements: 2.1, 2.3, 4.1, 4.2, 4.3_

- [x] 4. Revenants
  - [x] 4.1 `detectRevenants`, `emitRevenants` in `src/agents/revenant.ts`
  - [x] 4.2 Tests in `src/agents/revenant.test.ts`
  - [ ] 4.3 Revenant dispute flow in the UI (the dispute letter text exists in `src/kit/drafts.ts`; see `cancel-kit` tasks)
  - _Requirements: 6.1, 6.2_

- [ ] 5. Open review risks
  - [ ] 5.1 A failed cancel shows "Cancel started" in the status word
  - [ ] 5.2 Bridge probe on public pages
  - _Requirements: 3.1_
