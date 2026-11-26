# Grim Renewal: demo video script (2:40, must stay under 3:00)

Rules this script follows: the app works on screen in the first 10 seconds; it starts signed in;
no sign-up, no setup, no typing live; one strong example per feature; jump cuts; on-screen text for each point;
Kiro on screen; no music or trademarks without rights (the pixel art and sounds are original).
Upload to YouTube as **Public**.

## Before you record

- Sign in once with the seeded **test** Gmail account (never a real inbox, `privacy.md`). Refresh: you stay signed in.
- Run `npm run bridge` and `npm run dev`, open `http://localhost:5173/app.html?simulate&debug`, signed in with the test account.
  Fallback only if sign-in breaks: `app.html?demo&many&debug`. The demo has no sign-in, so it breaks the "start logged in" rule; use it only for shots 3 to 8.
- Shot 5 needs a failed cancel on purpose: open the Tuning panel (Ctrl+Shift+D) and tick "Make every cancellation fail". Untick it after.
- Settings → Sound on, volume about 60%. Browser zoom 110%. Hide bookmarks and other tabs.
- Have open in Kiro: `.kiro/specs/cancel-kit/requirements.md`, `.kiro/steering/privacy.md`, `.kiro/hooks/privacy-guard.json`.
- Record each shot as its own clip. Cut every load and wait.

## Shots

| # | Time | On screen | On-screen text | Voice |
|---|---|---|---|---|
| 1 | 0:00–0:10 | Already signed in. Results header counts up, mansion doors with zombies. | **You pay $X/mo for N things you forgot** (your real numbers) | "This is my inbox, read-only. N zombie subscriptions, X dollars a month." |
| 2 | 0:10–0:25 | Landing hero for 2 s, then back to the app. The guide ghost's hint bubble. | **Read-only Gmail. Receipts only.** | "Grim Renewal finds what you forgot. Budgeting apps show what you pay. We show what you forgot, and cancel it." |
| 3 | 0:25–0:45 | Click a door's tag → card. Click **Send the Reaper**. The approval dialog. Click Approve. | **Nothing happens without your yes** | "Every subscription is a zombie behind a door. The Reaper waits for my approval." |
| 4 | 0:45–1:15 | The Cancellation Player / real Chrome window: each step highlighted, approve, approve. Zombie dissolves, coins. | **A real browser, driven by Playwright MCP** | "The Reaper drives a real browser on my computer. It never types a password, and it only celebrates after the site says cancelled." |
| 5 | 1:15–1:35 | A failed one: the funny error, then the Cancel kit opens on "Start here: Email", the email draft. | **When the robot can't, you get a kit** | "Some companies make it hard on purpose. Then you get the link, an email draft and a phone script." |
| 6 | 1:35–1:50 | "I cancelled it" → share box (starts off) → tick → Done. | **Share what worked. Anonymously.** | "I can share which method worked. Only the company and yes or no. The next person starts with the answer." |
| 7 | 1:50–2:00 | Savings header: Avoided so far vs Next 12 months. One card says "No charge seen for a full cycle". | **Proof, not guesses** | "Savings only count with proof. A missing receipt is never called verified." |
| 8 | 2:00–2:10 | Graveyard: a trial climbing out. Click **Remind me**. | **Trials get buried before they charge** | "Free trials go to the graveyard, with a reminder before they charge." |
| 9 | 2:10–2:35 | Kiro: the spec (requirements with WHEN/SHALL), `privacy.md`, then add `console.log(token)` (pasted, not typed) in a file, save, the privacy hook's message appears, undo. Then the Kiro Crew board. | **Built spec-first in Kiro** / **Hooks enforce the privacy rules** | "We built it spec-first in Kiro. Steering holds the privacy rules. Hooks check every save, so a slip like logging a token is caught at once. Kiro Crew agents built it as a team." |
| 10 | 2:35–2:40 | Mansion, all doors quiet, the ghost: "All quiet. The dead stay dead." Logo and URL. | **grim-renewal · open source** | "Grim Renewal. Make sure the dead stay dead." |

## After recording

- Total under 3:00. Jump-cut pauses and "ums". If long, cut shot 8 first; keep shot 9 (Kiro), judges weigh it most.
- Add the on-screen text as captions in the editor.
- Description: paste the tagline and the links from `docs/devpost.md`.
