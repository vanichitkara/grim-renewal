# Review: judge-ready round (read only)

Branch `feature/build-wave`, HEAD `8796cdd`. Reviewer changed no source. `npm test`: 319/319. `npx vite build`: OK.
**BLOCKER count: 1.**

## Findings, in priority order

1. **BLOCKER. `test-on-save` hook never runs a test.** `scripts/hooks/hook-input.mjs` `norm()` turns every path into a repo-relative one. `vitest.config.ts` sets `root: src`, so `vitest related src/savings/cadence.ts` prints "No test files found" and exits 0. The script then prints "passed". With an absolute path it works (`vitest related $PWD/src/savings/cadence.ts` = 49 tests passed). The README says the hook "runs the tests that import the file". Fix: in `related-tests.mjs` pass `path.resolve(file)` (or `--root .`). It also covers `server/*.ts`, which sits outside the vitest root, so check that case after the fix.
2. **SHOULD. README claim "tested against known-bad files before they were turned on" has no proof in the repo.** There is no test for `scripts/hooks/*` and no log. I ran bad samples myself (see Hooks) and the checks work, but add a small `scripts/hooks/hooks.test.ts` (the two `check()` functions are exported) or soften the sentence. Also "written by Kiro" is not checkable.
3. **SHOULD. README "Project Structure" is stale.** It lists flat files `.kiro/specs/subscription-discovery.md` etc. These are now folders. It also lacks `.kiro/hooks/`, `scripts/hooks/`, `src/kit`, `src/savings`, `src/community`. A judge opening the README tree sees the old layout right under the new Kiro section.
4. **SHOULD. Scene toggle says "Hallway" while the scene is a mansion.** `src/ui/app.html:289` `<button id="viewHouse">Hallway</button>`, plus the canvas `aria-label` at line 299 ("Hallway of doors..."). The header text also says "The Reaper goes knocking". Rename to "Mansion" (the video script says mansion).
5. **SHOULD. `public/reaper.html` ships to the live site with "Prototype · sample data" and a note "Prototype. Art is placeholder pixel work..."** (lines 144, 198). Nothing on the landing page links to it, but it is served and the README tells people to open it ("standalone animation prototype"). Delete it from `public/`, or drop that README line. Also `src/ui/demo-data.ts:2` comment says "prototype mode" (comment only, NIT).
6. **SHOULD. Video script shot 0:30 and 1:45 need a real Google sign-in.** `?simulate` only applies to the signed-in path (`app.html:699`). It works with the seeded test account, as the script says. The Cancellation Player is not used in `?demo` (it uses `fakeCancel`). If sign-in is flaky on record day, the fallback is `?demo`, which has no player and a different look. Say so in the script.
7. **NIT. Palette guard misses.** It does not flag 3-digit hex (`#fff`), `rgb()`, `hsl()` or named colours. I confirmed with `check()`. It also only checks lines added versus HEAD. Existing code has many off-palette hex values in pixel art (about 90 across `src/animation/{background,door,graveyard-scene,hallway,particles,reaper,zombie}.ts`, `src/ui/demo-data.ts`, `landing.ts`). `animation.md` says "never hardcode outside these". A judge who greps will find them. Either note "sprite shading is exempt" in `animation.md`, or leave it.
8. **NIT. Privacy guard false alarm risk.** `console.warn('token expired')` would be flagged, because the regex matches the word `token` inside a string literal. All current `src` files pass (I ran the guard on every non-test `.ts/.html` file). No miss found in my bad sample: other scopes, `in:sent/drafts/trash`, localStorage token, password fill, messageId persist, logged snippet all caught. `gmail.readonly` and `in:inbox` lines are clean.
9. **NIT. Console on built `app.html?demo`:** only AudioContext autoplay warnings (expected before a user gesture) and `127.0.0.1:8787/health` ERR_CONNECTION_REFUSED. The second is the bridge probe on localhost, which the README says is hidden on hosted sites. Landing page: one 404 from the static server, most likely the missing favicon (`dist/` has no favicon). Add a favicon to be clean. Vite prints three "didn't resolve at build time" notices for sprite URLs in inline CSS (resolved at runtime, harmless).
10. **NIT. Video shot "tip: most people cancelled online"** is not literal text. The kit shows "Start here: ..." with a source from the tips or the starter list. Say "Start here" in the script. Shot 2:20 `.ics`: the reminder is an all-day event `daysBefore` days ahead with a 9h alarm, so "two days before" holds only if the trial uses 2 (check `demo-data.ts`).
11. **NIT. "Browser cancels: off. Run: npm run bridge" chip shows in the demo header on localhost.** Fine on Pages. Hide it before recording on localhost.

## 1. Hooks

- Schema: all four files match the current docs (`version: "v1"`, `hooks[]`, `name`, `trigger: PostFileSave`, regex `matcher`, `action.type` command or agent, `timeout` in seconds, `description` allowed). `spec-sync` uses `type: agent` with `prompt` and no timeout, as documented. No schema errors.
- I could not run Kiro itself, so I did not check exit-code feedback (non-zero exit going back to the agent). The docs excerpt I fetched does not state it.
- `privacy-guard.mjs`, `palette-guard.mjs` run with a file argument and with Kiro-style JSON on stdin (`{"tool_input":{"file_path":"/abs/..."}}`): both OK, exit 0. A path outside `src/` (such as `/tmp/x.ts`) exits 0 silently by design, so bad samples were tested through the exported `check()` functions (`/tmp/bad.mjs`).
- Privacy bad sample: 10 of 10 bad lines caught, clean lines gave 0. Palette bad sample: `#ff00ff`, `cubic-bezier`, `pixi.js` caught; uppercase `#F2B84B` correctly allowed; `#fff` and `rgb()` missed (item 7).
- `test-on-save`: see item 1.

## 2. Specs ticks

Counts of `[x]` per `tasks.md`: cancel-kit 16, state-machine 15, community-tips 19, forgotten-score 8, kiro-crew-agents 16, mansion-scene 18, receipt-parser 16, sign-in 12, discovery 17, verified-savings 14 (151 ticks). Unticked items are honest ("Not in the repo" blocks).
I extracted every backticked path and identifier from all ticked lines and checked them: every file exists (bare names such as `simulated.ts`, `door.ts`, `tween.ts`, `gmail-scout-body.test.ts` resolve under `src/`), and every camelCase or CONSTANT symbol is found in `src/server/scripts/public`. I also read these ticks against code: 429 back-off (`gmail-scout.ts:279,301`), sha256 id (`gmail-scout.ts:173`), `npm run community` (`package.json`), the VALARM in `ics.ts`, ctrl+shift+D, and the `?many` flag. **Wrong ticks found: 0.** Caveat: ticks like "Reduced-motion rules" and "MCP scoping 6.1" were checked for existence only. `browser.ts:88` says the Playwright MCP driver is "Not tested against a live server"; the spec tick says only that the driver exists, so it is honest, but not proven.

## 3. README "How we built it" and "Where Kiro surprised us"

Checkable: specs folder and counts, steering files, hook files, 319 tests (I ran it), `npm run bridge` via Playwright MCP (`server/browser-bridge.ts` spawns `@playwright/mcp`), `labelIds` AND note (`gmail-scout.ts:21`), build account `grim-tips-builder` with a role loop (`deploy-tips-gcp.sh`; "two roles" matches the run account's `datastore.user` plus the builder role, but the sentence reads as if the build account has two roles; the script grants one role per account), evidence levels (`src/savings/assess.ts`, "No charge seen"), AI-calls decision (`docs/specs/build-wave-2026-11-22.md`, `docs/video-script.md`, `review-build-wave.md`).
Not checkable in the repo (conversation history only): "caught a privacy leak" (partly in `review-build-wave.md`), "Kiro researched how other apps count savings", "debugged an empty inbox", the Cloud Run PERMISSION_DENIED story, "tested against known-bad files". Overclaim risks: item 2 and the "two roles" wording. Also "Kiro" is credited for work done by Kiro Crew sessions; fine, but a judge may read "Kiro" as the IDE.
"Agent checks: ... screenshots" are not in the repo.

## 4. Video script feasibility

Works: landing, **Enter the crypt**, `?demo&many` (second page), Scene|List, Cancel kit, Settings → Sound, Ctrl+Shift+D (`hallway.ts:1366`; checkbox "Make every cancellation fail (Boss Door)" exists), "Cancel failed" text, graveyard with trials (demo has 3 trials), `.ics`, savings header labels "Avoided so far" and "Next 12 months", footer tagline. Needs care: items 4, 6, 10. Shot 2:30 (Kiro views) is outside the app; the hook demo needs `console.log(token)` in a `src` file (the privacy guard catches it, verified).

## 5. Polish run

`npx vite build` OK. Headless Chrome, 1280×800, `dist/` served on :4599: landing, locked `app.html`, `?demo`, `?demo&many`. Screenshots in `/tmp/landing.png`, `/tmp/demo.png` (not in repo). Visible text had no "Prototype", "Debug", TODO, lorem or placeholder in the app or landing. Landing links resolve (`#how #features #privacy ./app.html ./app.html?demo`). Page errors: none (only item 9). Demo looks finished apart from item 4.

## Not checked

Kiro's real hook execution and exit-code feedback; live Pages site; sign-in and Gmail flow; the Cancellation Player and Cancel kit visually (only code and grep); sound; mobile layout; the full `spec-sync` agent behaviour.
