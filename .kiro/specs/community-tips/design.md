# Design: Community Cancel Tips

## Overview
A pure core (`handle`, `summarize`, `parseSubmission`, `merchantKeyFor`) shared by a thin Node HTTP server and a browser client. Tests drive `handle()` without sockets.

## Architecture
```
Cancel kit -> src/community/client.ts -> HTTPS -> server/community-api.ts -> handle() -> TipStore
                    | on failure
                    v
             public/data/cancel-methods.seed.json (starter list)
```
The server wrapper in `server/community-api.ts` reads env `PORT` (8788), `HOST` (127.0.0.1), `GRIM_CORS_ORIGINS`, `TRUST_PROXY`, `STORE_FILE`. Deploy script: `scripts/deploy-tips-gcp.sh`. The live base URL comes from the build constant `__GRIM_COMMUNITY_URL__`.

## Components and Interfaces
- `src/community/types.ts`: `METHODS`, `MethodKind`, `Submission`, `Row`, `Tip`, `TipSummary`, `TipStore`.
- `src/community/merchant-key.ts`: `merchantKeyFor(input): string | null`, `MAX_KEY_LENGTH`.
- `src/community/validate.ts`: `parseMerchantKey`, `parseSubmission`.
- `src/community/rank.ts`: `summarize(rows, merchantKey, now)`, `wilsonLower`, `monthKey`, `monthsAgo`, `weightFor`, `MIN_REPORTS = 5`, `MIN_LOWER_BOUND = 0.4`.
- `src/community/handle.ts`: `handle(req, ...)`, `createLimiter()`, `BODY_LIMIT_BYTES = 1024`, `REPORTS_PER_HOUR = 20`, types `ApiConfig`, `ApiRequest`, `ApiResponse`, `Limiter`.
- `src/community/store.ts`: `createMemoryStore`, `createFileStore(path)`.
- `src/community/firestore-store.ts`: `createFirestoreStore(db, FieldValue, collection)`, `docId`.
- `src/community/client.ts`: `getTips(merchantKey)`, `submitOutcome({...})`, `baseUrl()`, `TIMEOUT_MS = 6000`, `SEED_URL`, `_resetTipsCache`.
- `server/known-merchants.json`: the allow-list. `public/data/cancel-methods.seed.json`: five mock merchants only.
- UI: `SHARE_TEXT` and the "What worked?" step in `src/ui/cancel-kit.ts`.

## Data Models
`Submission {merchantKey, method, worked}`. `Row` is a month bucket with counts. `TipSummary {merchantKey, best, bestWorked, bestTotal, methods, source: 'community'|'seed'|'none'}`.

## Error Handling
- Bad body: 4xx with a code from `parseSubmission`. Unknown key: 202 and drop. Rate limit: 429.
- Unhandled server error: 500 JSON, nothing logged about the request.
- Client: timeout, non-JSON, CORS failure or 500 gives the seed result.
- Known gaps (in `docs/community-api.md`): anyone can POST; limits are per instance; `failed` is biased to the first method tried.

## Testing Strategy
- `src/community/handle.test.ts`: health, 404, CORS, validation, rate limit, allow-list drop, `/tips` caching, end to end, file store restart, committed data files, `/tips/all`.
- `src/community/merchant-key.test.ts`, `validate.test.ts`, `rank.test.ts`, `client.test.ts`, `firestore-store.test.ts` (fake Firestore).
- Not tested: a real Firestore write, a deployed API from the Pages origin.
