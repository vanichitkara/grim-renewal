# Final review: build wave (feature/build-wave, a9eda60)

Ran: `npm test` 302/302; `npx tsc --noEmit` only the known vite node_modules error; `npx vite build` ok; real Chrome on `dist` (`/tmp/review-final.mts`) and on the dev server with injected data (`/tmp/review-stress.mts`).

## Verified good
- Privacy of tips: with the API set, the only company-related traffic is `GET /tips/all` (whole list, no company named). Nothing is sent before the box is ticked. Box is unticked by default, text exact. Ticked POST body was exactly `{"merchantKey":"cloudboxpro.com","method":"online","worked":true}`. Gate text exact, optional line present. localStorage holds only `grim_claims` (id and date), `grim_view`; `grim_subs` has no email address or links. No innerHTML anywhere. The `<img onerror>` name and 140-char name rendered as text; `javascript:` cancel URL is not offered as a link.
- Locked page: results, stage, cards, tuning hidden. Only `?demo` and a real `#access_token` open it. `?demo` is deliberate (`TODO(remove-demo)` in index.html and app.html).
- Kit dialog: 40 Tab presses never left it, Escape closes, focus returns to the opening button. 0, 1, 3, 24 subs: no errors, 3 pages for 24.
- Status words: "Verified" only comes from assess level `verified`. Header "Avoided so far" counts verified only.

## BLOCKERS
None found.

## RISKS (ranked)
1. **Scene tag and ledger contradict the new labels.** The tag says "Subscription active" on cards that are Likely cancelled or Verified (seen in demo). After a Reaper cancel it says "Cancelled · +$X/yr" and the ledger "Cancelled by the Reaper this session (per year)" adds money, while the header says "Avoided so far $0.00". Fix: `statusText()` in hallway.ts should use the dashboard status word; drop the `+$/yr` or relabel it "would save".
2. **Demo is not repeatable.** In `?demo`, the kit's "I cancelled it" writes `grim_claims` to localStorage (`{"flix":...}`) even though demo is meant to remember nothing. The next demo run starts with StreamFlix already "Waiting to verify" and its button disabled. Fix: in demo, keep claims in memory (pass a no-op `saveClaim`).
3. **Demo can poison shared tips.** If the community URL is set on the deployed site, a judge ticking the box in `?demo` posts fake companies (`cloudboxpro.com`) to the real store. Fix: pass `consented:false` (or disable the box) when `isDemoPage`.
4. **Bridge probe on every public page load.** `GET http://127.0.0.1:8787/health` fires for every visitor. On the deployed site this logs a console error and may trigger Chrome's local-network permission prompt. Fix: call `connectBridge()` only when `isLocalHost(location.hostname)`.
5. **Verified can be claimed for Apple/Google/PayPal-billed subs.** The processor guard in assess.ts applies only to the no-claim path. A claim plus a quiet cycle gives "Verified" and money even though another sender may still be billing. Fix: cap processor-billed subs at `confirmed`.
6. **Reaper `failed` shows "Cancel started".** Wording implies progress after a failure. Fix: show "Cancel failed. Use the Cancel kit".
7. Sub id is `sha256(merchant+accountEmail)[:8]`, stored in `grim_claims` and `grim_subs`. It is derived from the address but not reversible in practice. Mention it in the write-up.

## NITS
- A 140-char name stretches the List table to 1841px; Price, Status and Actions scroll off-screen. Fix: `overflow-wrap:anywhere; max-width:30ch` on `table.list th[scope=row]`.
- Demo shows "Prototype · sample data", "Debug: a cancelled charge comes back", and the Tuning panel. Hide the debug button unless `?debug`, as animation.md requires.
- Zero subs: header says "No subscriptions found yet" over an empty canvas with a pager "Page 1 of 1". Add an empty-state line and hide the pager when there is one page.
- The note at the bottom still says "Prototype."
- Console shows AudioContext warnings and a failed font request when offline.
- Chip colours (blood/coin/rot on crypt) are fine by estimate (about 5:1 or better).

## Weak tests
- Tests pass with pure-function inputs only. No test loads app.html, so risk 1 (scene tag vs card), 2 and 4 are invisible to `npm test`. A single Chrome smoke test that asserts scene tag text equals card status would catch risk 1.
- The privacy test of "no request without a tick" exists at client level; nothing checks that the UI passes `consented` from the box.

## Not checked
Real Gmail inbox, real Firestore or deployed tips server, Chrome's local-network prompt, a screen reader, the pager and scene tags by keyboard, exact contrast numbers, Safari/Firefox.
