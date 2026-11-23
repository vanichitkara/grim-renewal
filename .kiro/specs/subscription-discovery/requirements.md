# Requirements: Subscription Discovery

## Introduction
The Scout reads the signed-in user's Gmail with the `gmail.readonly` scope, finds billing emails, and returns one `Subscription` record per merchant and account. Raw message text is never kept. The full original text is kept in `original-spec.md`. Privacy rules: `.kiro/steering/privacy.md`.

## Requirements

### Requirement 1: Read-only, query-level search
**User Story:** As a user, I want only my billing mail searched, so that my personal mail stays private.

#### Acceptance Criteria
1. THE SYSTEM SHALL request only the `gmail.readonly` scope.
2. WHEN a scan runs THE SYSTEM SHALL filter with a Gmail query (`in:inbox ... newer_than:13m`) and not filter locally after a full download.
3. THE SYSTEM SHALL never read drafts, sent mail or trash.
4. THE SYSTEM SHALL read at most 300 messages per scan.

### Requirement 2: Extraction without keeping text
**User Story:** As a user, I want only the structured fields kept, so that no email content is stored.

#### Acceptance Criteria
1. WHEN a message matches THE SYSTEM SHALL extract merchant, amount, currency, date, plan, renewal date, trial end, account email, cancel URL, phone fields, sender domain, and the date of any cancellation email.
2. THE SYSTEM SHALL read the snippet first and fetch the full body only if the snippet fails to parse, then discard it at once.
3. THE SYSTEM SHALL not output any raw body, subject line or message id.

### Requirement 3: Deduplication and ids
**User Story:** As a user, I want one record per subscription, so that the list is clean.

#### Acceptance Criteria
1. THE SYSTEM SHALL group by merchant and account email.
2. THE SYSTEM SHALL set `id` to the first 8 hex characters of `sha256(merchant + accountEmail)`.
3. WHEN the same account is scanned twice THE SYSTEM SHALL return the same ids.
4. WHEN a merchant has several amounts THE SYSTEM SHALL use the most recent non-zero amount.
5. THE SYSTEM SHALL keep `chargeDates` sorted, unique, and at most 36.

### Requirement 4: Amount normalization
**User Story:** As a user, I want annual plans shown per month, so that I can compare.

#### Acceptance Criteria
1. WHEN the plan is annual THE SYSTEM SHALL store `monthlyAmount` as the amount divided by 12.
2. THE SYSTEM SHALL keep the currency code of the receipt in `currency`.

### Requirement 5: Errors
**User Story:** As a user, I want clear failures, so that I know what to do.

#### Acceptance Criteria
1. IF Gmail returns 429 THEN THE SYSTEM SHALL wait 60 s and retry up to 3 times, then raise the error.
2. IF one message fails to parse THEN THE SYSTEM SHALL skip it and continue.
3. IF nothing is found THEN THE SYSTEM SHALL return an empty list and the UI shows an empty state.
4. WHEN messages are read THE SYSTEM SHALL report counts only through `onProgress`.

### Requirement 6: Consent text
**User Story:** As a user, I want to know what the Reaper reads before I connect, so that I can decide.

#### Acceptance Criteria
1. THE SYSTEM SHALL show the exact consent text from `privacy.md` on the same screen as the "Connect Gmail" button.
