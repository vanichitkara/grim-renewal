# Requirements: Community Cancel Tips

## Introduction
Users can share which cancel method worked for a company (online, email, phone, other). Later users see "7 of 9 say it worked" and the Cancel kit opens on that tab. This is the one place data leaves the browser, so it is strict: a company website name, a method, and yes or no. Source plan: `docs/specs/build-wave-2026-11-22.md` section A and its review changes. API notes: `docs/community-api.md`. Steering: `.kiro/steering/privacy.md` (the shared-tips exception is recorded in the docs; the steering file is unchanged).

## Requirements

### Requirement 1: What is shared
**User Story:** As a user, I want to share only the minimum, so that nothing about me leaves my browser.

#### Acceptance Criteria
1. THE SYSTEM SHALL send only `merchantKey`, `method` (`online | email | phone | other`) and `worked` (true or false).
2. IF a request has any extra field, a key over 100 characters, a key with `@`, `/` or spaces, or an unknown method THEN THE SYSTEM SHALL reject it.
3. WHEN the user finishes a cancel THE SYSTEM SHALL show an opt-in checkbox, off by default, with the exact share text (`SHARE_TEXT`).
4. IF the box is not ticked THEN THE SYSTEM SHALL send no request to the community API.

### Requirement 2: Merchant keys
**User Story:** As a user, I want companies matched by their website name, so that reports pool correctly.

#### Acceptance Criteria
1. WHEN given a sender domain, URL or name THE SYSTEM SHALL return a lower-case registrable name such as `netflix.com`.
2. IF the sender is a payment or app-store processor THEN THE SYSTEM SHALL return `null`.
3. THE SYSTEM SHALL handle two-level suffixes such as `co.uk` and `com.au`.

### Requirement 3: Ranking
**User Story:** As a user, I want a tip only when enough people agree, so that one fake report cannot mislead me.

#### Acceptance Criteria
1. THE SYSTEM SHALL pick `best` only when a method has at least 5 reports and a Wilson lower bound (95%) of at least 0.40.
2. IF the rule is not met THEN THE SYSTEM SHALL return `best = null`.
3. WHEN a report is older than 12 months THE SYSTEM SHALL give it half weight, and drop it after 36 months.

### Requirement 4: API
**User Story:** As the owner, I want a small, safe server, so that abuse is limited.

#### Acceptance Criteria
1. THE SYSTEM SHALL serve `GET /health`, `GET /tips`, `GET /tips/all` and `POST /report`, and answer `OPTIONS`.
2. WHEN the request origin is not in the allow-list THE SYSTEM SHALL refuse it, and never send a wildcard CORS header.
3. IF the body is over 1 KB or the content type is not JSON THEN THE SYSTEM SHALL refuse it.
4. IF a key is not in `server/known-merchants.json` THEN THE SYSTEM SHALL reply `202` and drop the report, so the list cannot be probed.
5. THE SYSTEM SHALL allow one report per (ip, company) per day and 20 per hour per ip, using a salted hash of the ip kept in memory only.
6. THE SYSTEM SHALL never log bodies, ips or headers.
7. WHEN `GET /tips` answers THE SYSTEM SHALL send `Cache-Control: public, max-age=60`.

### Requirement 5: Client fallback
**User Story:** As a user, I want the app to work when the API is down, so that the Cancel kit still helps.

#### Acceptance Criteria
1. WHEN the API times out (6 s), errors or returns bad JSON THE SYSTEM SHALL retry once and then return the starter list, and never throw into the UI.
2. IF the base URL is empty THEN THE SYSTEM SHALL use the starter list only.
3. THE SYSTEM SHALL load the starter list from a relative URL so it works under `/grim-renewal/`.

### Requirement 6: Storage
**User Story:** As the owner, I want counts, not reports, so that no one can be identified.

#### Acceptance Criteria
1. THE SYSTEM SHALL store counts per (merchantKey, method, month) with `worked` and `failed`, and no per-report time.
2. THE SYSTEM SHALL write the file store atomically (temp file, then rename).
3. THE SYSTEM SHALL offer a Firestore store behind the same `TipStore` interface.
