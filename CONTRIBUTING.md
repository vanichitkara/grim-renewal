# Contributing to Grim Renewal

Thank you for helping the dead stay dead. Small, focused pull requests are easiest to review.

## Good first contributions

- **A company the tips server should know.** Add its website name (for example `example.com`) to
  `server/known-merchants.json`. Only companies on this list can collect shared tips.
- **A receipt the scanner misses.** Add a test case to `src/pipeline/parse-receipt.test.ts` with a made-up
  receipt (never paste a real email). Then fix `src/pipeline/parse-receipt.ts`.
- **A mock cancel site.** Copy a folder in `public/mock/` and make the cancel flow harder: a survey, a
  "are you sure" step, a hidden link. The Reaper's browser adapter should still find its way, or stop safely.

## Before you open a pull request

```bash
npm install
npm test
npx tsc --noEmit --skipLibCheck
npx vite build
```

## Rules that always hold

The rules live in `.kiro/steering/` and the Kiro hooks in `.kiro/hooks/` check them on every save:

- Gmail scope is `gmail.readonly` only. Never log or store email text, subjects or tokens.
- Never fill a password field by automation. Never click without the user's approval.
- Animation uses the palette and named easings in `.kiro/steering/animation.md`, and respects reduced motion.
- No API keys in code. Use `.env` (git-ignored); copy `.env.example` to start.

## Specs

Each feature has a spec in `.kiro/specs/<feature>/` (`requirements.md`, `design.md`, `tasks.md`).
If you change what a feature does, update its spec in the same pull request.
