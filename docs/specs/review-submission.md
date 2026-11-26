# Review: submission readiness (feature/build-wave, 9d4795f)

Read only. Nothing but this file was written. BLOCKER count: **0**.

## Checked

| Check | Result |
|---|---|
| `npm test` | 348/348 pass (36 files). "330+ tests" in devpost is true. |
| Secrets, working tree | No `AIza`, `GOCSPX-`, `ya29.`, private key or `AKIA` match outside node_modules/.git/dist. |
| Secrets, full git history (`git log --all -p -G`) | No match. `.env` was never committed. Only `.env.example` is tracked. |
| `.env` ignored | Yes (`.gitignore:7`). `.env` holds only `GRIM_BRIDGE_TOKEN`. |
| `.kiro` not ignored | Yes. `git check-ignore` is silent. 42 files tracked. |
| Trademarks | Mock sites and the starter tips list use fictional names (streamflix, cloudbox, designhub, mealcrate, ironcoregym). The tips file says "Not a claim about any real company". No logos. |
| Guide ghost, `?demo` and locked, 390 and 1280, reduced motion | Visible, no horizontal scroll (scrollWidth equals viewport), no page errors. Reduced motion turns the bob off (`animation: none`). |
| Ghost buttons | Locked: "Connect Gmail" opens the consent dialog (exact text). Demo: "Bury it" opens the approval dialog. Enter works, focus ring is 2px `--coin`. |
| Live region | `#ghostLive` gets the hint text. |
| Console | Only the refused bridge probe (`ERR_FAILED`). Ignored as told. |

## Findings, in priority order

### BLOCKER
None.

### SHOULD
1. **Dev text on the public demo page.** `app.html?demo` shows "BROWSER CANCELS: OFF. RUN: NPM RUN BRIDGE" under the title (see the 390 px screenshot). A judge sees a terminal command in the first screen. Hide it when `?demo`, or say "Browser cancels: off (demo)".
2. **Devpost claims need a live check.**
   - "It works end to end: sign in, scan, cancel in a real browser, verify savings." The open items list live bridge verification and a real-inbox scan as not done by the owner. Either run them before recording or soften the line to what the video shows.
   - Stack says "Node on Google Cloud Run with Firestore". README says the live site has no deployed server and shows the starter list. Say "optional" or remove if not deployed.
3. **"Anonymously" for shared tips.** An earlier review flagged that IPs and server logs undercut it. The README and devpost still say "anonymously". Use "no account, no email stored", or confirm the server does not log IPs.
4. **Video script depends on setup the owner must do.** Shot 1 needs a real signed-in test account with seeded receipts. Shot 4 needs `npm run bridge` and a real browser; the script has a fallback (demo + the mock Cancellation Player) which is fine. Shot 5 needs a failed cancel; use the force-fail toggle in the debug panel (`?debug`) so it is not a lucky run. The "demo shows no sign-in" fallback breaks the "starts logged in" rule, so sign in the test account first.
   Every other shot maps to a feature that exists: door card, approval dialog, Cancel kit, share box, savings split, Remind me, guide ghost.
5. **Total video time.** Shots sum to 2:40. Shot 9 (Kiro, 25 s) is the longest and is the one judges weigh most. Keep it. Cut shot 8 first if over 3:00.

### NIT
1. Ghost says "Bury it" for a trial, but the dialog it opens says "Send the Reaper?". Same action, two words. Match the title to "Bury it?" for trials.
2. `MSG.gmail403` is 22 words, over the ~20 target. Other messages are short, plain and name a tap. Suggest: "Gmail bolted the door. Its API may be off, or this account is not a test user. Check, then tap Connect Gmail." -> drop "Its API may be off, or".
3. `.gitignore` comment says "the app keeps tokens in memory only". The owner ruling (2026-11-23) allows `grim_auth` in localStorage. Update the comment so it matches `privacy.md`.
4. `scanError` ghost text says "Tap Connect Gmail" and the messages say the same; when the app is unlocked the button is the small "Connect Gmail" in the header. It works (the ghost button clicks it), but the header button is small (12 px). Fine for now.
5. Landing page 404 (probably favicon) noted in an earlier review. Add a favicon.

## 30-second test (README top and devpost)
Pass. README opens with What / Who / Why / "Try it in 10 seconds" link / Built with Kiro (specs, steering, hooks, MCP, Crew) with links into `.kiro`. Devpost has tagline, Built With (kiro, kiro-specs, kiro-hooks, kiro-steering), links to code (MIT) and `.kiro`. `LICENSE` and `CONTRIBUTING.md` exist at root. Outlives the hackathon: open source, MIT, starter list plus shared tips.

## Not checked
Real Gmail sign-in, the real bridge on a live site, GitHub repo description/topics (needs "Kiro" named there), YouTube upload settings, narrow-viewport view of every ghost state (only the demo and locked states were driven; failed, came-back and scan-error hints were read in code, not run).
