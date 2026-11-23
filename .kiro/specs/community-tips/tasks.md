# Tasks: Community Cancel Tips

- [x] 1. Pure core
  - [x] 1.1 Types in `src/community/types.ts`
  - [x] 1.2 `merchantKeyFor` with processor and suffix lists
  - [x] 1.3 `parseSubmission` and `parseMerchantKey`
  - [x] 1.4 `summarize` with Wilson lower bound and month decay
  - _Requirements: 1.1, 1.2, 2.1, 2.2, 2.3, 3.1, 3.2, 3.3_

- [x] 2. Server
  - [x] 2.1 `handle()` with routes, CORS, limits, allow-list (`src/community/handle.ts`)
  - [x] 2.2 HTTP wrapper `server/community-api.ts` and `npm run community`
  - [x] 2.3 Allow-list `server/known-merchants.json`
  - [x] 2.4 Memory store and atomic file store
  - [x] 2.5 Firestore store behind `TipStore` (`src/community/firestore-store.ts`)
  - [x] 2.6 Deploy script `scripts/deploy-tips-gcp.sh`; docs `docs/community-api.md`
  - _Requirements: 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7, 6.1, 6.2, 6.3_

- [x] 3. Client and seed
  - [x] 3.1 `getTips`, `submitOutcome`, retry, timeout, seed fallback
  - [x] 3.2 Seed file `public/data/cancel-methods.seed.json`
  - _Requirements: 5.1, 5.2, 5.3_

- [x] 4. UI opt-in
  - [x] 4.1 Share box, off by default, exact text (`SHARE_TEXT` in `src/ui/cancel-kit.ts`)
  - _Requirements: 1.3, 1.4_

- [x] 5. Tests with fakes
  - [x] 5.1 `src/community/*.test.ts` (handle, merchant-key, validate, rank, client, firestore-store)
  - _Requirements: 1.2, 2.1, 3.1, 4.1, 5.1_

- [ ] 6. Not yet verified
  - [ ] 6.1 A real Firestore write test (only a fake `FirestoreLike` is tested)
  - [ ] 6.2 Check `/health` from the Pages origin after the wave is merged to main
  - [ ] 6.3 Platform-level rate limit (limits reset on cold start)
  - _Requirements: 4.5, 6.3_
