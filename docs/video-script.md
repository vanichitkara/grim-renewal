# Grim Renewal: demo video script (about 3 minutes)

Judges score five things equally: impact, Kiro use, design, idea, presentation.
They asked for: the problem, the solution working end to end, and how specs, steering and hooks got us there.

**Rules for recording**
- Use the demo Gmail account with fake receipts (privacy.md). Never a real personal inbox.
- Record at 1280×720 or larger. Turn sound on (Settings → Sound, volume about 60%).
- Use `?simulate` for the live part, so cancels play on the mock sites and nothing real is cancelled.
- Keep each shot short. Speak over the action, not after it.

| Time | Show | Say |
|---|---|---|
| 0:00–0:15 | Landing page, the Reaper scene moving. | "The average person pays for subscriptions they forgot. Budgeting apps show what you pay. Nobody shows you what you forgot, or cancels it for you." |
| 0:15–0:30 | Click **Enter the crypt**. The sign-in card with the consent text. | "Grim Renewal reads only receipts. Read-only Gmail. It keeps the company, the amount and the date, and throws away the rest." |
| 0:30–0:50 | `app.html?simulate`, Connect Gmail, the potion loader, then the results header. | "One sign-in, and the answer comes first: you pay this much a month for these things you may have forgotten." |
| 0:50–1:15 | The mansion scene: doors on two floors, tags, paging. Switch to **List** and back. | "Each forgotten subscription is a zombie behind a door. More than eight? The mansion gets more pages. Prefer a table? The List shows the same data." |
| 1:15–1:45 | Send the Reaper to one door. Approve. The Cancellation Player shows each step on the mock site. Zombie dissolves. | "The Reaper cancels while you watch. Every click waits for your yes. It never types a password. The animation waits for the real result, so it never celebrates early." |
| 1:45–2:05 | A failed one (Tuning panel, Ctrl+Shift+D, "make every cancellation fail"): "Cancel failed". Open the **Cancel kit**: Online / Email / Phone, the tip "most people cancelled online". | "When the Reaper can't finish, it says so and hands you a Cancel kit: the link, an email draft, a call script. It opens on the method that worked for most people." |
| 2:05–2:20 | Mark "I cancelled it", the share box (off by default). The savings header: Avoided so far vs Next 12 months. | "Savings stay honest. A missing receipt is only 'no charge seen'. 'Verified' needs a cancellation and a full billing cycle with no charge." |
| 2:20–2:30 | Graveyard view with trials, the .ics reminder. | "Free trials go in the graveyard, with a calendar reminder two days before they charge." |
| 2:30–2:55 | Kiro: `.kiro/specs/` folder (requirements, design, tasks), `.kiro/steering/privacy.md`, a hook firing on save and handing a problem back, the Kiro Crew board with workers and accepted items. | "We built it with Kiro, spec first. Steering holds the privacy and animation rules. Hooks check every save against them. A Kiro Crew lead split the work across worker sessions, and nothing counted as done until an evaluator checked it. Kiro even caught a privacy leak in our own tips design." |
| 2:55–3:00 | Logo and live URL. | "Grim Renewal. Make sure the dead stay dead." |

**Shots to capture ahead of time**
1. A hook catching a problem: add `console.log(token)` to a file, save, show the privacy guard's message, undo.
2. The work ledger board with accepted items.
3. `?demo&many` for the paging shot if the demo inbox has fewer than 9 subscriptions.

**Links for the description**
- Live site: https://vanichitkara.github.io/grim-renewal/
- Demo without sign-in: https://vanichitkara.github.io/grim-renewal/app.html?demo
- Code: https://github.com/vanichitkara/grim-renewal
