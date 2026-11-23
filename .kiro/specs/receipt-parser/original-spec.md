# Spec: Receipt Parser

## Overview
Parses a single Gmail message and extracts billing fields.
Pure function: `parse(messageText: string, senderDomain: string): ReceiptFields | null`

Returns `null` if the message is not a billing email.

## Output Shape
```typescript
interface ReceiptFields {
  merchant: string;        // normalized sender name
  amount: number;          // positive float, in units of currency
  currency: string;        // ISO 4217 (e.g. "USD", "EUR", "GBP")
  date: string;            // ISO 8601 date (YYYY-MM-DD)
  plan: string | null;
  renewalDate: string | null;
  trialEndDate: string | null;
  billingCycle: 'monthly' | 'annual' | 'unknown';
  accountEmail: string | null;
  cancelUrl: string | null;
  phoneOnly: boolean;
  phone: string | null;
  memberId: string | null;
}
```

## Amount Parsing Rules
Normalize all amounts to a positive float.

Patterns to handle (non-exhaustive):
- `$9.99` → 9.99 USD
- `€99,00` → 99.00 EUR  (European comma-decimal)
- `£14.99/month` → 14.99 GBP monthly
- `$119.99/year` → 119.99 USD annual
- `USD 9.99` → 9.99 USD
- `9.99 USD` → 9.99 USD
- `Free` or `$0.00` → skip (not a paid charge)

## Billing Cycle Detection
- Annual if: "year", "annual", "annually", "/yr", "12 months" present near amount
- Monthly if: "month", "monthly", "/mo", "per month" present near amount
- Unknown otherwise

## Date Parsing
Accept any of:
- `November 10, 2026`
- `10 Nov 2026`
- `2026-11-10`
- `11/10/2026` (US format)
- `10/11/2026` (EU format — disambiguate by locale signal in email)

Normalize to ISO 8601 `YYYY-MM-DD`.

## Merchant Normalization
Strip common suffixes: "Inc.", "LLC", "Ltd.", "Corp.", ".com", "Payments"
Capitalize first letter. Examples:
- `netflix.com` → `Netflix`
- `Adobe Inc.` → `Adobe`
- `GOOGLE PAYMENTS` → `Google`

## Cancel URL Detection
Look for links containing: "cancel", "unsubscribe", "manage subscription", "billing"
Return the first such URL. Do not follow it.

## Phone-Only Detection
Set `phoneOnly: true` if the message contains:
- "call us to cancel"
- "cancel by phone"
- "cancellations must be made by phone"
- A phone number within 20 characters of the word "cancel"

## Property-Based Test Requirements
The parser must pass property-based tests for:
1. Any valid USD amount string → parsed as positive float
2. Any valid EUR amount string with comma decimal → parsed correctly
3. Annual amounts → `billingCycle === 'annual'`
4. `parse` on a non-billing email → returns `null`
5. Running `parse` twice on the same input → identical output (pure function)
6. Amount is always positive; `parse` returns `null` for $0.00 or "Free"

Use `fast-check` for property-based testing.

## Acceptance Conditions
- Parser handles all amount formats in this spec without throwing.
- Returns `null` for a plain text email with no billing signals.
- Phone-only detection triggers on the patterns above.
- All property-based tests pass.
