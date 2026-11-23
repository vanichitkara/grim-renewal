# Spec: Subscription Discovery Pipeline

## Overview
The Scout agent reads a user's Gmail (read-only) and extracts subscription data.
It never stores full email bodies. It outputs structured subscription records.

## Inputs
- Gmail OAuth token (scope: `gmail.readonly`)
- User-approved email address

## Gmail Query
Search: `(receipt OR renewal OR billing OR "your subscription" OR "trial ending") newer_than:13m`

Do NOT search contacts, drafts, or sent mail.

## Extraction Rules
For each matching message, extract:
1. `merchant` — sender domain or display name (e.g. "Netflix", "adobe.com")
2. `amount` — the charged amount, normalized to USD float
3. `currency` — ISO 4217 code
4. `date` — ISO 8601 date of the charge
5. `plan` — plan name if present (e.g. "Premium 4K")
6. `renewal_date` — next renewal date if present
7. `trial_end` — trial end date if present (free trial detection)
8. `account_email` — the email address the subscription is under

Do NOT store: message body, subject line beyond the above fields, thread IDs.

## Deduplication
Group by `merchant` + `account_email`. One subscription record per pair.
If multiple amounts exist for one merchant, pick the most recent non-zero amount.

## Output Shape
```typescript
interface Subscription {
  id: string;               // sha256(merchant + accountEmail)[:8]
  merchant: string;
  plan: string | null;
  monthlyAmount: number;    // normalized: annual ÷ 12
  billingCycle: 'monthly' | 'annual' | 'unknown';
  chargeCount: number;      // receipts found in last 13 months
  totalSpent: number;       // sum of charges found
  lastChargeDate: string;   // ISO 8601
  renewalDate: string | null;
  trialEndDate: string | null;
  accountEmail: string;
  cancelUrl: string | null; // deep link to cancel page if known
  phoneOnly: boolean;       // true when cancel requires a call
  phone: string | null;
  memberId: string | null;
  forgottenScore: number;   // 0–1, computed by Coroner agent
}
```

## Privacy Controls
- Request only `gmail.readonly`. Never request write, send, or delete.
- Filter at the API query level; do not download and filter client-side.
- Discard raw message text after extraction. Store only the fields above.
- The full body is fetched only when the preview (snippet) fails to parse, and is discarded immediately after parsing.
- Display "The Reaper only reads receipts" in the UI before OAuth consent.
- For the hackathon: use Google OAuth testing mode (up to 100 test users, no security review needed).

## Error Handling
- Quota exceeded: back off 60 s, retry up to 3 times, then surface error to user.
- Parse failure on a message: log merchant + date, skip the message, continue.
- Zero subscriptions found: surface empty state with instructions to check the demo account.

## Acceptance Conditions
- Given a seeded Gmail test account with ≥ 5 subscription receipts, the pipeline returns ≥ 5 subscription records.
- Amount parsing handles: USD, EUR, GBP; monthly and annual billing; "$9.99/mo" and "€99/year" formats.
- Running the pipeline twice on the same account returns the same set of IDs (idempotent).
- No raw email body or subject line is present in the output.
