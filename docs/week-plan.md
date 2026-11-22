# Grim Renewal — 4-Week Build Plan

## North Star
Ship a demo-ready app for the Costume Contest. Judges see:
1. The hallway animation (Reaper walks, knocks, kills or flees)
2. Real subscriptions from a seeded Gmail account
3. The Boss Door sequence with the call script
4. Live savings counter

---

## Week 1 — Animation First
**Goal:** A working hallway with fake data that looks good enough to keep.

- [ ] Port `reaper.html` → `src/ui/app.html` (done — see `public/reaper.html`)
- [ ] Extract animation into `src/animation/` (tween, ease, draw functions)
- [ ] Add the `src/types.ts` event bus hook (animation waits on `AgentEvent`)
- [ ] Add a `?debug` query param to show/hide the tuning panel ✓
- [ ] Connect Playwright MCP server locally — screenshot after every change
- [ ] Add a `src/animation/` steering doc check: run `npm test` after every animation file change

**Done when:** hallway runs at 60 fps, Reaper kills two zombies and flees the third, no console errors.

---

## Week 2 — Gmail Pipeline
**Goal:** Real subscriptions appear in the hallway.

- [ ] Set up Google Cloud project, enable Gmail API, configure OAuth consent (testing mode)
- [ ] Seed the demo Gmail account with fake receipts (5+ merchants, mix of monthly/annual, one phone-only)
- [ ] Implement `src/pipeline/parse-receipt.ts` (done — spec in `.kiro/specs/receipt-parser.md`)
- [ ] Implement `src/pipeline/gmail-scout.ts` (Gmail MCP, read-only, query-level filter)
- [ ] Implement `src/agents/coroner.ts` (done — scores from activity signals)
- [ ] Wire Scout → Coroner → event bus → animation
- [ ] Run property-based tests: `npm test`

**Done when:** connecting the demo Gmail account populates the hallway with real zombie sizes and rot levels.

---

## Week 3 — Cancellation Flows
**Goal:** The Reaper actually cancels something.

- [ ] Implement cancellation state machine (`src/agents/reaper.ts`)
- [ ] Method 1: unsubscribe header (newsletters — fully automatic with user approval)
- [ ] Method 2: browser automation via Playwright MCP (deep link → cancel page)
- [ ] Method 3: Boss Door panel (phone script + chargeback letter template)
- [ ] Add Revenant detection: watch for new receipts from "dead" merchants
- [ ] User approval gate: approve/skip UI before any cancellation starts

**Done when:** the Reaper successfully cancels one newsletter-type subscription end-to-end, and the Boss Door sequence plays for the gym.

---

## Week 4 — Polish & Demo Video
**Goal:** A 3-minute video that wins the demo category.

- [ ] Swap placeholder pixel art for real sprites (Kenney.nl CC0 pack, or Aseprite originals)
- [ ] Add the Graveyard view (free trials counting down)
- [ ] Add Revenant rising-tombstone animation
- [ ] Record the demo video — follow the script below
- [ ] Write the "how we used Kiro" section for the submission form
- [ ] Final privacy review: re-read `.kiro/steering/privacy.md` checklist

---

## Demo Video Script (3 minutes)

### 0:00–0:20 — Hook
> "Every month, forgotten subscriptions eat your money. Budgeting apps show you the list. Grim Renewal sends the Reaper."

Show the hallway loading with the user's real subscriptions. Zombies appear, sized by cost.

### 0:20–1:10 — Normal kill × 2
Click "Send the Reaper to every door."

- Reaper walks to StreamFlix door. Knocks. Door creaks open. Zombie shuffles out.
- "Cancelling…" — API call. "Cancelled." Scythe swings. Dissolve. Coins. +$275.88/yr floats up.
- Reaper walks to CloudBox. Same sequence, smaller zombie.

Pause on the savings counter: **$395.76 saved**.

### 1:10–1:40 — Boss Door
Reaper walks to IronCore Gym. Knocks. Giant zombie. Screen shakes.

> "IronCore Gym only cancels by phone."

Reaper turns white, runs off screen. Boss panel slides in with phone number, call script, chargeback letter.

> "The Reaper ran. We didn't."

User clicks "Copy call script." Makes the call. Clicks "I cancelled it on the phone."

Reaper walks back. "Then you're mine." Zombie dissolves. Final coins. **$995.64/yr saved.**

### 1:40–2:10 — Graveyard & Revenants
Show the Graveyard tab: free trials counting down.

> "We also catch trials before they bite."

One trial: 2 days left. Click "Kill before it charges." Reaper runs — the company doesn't have a cancel page yet. Boss Door again. User cancels via chat support.

### 2:10–2:30 — Privacy slide
> "The Reaper only reads receipts."

Show the consent screen. Show Gmail query. Show: no message body stored, read-only scope.

### 2:30–3:00 — Close
> "Budgeting apps tell you what you pay. We find what you forgot, catch trials before they charge you, and cancel them while you watch — including the ones that make you call."

Final frame: the hallway, four tombstones, $995.64/yr saved.

---

## Feature Vocabulary (use these names consistently)

| Feature | Name |
|---------|------|
| Cancellation agent | The Reaper |
| Free trials tab | The Graveyard |
| Charges that return | Revenants |
| Dormant accounts | Ghosts |
| Phone-only cancellations | Boss Door |

---

## Kiro Crew Eligibility Checklist
- [x] Scout agent (Gmail discovery)
- [x] Coroner agent (forgotten score)
- [x] Reaper agent (cancellation)
- [x] Conductor dispatches all three
- [x] Agents share an event bus
- [ ] Submit under "Best Kiro Crew App" category

---

## Backlog (decided, not started)

- [ ] **Revenant dispute flow** (build if time allows). Source: the user's prototype HTML; the
  relevant parts are in `docs/reference/graveyard-prototype-excerpt.md` (last section says what
  was left out). To build: evidence list (saved cancel confirmation, new charge date and amount,
  no usage emails since), a drafted card-issuer dispute letter with copy button, a
  "Send the reaper with the evidence" action that kills the ghost and chains the tombstone, and a
  "Clawed back" total in the stats row. Also wire `emitRevenants` into the real rescan
  (today it only runs from the demo's debug button).
  When this ships, put the dispute wording back on the landing page Revenants card
  (`src/ui/index.html`, the landing page, features row), which now says "Preview in the demo".
- [ ] **Ghosts: dormant-account detection** (build if time allows). Today only the forgotten
  score exists (`src/agents/coroner.ts`, driven by stub signals in `src/pipeline/activity-scout.ts`).
  To build: a real activity-signal pass in Gmail (login alerts, usage emails per merchant), then
  flag accounts that hold a card or data but show no activity as Ghosts, with a Ghosts view or
  badge. The landing page Ghosts card was reworded to match what is built and says this is
  "coming soon"; when Ghosts ships, restore the dormant-account wording in `src/ui/index.html` (the landing page).

---

## In progress / queued (set 2026-11-22)

- [x] **Cancellation Player** (done, merged): watch the Reaper cancel on dummy merchant sites in `public/mock/`, approve each step.
- **DROPPED (user decision 2026-11-22): the simulated AI phone-call console.** The app will not place calls for the user
  (legal limits: FCC 24-17 treats AI voices as "artificial voice" under the TCPA; California AI-voice disclosure and
  all-party recording consent; companies check identity). A fake call console would promise something we will not ship.
- [ ] **Call kit** (replaces it): for a phone-only company, show a tap-to-call link, the call script with a copy button,
  a written-cancellation email draft (opens the user's mail app with the text filled in), a dispute letter, and a
  calendar reminder (.ics) to re-check for a returning charge. Remove the invented "Tuesday mornings have the
  shortest wait" line.
- [ ] **Verified savings (the core idea)**: after the user cancels, sweep the inbox again. Count a saving only when a
  cancellation confirmation email appears AND no new receipt arrives after the next renewal date. Show two numbers:
  "Pending" and "Verified". Gold coins drop on verification, not at the click. Read-only Gmail, store only a flag and a date.
- [ ] **Cancel guide per subscription**: the easiest path first (cancel link and steps, email draft, call kit), with a
  status: Found, Cancel started, Waiting to verify, Verified, Came back.
- [ ] **Trial guard**: a reminder (.ics) 2 days before a trial ends.
- [ ] **Results-first screen plus a List view** next to the hallway scene (see the UX notes in the chat of 2026-11-22).
- [ ] Then: Revenant dispute flow (fits Verified savings: a charge after verification becomes a Revenant), then Ghosts.
- Playwright "assisted cancel" stays a local power-user feature. The user signs in in the visible window; the robot never
  types a password (the adapter already stops at a login page; resume-after-login is a possible next step).

---

## Decisions (2026-11-22)

- **Landing page first.** `src/ui/index.html` is the landing page and is what the live site opens. The app is `src/ui/app.html`. A Google sign-in return that lands on the site root is handed to `app.html` by a small script in the landing page, so the redirect URI registered in Google Cloud stays the site root.
- **Sign-in gate.** `app.html` starts locked (`<body class="locked">`). Only a returning sign-in token or `?demo` unlocks it. This is a UI gate, not a server check: the app has no server and holds no data.
- [ ] **REMOVE THE DEMO FROM THE LANDING PAGE before launch.** Demo is fine for now. Search for `TODO(remove-demo)`: three links in `src/ui/index.html` (nav "Demo", hero "Try the demo", footer link), one test line in `src/ui/landing.test.ts`, and the demo branch in `src/ui/app.html`. Decide at that time whether the `?demo` path itself stays for judges or goes.
- Hosting: GitHub Pages stays. Vercel's free Hobby plan is for personal, non-commercial use only; a hackathon project fits, a paid product would not.

- [ ] **Hosted browser for real cancels (decide later).** The local bridge only works on the
  developer's own machine. For visitors on the live site, "every login connects to a browser"
  needs a browser that runs on a server, which is a separate piece of work:
  1. a paid hosted-browser service (the provider's API key is a server-side secret);
  2. a serverless function with a headless Chromium (short time limits, and the user cannot
     watch a visible window, so the page would have to stream pictures of it);
  3. keep the local bridge as a power-user option and give hosted users the guided cancel
     (script, links, Cancellation Player on mock sites) until then.
  Whatever is chosen, its secret lives in the host's SERVER-side settings, never in a `VITE_` variable.
  Hosting stays on GitHub Pages for now (free, already live). Vercel Hobby is free for
  personal, non-commercial use only.

---

## Design notes: tracking cancels and picking a cancel method (2026-11-22)

**Standing rule from the user: do not open a pull request for a plan change. Open one only when asked.**

### Did the user really cancel? Three levels of evidence
We find a subscription because it sends receipts. So when its receipts stop, that is a real signal.

| Level | Evidence | Label shown |
|---|---|---|
| Confirmed | A cancellation email arrived, or the user pressed "I cancelled it" and gave a date | "Cancelled" |
| Likely | The expected receipt did not arrive: last receipt date + the usual gap (monthly: about 30 days, annual: about 365) + a 5-day grace | "Likely cancelled: no receipt since <date>" |
| Verified | Confirmed or Likely, AND at least one full billing cycle passed with no new receipt | "Verified by email" |

- Expected date comes from the receipt history (median gap between receipts, or `renewalDate` if the receipt gave one).
- Savings are shown as two numbers: **Avoided so far** (missed renewals x amount, real evidence) and **Next 12 months** (an estimate, labelled as one).
- A new receipt after cancel/verify turns the card into a **Revenant** (the dispute flow).
- Known weak spots, say them in the UI: receipt moved or missed by the filter, billing through Apple/Google, payment failed or paused, sender changed, 13-month look-back for annual plans. When unsure show "Not sure yet", never a saving.
- Later option: bank "card was charged" alert emails are readable with the same read-only access and would cover merchants that send no receipt. Formats differ by bank; do not promise it.

### How to cancel? We often do not know, so show all ways, best guess first
A "Cancel kit" per subscription with three tabs: Online, Email, Phone. Pick the first tab from what we know, with a label:
1. The receipt has a manage or cancel link: Online tab first, "from your receipt".
2. The receipt says call, or has a phone number near "cancel": Phone tab first, "from your receipt".
3. The merchant is in a small hand-kept list (start with about 20): use that, "from our list".
4. Otherwise: Online tab first with "We could not tell how this one works. Try these in order": the account page, a web search link for "<merchant> cancel subscription", then the Email draft, then the Phone script if a number is known.
After the user finishes, ask "What worked?" (online, email, phone, other) so the card learns. Sharing that across users needs a server and is a later step.

- **Owner decision, 2026-11-22: privacy exception ACCEPTED for shared cancel tips.** The one thing that leaves the browser is
  {company website name, method (online/email/phone/other), worked yes/no}, sent only when the user ticks an opt-in box that
  starts OFF. The server keeps counts per company, method and month, accepts only companies on a reviewed list, and never logs
  bodies or IPs. `.kiro/steering/privacy.md` itself is unchanged. Spec: `docs/specs/build-wave-2026-11-22.md` section A.
