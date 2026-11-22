# Build wave, 2026-11-22: community tips, verified savings, Cancel kit, results-first, Mansion scene

Owner's ask (verbatim): "Build all of them and, most importantly, the thing you mentioned, right, that we can share
across the users: what worked for cancellation for a company. Let's say, for Netflix, a simple email cancellation
worked. It is shared across all the users: whoever has a Netflix subscription would be cancelled via email only so
we can update or cancel it based on the information we gather from the users. Build that importantly. That is a good
feature to highlight and build the rest of the things that you have suggested. Build the scene.

Also since there are a lot of subscriptions, instead of the Grim Reaper walking, can we make different doors on screen
and/or maybe windows on screen? The Grim Reaper goes to each window and knocks it out. I'm not sure how the UX can be
done for subscriptions which are more than 5 or 6. You can't just make the Grim Reaper walk across the hallway."

Standing rules: no PR unless the owner asks. Never push or merge to `main`. Work on a feature branch; commit locally.
Read `.kiro/steering/privacy.md` and `animation.md`. Earlier design notes: `docs/week-plan.md` ("Design notes").

## A. Community cancel tips (the headline feature)  -- item `community`

Idea: when users report what worked to cancel a company (online / email / phone / other), later users with that
company see "Most people cancel this one by email (7 of 9 say it worked)" and the Cancel kit opens on that tab.

**What is shared, and nothing else** (this is the one place data leaves the browser, so it is strict):
- `merchantKey`: the company's website name only, lower-case, e.g. `netflix.com`. Never a name, email, amount, date, plan or account.
- `method`: one of `online | email | phone | other`.
- `worked`: true or false.
- No free text. No user id. No cookies. The server stores counts per (merchantKey, method), not individual reports with identity.
- Opt-in per report: a checkbox, OFF by default, with this exact text next to it:
  "Share anonymously that this worked. We send only the company's website name, the method, and yes or no. No name, email, amount or date."
- The privacy steering file says "Never send subscription data to any third-party endpoint". This server is first-party and the
  payload is the minimum above. Record this exception in the docs and tell the owner plainly; do NOT edit `.kiro/steering/privacy.md`.

**Files owned by this item** (nobody else writes them): `src/community/*`, `server/community-api.ts`, `server/community-*.ts`,
`public/data/cancel-methods.seed.json`, `docs/community-api.md`, tests for these.

**Build:**
1. `src/community/types.ts`: `MethodKind`, `Tip {merchantKey, method, worked, failed}`, `TipSummary {merchantKey, best: MethodKind|null, bestWorked, bestTotal, methods: Tip[], source: 'community'|'seed'|'none'}`.
2. `src/community/merchant-key.ts` (pure): `merchantKeyFor(input)` turns a sender domain, a URL or a display name into the key (strip `www.`, `mail.`, `billing.`, `no-reply@`, subdomains down to the registrable name using a small suffix list incl. `.co.uk`). Property tests: idempotent, lower-case, never contains `@`, `/` or spaces.
3. `src/community/rank.ts` (pure): `summarize(rows, {minVotes: 3, now})` picks `best` only when the top method has at least `minVotes` reports and a worked-rate of at least 60 percent; otherwise `best = null` and say "not enough reports yet". Ties go to the more reports, then to the newer. Old reports weigh less (half weight after 12 months). Tests incl. poisoning: 1 fake report must never flip a settled result; 2 reports are never enough.
4. `src/community/validate.ts` (pure): `parseSubmission(body)` accepts only the three fields above, rejects extra fields, long keys (>100), keys with `@`/`/`/spaces, unknown methods. Returns a typed value or an error code.
5. `server/community-api.ts`: Node `http` server (default port 8788, bind `127.0.0.1` locally, `HOST` env to change), pure `handle(req, store, limiter)` function like `src/server/bridge-core.ts` so tests need no sockets. Routes: `GET /health`, `GET /tips?merchant=<key>` , `POST /report`. CORS allow-list from env `GRIM_CORS_ORIGINS` (default `http://localhost:5173,http://127.0.0.1:5173,https://vanichitkara.github.io`), no wildcard. Body limit 1 KB. Per-IP rate limit (in memory, e.g. 20 reports per hour) and per (ip, merchantKey) one report per day. Never log request bodies, IPs or headers.
6. Store interface `TipStore { add(report): Promise<void>; get(merchantKey): Promise<Row[]> }` with an in-memory store, and a SQLite store using Node's built-in `node:sqlite` (file `data/community.sqlite`, git-ignored; add `data/` to `.gitignore`). SQLite is for local runs and tests; Cloud Run's disk is temporary, so `docs/community-api.md` must say production needs a Firestore (or other) store behind the same interface, and sketch it (do not add the dependency).
7. `src/community/client.ts`: `getTips(merchantKey)` and `submitOutcome({merchantKey, method, worked})`. Base URL from `window.GRIM_COMMUNITY_URL` (empty means off). 3 s timeout. On any failure return the seed result, never throw into the UI. Seed data is `public/data/cancel-methods.seed.json`, loaded with a relative URL (the site lives under `/grim-renewal/`). Submissions are only sent when the caller passes `consented: true`.
8. Seed file: ONLY the mock merchants that exist in `public/mock/` (streamflix, cloudbox, mealcrate, designhub = online; ironcoregym = phone), each marked `"source": "starter list"`. Do NOT add claims about real companies you cannot verify.
9. `package.json` scripts: `"community": "tsx server/community-api.ts"`. Docs `docs/community-api.md`: what is stored, what is not, the privacy exception, how to run, how to deploy to Cloud Run with a Firestore store, abuse limits and their known gaps (anyone can POST; the min-votes rule and rate limits reduce but do not remove poisoning).
10. Acceptance: `npm test` green incl. the tests above; a script-free test drives `handle()` for health, tips, report, bad body, rate limit, CORS; `tsc` no new errors.

## B. Verified savings engine  -- item `savings`

Evidence rules (from `docs/week-plan.md` Design notes): Confirmed (cancellation email, or the user pressed "I cancelled it" with a date) / Likely (the expected receipt did not arrive: last receipt + usual gap + 5 days) / Verified (Confirmed or Likely, and a full billing cycle passed with no new receipt). Savings show two numbers: **Avoided so far** (missed renewals x amount) and **Next 12 months** (an estimate, labelled so). A new receipt after cancel/verify means **Came back** (a Revenant). When unsure: `none`, never a saving.

**Files owned:** `src/savings/*`, `src/types.ts` (additions only), `src/pipeline/gmail-scout.ts`, `src/pipeline/parse-receipt.ts`, `src/state/claims.ts`, their tests.

**Build:**
1. `src/types.ts`: add `chargeDates: string[]` to `Subscription` (ISO dates, oldest first, at most 36) and optional `cancellationEmailDate?: string`. Update `gmail-scout.ts` to fill them; update every place that builds a `Subscription` (tests, `demo-data.ts` is owned by the UI item, so leave a compatible default and tell the lead).
2. `src/pipeline/parse-receipt.ts`: add pure `isCancellationEmail(text): boolean` (phrases like "has been cancelled", "we're sorry to see you go", "your membership ends on", "cancellation confirmation"; must not fire on "cancel anytime" marketing). The scout calls it on the same text as the receipt parse and records the date only; raw text is still discarded at once.
3. `src/savings/cadence.ts` (pure): `usualGapDays(chargeDates)` (median gap, clamp 7..400; with one date use the billing cycle: monthly 30, annual 365), `expectedNext(lastDate, gap)`.
4. `src/savings/assess.ts` (pure): `assessCancellation({sub, claim, now}): Assessment` where `claim` is `{claimedAt: string} | null`. Returns `{level: 'none'|'confirmed'|'likely'|'verified'|'came_back', since?, expectedBy?, missedRenewals, avoidedAmount, projected12m, notes: string[]}`. `notes` carries plain reasons shown in the UI ("No receipt since 3 Oct. One renewal missed."). Property tests: never negative; never `verified` before a full cycle passed; a receipt after the claim date gives `came_back`; amount for annual plans is not multiplied by 12 twice; deterministic.
5. `src/state/claims.ts`: `loadClaims()/saveClaim(id, claimedAt)/clearClaim(id)` over `localStorage` key `grim_claims` (ids and dates only; privacy.md allows local persistence of subscription records). No Gmail tokens, no email text. Inject a storage object for tests.
6. Re-sweep: export `sweepForChanges(prev: Subscription[], scanned: Subscription[], claims)` returning per-subscription assessments (the UI item calls it after each scan; do not edit `pipeline.ts` beyond a minimal exported hook if you must, and say so).
7. Acceptance: tests above green; `tsc` no new errors; scout tests updated; a table-driven test of 10 realistic histories (monthly stops, annual, trial, price change, gap of 45 days, missing one receipt only, claim then charge again).

## C. Mansion scene  -- item `scene`

Problem: the hallway has 4 doors and the reaper walks; that fails at 6+ subscriptions. New scene = a haunted mansion front with **doors and windows**. The reaper does not walk the whole way: it glides (a short fly or a puff of smoke) to the target and **knocks the window out**.

**Layout:** canvas stays 480x220 native (steering rule). A page shows up to **8 slots** (2 floors x 4: ground-floor doors, upper-floor windows). More than 8 subscriptions: pages with small arrow controls and a "Page 2 of 3" label (keyboard reachable, aria-live announce). The graveyard/yard keeps working for trials (keep the existing 800 px world idea or give the yard its own page; your call, but trials must still be reachable and keep today's graveyard behaviour).

**Reaper movement:** `glideTo(slot)` with `ease.out`; for far targets use "blink": smoke puff out, smoke puff in (no long walk). Speed scales with how many are queued so "Send the reaper to every door" on 24 subscriptions takes seconds per slot, not a minute: for queue length > 8 use shorter knocks (1) and faster tweens (never below readable; honour `tune.speed` and reduced motion).
**Knock-out:** knock, window shakes, pane shatters (particles, skipped under reduced motion), the zombie inside reacts, then the existing result-driven kill/flee sequence plays. Phone-only / failure keeps the Boss Door flee. A cancelled slot gets boards or a small tombstone on the sill.
**State rules unchanged:** the scene advances only on `AgentEvent`s from the bus (animation steering), never ahead of the real result.
**Verified savings hook:** export `celebrateVerified(id)`: gold coins drop from that slot. The UI item calls it when savings reach Verified.

**Files owned:** `src/animation/*` (all of it, including `hallway.ts`, `door.ts`, `background.ts`, `zombie.ts`, `reaper.ts`, `particles.ts`, `graveyard-scene.ts`, `sprites.ts`, `sound.ts`), `scripts/make-sprites.ts`, `public/assets/sprites/*`, `.kiro/steering/animation.md` (only to add scene rules). New original pixel art: window frame, broken window, board, mansion wall, smoke puff (same palette, generated by script; update ASSETS.md; rectangle fallback stays).
**Must not touch:** `src/ui/app.html` (owned by the UI item). Expose the scene through the existing `initHallway`, `addSubscription`, `enqueue`, `onHordeChange`, `setView` API; add `setPage(n)`, `getPageInfo()`, and `celebrateVerified(id)`, and describe any API change in your report so the UI item can wire it.
**Acceptance:** pure helpers tested (slot layout for 1..24, paging, speed scaling, never more than 8 slots drawn); existing tests green; `vite build` OK; a real-Chrome check (script allowed in /tmp) that loads `app.html?demo` with 12 fake subscriptions and sends the reaper to all, with no page errors; say what you could not see.

## D. Cancel kit, results-first screen, List view, trial guard  -- item `ui` (starts after A and B land)

**Files owned:** `src/ui/*` (incl. `app.html`, `demo-data.ts`), `src/kit/*`, `public/mock/*`. May edit `src/pipeline/pipeline.ts` only to call hooks A and B export.
1. Results-first header: "You pay $X a month for N things you may have forgotten" plus chips (trials ending soon, likely cancelled, verified savings). Two numbers for savings: **Avoided so far (verified)** and **Next 12 months (estimate)**.
2. `Scene | List` switch; the List is a real accessible table (name, price, how forgotten, status, Cancel kit button) that scales to any count; it reuses the same data and statuses.
3. Statuses per subscription: Found, Cancel started, Waiting to verify, Likely cancelled, Verified, Came back. Button "I cancelled it" (asks for the date) stores a claim via `src/state/claims.ts`.
4. Cancel kit (modal or panel) with tabs Online / Email / Phone. `chooseMethod(sub, summary)` (pure, tested) picks the first tab and says why: from community ("7 of 9 say it worked"), from the receipt, from the starter list, or "we could not tell". Email tab: a draft that opens the mail app (`mailto:` with the text filled in, recipient left for the user), copy button. Phone tab: tap-to-call link when a number is known, the call script, the written-confirmation ask. A dispute-letter tab appears when status is Came back. Remove the invented "Tuesday mornings" line.
5. "What worked?" after the user finishes: choose method + yes/no, plus the opt-in checkbox (off by default, exact text from section A). Calls `submitOutcome` only when ticked.
6. Trial guard: for a trial, a "Remind me" button that downloads an `.ics` event 2 days before the trial ends (pure `makeIcs()` tested). Nothing is sent anywhere.
7. Wire A (tips), B (assessments, claims, re-sweep after each scan), C (page controls, `celebrateVerified`).
8. Keep: sign-in gate, `?demo` path, bridge chip rules, consent text, reduced motion, keyboard use.
9. Acceptance: tests green; `vite build` OK; real-Chrome check of `app.html?demo` for the new header, List table, Cancel kit tabs, I-cancelled-it flow and the opt-in checkbox default off.

## Interfaces between items (do not break)
- `merchantKeyFor(nameOrDomain)` from `src/community/merchant-key.ts` is the only way a merchant key is made. Subscriptions carry `merchant` (display name); the UI item derives the key from the sender domain when known (add optional `senderDomain?: string` to `Subscription` in item B and fill it in the scout).
- `assessCancellation` and `summarize` are pure; the UI never recomputes their rules.
- The scene never imports from `src/community`, `src/savings` or `src/ui`.

---

# CHANGES AFTER REVIEW (these override anything above)

Source: `docs/specs/review-build-wave.md`. The lead answered every point. Where this section and the text above disagree, this section wins.

## Rules for every worker
- **Do not run `git commit`, `git add`, `git push`, or open a PR.** Three workers share one working tree; the lead commits. Edit only the files your item owns.
- The lead owns `README.md`, `package.json`, `.gitignore`, `vite.config.ts`, `.github/workflows/pages.yml`, `vitest.config.ts`. Do not edit them. Ask in your report if you need a change.
- `tsc` bar: "no errors in the files you changed". The known `node_modules` vite error is not yours.
- Never claim something you did not run. Say "not verified" plainly.

## A. Community tips: changes
1. **No `node:sqlite`.** Store interface `TipStore` with an in-memory store (tests) and a **JSON-file store** (`data/community.json`, written atomically: write a temp file then rename). Docs sketch the Firestore store for production. Do not bump `engines`.
2. **Counts only, by month.** Store `(merchantKey, method, yyyy-mm) -> {worked, failed}`. No per-report timestamps. Decay uses the month bucket (full weight for 12 months, half weight older, drop after 36).
3. **Allow-list of keys.** The server stores a report only if `merchantKey` is in `server/known-merchants.json` (a committed list). Put about 40 well-known consumer subscription domains there (streaming, music, software, cloud storage, news, meal kits, gyms: only names you are certain exist; NO claims about how they cancel). Keys not on the list get the same `202` reply and are dropped, so the API cannot be probed. This also keeps sensitive services (health, therapy, adult, legal) out by default. `GET /tips` for a key not on the list returns `source: 'none'`.
4. **Processors are not merchants.** `merchantKeyFor` returns `null` for payment and app-store senders: `paypal.com, stripe.com, apple.com, itunes.com, google.com, googleplay, paddle.com, paddle.net, fastspring.com, 2checkout.com, squareup.com, shopify.com, substack.com, amazon.com` (amazon is too broad). Add the two-level suffix list: `co.uk, com.au, co.in, com.br, co.jp, co.nz, com.mx, co.za, com.sg`. Table-driven tests with real domains: `help.netflix.com`, `mail.spotify.com`, `bbc.co.uk`, `x.com.au`.
5. **Ranking maths.** Use the **Wilson lower bound (95%)** of the worked-rate, with the decayed counts. `best` needs at least **5** reports for that method AND a lower bound of at least **0.40**. Otherwise `best = null`, "not enough reports yet". Tests with numbers: 20 true + 1 false stays settled; 3 of 3 is NOT enough; 5 of 5 is; 7 of 9 is. Document that `failed` is biased toward the method people try first.
6. **IP handling.** The limiter keeps `sha256(dailySalt + ip)` in memory only; the salt rotates every 24 h and is never stored. Never log bodies, IPs or headers (platform request logs on Cloud Run still exist: say so in the docs). Rate limits are per instance and reset on cold start: say so; the real answer is a platform limiter or Firestore counters.
7. **API shape extras:** answer `OPTIONS`; check `Content-Type: application/json`; `Vary: Origin`; `GET /tips` sends `Cache-Control: public, max-age=60`; run the same validator on the `merchant` query value (length cap 100).
8. **Client.** Timeout **6 s** with **one retry**. The base URL comes from a build-time constant `__GRIM_COMMUNITY_URL__` (the lead adds the `define` in `vite.config.ts` and a `pages.yml` variable); `declare const __GRIM_COMMUNITY_URL__: string | undefined` with a `typeof` guard so tests work; `window.GRIM_COMMUNITY_URL` may override it. Empty means off. Say plainly in your report and docs: **without a deployed https API the shared feature works only on the developer's machine; the live site shows the starter list.**
9. **Stronger tests:** fetch-stub tests for timeout, non-JSON reply, CORS failure and a 500 (each falls back to the seed and never throws); an end-to-end test: POST five reports for an allow-listed key, GET shows `best`; a test that the seed file parses and every key passes `merchantKeyFor` unchanged and is on the allow-list; a test that a non-allow-listed key is dropped.

## B. Savings engine: changes
1. **Chains, spelled out.** `ReceiptFields` gains `senderDomain: string`. `parseReceipt` returns it (the `senderDomain` argument it already gets). The scout's `Accumulator` gains `senderDomain`, `chargeDates: string[]` (push each receipt date, dedupe, sort, cap 36) and `currency`. `Subscription` gains **optional** `senderDomain?`, `chargeDates?`, `cancellationEmailDate?`, `currency?` so no existing literal breaks (`demo-data.ts` belongs to item D). Fill all four in the scout.
2. **Gmail query.** Add cancellation words to the same query-level filter, still inbox only: `... OR cancelled OR canceled OR "membership ends" OR "sorry to see you go"`. Detection is best-effort: say so in a comment. `isCancellationEmail` runs on the snippet first, and on the body only on the existing fallback path.
3. **Arithmetic.** `chargeAmount = monthlyAmount * (billingCycle === 'annual' ? 12 : 1)`. `avoidedAmount = missedRenewals * chargeAmount`. Test: annual $120, one missed renewal gives $120 (not $10, not $1440). A price change uses the most recent amount, not a mean. `projected12m` for annual is one `chargeAmount` if a renewal falls inside the next 12 months, else 0.
4. **When "likely" is allowed.** Only with at least 2 charge dates; never when `billingCycle` is `'unknown'`; for annual plans only when the last charge is under 10 months old, else `none` with a note "Annual plans need a year of history". The receipt window is 13 months: add a note when the last receipt is older than 11 months. Archived mail is invisible to the scan: say so in `notes` for any `likely`.
5. **Labels (levels).** `confirmed` = a cancellation email OR the user's claim. Display words: claim only -> "You marked it cancelled"; cancellation email -> "Cancellation email seen". `likely` = no receipt when expected. `verified` = (confirmed) AND a full cycle with no new receipt -> "Verified: no charge seen for a full cycle". `likely` plus a full cycle -> level `quiet` with the display word "No charge seen for a full cycle" (NOT "Verified"). Add `quiet` to the level union.
6. **Currency.** Assess in the subscription's own currency. Provide `sumByCurrency(assessments)`; the UI never adds across currencies.
7. **Stronger tests:** the 10 histories table asserts the exact `level`, `avoidedAmount` and `notes` for each, not only "never negative".

## C. Mansion scene: changes
1. **Layout first.** Extract layout and paging into a pure, tested `src/animation/layout.ts` (slots for 1..24, page count, which page a slot is on, positions for doors and windows). Prototype 8 slots (2x4) and LOOK at it in real Chrome before building the knock-out. If 8 is cramped (zombie, bubble or float text unreadable), use **6 slots (2x3)** and change the paging maths; say which you chose and why. Keep `initHallway`, `addSubscription`, `enqueue`, `onHordeChange`, `setView` signatures stable.
2. **State machine.** The glide or blink to a slot starts on the `approved` event (the existing gate), never on enqueue. The smash and the kill or flee play only on `cancel_ok` / `cancel_fail`. Every glide, blink and smash is cancellable. For long queues keep the `knocking` state, just shorter. Auto-turn the page to the slot being visited, announce it in the aria-live region, and never turn the page while a tween runs.
3. **Safety net.** Before you change `hallway.ts`, write a Chrome script (in `/tmp`, not committed) that runs: the 4-subscription demo flow to the end, a trial bury, the graveyard view, and a revenant. Run it BEFORE and AFTER your changes and report both. Also add unit tests for `layout.ts`.
4. **Stronger bar:** a screenshot of a full page of slots, plus the transition log showing every subscription ended `dead` or `boss` after "send the reaper to all" with 12 fake subscriptions. Read the screenshot yourself and say what you see.

## D. UI item: changes (it starts after A, B and C have landed)
- Derives the merchant key from `senderDomain` (optional) via `merchantKeyFor`; shows the tab choice with its source label.
- The privacy gate text stays exactly as `privacy.md` requires. Add ONE separate line under it: "Optional: after you cancel, you can choose to share anonymously which method worked." The opt-in checkbox text is exactly as written in section A.
- Savings labels use the display words from B item 5. Never show "Verified" for a receipt-gap-only case.
- `mailto:` drafts stay short (under about 1500 characters).
- Chrome check also asserts: with the share box unticked, no request goes to the community API (watch network).
- `chooseMethod` is tested with four cases: community summary, receipt link, a phone number, and nothing.
- Add `README`-style notes in your report; the lead updates README.

## Deploy (lead's item, not a worker's)
`GRIM_COMMUNITY_URL` (an https address) goes in as a GitHub Actions variable and is baked in at build time. It is a public address, not a secret. Hosting the API needs the owner's Google Cloud account (an owner step). Post-deploy check (lead): the Pages URL answers and `/health` of the API answers from the Pages origin.
