# Specs

Each feature is a folder with the three Kiro spec files: `requirements.md` (user stories, EARS acceptance criteria), `design.md` (architecture, real files and functions, tests), `tasks.md` (checkbox plan; `[x]` means the code and tests exist, `[ ]` means not built or not tested).

| Folder | What it covers | Steering that applies |
|---|---|---|
| [`subscription-discovery`](subscription-discovery/) | The Scout: read Gmail receipts (read-only, query level) into subscription records. | `privacy.md` |
| [`receipt-parser`](receipt-parser/) | Pure parser from one email to amount, currency, date, cycle, phone and cancel link. | `privacy.md` |
| [`forgotten-score`](forgotten-score/) | The Coroner: a 0 to 1 score of how forgotten a subscription is. | none |
| [`cancellation-state-machine`](cancellation-state-machine/) | The Reaper: approval gate, method fallthrough, Boss Door, revenants. | `privacy.md`, `animation.md` |
| [`kiro-crew-agents`](kiro-crew-agents/) | Scout, Coroner, Reaper and the event bus that joins them. | `privacy.md` |
| [`community-tips`](community-tips/) | Shared "what worked" cancel tips: ranking, API, opt-in. | `privacy.md` |
| [`verified-savings`](verified-savings/) | Evidence levels and savings maths for cancelled subscriptions. | `privacy.md` |
| [`cancel-kit`](cancel-kit/) | Results-first header, List view, Cancel kit tabs, trial reminder. | `privacy.md` |
| [`mansion-scene`](mansion-scene/) | The canvas mansion, paging, reaper travel, graveyard. | `animation.md` |
| [`sign-in-and-settings`](sign-in-and-settings/) | Google sign-in until sign out, silent re-auth, Settings panel. | `privacy.md` |

Steering files are in `.kiro/steering/`: `privacy.md` (Gmail scope, storage, consent text) and `animation.md` (canvas, timing, palette, accessibility). Hooks are in `.kiro/hooks/`.

Folders that began as single files also keep that text as `original-spec.md`. The build plan for community tips, verified savings, the Cancel kit and the mansion scene is `docs/specs/build-wave-2026-11-22.md`.
