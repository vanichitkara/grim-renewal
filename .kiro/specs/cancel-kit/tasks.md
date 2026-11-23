# Tasks: Cancel Kit and Results-First Screen

- [x] 1. Pure kit logic
  - [x] 1.1 `chooseMethod` in `src/kit/choose-method.ts`
  - [x] 1.2 Drafts, `mailto:`, call script, dispute letter in `src/kit/drafts.ts`
  - [x] 1.3 `makeIcs` in `src/kit/ics.ts`
  - [x] 1.4 `statusFor` in `src/kit/status.ts`
  - [x] 1.5 `headerModel`, `listRows` in `src/kit/view-model.ts`
  - [x] 1.6 Last scan storage in `src/kit/last-scan.ts`
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.2, 3.1, 3.2, 4.1, 4.2, 4.3, 4.4, 5.1, 5.2, 5.3, 5.4, 5.5, 7.1, 7.2, 8.1, 8.2_

- [x] 2. UI
  - [x] 2.1 Cancel kit modal with tabs in `src/ui/cancel-kit.ts`
  - [x] 2.2 Dashboard, Scene and List switch in `src/ui/dashboard.ts` and `src/ui/app.html`
  - [x] 2.3 "I cancelled it" saves a claim (`src/state/claims.ts`)
  - [x] 2.4 "What worked?" with the opt-in box, off by default
  - [x] 2.5 Demo data with 10 subscriptions and 3 trials (`src/ui/demo-data.ts`)
  - _Requirements: 1.1, 2.1, 3.3, 6.1, 6.2_

- [x] 3. Tests
  - [x] 3.1 `src/kit/kit.test.ts`
  - [x] 3.2 `src/ui/app-gate.test.ts`
  - _Requirements: 4.1, 4.4, 5.2, 5.5, 8.1_

- [ ] 4. Open
  - [ ] 4.1 Revenant dispute flow: wire the Dispute tab to a full came-back path and test it
  - [ ] 4.2 A failed cancel shows "Cancel started" (review risk)
  - [ ] 4.3 Repo test for the Cancel kit DOM (today only checked by hand in Chrome)
  - _Requirements: 3.1, 5.4_
