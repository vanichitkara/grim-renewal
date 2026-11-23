# Design: Cancellation State Machine (Reaper)

## Overview
One in-memory state map per subscription id, driven by events on a shared bus. The UI and the animation read the same events. See `original-spec.md` for the first written spec.

## Architecture
```
UI "Send the Reaper" -> requestCancel(sub)         queued -> walking -> knocking
user approves        -> emit('approved')           opening -> cancelling
adapters (api, browser, unsubscribe_header)        success: reaping -> dead, cancel_ok
all fail / phoneOnly -> boss, cancel_fail          user phones -> boss_resolved -> dead
new scan             -> emitRevenants()            dead -> idle, 'revenant'
```
The animation steering file (`.kiro/steering/animation.md`) says animation moves only on `AgentEvent`s, never ahead of the result.

## Components and Interfaces
- `src/agents/reaper.ts`: `requestCancel(sub)`, `setAdapters(partial)`, `getState(id)`, `getTransitionLog()`, `resetForRevenant(id)`, `_resetForTest()`. Types `CancelAdapter`, `Confirm`, `ConfirmStep`, `AdapterResult`, `Transition`. Private `run(sub)` loops `AUTO_METHODS = ['api','browser','unsubscribe_header']`. Default adapters all return `{ok:false, reason:'not_configured'}`.
- `src/agents/event-bus.ts`: `emit`, `subscribe`, `subscribeToId`, `getHistory`, `_clearForTest`.
- `src/agents/revenant.ts`: `detectRevenants(prev, scanned)`, `emitRevenants(prev, scanned)`.
- `src/agents/adapters/browser.ts`: `createBrowserAdapter(makeDriver)`, `createPlaywrightMcpDriver`, `parseSnapshot`. Types `BrowserDriver`, `PageSnapshot`, `PageElement`.
- `src/agents/adapters/simulated.ts`: a simulated adapter used by `?simulate`.
- `src/agents/adapters/mock-registry.ts`: `mockUrlFor(name)`, `isMockMerchant(name)`; `iframe-driver.ts` drives the mock merchant pages in `public/mock/`.
- `src/pipeline/bridge-client.ts`, `server/browser-bridge.ts`, `src/server/bridge-core.ts` (`decide`, `matchOrigin`, `ALLOWED_TOOLS`): local bridge to a real browser. Default is off.
- `src/ui/approval-dialog.ts`: `showApprovalDialog`, `cancelMethodLabel(sub)`.
- `src/ui/cancel-player.ts`, `cancel-player-steps.ts`: `createCancelPlayerAdapter`, `stepLabel`, `approvalCaption`, `resultLine`.

## Data Models
- `CancellationState`, `CancelMethod` (`api | browser | unsubscribe_header | boss_door`) and `AgentEvent` in `src/types.ts`.
- `Subscription.state` and `stateChangedAt` hold the latest state and its time.
- `Transition = {at, subscriptionId, from, to}`.

## Error Handling
- An adapter that throws is turned into `{ok:false, reason:'adapter_error'}`.
- A declined confirm stops the adapter with a failure; the next method runs.
- Repeated `requestCancel` for `dead`, `boss_resolved`, `boss` or a pending id returns at once.
- Bridge: a wrong origin or token is refused by `decide`; the chip shows `not_found` or `wrong_token`.

## Testing Strategy
- `src/agents/reaper.test.ts`: no adapter before approval, one `cancel_ok`, phone-only, fallthrough order, `boss_resolved`, repeated cancel (property test).
- `src/agents/revenant.test.ts`: detect after death, ignore older charges, emit once.
- `src/agents/adapters/browser.test.ts`, `simulated.test.ts`, `mock-registry.test.ts`.
- `src/ui/approval-dialog.test.ts`, `src/ui/cancel-player-steps.test.ts`.
- `src/pipeline/bridge-client.test.ts`, `src/server/bridge-core.test.ts`.
