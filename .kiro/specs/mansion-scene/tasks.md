# Tasks: Mansion Scene

- [x] 1. Layout
  - [x] 1.1 Pure `src/animation/layout.ts` with 8 slots, paging, travel kind and pace
  - [x] 1.2 Tests in `src/animation/layout.test.ts`
  - _Requirements: 1.1, 1.3, 2.1, 2.2, 2.3_

- [x] 2. Scene
  - [x] 2.1 Mansion drawing and door slots in `src/animation/hallway.ts`, `door.ts`, `background.ts`
  - [x] 2.2 Glide and blink with cancellable tweens (`tween.ts`)
  - [x] 2.3 Approach on `approved`; kill on `cancel_ok`; flee on `cancel_fail`; tombstones
  - [x] 2.4 Paging with auto-turn and `aria-live` announce (`setPage`, `getPageInfo`)
  - _Requirements: 1.2, 1.4, 1.5, 2.4, 3.1, 3.2, 3.3, 3.4, 3.5_

- [x] 3. Graveyard
  - [x] 3.1 Full-frame yard and camera cut (`src/animation/graveyard-scene.ts`)
  - [x] 3.2 Yard hidden when there are no trials
  - [x] 3.3 Tests in `src/animation/graveyard-scene.test.ts`
  - _Requirements: 4.1, 4.2_

- [x] 4. Effects and access
  - [x] 4.1 `celebrateVerified(id)` coins
  - [x] 4.2 Reduced-motion rules, canvas `aria-label`
  - _Requirements: 5.1, 6.1, 6.2, 6.3_

- [x] 5. Sprites
  - [x] 5.1 `scripts/make-sprites.ts` and `public/assets/sprites/*` with rectangle fallbacks
  - [x] 5.2 Tests in `src/animation/sprites.test.ts`
  - _Requirements: 7.1, 7.2_

- [ ] 6. Not in the repo
  - [ ] 6.1 A saved browser test for the full scene flow (checked by hand in Chrome only)
  - [ ] 6.2 Unit tests for `hallway.ts` event handling
  - _Requirements: 3.1, 3.2, 3.3_
