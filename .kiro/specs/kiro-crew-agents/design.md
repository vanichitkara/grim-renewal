# Design: Kiro Crew Agents

## Overview
The agents are plain modules in `src/agents/` and `src/pipeline/`. The "Conductor" role is `runPipeline` plus the UI: it calls the Scout, then the Coroner, then parks each subscription for a Reaper. A real Kiro Crew conductor dispatched the build work (see `docs/week-plan.md`); the app itself does not call a crew runtime.

## Architecture
```
runPipeline (src/pipeline/pipeline.ts)
  Scout   scanInbox            -> Subscription[]
  Coroner scanActivitySignals + scoreSubscriptions
  bus     emit discovered, scored; requestCancel(sub) parks at 'knocking'
UI approval -> emit approved -> Reaper run -> cancel_ok | cancel_fail
```

## Components and Interfaces
- Scout: `scanInbox(token, accountEmail, sleep?, onProgress?)` in `src/pipeline/gmail-scout.ts`; `parseReceipt` in `src/pipeline/parse-receipt.ts`.
- Coroner: `computeForgottenScore`, `scoreSubscriptions` in `src/agents/coroner.ts`.
- Reaper: `requestCancel`, `setAdapters`, `getState`, `getTransitionLog` in `src/agents/reaper.ts`.
- Bus: `emit`, `subscribe`, `subscribeToId`, `getHistory` in `src/agents/event-bus.ts`.
- Revenants: `emitRevenants` in `src/agents/revenant.ts`.
- Pipeline: `runPipeline(token, accountEmail, onProgress?, onSweep?)`.
- MCP use: a Playwright MCP driver exists as `createPlaywrightMcpDriver` in `src/agents/adapters/browser.ts`. Gmail is read with the Gmail REST API and a `gmail.readonly` token, not a Gmail MCP server.

## Data Models
`AgentEvent` union and `Subscription` in `src/types.ts`. `Transition` in `src/agents/reaper.ts`.

## Error Handling
- Gmail 429: back off 60 s, up to 3 retries, then throw (`scanInbox`).
- A message that fails to parse is skipped.
- A Reaper adapter error becomes `adapter_error` and the next method runs.

## Testing Strategy
- `src/agents/reaper.test.ts`, `src/agents/revenant.test.ts`: per-id isolation, no repeat work.
- `src/pipeline/gmail-scout.test.ts`, `gmail-scout-body.test.ts`: the Scout.
- There is no `event-bus.test.ts` and no `coroner.test.ts` yet.
