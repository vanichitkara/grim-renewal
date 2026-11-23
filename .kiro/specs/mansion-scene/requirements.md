# Requirements: Mansion Scene

## Introduction
The animation shows a haunted mansion front with doors on two floors (ground and an upper landing). The reaper visits doors instead of walking a long hall, so the scene works for 24 subscriptions or more. A separate graveyard scene shows trials. Rules for this feature live in `.kiro/steering/animation.md` and apply to every requirement below. Source plan: `docs/specs/build-wave-2026-11-22.md` section C and review changes.

## Requirements

### Requirement 1: Slots and pages
**User Story:** As a user with many subscriptions, I want pages of doors, so that the scene stays readable.

#### Acceptance Criteria
1. THE SYSTEM SHALL draw at most 8 slots per page (4 columns; a ground door and an upper door).
2. WHEN there are more than 8 subscriptions THE SYSTEM SHALL add pages with controls and a "Page N of M" label.
3. THE SYSTEM SHALL compute all slot positions in `src/animation/layout.ts`, never in draw code.
4. THE SYSTEM SHALL turn pages only between sequences, after all tweens have settled.
5. WHEN the reaper moves to a slot on another page THE SYSTEM SHALL turn to it and announce the page in the `aria-live` region.

### Requirement 2: Reaper travel
**User Story:** As a user, I want the reaper to reach far doors quickly, so that a long queue does not take minutes.

#### Acceptance Criteria
1. WHEN the target is near THE SYSTEM SHALL glide with `ease.out`.
2. WHEN the target is far (150 px or more) THE SYSTEM SHALL blink: smoke out, smoke in.
3. WHEN the queue is long THE SYSTEM SHALL use fewer knocks and faster tweens, at most 2.5 times faster, never below 1 knock.
4. THE SYSTEM SHALL divide every timed value by `tune.speed`.

### Requirement 3: State follows events
**User Story:** As a user, I want the animation to show what really happened, so that I am never misled.

#### Acceptance Criteria
1. WHEN `approved` arrives THE SYSTEM SHALL start the approach; never on enqueue.
2. WHEN `cancel_ok` arrives THE SYSTEM SHALL play the kill (dissolve, tombstone at the door's foot, on the landing for upper doors).
3. WHEN `cancel_fail` arrives THE SYSTEM SHALL leave the door standing and play the Boss Door flee.
4. THE SYSTEM SHALL make every glide, blink and kill cancellable.
5. THE SYSTEM SHALL show a tombstone at the slot of a cancelled subscription.

### Requirement 4: Graveyard
**User Story:** As a user with trials, I want a yard for them, so that I see what is about to be billed.

#### Acceptance Criteria
1. THE SYSTEM SHALL show the mansion (camera x 0) or the yard (camera x 480), never in between, with a short fade.
2. IF there are no trials THEN `setView('yard')` SHALL do nothing and the yard SHALL not be drawn.

### Requirement 5: Verified savings celebration
**User Story:** As a user, I want a small reward when savings are verified, so that the win feels real.

#### Acceptance Criteria
1. WHEN `celebrateVerified(id)` is called THE SYSTEM SHALL drop gold coins from that slot.

### Requirement 6: Reduced motion and accessibility
**User Story:** As a user who prefers less motion, I want calm effects, so that the page is comfortable.

#### Acceptance Criteria
1. WHILE `prefers-reduced-motion` is true THE SYSTEM SHALL skip camera shake and smoke, and cut particles (dissolve 18, coins 4).
2. THE SYSTEM SHALL keep the canvas at 480 x 220, `image-rendering: pixelated`, and cap `dt` at 50 ms.
3. THE SYSTEM SHALL set an `aria-label` on the canvas that names the page and the current action.

### Requirement 7: Sprites
**User Story:** As the builder, I want generated sprites with a fallback, so that missing art never breaks the scene.

#### Acceptance Criteria
1. THE SYSTEM SHALL create sprites only through `scripts/make-sprites.ts`.
2. IF a sprite fails to load THEN THE SYSTEM SHALL draw a rectangle fallback.
