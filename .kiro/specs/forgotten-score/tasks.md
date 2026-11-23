# Tasks: Forgotten Score (Coroner)

- [x] 1. Scoring function
  - [x] 1.1 `ActivitySignals` and `computeForgottenScore` in `src/agents/coroner.ts`
  - [x] 1.2 `scoreSubscriptions` returns a new list, only `forgottenScore` changes
  - _Requirements: 1.1, 1.2, 1.3, 2.1, 2.2, 2.3, 2.4, 2.5_

- [x] 2. Pipeline wiring
  - [x] 2.1 Call scout, signals, scoring and emit `scored` in `src/pipeline/pipeline.ts`
  - _Requirements: 1.1_

- [x] 3. Use in the UI
  - [x] 3.1 `FORGOTTEN_AT`, `headerModel`, `forgottenWords`, `listRows` in `src/kit/view-model.ts`
  - _Requirements: 4.1, 4.2_

- [ ] 4. Real activity signals
  - [x] 4.1 Stub `scanActivitySignals` with conservative defaults in `src/pipeline/activity-scout.ts`
  - [ ] 4.2 Second Gmail pass for login alerts and activity emails (query level, read-only)
  - [ ] 4.3 Ghosts detection (dormant accounts that still hold card data)
  - _Requirements: 5.1, 5.2_

- [ ] 5. Tests
  - [ ] 5.1 `src/agents/coroner.test.ts`: login alert yesterday scores 0.1 or less; 12 silent months score 0.7 or more
  - [ ] 5.2 Property test over `computeForgottenScore` for any signals, result in [0, 1]
  - _Requirements: 1.1, 3.1, 3.2_
