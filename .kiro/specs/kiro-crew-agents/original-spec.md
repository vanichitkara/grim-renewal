# Spec: Kiro Crew Agents

## Three Agents

### Scout
**Purpose:** Find subscriptions. Read Gmail receipts. Output structured data.
**Dispatched by:** Conductor when user connects Gmail.
**Acceptance:** ≥ 1 subscription record returned per distinct merchant found.
**Tools:** Gmail MCP (read-only), receipt parser, deduplication.
**Does NOT:** write email, access any folder other than inbox/promotions, store raw bodies.

### Coroner
**Purpose:** Score how forgotten each subscription is.
**Input:** Subscription list from Scout.
**Output:** Same list with `forgottenScore` populated.
**Dispatched by:** Conductor after Scout completes.
**Acceptance:** Every subscription has `forgottenScore` in [0, 1].
**Tools:** Gmail MCP (read-only, checks for activity signals), scoring formula.

### Reaper
**Purpose:** Execute cancellations, one subscription at a time.
**Input:** A single subscription record + user approval event.
**Output:** Updated subscription state (`dead` or `boss`).
**Dispatched by:** Conductor once per cancellation the user approves.
**Tools:** Playwright MCP (browser automation), HTTP client (direct API), email unsubscribe.
**Does NOT:** advance past `knocking` without an explicit user approval event.
**One item per session:** each Reaper session handles exactly one subscription.

## Conductor
Owns the full goal. Dispatches Scout once per session, Coroner once after Scout,
and one Reaper per user-approved cancellation. Reads worker status after each round.
Updates the UI state via the animation event bus.

## Crew Eligibility
This setup (Scout + Coroner + Reaper conductor pattern) qualifies the submission
for the "Best Kiro Crew App" category.

## MCP Servers Required
| Server | Purpose | Approval level |
|--------|---------|----------------|
| `gmail-mcp` | Read inbox receipts | User approves OAuth scope |
| `playwright-mcp` | Browser-based cancellation | User approves each navigation step |

## Event Bus
All agents write events to a shared in-memory bus keyed by `subscriptionId`.
The animation layer reads this bus to drive state transitions.

```typescript
type AgentEvent =
  | { kind: 'discovered';    subscriptionId: string; data: Subscription }
  | { kind: 'scored';        subscriptionId: string; forgottenScore: number }
  | { kind: 'approved';      subscriptionId: string }
  | { kind: 'cancel_start';  subscriptionId: string; method: CancelMethod }
  | { kind: 'cancel_ok';     subscriptionId: string; confirmedAt: string }
  | { kind: 'cancel_fail';   subscriptionId: string; reason: string }
  | { kind: 'boss_resolved'; subscriptionId: string }
  | { kind: 'revenant';      subscriptionId: string; newChargeDate: string }
```

## Acceptance Conditions
- Scout, Coroner, and Reaper can run concurrently for different subscriptions.
- Reaper for subscription A does not affect Reaper for subscription B.
- After `cancel_ok`, re-running Scout does not re-add the subscription (Revenant detection excluded).
