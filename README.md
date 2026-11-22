# 💀 Grim Renewal

> Make sure the dead stay dead.

Grim Renewal finds your forgotten subscriptions, scores how forgotten they are,
and sends the Reaper to cancel them — while you watch and approve every step.

## Live site

- Open the site (landing page first): https://vanichitkara.github.io/grim-renewal/
- The app: https://vanichitkara.github.io/grim-renewal/app.html. It stays locked until you sign in with Google.
- Demo (fake subscriptions, no sign-in): https://vanichitkara.github.io/grim-renewal/app.html?demo. The demo links on the landing page are temporary and will be removed before launch.
- Every push to `main` runs the tests, builds, and publishes through `.github/workflows/pages.yml`.
- Gmail sign-in runs in Google "testing" mode: only listed test users can connect.

## Cancellation Player (mock sites)

With `?simulate`, the Reaper cancels on dummy merchant sites under `public/mock/` while you watch.
You approve each click. Nothing real is cancelled. A real site will use the same driver through
the local Playwright bridge (see "Browser cancels").

## What it does

- **Finds** forgotten subscriptions from receipt emails (read-only Gmail, nothing but the key facts is kept).
- **Shows the answer first:** "You pay $X a month for N things you may have forgotten", with two honest savings numbers.
  *Avoided so far* counts only evidence (a cancellation email, or you saying you cancelled, plus charges that did not come).
  *Next 12 months* is an estimate and says so. A receipt gap alone is "No charge seen", never "Verified".
- **Scene or List:** a haunted mansion front (doors and windows, 8 per page) or a plain table that scales to any count.
- **Cancel kit:** Online / Email / Phone tabs. It opens on the method that worked for most people, and says why.
- **Shared tips ("what worked"):** after you cancel, you may choose to share, anonymously, which method worked for a company.
  Only the company's website name, the method and yes/no are sent, only when you tick a box that starts OFF.
  The app downloads one public list of settled answers and looks companies up on your own machine, so the server never learns
  which companies you have. See `docs/community-api.md`. **Without a deployed https server this works only on your machine;
  the live site shows the starter list.**
- **Trial guard:** a calendar reminder file two days before a free trial ends.

## Run the pieces

```bash
npm run dev          # the site (landing page first; the app is /app.html, locked until sign-in; /app.html?demo for the demo)
npm run community    # optional: the shared-tips server on http://127.0.0.1:8788
npm run bridge       # optional: the local browser bridge (see "Browser cancels")
```

Local shared tips: put `GRIM_COMMUNITY_URL=http://127.0.0.1:8788` in `.env` (see `.env.example`) and restart `npm run dev`.
The address is baked in at build time, is public, and is not a secret. On GitHub, set it as a repository **variable**
named `GRIM_COMMUNITY_URL` (an https address) before the Pages build.

Deploy the tips server to Google Cloud Run (your terminal, needs `gcloud auth login`):
`bash scripts/deploy-tips-gcp.sh <project-id> us-central1`. See `docs/community-api.md`.

Specs and decisions: `docs/specs/build-wave-2026-11-22.md`, `docs/specs/review-build-wave.md`, `docs/week-plan.md`.

## Concept

Every subscription is a zombie. Its size is the money it has eaten this year.
The more forgotten it is, the more rotten it looks.

The Reaper walks down the hallway, knocks on each door, and cancels the subscription.
If a cancellation can't be done automatically — it's phone-only — the Reaper runs away,
and the app gives you the phone number, a call script, and a chargeback letter template.

## Quickstart

```bash
npm install
npm run dev        # opens the landing page; the app is at http://localhost:5173/app.html
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
  ui/                           index.html = landing page, app.html = the app (sign-in gate), components

public/
  reaper.html                   Standalone animation prototype (Grim Renewal)
  assets/
    sprites/                    Drop pixel-art sprite sheets here
    sounds/                     Royalty-free sound effects here

docs/
  week-plan.md                  4-week build plan + demo video script
```

## Browser cancels (optional, on your own computer)

The browser bridge is a small program that runs on YOUR machine and opens a visible Playwright browser.
A website on the internet cannot reach it, so a hosted copy of this app never shows a bridge message.

1. Run `npm run bridge` once. It makes a key, saves it in `.env` (git-ignored), and opens a headed browser.
2. Start the dev server (`npm run dev`) and open the app. The dev server reads the key from `.env`
   and gives it to the page, so **every sign-in connects by itself**. No pasting, no link.
   (If you started the dev server before the key existed, restart it once.)
3. The header chip says "Browser: connected". If the bridge is off, on your machine it says
   "Browser cancels: off. Run: npm run bridge". On a hosted site it shows nothing.
4. Test without a real merchant: open `http://localhost:5173/app.html?demo&bridgetest` and press
   "Test the browser bridge". Add `&login=1` to check that a password page stops the run.
5. Trouble? `npm run bridge:check`. If no browser is found: `npx playwright install chromium`.
   A key from the printed link (`app.html#bridge=<key>`) or the Tuning panel still works and wins.

Where the key lives:
- `.env` on your machine only. `.env.example` shows the shape. The file is git-ignored.
- The key goes into the page only from the dev server. `vite build` never includes it (a test checks this),
  because a built site is public.
- Do not add it to Vercel or GitHub as a `VITE_` variable. Anything the browser can read is public.

The bridge listens on 127.0.0.1 only and accepts pages from `localhost:5173` and `127.0.0.1:5173`.
Never automated: password fields (login pages stop the run) and any click you have not approved.
Without the bridge, browser cancels stay off and the Boss Door guide is used instead.

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
