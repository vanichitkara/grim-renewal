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

- [ ] Port `reaper.html` → `src/ui/index.html` (done — see `public/reaper.html`)
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
  (`src/ui/landing.html`, features row), which now says "Preview in the demo".
- [ ] **Ghosts: dormant-account detection** (build if time allows). Today only the forgotten
  score exists (`src/agents/coroner.ts`, driven by stub signals in `src/pipeline/activity-scout.ts`).
  To build: a real activity-signal pass in Gmail (login alerts, usage emails per merchant), then
  flag accounts that hold a card or data but show no activity as Ghosts, with a Ghosts view or
  badge. The landing page Ghosts card was reworded to match what is built and says this is
  "coming soon"; when Ghosts ships, restore the dormant-account wording in `src/ui/landing.html`.
