# Requirements: Kiro Crew Agents

## Introduction
Grim Renewal is built as a crew: a Conductor dispatches a Scout (find subscriptions), a Coroner (score them) and a Reaper (cancel, one per approved subscription). Agents talk through one in-memory event bus keyed by `subscriptionId`. The full original text is kept in `original-spec.md`.

## Requirements

### Requirement 1: Scout
**User Story:** As a user, I want a read-only agent to find my subscriptions, so that nothing in my mailbox changes.

#### Acceptance Criteria
1. WHEN the user connects Gmail THE SYSTEM SHALL run the Scout once for that session.
2. THE SYSTEM SHALL return at least one subscription record per distinct merchant found.
3. THE SYSTEM SHALL read only the inbox and never write, send or delete mail, and never keep raw message bodies.

### Requirement 2: Coroner
**User Story:** As a user, I want each subscription scored, so that I see which are forgotten.

#### Acceptance Criteria
1. WHEN the Scout finishes THE SYSTEM SHALL run the Coroner once on its list.
2. THE SYSTEM SHALL give every scored subscription a `forgottenScore` in [0, 1].

### Requirement 3: Reaper
**User Story:** As a user, I want one Reaper per approved cancellation, so that one failure cannot hurt another.

#### Acceptance Criteria
1. WHEN the user approves a cancellation THE SYSTEM SHALL run one Reaper for that subscription only.
2. THE SYSTEM SHALL keep Reaper state per subscription id, so that two Reapers never share state.
3. THE SYSTEM SHALL not advance past `knocking` without an `approved` event.

### Requirement 4: Event bus
**User Story:** As the builder, I want one typed event stream, so that the animation and the UI follow the real result.

#### Acceptance Criteria
1. WHEN an agent changes a subscription THE SYSTEM SHALL emit one of the `AgentEvent` kinds: `discovered`, `scored`, `approved`, `cancel_start`, `cancel_ok`, `cancel_fail`, `boss_resolved`, `revenant`.
2. WHEN a listener subscribes by id THE SYSTEM SHALL deliver only events for that id.
3. THE SYSTEM SHALL let the animation layer read the bus and not call the agents directly.

### Requirement 5: Concurrency and rescans
**User Story:** As a user, I want several subscriptions handled at once, so that a long queue finishes.

#### Acceptance Criteria
1. THE SYSTEM SHALL let Scout, Coroner and Reaper run for different subscriptions at the same time.
2. WHEN a scan runs again after `cancel_ok` THE SYSTEM SHALL treat a later charge as a revenant and not as a new subscription (see `cancellation-state-machine`).

### Requirement 6: Required MCP servers
**User Story:** As the owner, I want each tool scoped and approved, so that the agents have the least power they need.

#### Acceptance Criteria
1. THE SYSTEM SHALL read Gmail with the `gmail.readonly` scope only.
2. WHEN a browser step would change something THE SYSTEM SHALL ask the user first.
