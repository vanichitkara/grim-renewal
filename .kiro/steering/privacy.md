# Steering: Privacy Rules

These rules are non-negotiable. Every agent that touches email or user data must follow them.

## Gmail Access
- Scope: `gmail.readonly` only. Never request write, send, delete, or labels scopes.
- Query only: inbox and promotions. Never drafts, sent, or trash.
- Filter at the API query level (use Gmail's `q` parameter). Do not download all messages and filter locally.
- Discard raw message text immediately after field extraction. Store only the structured fields defined in `subscription-discovery.md`.
- Never log message bodies, subject lines, or sender email addresses beyond what is in the Subscription record.

## Storage
- Do NOT persist OAuth tokens to disk. Hold them in memory for the session only.
- Subscription records may be persisted to localStorage (browser) or a local SQLite file.
- Never send subscription data to any third-party endpoint.
- Never store: message IDs, thread IDs, full email addresses beyond `accountEmail` on the subscription record.

## Consent UI
Before the Gmail OAuth flow, display this exact text:
> "The Reaper only reads receipts. We search your inbox for billing emails,
>  extract the merchant name, amount, and date, and discard the rest.
>  We never read your personal email, store message content, or share your data."

This text must appear on the same screen as the "Connect Gmail" button.

## Demo / Hackathon Mode
- Use Google OAuth testing mode (up to 100 test users, no security review).
- Provide a demo Gmail account in the private submission form. Seed it with fake receipts.
- Do not use a real personal Gmail account in any demo video or screenshot.

## Cancellation
- Never fill in a password field automatically via browser automation.
- Always display what the Reaper is about to do before doing it.
- Never submit a form in the browser without an explicit user approval event.
