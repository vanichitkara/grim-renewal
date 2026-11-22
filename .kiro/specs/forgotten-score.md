# Spec: Forgotten Score (Coroner Agent)

## Overview
The Coroner agent takes a list of subscriptions from the Scout and assigns each one
a `forgottenScore` between 0 and 1. Higher means more forgotten.

The score drives:
- Zombie visual decay in the animation (rotten skin, spots, twitching)
- Sort order in the Horde list (most forgotten first)
- The "Ghosts" badge for dormant accounts still holding card data

## Signals

### Strong signals (high weight)
| Signal | Direction | Notes |
|--------|-----------|-------|
| Days since last login alert email | +forgotten | "Someone signed in to your account" |
| Days since last activity email | +forgotten | "Your weekly summary", "Here's what you watched" |
| Receipts arriving with zero activity emails | +forgotten | Charges keep coming but no usage signals |
| Trial-only history (no paid receipts after trial end) | +forgotten | Still being charged but never actually used |

### Weak signals (low weight)
| Signal | Direction | Notes |
|--------|-----------|-------|
| Subscription age | +forgotten | Older subscriptions skew forgotten |
| Number of months charged | neutral | Used to normalize totalSpent |

### Negative signals (reduce forgotten score)
| Signal | Direction | Notes |
|--------|-----------|-------|
| Activity email in last 30 days | -forgotten | Still using it |
| Login alert in last 14 days | -forgotten | Active account |

## Formula
```
raw = (daysSinceActivity / 365) * 0.6
    + (chargesWithoutActivity / totalCharges) * 0.3
    + (isTrialOnly ? 0.1 : 0.0)

forgottenScore = clamp(raw - activeSignalPenalty, 0, 1)

activeSignalPenalty = 0.3 if loginAlertWithin14d
                    + 0.2 if activityEmailWithin30d
```

If no activity signal is found at all (no login alerts, no activity emails),
treat `daysSinceActivity` as 365.

## Output
Returns the full Subscription list with `forgottenScore` populated.
Does not modify any other field.

## Acceptance Conditions
- A subscription with a login alert yesterday scores ≤ 0.1.
- A subscription with receipts for 12 months and no activity emails scores ≥ 0.7.
- Scores are always in [0, 1].
- Property-based test: for any valid subscription record, `forgottenScore` is a float in [0, 1].
