# Design: Forgotten Score (Coroner)

## Overview
A pure scoring function plus a thin list mapper. The input signals come from an activity scout. The pipeline calls both after the inbox scan. See `original-spec.md` for the first written spec.

## Architecture
```
scanInbox (Subscription[]) -> scanActivitySignals -> scoreSubscriptions -> emit 'discovered', 'scored'
```
This runs inside `runPipeline` in `src/pipeline/pipeline.ts`.

## Components and Interfaces
- `src/agents/coroner.ts`: `computeForgottenScore(signals: ActivitySignals): number`, `scoreSubscriptions(subs, signals): Subscription[]` (returns a new list, never mutates).
- `src/pipeline/activity-scout.ts`: `scanActivitySignals(token, subs)`. It is a stub. It returns `daysSinceLoginAlert: null`, `daysSinceActivityEmail: null`, `chargesWithoutActivity: sub.chargeCount`, `isTrialOnly: false`.
- `src/kit/view-model.ts`: `FORGOTTEN_AT = 0.5`, `headerModel`, `forgottenWords(score)`, `listRows`.

## Data Models
`ActivitySignals { subscriptionId; daysSinceLoginAlert: number|null; daysSinceActivityEmail: number|null; chargesWithoutActivity: number; isTrialOnly: boolean }`. `Subscription.forgottenScore: number` (0 until scored).

## Error Handling
- A subscription with no matching signal entry keeps its score.
- Null days fall back to 365, so the score never becomes NaN.
- The output is clamped with `Math.max(0, Math.min(1, ...))`.

## Testing Strategy
- `src/pipeline/parse-receipt.test.ts` holds a property test that a score stays in [0, 1].
- There is no `coroner.test.ts` yet. The two numeric examples (login alert yesterday, 12 months silent) are not pinned by a test. This is listed in `tasks.md`.
