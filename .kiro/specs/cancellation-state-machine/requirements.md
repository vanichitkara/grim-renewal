# Requirements: Cancellation State Machine (Reaper)

## Introduction
The Reaper agent walks each subscription through a cancellation flow. It announces every state change on the event bus, waits for the real result, and picks the next branch. Nothing runs before the user approves. The full original text is kept in `original-spec.md`.

States (`CancellationState` in `src/types.ts`): `idle`, `queued`, `walking`, `knocking`, `opening`, `cancelling`, `reaping`, `dead`, `boss`, `boss_resolved`.

## Requirements

### Requirement 1: User approval gate
**User Story:** As a user, I want to see what the Reaper will do before it does it, so that nothing is cancelled without my say.

#### Acceptance Criteria
1. WHEN a cancellation is requested THE SYSTEM SHALL move the subscription through `queued`, `walking` and stop at `knocking`.
2. WHILE a subscription is in `knocking` THE SYSTEM SHALL run no cancel adapter until an `approved` event arrives for it.
3. WHEN the approval dialog opens THE SYSTEM SHALL show the merchant name, the plan and amount, and the method that will be used, with "Approve cancellation" and "Skip for now" buttons.
4. IF the user chooses "Skip for now" THEN THE SYSTEM SHALL leave the subscription at `knocking` and call no adapter.

### Requirement 2: Method order and fallthrough
**User Story:** As a user, I want the Reaper to try the safest automatic methods in order, so that I only make a phone call when nothing else works.

#### Acceptance Criteria
1. WHEN `approved` arrives THE SYSTEM SHALL move to `opening`, then `cancelling`, and try the methods `api`, `browser`, `unsubscribe_header` in that order.
2. WHEN a method starts THE SYSTEM SHALL emit `cancel_start` with that method.
3. IF a method returns a failure THEN THE SYSTEM SHALL try the next method.
4. WHEN a method succeeds THE SYSTEM SHALL move to `reaping`, then `dead`, and emit exactly one `cancel_ok`.
5. IF `phoneOnly` is true THEN THE SYSTEM SHALL skip all automatic methods and go straight to the Boss Door.
6. IF a method throws THEN THE SYSTEM SHALL treat it as the failure `adapter_error`.

### Requirement 3: Boss Door (phone only)
**User Story:** As a user, I want a phone script when the company only accepts calls, so that I can still finish the cancellation.

#### Acceptance Criteria
1. WHEN every method fails or `phoneOnly` is true THE SYSTEM SHALL emit `cancel_start` with `boss_door`, move to `boss`, and emit `cancel_fail` with the last reason.
2. WHILE a subscription is in `boss` THE SYSTEM SHALL keep listening for `boss_resolved`.
3. WHEN `boss_resolved` arrives in state `boss` THE SYSTEM SHALL log `boss_resolved` and then `dead`.

### Requirement 4: Browser steps need confirmation
**User Story:** As a user, I want to confirm every destructive browser step and never have a password typed for me, so that the Reaper cannot act behind my back.

#### Acceptance Criteria
1. WHEN the browser adapter is about to click or type THE SYSTEM SHALL call `confirm` first.
2. IF the user declines a step THEN THE SYSTEM SHALL stop and report a failure.
3. THE SYSTEM SHALL never fill a password field automatically.

### Requirement 5: Idempotency
**User Story:** As a user, I want a second cancel on a finished subscription to do nothing, so that nothing is counted twice.

#### Acceptance Criteria
1. IF the state is `dead`, `boss_resolved`, `boss`, or a request is already pending THEN THE SYSTEM SHALL make `requestCancel` a no-op.
2. WHEN approve, cancel and succeed run once THE SYSTEM SHALL emit exactly one `cancel_ok`.

### Requirement 6: Revenants
**User Story:** As a user, I want to know when a charge comes back after I cancelled, so that I can dispute it.

#### Acceptance Criteria
1. WHEN a new scan shows a charge dated after the `stateChangedAt` of a `dead` or `boss_resolved` subscription THE SYSTEM SHALL emit one `revenant` event and reset that subscription to `idle`.
2. WHEN the same returning charge is scanned again THE SYSTEM SHALL emit nothing.

### Requirement 7: Audit log
**User Story:** As the builder, I want timestamped transitions, so that I can show how the machine behaved.

#### Acceptance Criteria
1. WHEN the state changes THE SYSTEM SHALL append `{at, subscriptionId, from, to}` to the transition log.
