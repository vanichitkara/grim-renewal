# Requirements: Cancel Kit and Results-First Screen

## Introduction
After a scan the user sees the answer first: what they pay for things they may have forgotten, with a Scene view and a List view. For each subscription a Cancel kit helps them cancel by hand (Online, Email, Phone tabs, plus a dispute letter after a charge comes back). Nothing is sent without the user's action. Source plan: `docs/specs/build-wave-2026-11-22.md` section D and review changes.

## Requirements

### Requirement 1: Results-first header
**User Story:** As a user, I want the answer at the top, so that I see the cost of forgetting at once.

#### Acceptance Criteria
1. WHEN a scan finishes THE SYSTEM SHALL show a headline of what the user pays for subscriptions that score 0.5 or more and are still paid.
2. THE SYSTEM SHALL show chips for trials ending soon (3 days), likely cancelled and verified savings.
3. THE SYSTEM SHALL show "Avoided so far (verified)" and "Next 12 months (estimate)" as separate numbers, summed per currency.
4. IF there are no subscriptions THEN THE SYSTEM SHALL show an honest empty headline.

### Requirement 2: Scene and List
**User Story:** As a user, I want a plain table too, so that any number of subscriptions is easy to read.

#### Acceptance Criteria
1. WHEN the user picks "List" THE SYSTEM SHALL show an accessible table with one row per subscription and trial: name, price, how forgotten, status and a Cancel kit button.
2. THE SYSTEM SHALL use the same data and statuses as the Scene.

### Requirement 3: Statuses
**User Story:** As a user, I want one status word per subscription, so that I know where it stands.

#### Acceptance Criteria
1. THE SYSTEM SHALL use these words: Found, Cancel started, Waiting to verify, Likely cancelled, Verified, Came back.
2. THE SYSTEM SHALL show "Verified" only for assessment level `verified`.
3. WHEN the user presses "I cancelled it" and gives a date THE SYSTEM SHALL save a claim.

### Requirement 4: Choosing the first tab
**User Story:** As a user, I want the best method first with the reason, so that I do not guess.

#### Acceptance Criteria
1. WHEN a settled community tip exists THE SYSTEM SHALL open that tab and say "N of M say it worked".
2. ELSE WHEN the receipt has a cancel link or a phone number THE SYSTEM SHALL open Online or Phone.
3. ELSE WHEN the starter list knows the company THE SYSTEM SHALL use it.
4. IF nothing is known THEN THE SYSTEM SHALL say so and list the steps in order.

### Requirement 5: Drafts
**User Story:** As a user, I want ready text, so that cancelling takes a minute.

#### Acceptance Criteria
1. THE SYSTEM SHALL build an email draft that opens the mail app (`mailto:`) with the recipient left empty, and a copy button.
2. THE SYSTEM SHALL keep the `mailto:` link short (about 1500 characters at most).
3. WHEN a phone number is known THE SYSTEM SHALL give a tap-to-call link, a call script and the ask for written confirmation.
4. WHEN a charge came back THE SYSTEM SHALL show a Dispute tab with a letter.
5. THE SYSTEM SHALL not invent facts such as hold times.

### Requirement 6: What worked
**User Story:** As a user, I want to tell others what worked only if I choose to, so that sharing is mine to decide.

#### Acceptance Criteria
1. WHEN the user finishes THE SYSTEM SHALL ask which method and yes or no, with the share box unticked.
2. IF the box is ticked THEN THE SYSTEM SHALL send one report; ELSE nothing is sent (see `community-tips`).

### Requirement 7: Trial guard
**User Story:** As a user, I want a reminder before a trial bills me, so that I can cancel in time.

#### Acceptance Criteria
1. WHEN the user presses "Remind me" on a trial THE SYSTEM SHALL download an `.ics` event 2 days before the trial ends.
2. THE SYSTEM SHALL send nothing anywhere for this.

### Requirement 8: Last scan
**User Story:** As a user, I want my last scan remembered, so that a later scan can find changes.

#### Acceptance Criteria
1. WHEN a scan finishes THE SYSTEM SHALL save dates and amounts in `grim_subs` and omit the account address, links, phone and member id.
2. IF stored data is corrupt THEN THE SYSTEM SHALL load an empty list.
