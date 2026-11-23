# Design: Cancel Kit and Results-First Screen

## Overview
Pure view-model and draft functions in `src/kit/` feed DOM code in `src/ui/`. The DOM code holds no business rules.

## Architecture
```
runPipeline -> onSweep -> src/ui/dashboard.ts (createDashboard)
   headerModel / listRows (src/kit/view-model.ts) -> header chips + List table
   statusFor (src/kit/status.ts)                  -> status words, scene tags (sceneLabel)
Cancel kit button -> openCancelKit (src/ui/cancel-kit.ts)
   getTips -> chooseMethod -> tabs (online / email / phone / dispute)
   I cancelled it -> saveClaim;  What worked? -> submitOutcome (only if ticked)
Remind me -> makeIcs -> download
```

## Components and Interfaces
- `src/kit/choose-method.ts`: `chooseMethod(sub, summary): MethodChoice`, `UNKNOWN_WHY`.
- `src/kit/drafts.ts`: `emailDraft`, `mailtoUrl`, `callScript`, `CALL_TIPS`, `searchUrl`, `disputeLetter`.
- `src/kit/ics.ts`: `makeIcs({title, dateISO, daysBefore, now?})`.
- `src/kit/status.ts`: `statusFor({reaper, assessment})`, `StatusWord`, `ReaperState`.
- `src/kit/view-model.ts`: `headerModel`, `listRows`, `forgottenWords`, `formatMoney`, `moneyList`, `FORGOTTEN_AT = 0.5`, `TRIAL_SOON_DAYS = 3`.
- `src/kit/last-scan.ts`: `saveLastScan`, `loadLastScan`, `loadCelebrated`, `markCelebrated`, keys `grim_subs`, `grim_celebrated`.
- `src/ui/cancel-kit.ts`: `openCancelKit(input, deps)`, `SHARE_TEXT`, a modal with `role="tablist"` and an `aria-live` region.
- `src/ui/dashboard.ts`: `createDashboard(opts)`, `sceneLabel`.
- `src/ui/app.html`, `src/ui/demo-data.ts` (`?demo` data).

## Data Models
`Row {sub, assessment, status}`, `HeaderModel`, `ListRow`, `MethodChoice {first, source, why, order}`, `Status`.

## Error Handling
- `getTips` never throws (seed fallback), so the kit always opens.
- `makeIcs` rejects bad dates and folds lines to 75 characters.
- `loadLastScan` returns an empty list for junk.
- `mailtoUrl` truncates absurd input and encodes special characters.

## Testing Strategy
- `src/kit/kit.test.ts`: `chooseMethod` (community, receipt link, phone, starter list, nothing), drafts and `mailto:` limits, no "Tuesday" line, ics, `statusFor`, `headerModel`, `listRows`, last scan privacy.
- `src/ui/app-gate.test.ts`: gate and consent text in `app.html`.
- Browser checks of `?demo` (header, List, kit tabs, unticked share box sends nothing) were run by hand in Chrome and are not in the repo.
- Not covered by a repo test: the dispute tab flow in the UI.
