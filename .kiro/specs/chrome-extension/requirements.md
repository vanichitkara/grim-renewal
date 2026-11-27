# Requirements: Reaper Chrome Extension

## Introduction
The live site cannot reach a local bridge without a terminal. A small Chrome extension (Manifest V3) lets the site cancel in the user's own signed-in Chrome. It is loaded unpacked for the hackathon. The local bridge stays as a backup.

## Requirements

### Requirement 1: Detect and prefer the extension
**User Story:** As a user, I want cancels to work with no terminal, so that I only install one extension.

#### Acceptance Criteria
1. WHEN the app loads and the extension answers `ping` THE SYSTEM SHALL register it as the browser adapter and show "Browser: Reaper extension".
2. IF the extension does not answer THEN THE SYSTEM SHALL use the existing bridge logic unchanged.
3. THE extension ID SHALL be stable (manifest `key`) and exported as `EXTENSION_ID`.

### Requirement 2: Only the app may talk to it
#### Acceptance Criteria
1. THE extension SHALL accept messages only from origins in `externally_connectable.matches`, checked again on `sender.origin`.
2. THE extension SHALL answer any unknown command, including `type`, with `tool_not_allowed`.

### Requirement 3: Least permission
#### Acceptance Criteria
1. THE extension SHALL declare only `scripting` and `storage`, and host access as optional.
2. WHEN the app asks to open a site without host permission THE extension SHALL open its own window with an Allow button and call `chrome.permissions.request` from that click.
3. IF the user refuses THEN THE adapter SHALL return `permission_denied` and the Reaper SHALL fall back to the Cancel kit.

### Requirement 4: Privacy (steering `privacy.md`)
#### Acceptance Criteria
1. THE extension SHALL never type, fill or read a password; a password input gets no ref and a click on it or on a control holding it SHALL be refused.
2. THE app SHALL still call `confirm()` before every click.
3. THE extension SHALL use one tab it opened, and SHALL not log or store page text or URLs.
4. THE extension SHALL send nothing to any server.
