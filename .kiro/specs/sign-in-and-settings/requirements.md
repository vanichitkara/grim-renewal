# Requirements: Sign-in and Settings

## Introduction
Google sign-in lasts until the user signs out (owner ruling, 2026-11-23). The `gmail.readonly` token lives in the browser until Google's own expiry (about 1 hour), then the app asks again silently. Settings has Sign out and sound controls. Steering: `.kiro/steering/privacy.md` (Storage and Consent sections).

## Requirements

### Requirement 1: Token storage
**User Story:** As a user, I want to stay signed in, so that I do not log in on every visit.

#### Acceptance Criteria
1. WHEN Google returns a token THE SYSTEM SHALL keep it in `localStorage` key `grim_auth` with its expiry (default 3600 s) and the account email.
2. THE SYSTEM SHALL treat a token as expired 60 s before Google does.
3. THE SYSTEM SHALL never write the token to a server, a file or a log, and never ask for a refresh token or offline access.
4. IF storage holds junk THEN THE SYSTEM SHALL ignore it.

### Requirement 2: Silent re-auth
**User Story:** As a user, I want a fresh token without a click, so that scans keep working.

#### Acceptance Criteria
1. WHEN the token expired AND the user never signed out AND this tab has not tried THE SYSTEM SHALL ask Google with `prompt=none`.
2. THE SYSTEM SHALL try once per tab, so a redirect loop cannot happen.
3. IF Google answers `interaction_required`, `login_required`, `consent_required` or `account_selection_required` THEN THE SYSTEM SHALL show the Connect button.
4. WHEN a token expires THE SYSTEM SHALL drop the token and keep the email.

### Requirement 3: Sign out
**User Story:** As a user, I want sign out to remove my data, so that the device keeps nothing of mine.

#### Acceptance Criteria
1. WHEN the user presses "Sign out" THE SYSTEM SHALL revoke the token at Google, best effort.
2. IF the network fails THEN THE SYSTEM SHALL still clear local state.
3. THE SYSTEM SHALL remove `grim_auth`, `grim_subs`, `grim_claims`, `grim_celebrated` and the silent-try flag, and keep device settings (sound, view).
4. WHEN sign out finishes THE SYSTEM SHALL reload the page.

### Requirement 4: Sign-in gate and consent
**User Story:** As a user, I want to read what the Reaper reads before connecting, so that I can decide.

#### Acceptance Criteria
1. WHILE the page is locked THE SYSTEM SHALL show only the header and the gate.
2. THE SYSTEM SHALL show the exact privacy consent text on the same screen as "Connect Gmail".
3. THE SYSTEM SHALL build the redirect URI from the current location so it works under the GitHub Pages sub-path.

### Requirement 5: Settings panel
**User Story:** As a user, I want one place for account and sound, so that I can manage both.

#### Acceptance Criteria
1. WHEN the user opens Settings THE SYSTEM SHALL show "Signed in as <email>" or "Not signed in.", and a Sign out button only when signed in.
2. THE SYSTEM SHALL offer a sound on/off box, a volume slider and a test sound.
3. WHEN Escape is pressed or the backdrop is clicked THE SYSTEM SHALL close the dialog and return focus to the opener.
4. THE SYSTEM SHALL write email text with `textContent` only.
