# Requirements: Receipt Parser

## Introduction
`parseReceipt(messageText, senderDomain, fallbackDate?)` turns one email into billing fields, or `null` if it is not a billing email. It is a pure function. The full original text is kept in `original-spec.md`.

## Requirements

### Requirement 1: Billing or not
**User Story:** As a user, I want only real charges picked up, so that newsletters never become subscriptions.

#### Acceptance Criteria
1. IF the text has no billing signal THEN THE SYSTEM SHALL return `null`.
2. IF the amount is `Free` or `$0.00` THEN THE SYSTEM SHALL return `null`.
3. IF no date can be found in the text or the fallback THEN THE SYSTEM SHALL return `null`.
4. WHEN the same input is parsed twice THE SYSTEM SHALL return identical output.

### Requirement 2: Amounts
**User Story:** As a user, I want amounts in my currency format read correctly, so that totals are right.

#### Acceptance Criteria
1. WHEN the text holds `$9.99`, `USD 9.99`, `9.99 USD`, `€99,00` or `£14.99` THE SYSTEM SHALL return a positive number and the ISO currency code.
2. WHEN a total, a subtotal and tax appear THE SYSTEM SHALL prefer the total, and prefer "you paid" over an earlier list price.
3. WHEN a discount line shows a total THE SYSTEM SHALL ignore it.

### Requirement 3: Billing cycle
**User Story:** As a user, I want monthly and annual plans told apart, so that yearly cost is correct.

#### Acceptance Criteria
1. WHEN "year", "annual", "annually" or "/yr" is near the amount THE SYSTEM SHALL return `annual`.
2. WHEN "month", "monthly" or "/mo" is near the amount THE SYSTEM SHALL return `monthly`.
3. OTHERWISE THE SYSTEM SHALL return `unknown`.

### Requirement 4: Dates
**User Story:** As a user, I want dates read in common forms, so that the charge history is right.

#### Acceptance Criteria
1. WHEN the text holds `2026-11-10`, `November 10, 2026` or `10 Nov 2026` THE SYSTEM SHALL return `2026-11-10`.
2. IF the text has no date THEN THE SYSTEM SHALL use the caller's `fallbackDate` (the email Date header).

### Requirement 5: Merchant, cancel link, phone
**User Story:** As a user, I want a clean merchant name and the best way to cancel, so that the Cancel kit can help.

#### Acceptance Criteria
1. THE SYSTEM SHALL strip suffixes such as `.com`, `Inc.` and `Payments` from the merchant name (`normalizeMerchant`).
2. WHEN the text holds a cancel, unsubscribe, manage-subscription or billing link THE SYSTEM SHALL return the first one and never follow it.
3. WHEN the text says to cancel by phone, or a phone number sits near "cancel" THE SYSTEM SHALL set `phoneOnly` true and return the number.
4. THE SYSTEM SHALL return the `senderDomain` it was given.

### Requirement 6: Cancellation emails
**User Story:** As a user, I want cancellation confirmations noticed, so that savings can be confirmed.

#### Acceptance Criteria
1. WHEN the text says "has been cancelled" or similar THE SYSTEM SHALL make `isCancellationEmail` return true.
2. IF the text is marketing such as "cancel anytime" THEN THE SYSTEM SHALL return false.

### Requirement 7: Privacy
**User Story:** As a user, I want the email text dropped right after parsing, so that nothing is kept.

#### Acceptance Criteria
1. THE SYSTEM SHALL return only the structured fields and never the text.
