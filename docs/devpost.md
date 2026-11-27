# Grim Renewal: submission text

Paste each section into the matching field on the submission page.

## Tagline (one line)

Find the subscriptions you forgot, and send the Grim Reaper to cancel them while you watch.

## Inspiration

Everyone has a zombie subscription: a streaming plan from last winter, an app trial that turned paid, a gym you stopped visiting.
Budgeting apps show you what you pay. Nobody shows you what you forgot, and cancelling is made hard on purpose.
We wanted something that finds the zombies, proves the savings, and makes cancelling a little bit fun.

## What it does

- **Finds forgotten subscriptions** from Gmail receipts, read-only. It keeps the company, the amount and the date, and throws away the rest.
- **Shows the answer first:** "You pay $X a month for N things you may have forgotten."
- **A haunted mansion:** every subscription is a zombie behind a door. The Reaper knocks, waits for the real result, then reaps.
  A guide ghost tells you what to tap next. A List view shows the same thing as a plain table.
- **Cancels while you watch:** the Reaper drives a real browser through Playwright MCP, on your own computer.
  Every click waits for your yes. It never types a password.
- **Cancel kit** when a robot can't: the cancel link, an email draft, and a phone script, starting with the method that worked for most people.
- **Shared tips:** after you cancel, you may share which method worked, with no name, email or amount attached. Only the company's website name,
  the method and yes/no are sent, and only if you tick a box that starts off. The app downloads one public list and looks companies up
  on your own machine, so the server never learns what you pay for.
- **Honest savings:** a missing receipt is only "no charge seen". "Verified" needs a cancellation and a full billing cycle with no charge.
- **Trial guard:** free trials go to the graveyard, with a calendar reminder before they charge.

## How we built it (Kiro)

We built Grim Renewal spec-first in Kiro, and used every Kiro surface:

- **Specs:** 10 features, each with `requirements.md` (EARS acceptance criteria), `design.md` and `tasks.md`, in `.kiro/specs/`.
- **Steering:** `.kiro/steering/privacy.md` (read-only Gmail, exact consent text, no stored email text, no auto-filled passwords)
  and `.kiro/steering/animation.md` (one palette, named easings, reduced motion, 60 fps rules). Every agent followed them.
- **Agent hooks:** `.kiro/hooks/` checks every saved file against the steering: a privacy guard, a palette guard,
  test-on-save (runs only the tests that import the file), and spec-sync (unticks any task the code does not really have).
- **MCP:** Playwright MCP is the Reaper's hands. A local bridge lets the web page drive it, with an approval on every click.
- **Chrome extension (MV3):** the live site cancels in the user's own signed-in Chrome, with no terminal. It never types, pins to the two dev ports and the live site only, asks for access to one site at a time (and removes that permission when the run ends), and the app approves every click.
- **Kiro Crew agents:** a team lead split each round into work items, sent them to worker sessions, and let an evaluator,
  not the worker, decide when an item was done. A separate reviewer session checked each round.

Stack: TypeScript, Vite, Canvas 2D with original pixel art drawn by script, Web Audio, Gmail API, Google OAuth,
Node on Google Cloud Run with Firestore for shared tips, GitHub Pages.

## Challenges

- **Privacy versus shared tips.** Our first design asked the server "what works for Netflix?", which tells it what you pay for.
  A Kiro reviewer session caught it. We switched to one public list, looked up on your machine.
- **Proving savings.** A missing receipt might just be archived mail. We built evidence levels so we never call a guess "verified".
- **Gmail's query rules.** Our first real scan found nothing: `labelIds` means AND, not OR. Kiro traced it and fixed the query.
- **AI phone calls.** We wanted the Reaper to phone companies. Kiro laid out the consent rules for AI calls, so we built a call kit instead.

## Accomplishments

- Every step is built and tested: sign in, scan, cancel in a real browser, verify savings. The demo runs the whole flow with no sign-in.
- 330+ unit tests and headless-Chrome checks for every screen.
- Every privacy rule is enforced by a hook, not by memory.

## What we learned

Specs and steering turn "please remember" into rules the agent cannot forget. Hooks catch the slip the moment it is saved.

## What's next

- A revenant dispute flow: when a cancelled charge comes back, a ready-made letter for your card issuer.
- Ghost accounts: services you still have but never use.
- More companies in the shared tips list. The project is MIT-licensed; contributions are welcome.

## Built With

kiro, kiro-specs, kiro-hooks, kiro-steering, model-context-protocol, playwright-mcp, typescript, vite, canvas, web-audio,
gmail-api, google-oauth, node.js, google-cloud-run, firestore, github-pages, vitest

## Links

- Live site: https://vanichitkara.github.io/grim-renewal/
- Demo, no sign-in: https://vanichitkara.github.io/grim-renewal/app.html?demo
- Code (MIT): https://github.com/vanichitkara/grim-renewal
- Kiro files: https://github.com/vanichitkara/grim-renewal/tree/main/.kiro
