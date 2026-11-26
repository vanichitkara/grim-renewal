# 💀 Grim Renewal

> Make sure the dead stay dead.

**What:** Grim Renewal reads your Gmail receipts (read-only), finds the subscriptions you forgot,
and helps you cancel them. A Reaper does the clicking while you watch and approve every step.

**Who:** anyone paying for things they stopped using: streaming, apps, gyms, free trials that quietly turned paid.

**Why:** people forget subscriptions they still pay for, and cancelling is made hard on purpose.
Grim Renewal shows the number first ("You pay $X a month for N things you may have forgotten"),
counts savings only when there is proof, and shares which cancel method really worked, anonymously, so the next person has it easier.

**Try it in 10 seconds:** [the demo, no sign-in](https://vanichitkara.github.io/grim-renewal/app.html?demo).

**Built with Kiro:** spec-driven development (10 specs in [`.kiro/specs`](.kiro/specs/README.md)),
steering ([`.kiro/steering`](.kiro/steering/)), agent hooks ([`.kiro/hooks`](.kiro/hooks/)),
MCP (Playwright MCP drives the browser), and Kiro Crew agents. See [How we built it with Kiro](#how-we-built-it-with-kiro).

## Live site

- Open the site (landing page first): https://vanichitkara.github.io/grim-renewal/
- The app: https://vanichitkara.github.io/grim-renewal/app.html. It stays locked until you sign in with Google.
- Demo (fake subscriptions, no sign-in): https://vanichitkara.github.io/grim-renewal/app.html?demo. It stays on purpose: Google's testing mode lets only listed test users sign in, so this is how judges can try everything. The demo never saves anything and never shares tips.
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
- **Scene or List:** a haunted mansion front (doors on two floors, 8 per page, paging for more) or a plain table that scales to any count.
- **Cancel kit:** Online / Email / Phone tabs. It opens on the method that worked for most people, and says why.
- **Shared tips ("what worked"):** after you cancel, you may choose to share, anonymously, which method worked for a company.
  Only the company's website name, the method and yes/no are sent, only when you tick a box that starts OFF.
  The app downloads one public list of settled answers and looks companies up on your own machine, so the server never learns
  which companies you have. See `docs/community-api.md`. **Without a deployed https server this works only on your machine;
  the live site shows the starter list.**
- **Trial guard:** a calendar reminder file two days before a free trial ends.

## How we built it with Kiro

Grim Renewal was built spec-first, with steering rules Kiro had to obey and hooks that check its work on every save.
A Kiro Crew team lead planned each round, handed big pieces to worker sessions, and accepted nothing on a worker's word.

| Kiro surface | Where | What it did for us |
|---|---|---|
| **Specs** | [`.kiro/specs/`](.kiro/specs/README.md) | 10 features, each with `requirements.md` (EARS criteria), `design.md` (real files and functions) and `tasks.md` (ticked only when code and tests exist). |
| **Steering** | [`.kiro/steering/privacy.md`](.kiro/steering/privacy.md), [`animation.md`](.kiro/steering/animation.md) | Hard rules every agent followed: `gmail.readonly` only, exact consent text, no auto-filled passwords; one palette, named easings, reduced motion, dt cap. |
| **Hooks** | [`.kiro/hooks/`](.kiro/hooks/) | `privacy-guard` and `palette-guard` check each saved file against the steering rules and hand problems back to the agent. `test-on-save` runs the tests that import the file. `spec-sync` makes the agent untick any task the code does not really have. |
| **Kiro Crew** | team lead + worker sessions | A work ledger with one acceptance bar per item; an evaluator (not the worker) decides "done". A separate reviewer session read each round and found the bugs below. |
| **MCP** | Playwright bridge (`npm run bridge`) | Lets the Reaper drive a real browser on your own machine, with your approval on every click. |
| **Agent checks** | real Chrome scripts | Each change was checked in headless Chrome (sign-in, refresh, demo, paging, tags, fonts) and with screenshots, not only unit tests. 319 unit tests today. |

### Where Kiro surprised us

- **It caught a privacy leak in our own design.** The first plan asked the tips server "what works for Netflix?". The reviewer session pointed out that this tells the server which companies you pay for. We switched to downloading one public list and looking it up on your machine.
- **It argued us out of AI phone calls.** We wanted the Reaper to phone companies. Kiro laid out the consent and recording rules for AI calls and proposed a call kit (script and email draft) instead. Simpler, legal, and it works today.
- **It refused to call a guess "verified".** Kiro researched how other apps count savings and pushed for evidence levels: a missing receipt is "No charge seen", and only a cancellation plus a quiet billing cycle is "Verified".
- **It debugged an empty inbox.** A real Gmail scan found nothing. Kiro traced it to Gmail's `labelIds` meaning AND, not OR, and fixed the query.
- **It took the least-privilege path when a deploy failed.** Cloud Run's build hit PERMISSION_DENIED. Instead of widening the default account, Kiro made a dedicated build account with two roles.
- **It wrote its own guardrails.** Kiro wrote the hooks above to enforce the steering it was given. `src/tooling/hooks.test.ts` feeds them known-bad lines and checks they are caught, and checks every source file passes today. A reviewer session then found that test-on-save was silently running zero tests, and it was fixed.

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


## Project Structure

```
.kiro/
  specs/<feature>/              requirements.md, design.md, tasks.md for 10 features (see .kiro/specs/README.md)
  steering/
    privacy.md                  Gmail scope, storage, consent text, cancellation rules
    animation.md                Canvas rules, palette, easing, accessibility
  hooks/                        privacy-guard, palette-guard, test-on-save, spec-sync

scripts/
  hooks/                        The scripts the hooks run (tested in src/tooling/hooks.test.ts)
  deploy-tips-gcp.sh            Deploy the tips server to Cloud Run

src/
  types.ts                      Core domain types (Subscription, AgentEvent, …)
  animation/                    Canvas mansion, graveyard, sprites, particles, sound, named easings
  pipeline/                     Gmail scout, receipt parser, sign-in (session-auth.ts), bridge client
  agents/                       Coroner, Reaper, event bus, cancel adapters
  savings/                      Evidence levels and verified savings
  kit/                          Status words, Cancel kit model, trial reminder (.ics)
  community/                    Shared tips client and Firestore store
  state/                        "I cancelled it" claims
  ui/                           index.html = landing page, app.html = the app, Settings, Cancel kit, dialogs
  tooling/                      Tests for the Kiro hook scripts

server/                         Tips API (Cloud Run) and the local Playwright bridge

public/
  mock/                         Fake merchant sites for the Cancellation Player
  data/                         Starter cancel-method list

docs/
  video-script.md               3-minute demo video, shot by shot
  week-plan.md                  Build plan and backlog
  specs/                        Build-wave plan and review reports
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
- Sign-in lasts until you sign out: the `gmail.readonly` token stays in your browser only until Google's own expiry (about an hour), then a silent `prompt=none` re-auth gets a new one. No refresh token, nothing on a server. Settings → Sign out revokes it at Google and clears this device.
- See `.kiro/steering/privacy.md` for the full rules.

## Feature Names

| Feature | Name |
|---------|------|
| Cancellation agent | The Reaper |
| Free trials tab | The Graveyard |
| Charges that return | Revenants |
| Dormant accounts | Ghosts |
| Phone-only cancellations | Boss Door |

## Built With

| | |
|---|---|
| **Kiro** | Specs (requirements, design, tasks), steering, agent hooks, MCP, Kiro Crew agents (team lead, workers, reviewers) |
| **Frontend** | TypeScript, Vite, Canvas 2D (original pixel art drawn by script), Web Audio |
| **Data** | Gmail API (`gmail.readonly`), Google OAuth (token flow, silent re-auth) |
| **Cancelling** | Playwright MCP through a local bridge on your own computer |
| **Shared tips** | Node, Google Cloud Run, Firestore |
| **Hosting** | GitHub Pages, GitHub Actions |
| **Tests** | Vitest, fast-check, headless Chrome checks |

## License and contributing

MIT, see [LICENSE](LICENSE). Help is welcome, especially cancel tips for real companies and new mock sites:
see [CONTRIBUTING.md](CONTRIBUTING.md).

## Tagline

*"Budgeting apps tell you what you pay. We find what you forgot, catch trials before they charge you, and cancel them while you watch."*
