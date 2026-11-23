# Tasks: Receipt Parser

- [x] 1. Core parser
  - [x] 1.1 `parseReceipt` with billing check, amount, date in `src/pipeline/parse-receipt.ts`
  - [x] 1.2 Null for non-billing, `$0.00`, no date
  - _Requirements: 1.1, 1.2, 1.3, 1.4_

- [x] 2. Amounts and cycles
  - [x] 2.1 USD, EUR comma-decimal, GBP, code-first and code-last
  - [x] 2.2 Prefer total and "you paid"; ignore discount lines
  - [x] 2.3 Monthly, annual, unknown
  - _Requirements: 2.1, 2.2, 2.3, 3.1, 3.2, 3.3_

- [ ] 3. Dates
  - [x] 3.1 ISO, `November 10, 2026`, `10 Nov 2026`, fallback date
  - [ ] 3.2 EU `10/11/2026` disambiguated by locale signal (no test pins it)
  - _Requirements: 4.1, 4.2_

- [x] 4. Merchant, links, phone
  - [x] 4.1 `normalizeMerchant`
  - [x] 4.2 Cancel URL and `phoneOnly` detection
  - [x] 4.3 `senderDomain` pass-through
  - _Requirements: 5.1, 5.2, 5.3, 5.4_

- [x] 5. Cancellation emails
  - [x] 5.1 `isCancellationEmail` (fires on real wording, not marketing)
  - _Requirements: 6.1, 6.2_

- [x] 6. Tests
  - [x] 6.1 Unit and `fast-check` property tests in `src/pipeline/parse-receipt.test.ts`
  - _Requirements: 1.4, 2.1, 3.1, 7.1_
