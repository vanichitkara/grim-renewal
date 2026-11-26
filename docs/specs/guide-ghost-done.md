# Guide ghost and funny-but-clear messages: done

## Built
- **Guide ghost**: a 12x12 pixel SVG ghost (--spirit) plus a speech bubble in the page flow under the header in `src/ui/app.html`. It sits in the flow, so it never covers the canvas or a primary button (checked at 1280 and 390 px, no overlap). The bubble button does the action. An x hides it for the session (sessionStorage `grim_ghost_off`). Both buttons are keyboard-focusable with the global 2px --coin ring. The bob animation runs only under `prefers-reduced-motion: no-preference`. Hint changes go to `#ghostLive` (aria-live=polite).
- **Messages**: `src/ui/messages.ts` holds the text. Each message is a joke, then the fix and what to tap.
- Fix found on the way: after a failed scan the Connect Gmail button was shown but had no click handler. `signIn()` is now top-level in app.html and is wired to it.

## Files
New: `src/ui/guide-ghost.ts`, `guide-ghost.test.ts`, `messages.ts`, `messages.test.ts`.
Edited: `src/ui/app.html`, `potion-loader.ts`, `cancel-player-steps.ts`, `src/kit/view-model.ts`, `src/kit/status.ts` (one detail string; outside the list but message-only), `src/kit/kit.test.ts` (one string).

## Hints (priority order)
1. locked: "Psst. Connect Gmail. I only read receipts." -> Connect Gmail
2. scan error: "The scan fizzled. Tap Connect Gmail to try again." -> Connect Gmail
3. scanning: "The cauldron is bubbling. Hold tight, souls are coming." (no button)
4. cancel failed: "The Reaper got spooked by {name}. The Cancel kit has a script." -> opens Cancel kit
5. came back: "{name} rose from the grave. Send the Reaper again?" -> approval dialog
6. trial within 3 days: "{name} trial wakes up in 2 days / tomorrow / today. Bury it?" -> approval dialog
7. zombie (forgotten score >= 0.5): "{name} has been charging you for 14 months. Send the Reaper?" -> approval dialog
8. waiting to verify: "I'll watch for the next bill. Go have a snack." -> See the list
9. any other idle trial: same as 6
10. nothing left: "All quiet. The dead stay dead." -> Thanks, ghost (hides it)

Every action opens the existing approval dialog or Cancel kit. Nothing is submitted without approval.

## Messages
- gmail401: "That token turned to dust. Tap Connect Gmail to sign in again."
- gmail403: "Gmail bolted the door. Its API may be off, or this account is not a test user. Check, then tap Connect Gmail."
- gmail429: "Gmail is out of breath. Wait a minute, then tap Connect Gmail to scan again."
- scanFailed: "The cauldron cracked. Nothing was lost. Tap Connect Gmail to scan again."
- scanEmpty (empty potion, no subscriptions): "The pot is empty. No receipts in 13 months. Tap Connect Gmail to try another account."
- signInUnfinished: "The ritual got interrupted. Tap Connect Gmail to start again."
- signInExpired: "Your sign-in faded like a ghost. Tap Connect Gmail to bring it back."
- noneYet: "The crypt is quiet. No subscriptions found yet."
- cancelFailedDetail: "The Reaper got spooked. Tap Cancel kit for a script."
- Cancellation Player: playerDeclined, playerLogin, playerNoControl, playerStepLimit, playerOther. Each says "Nothing was cancelled". All but declined point to Cancel kit.

## Checks
- `npm test`: 348/348 pass (36 files); 18 new tests (14 hint, 4 message).
- `npx tsc --noEmit --skipLibCheck`: clean. `npx vite build`: OK.
- Chrome (playwright-core) at `/app.html?demo` and locked `/app.html`, 1280 and 390 px: no page errors, no overlap, the bubble button opens the approval dialog, x hides the ghost and it stays hidden after reload.
- Screenshots: `/tmp/ghost-demo-1280.png`, `/tmp/ghost-demo-390.png`, `/tmp/ghost-locked-1280.png`, `/tmp/ghost-locked-390.png`, `/tmp/ghost-demo-action.png`.

## Not checked
Reduced-motion run in a browser, a real failed Gmail scan, the real signed-in ghost states, screen reader output.
