# Requirements: Forgotten Score (Coroner)

## Introduction
The Coroner agent gives each subscription a `forgottenScore` between 0 and 1. A higher score means more forgotten. The score drives zombie decay in the animation, the sort order of the list, and the "may have forgotten" counts in the results header. The full original text is kept in `original-spec.md`.

## Requirements

### Requirement 1: Score range
**User Story:** As a user, I want one clear number for how forgotten a subscription is, so that I can rank them.

#### Acceptance Criteria
1. WHEN the Coroner scores a subscription THE SYSTEM SHALL return a number in [0, 1].
2. THE SYSTEM SHALL set only `forgottenScore` and leave every other field of the subscription unchanged.
3. IF no signals exist for a subscription THEN THE SYSTEM SHALL return it unchanged.

### Requirement 2: Formula
**User Story:** As the builder, I want a documented formula, so that scores can be explained and tested.

#### Acceptance Criteria
1. THE SYSTEM SHALL compute `raw = (days since activity / 365) * 0.6 + (charges without activity / total charges) * 0.3 + (trial only ? 0.1 : 0)`, with days capped at 365.
2. IF no activity email and no login alert is found THEN THE SYSTEM SHALL treat days since activity as 365.
3. WHEN a login alert is 14 days old or newer THE SYSTEM SHALL subtract 0.3.
4. WHEN an activity email is 30 days old or newer THE SYSTEM SHALL subtract 0.2.
5. THE SYSTEM SHALL clamp the final score to [0, 1].

### Requirement 3: Expected scores
**User Story:** As a user, I want active accounts to look alive and unused ones to look dead, so that the horde is honest.

#### Acceptance Criteria
1. WHEN a login alert arrived yesterday THE SYSTEM SHALL score at most 0.1.
2. WHEN receipts span 12 months with no activity email THE SYSTEM SHALL score at least 0.7.

### Requirement 4: Where the score is used
**User Story:** As a user, I want the score to show up where I decide, so that I can act on it.

#### Acceptance Criteria
1. WHEN a subscription scores 0.5 or more (`FORGOTTEN_AT`) and the user still pays THE SYSTEM SHALL count it in the results header as "may have forgotten".
2. WHEN the list view is built THE SYSTEM SHALL show the score as words from `forgottenWords`.

### Requirement 5: Activity signals from Gmail
**User Story:** As a user, I want the score to use real login and activity emails, so that it reflects my use.

#### Acceptance Criteria
1. WHEN a scan runs THE SYSTEM SHALL ask Gmail (read-only, query level) for login-alert and activity emails per merchant.
2. IF the second Gmail pass is not built THEN THE SYSTEM SHALL fall back to conservative defaults (no signals found).
