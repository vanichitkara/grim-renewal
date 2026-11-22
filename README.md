# 💀 Grim Renewal

> Make sure the dead stay dead.

Grim Renewal finds your forgotten subscriptions, scores how forgotten they are,
and sends the Reaper to cancel them — while you watch and approve every step.

## Live site

- Landing page: https://vanichitkara.github.io/grim-renewal/landing.html
- Try the demo (fake subscriptions, no sign-in): https://vanichitkara.github.io/grim-renewal/index.html?demo
- Every push to `main` runs the tests, builds, and publishes through `.github/workflows/pages.yml`.
- Gmail sign-in runs in Google "testing" mode: only listed test users can connect.

## Cancellation Player (mock sites)

With `?simulate`, the Reaper cancels on dummy merchant sites under `public/mock/` while you watch.
You approve each click. Nothing real is cancelled. A real site will use the same driver through
the local Playwright bridge (see "Browser cancels").

## Concept

Every subscription is a zombie. Its size is the money it has eaten this year.
The more forgotten it is, the more rotten it looks.

The Reaper walks down the hallway, knocks on each door, and cancels the subscription.
If a cancellation can't be done automatically — it's phone-only — the Reaper runs away,
and the app gives you the phone number, a call script, and a chargeback letter template.

## Quickstart

```bash
npm install
npm run dev        # opens the landing page; the app is at http://localhost:5173/
npm test           # receipt parser + property-based tests
npm run typecheck  # TypeScript strict check
```

Open `public/reaper.html` directly in a browser for the standalone animation prototype.

## Project Structure

```
.kiro/
  specs/
    subscription-discovery.md   Scout agent: Gmail → Subscription records
    forgotten-score.md          Coroner agent: activity signals → forgottenScore
    cancellation-state-machine.md  Reaper agent: state transitions
    receipt-parser.md           Pure function spec + property-based test requirements
    kiro-crew-agents.md         Scout + Coroner + Reaper conductor pattern
  steering/
    animation.md                Canvas rules, palette, easing, accessibility
    privacy.md                  Gmail scope, storage, consent UI, demo rules

src/
  types.ts                      Core domain types (Subscription, AgentEvent, …)
  animation/
    ease.ts                     Named easing functions (use only these)
    tween.ts                    Interruptible tween engine
  pipeline/
    parse-receipt.ts            Receipt parser — pure function
    parse-receipt.test.ts       Unit + property-based tests (vitest + fast-check)
  agents/
    coroner.ts                  Forgotten score computation
    event-bus.ts                Shared in-memory event bus
  ui/                           App UI (index.html + components)

public/
  reaper.html                   Standalone animation prototype (Grim Renewal)
  assets/
    sprites/                    Drop pixel-art sprite sheets here
    sounds/                     Royalty-free sound effects here

docs/
  week-plan.md                  4-week build plan + demo video script
```

## Browser cancels (optional)

1. Run `npm run bridge`. It opens a headed Playwright browser and prints a link like `http://localhost:5173/#bridge=<key>`.
2. Start the app (`npm run dev`) and open that printed link. The page saves the key for this tab and hides it from the URL, so the Google redirect keeps it.
   You can also paste the key in the Tuning panel ("Browser bridge key").
3. Look at the chip in the header: "Browser: connected". Other chips: "bridge not found" (run step 1) or "wrong token" (open the newest link).
4. Test without a real merchant: open `http://localhost:5173/?bridgetest` and press "Test the browser bridge". Add `&login=1` to check that a password page stops the run.
5. Trouble? `npm run bridge:check`. If no browser is found: `npx playwright install chromium`.

The bridge listens on 127.0.0.1 only and accepts pages from `localhost:5173` and `127.0.0.1:5173`.
Never automated: password fields (login pages stop the run) and any click you have not approved.
Without the bridge, browser cancels stay stubbed.

## Kiro Crew Agents

| Agent | Role | Input | Output |
|-------|------|-------|--------|
| Scout | Finds subscriptions from Gmail receipts | Gmail OAuth token | `Subscription[]` |
| Coroner | Scores how forgotten each sub is | `Subscription[]` + activity signals | `Subscription[]` with `forgottenScore` |
| Reaper | Cancels one subscription | User approval + subscription record | `cancel_ok` or `cancel_fail` event |

## Privacy

- Gmail scope: `gmail.readonly` only.
- Query-level filtering — only receipt and billing emails are fetched.
- Raw email text is discarded after parsing. No message bodies stored.
- OAuth tokens held in memory only; never written to disk.
- See `.kiro/steering/privacy.md` for the full rules.

## Feature Names

| Feature | Name |
|---------|------|
| Cancellation agent | The Reaper |
| Free trials tab | The Graveyard |
| Charges that return | Revenants |
| Dormant accounts | Ghosts |
| Phone-only cancellations | Boss Door |

## Tagline

*"Budgeting apps tell you what you pay. We find what you forgot, catch trials before they charge you, and cancel them while you watch."*
