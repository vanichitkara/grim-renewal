# Design: Receipt Parser

## Overview
One module of pure functions in `src/pipeline/parse-receipt.ts`. The Scout calls it for every candidate message and discards the text at once. See `original-spec.md` for the first written spec.

## Architecture
```
message text + sender domain + Date header
  -> isBillingEmail -> parseAmount -> parseDate -> detectPhoneOnly, cancel URL, plan
  -> ReceiptFields | null
```

## Components and Interfaces
- `parseReceipt(messageText, senderDomain, fallbackDate?): ReceiptFields | null`
- `normalizeMerchant(raw): string`
- `isCancellationEmail(text): boolean`
- Callers: `scanInbox` in `src/pipeline/gmail-scout.ts` (snippet first, full body only if the snippet fails).

## Data Models
`ReceiptFields` in `src/types.ts`: `merchant, amount, currency, date, plan, renewalDate, trialEndDate, billingCycle, accountEmail, cancelUrl, phoneOnly, phone, memberId, senderDomain`.

## Error Handling
- Not a billing email, no amount, zero amount or no date: return `null`. The parser does not throw.
- A message the Scout cannot parse is skipped; the scan continues.

## Testing Strategy
- `src/pipeline/parse-receipt.test.ts`: null cases, USD/EUR/GBP amounts, cycle words, dates, phone-only, merchant names, total-over-subtotal rules, cancellation wording, `senderDomain` pass-through.
- Property tests with `fast-check` in the same file: positive amount for any valid USD string, `annual` for annual words, purity, positive finite amount.
- Not covered: the EU `10/11/2026` date form with locale signals.
