# Tasks: Verified Savings

- [x] 1. Data from the scout
  - [x] 1.1 Optional fields on `Subscription` and `senderDomain` on `ReceiptFields` (`src/types.ts`)
  - [x] 1.2 Fill `senderDomain`, `currency`, `chargeDates`, `cancellationEmailDate` in `src/pipeline/gmail-scout.ts`
  - [x] 1.3 `isCancellationEmail` in `src/pipeline/parse-receipt.ts`; query widened, inbox only
  - _Requirements: 1.2, 2.4_

- [x] 2. Assessment
  - [x] 2.1 `usualGapDays`, `expectedNext` in `src/savings/cadence.ts`
  - [x] 2.2 `assessCancellation` with six levels and notes
  - [x] 2.3 `sumByCurrency`
  - _Requirements: 1.1, 1.3, 1.4, 1.5, 1.6, 2.1, 2.2, 2.3, 3.1, 3.2, 3.3, 3.4, 4.1, 4.2, 4.3_

- [x] 3. Claims and sweep
  - [x] 3.1 `loadClaims`, `saveClaim`, `clearClaim` in `src/state/claims.ts`
  - [x] 3.2 `sweepForChanges` in `src/savings/sweep.ts`, called from `runPipeline`
  - _Requirements: 5.1, 5.2, 5.3, 6.1, 6.2_

- [x] 4. Tests
  - [x] 4.1 `src/savings/assess.test.ts` (table plus property tests)
  - [x] 4.2 `src/state/claims.test.ts`
  - _Requirements: 1.1, 3.1, 5.2, 6.2_

- [ ] 5. Open
  - [ ] 5.1 Apple-billed subscriptions marked Verified (undecided review risk)
  - [ ] 5.2 Check on a real inbox over several months (user step)
  - _Requirements: 2.3_
