# Spec: Cancellation State Machine (Reaper Agent)

## Overview
The Reaper agent drives each subscription through a cancellation flow.
It announces each state transition to the UI, waits for the actual result,
then picks the right branch. The user approves every cancellation before it starts.

## States

```
idle
  → queued          (user clicks "Send the Reaper")
  → walking         (Reaper animation starts)
  → knocking        (Reaper reaches the door, knock animation plays)
  → opening         (door opens, zombie revealed)
  → cancelling      (cancellation attempt in flight)
  → reaping         (cancellation succeeded, scythe swing)
  → dead            (zombie dissolved, tombstone shown, savings counted)
  → boss            (cancellation failed / phone-only, Reaper fled)
  → boss_resolved   (user confirmed phone cancellation, zombie killed)
```

## Cancellation Methods (in priority order)

### 1. Direct API (highest priority)
When a known merchant has a documented REST endpoint for cancellation,
call it with the user's account token. User approves before the call is made.
Show the API response in the UI.

### 2. Browser automation (Playwright)
For merchants with a cancel page behind a login:
- Open the cancel page URL (from the subscription's `cancelUrl`)
- The user watches the browser window and clicks "Approve" at each step
- The agent navigates; the user confirms every destructive action
- Never fill in passwords automatically

### 3. Unsubscribe header (newsletters / marketing only)
For non-paid subscriptions with a `List-Unsubscribe` email header:
- POST to the unsubscribe URL
- This is fully automatic; no browser needed
- Confirm with user before sending

### 4. Boss Door (phone-only)
When none of the above work, or when `phoneOnly: true`:
- Reaper flees (animation)
- Display: phone number, member ID, call script, chargeback letter template
- After user calls: "I cancelled it on the phone" button triggers `boss_resolved`
- Reaper returns and kills the zombie

## User Approval Gate
Before ANY method (1, 2, or 3), display:
- Merchant name
- Plan name and amount
- Cancellation method that will be used
- "Approve cancellation" and "Skip for now" buttons

The state machine does not advance past `knocking` until the user approves.

## Idempotency
Running a cancel on a subscription already in state `dead` or `boss_resolved`
is a no-op. The UI shows the final state without re-triggering.

## Revenants
If a new receipt arrives after a subscription reaches `dead`, its state resets to `idle`
and a "Revenant!" badge appears. The zombie rises from the tombstone.

## Acceptance Conditions
- Attempting to cancel a `dead` subscription returns its current state without side effects.
- After `boss_resolved`, the subscription moves to `dead` with the correct `savedPerYear`.
- A sequence of: approve → cancel → succeed → dead produces exactly one savings counter increment.
- State transitions are logged with timestamps (for the "how we used Kiro" write-up).
