# Tasks: Subscription Discovery

- [x] 1. Gmail access
  - [x] 1.1 Query-level filter `RECEIPT_QUERY`, inbox only, paged, max 300
  - [x] 1.2 429 back-off and retry
  - [x] 1.3 Profile email lookup (`src/pipeline/gmail-profile.ts`)
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 5.1_

- [x] 2. Extraction
  - [x] 2.1 Snippet first, body fallback, text discarded (`extractText`)
  - [x] 2.2 Fill `senderDomain`, `currency`, `chargeDates`, `cancellationEmailDate`
  - _Requirements: 2.1, 2.2, 2.3, 3.5_

- [x] 3. Deduplication and ids
  - [x] 3.1 Group by merchant and account, sha256 id
  - [x] 3.2 Annual divided by 12
  - _Requirements: 3.1, 3.2, 3.4, 4.1, 4.2_

- [x] 4. Errors and progress
  - [x] 4.1 Skip bad messages, empty list is fine
  - [x] 4.2 `onProgress` counts only
  - _Requirements: 5.2, 5.3, 5.4_

- [x] 5. Consent
  - [x] 5.1 Consent text on the gate screen, pinned by `src/ui/app-gate.test.ts`
  - _Requirements: 6.1_

- [x] 6. Tests
  - [x] 6.1 `src/pipeline/gmail-scout.test.ts`, `gmail-scout-body.test.ts`
  - [ ] 6.2 Live check on a real seeded inbox with 5 or more receipts (user step)
  - [ ] 6.3 Test that the same ids come back on a second scan
  - _Requirements: 3.3_
