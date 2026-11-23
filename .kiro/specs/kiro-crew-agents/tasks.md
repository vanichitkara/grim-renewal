# Tasks: Kiro Crew Agents

- [x] 1. Event bus and types
  - [x] 1.1 `AgentEvent` union in `src/types.ts`
  - [x] 1.2 `emit`, `subscribe`, `subscribeToId`, `getHistory` in `src/agents/event-bus.ts`
  - _Requirements: 4.1, 4.2, 4.3_

- [x] 2. Scout
  - [x] 2.1 `scanInbox` with query-level filter in `src/pipeline/gmail-scout.ts`
  - [x] 2.2 Tests in `src/pipeline/gmail-scout.test.ts`
  - _Requirements: 1.1, 1.2, 1.3, 6.1_

- [x] 3. Coroner
  - [x] 3.1 `scoreSubscriptions` in `src/agents/coroner.ts` (see `forgotten-score`)
  - _Requirements: 2.1, 2.2_

- [x] 4. Reaper per subscription
  - [x] 4.1 Per-id state and pending set in `src/agents/reaper.ts`
  - [x] 4.2 Approval gate (see `cancellation-state-machine`)
  - _Requirements: 3.1, 3.2, 3.3, 5.1_

- [x] 5. Conductor wiring
  - [x] 5.1 `runPipeline` in `src/pipeline/pipeline.ts`
  - [x] 5.2 Revenant check on rescan (`emitRevenants`)
  - _Requirements: 5.2_

- [x] 6. MCP scoping
  - [x] 6.1 Playwright MCP driver with confirm before each step (`createPlaywrightMcpDriver`)
  - _Requirements: 6.2_

- [ ] 7. Tests still missing
  - [ ] 7.1 `src/agents/event-bus.test.ts` (delivery by id, history)
  - [ ] 7.2 Two Reapers at once do not share state
  - _Requirements: 3.2, 4.2, 5.1_
