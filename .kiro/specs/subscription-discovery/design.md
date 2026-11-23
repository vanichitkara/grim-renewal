# Design: Subscription Discovery

## Overview
`scanInbox` lists message ids with one Gmail query, reads each message, parses it, and folds results into one record per merchant and account. See `original-spec.md` for the first written spec.

## Architecture
```
Gmail list (RECEIPT_QUERY, paged, max 300) -> get message (snippet, then body fallback)
  -> parseReceipt + isCancellationEmail -> Accumulator per (merchant, account) -> Subscription[]
```
`RECEIPT_QUERY` is `in:inbox (receipt OR renewal OR billing OR "your subscription" OR "trial ending" OR cancelled OR canceled OR "membership ends" OR "sorry to see you go") newer_than:13m`. The words for cancellation emails are best effort. Archived mail is not seen.

## Components and Interfaces
- `src/pipeline/gmail-scout.ts`: `scanInbox(token, accountEmail, sleep?, onProgress?)`, `extractText(payload)`, `ScanProgress`. Private `makeId` (Web Crypto sha256), `Accumulator`, `MAX_BODY_CHARS = 20_000`, `MAX_MESSAGES = 300`, `MAX_CHARGE_DATES = 36`.
- `src/pipeline/parse-receipt.ts`: see `receipt-parser`.
- `src/pipeline/gmail-profile.ts`: `fetchProfileEmail(accessToken)`.
- `src/pipeline/pipeline.ts`: `runPipeline` calls the scout.
- `src/ui/consent-banner.ts` and `src/ui/app.html`: consent text beside "Connect Gmail".

## Data Models
`Subscription` and `ReceiptFields` in `src/types.ts`. Optional fields `senderDomain`, `chargeDates`, `cancellationEmailDate`, `currency` keep older literals compiling.

## Error Handling
- 429: sleep 60 s, up to 3 retries, then throw.
- Per-message failure: skip and continue.
- Empty result: empty array, not an error.
- The token is never logged.

## Testing Strategy
- `src/pipeline/gmail-scout.test.ts`: inbox query not AND-ed with labels, headers requested, merchant and date, empty result, progress counts, `senderDomain`/`currency`/`chargeDates`, cancellation-email date only.
- `src/pipeline/gmail-scout-body.test.ts`: the body fallback.
- `src/pipeline/gmail-profile.test.ts`: profile email.
- `src/ui/app-gate.test.ts`: consent text on the gate screen.
- Not tested: a live Gmail inbox with 5 or more receipts (a user step).
