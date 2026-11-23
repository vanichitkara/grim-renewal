# Design: Verified Savings

## Overview
Pure functions turn a subscription's charge dates plus an optional claim into an `Assessment`. The scout supplies the dates; the UI never recomputes the rules.

## Architecture
```
scanInbox (chargeDates, cancellationEmailDate, senderDomain, currency)
  -> runPipeline -> sweepForChanges(prev scan, new scan, claims) -> onSweep
assessCancellation({sub, claim, now}) -> Assessment -> kit/status.ts -> UI words
```

## Components and Interfaces
- `src/savings/cadence.ts`: `usualGapDays(chargeDates, cycle)`, `expectedNext(lastDate, gapDays)`, `nominalGapDays`, `cleanDates`, `dayNumber`, `isoFromDay`, `DAY_MS`.
- `src/savings/assess.ts`: `assessCancellation({sub, claim, now}): Assessment`, `sumByCurrency`, `GRACE_DAYS = 5`, types `Level`, `Claim`, `Assessment`. A private processor list (apple, google, paypal, stripe and others) stops missed-receipt claims.
- `src/savings/sweep.ts`: `sweepForChanges(prev, scanned, claims)`, type `SweepResult`.
- `src/state/claims.ts`: `loadClaims`, `saveClaim`, `clearClaim`, `CLAIMS_KEY = 'grim_claims'`; storage is injected.
- `src/pipeline/parse-receipt.ts`: `isCancellationEmail`.
- `src/pipeline/gmail-scout.ts`: fills the optional `Subscription` fields.
- `src/kit/status.ts`: `statusFor` maps a level to display words.

## Data Models
`Assessment` carries `level`, optional `since` and `expectedBy`, `missedRenewals`, `avoidedAmount`, `projected12m`, `notes`. `Claims = Record<id, ISO date>`. `Subscription` gains optional `chargeDates`, `cancellationEmailDate`, `senderDomain`, `currency`.

## Error Handling
- Corrupt or missing storage gives no claims.
- No history gives `none` with a note.
- Dates are validated before use; invalid dates are ignored.

## Testing Strategy
- `src/savings/assess.test.ts`: a table of realistic histories with exact level, amount and notes; annual $120 case; currency sums; property tests (never negative, deterministic, never verified without a basis, `came_back` after a claim, never likely for annual or unknown).
- `src/state/claims.test.ts`: claims storage and `sweepForChanges`.
- `src/pipeline/gmail-scout.test.ts` and `parse-receipt.test.ts`: the new fields and `isCancellationEmail`.
- `src/kit/kit.test.ts`: `statusFor` words ("Verified" only for level `verified`).
- Not verified: behaviour on a real inbox over months.
