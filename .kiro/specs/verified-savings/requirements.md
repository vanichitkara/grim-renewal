# Requirements: Verified Savings

## Introduction
Savings are only claimed with evidence. A cancellation is Confirmed (a cancellation email, or the user's own claim), Likely (the expected receipt did not arrive), or Verified (a confirmed basis plus a full billing cycle with no new receipt). When unsure the level is `none`, never a saving. Source plan: `docs/specs/build-wave-2026-11-22.md` section B and review changes.

## Requirements

### Requirement 1: Evidence levels
**User Story:** As a user, I want savings I can trust, so that the app never brags about money it did not save.

#### Acceptance Criteria
1. THE SYSTEM SHALL return one level: `none`, `confirmed`, `likely`, `quiet`, `verified` or `came_back`.
2. WHEN a claim or a cancellation email exists THE SYSTEM SHALL return at least `confirmed`.
3. WHEN a confirmed basis exists AND a full billing cycle passed with no receipt THE SYSTEM SHALL return `verified`.
4. WHEN only the receipt gap exists AND a full cycle passed THE SYSTEM SHALL return `quiet` and never the word "Verified".
5. WHEN a receipt is dated after the claim THE SYSTEM SHALL return `came_back`.
6. IF the evidence is not enough THEN THE SYSTEM SHALL return `none`.

### Requirement 2: When "likely" is allowed
**User Story:** As a user, I want a guess only when history supports it, so that false hopes are rare.

#### Acceptance Criteria
1. THE SYSTEM SHALL return `likely` only with at least 2 charge dates and a known billing cycle.
2. IF the plan is annual and has no claim and no cancellation email THEN THE SYSTEM SHALL return `none` with the note "Annual plans need a year of history".
3. IF the sender is a payment processor THEN THE SYSTEM SHALL not treat a missing receipt as a missed renewal.
4. WHEN the last receipt is over 11 months old THE SYSTEM SHALL add a window note.

### Requirement 3: Money
**User Story:** As a user, I want two honest numbers, so that I know what is saved and what is a guess.

#### Acceptance Criteria
1. THE SYSTEM SHALL compute `avoidedAmount = missedRenewals * chargeAmount`, where an annual plan's charge amount is the monthly amount times 12.
2. THE SYSTEM SHALL return `projected12m` as a labelled estimate.
3. THE SYSTEM SHALL assess in each subscription's own currency and sum per currency only (`sumByCurrency`).
4. THE SYSTEM SHALL never return a negative amount or count.

### Requirement 4: Cadence
**User Story:** As a user, I want the usual gap measured, so that "missed" means something.

#### Acceptance Criteria
1. THE SYSTEM SHALL use the median gap between charges, clamped to 7..400 days.
2. IF only one charge date exists THEN THE SYSTEM SHALL use the billing cycle (monthly 30, annual 365).
3. THE SYSTEM SHALL allow a grace of 5 days (`GRACE_DAYS`) before a receipt counts as missing.

### Requirement 5: Claims
**User Story:** As a user, I want to say "I cancelled it" with a date, so that the app can check.

#### Acceptance Criteria
1. WHEN the user marks a subscription cancelled THE SYSTEM SHALL store only the id and the date in `localStorage` key `grim_claims`.
2. IF the id or date is invalid, or storage is corrupt THEN THE SYSTEM SHALL ignore it and not throw.
3. WHEN the user clears a claim THE SYSTEM SHALL remove it.

### Requirement 6: Re-sweep
**User Story:** As a user, I want each new scan compared with the last, so that a revenant is caught.

#### Acceptance Criteria
1. WHEN a scan finishes THE SYSTEM SHALL compare it to the last saved scan and the claims (`sweepForChanges`) and report per-subscription assessments.
2. WHEN a claimed subscription was charged again THE SYSTEM SHALL flag it as `came_back`.
