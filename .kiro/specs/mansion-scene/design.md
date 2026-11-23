# Design: Mansion Scene

## Overview
Canvas 2D at 480 x 220. A pure layout module decides where things go. `hallway.ts` runs the loop, queue and tweens. The scene never imports from `src/community`, `src/savings` or `src/ui`. (The file is still called `hallway.ts`; it draws the mansion.)

## Architecture
```
AgentEvent bus -> hallway.ts (queue, tweens, draw) -> layout.ts (pure slots, paging, pace)
                                                   -> graveyard-scene.ts (yard, camera)
UI (dashboard.ts) -> setPage / getPageInfo / setView / celebrateVerified / enqueue
```
Camera shows the mansion (x 0) or the yard (x 480) with a fade.

## Components and Interfaces
- `src/animation/layout.ts`: `PER_PAGE = 8`, `COLS = 4`, `pageCount`, `pageOf`, `clampPage`, `pageSlots`, `slotPos`, `torchXs`, `pageInfo`, `travelKind`, `glideMs`, `pace`, `BLINK_DIST = 150`.
- `src/animation/hallway.ts`: `initHallway`, `addSubscription`, `enqueue`, `onHordeChange`, `setView`, `setPage`, `getPageInfo`, `celebrateVerified`, `setSlotLabel`, `setCancelHandler`, `advanceDay`, and the `tune` object.
- `src/animation/graveyard-scene.ts`: `riseFor`, `upFor`, `cameraTarget`, `drawGrave`, `drawFog`, type `View`.
- `src/animation/tween.ts`: `tween`, `tickTweens`, `wait`. `ease.ts`: the five named easings.
- Other draw modules: `door.ts`, `background.ts`, `zombie.ts`, `reaper.ts`, `particles.ts`, `sprites.ts`, `sound.ts`.
- `scripts/make-sprites.ts`: generates `public/assets/sprites/*`.

## Data Models
`SlotPos`, `PageInfo`, `Pace`, `Travel` (`none | glide | blink`), `HordeView`, `TrialView`, `GraveState`.

## Error Handling
- Out-of-range pages are clamped by `clampPage`.
- A missing sprite uses the rectangle fallback.
- Under reduced motion smoke, shake and most particles are skipped.
- Tweens are kept in a `live` set so a new event can cancel them.

## Testing Strategy
- `src/animation/layout.test.ts`: page counts for 1..24, never more than 8 slots, clamping, door sizes and floors, no overlap, canvas fit, reaper rest spot, glide vs blink, pace limits.
- `src/animation/graveyard-scene.test.ts`: yard maths and camera.
- `src/animation/sprites.test.ts`: sprite sheet rules.
- `hallway.ts` has no unit test. It was checked in real Chrome with scripts kept outside the repo (full demo flow, trial bury, yard, revenant, 12 fake subscriptions).
