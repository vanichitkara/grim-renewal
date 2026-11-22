# Community cancel tips API

Users can share which cancel method worked for a company ("Netflix: email worked"). Later users with that company see
"Most people cancel this one by email (7 of 9 say it worked)" and the Cancel kit opens on that tab.

> **WITHOUT A DEPLOYED HTTPS API THE SHARED FEATURE WORKS ONLY LOCALLY.**
> The live site is a static page. It shows the starter list (five demo merchants) until the owner deploys this API and sets
> `GRIM_COMMUNITY_URL` (see Deploy). Browsers refuse an `http://` API from an `https://` page.

## What is stored, and what is not

Shared by the user (opt-in, see below): `merchantKey` (website name such as `netflix.com`), `method`
(`online | email | phone | other`), `worked` (yes or no). Nothing else is accepted. A request with an extra field is refused.

Stored: a counter per `(merchantKey, method, yyyy-mm)` with `worked` and `failed`. Example row:
`{"merchantKey":"netflix.com","method":"email","month":"2026-11","worked":7,"failed":2}`.

Not stored: names, emails, amounts, dates of the user's charges, plans, accounts, user ids, cookies, message ids, free text,
per-report timestamps, IP addresses. The rate limiter keeps `sha256(dailySalt + ip)` in memory only; the salt is random,
changes every 24 hours and is never written anywhere. The server never logs bodies, addresses or headers.

## The privacy exception (owner: please read)

`.kiro/steering/privacy.md` says "Never send subscription data to any third-party endpoint". This API is first-party (the
project's own server) and the payload is the minimum above, so we treat it as a narrow exception. The rules that make it one:

1. First-party server only.
2. Only the three fields. No free text.
3. Opt-in per report. The checkbox is OFF by default. `submitOutcome` sends nothing unless the caller passes `consented: true`.
4. Allow-list: the server stores only keys in `server/known-merchants.json`. Others get the same `202` and are dropped.
   This also keeps health, therapy, adult and legal services out. The list makes no claim about how any company cancels.
   It also holds the five demo merchants.
5. `merchantKeyFor` returns nothing for payment and app-store senders (PayPal, Stripe, Apple, Google, Paddle, Amazon...).

`privacy.md` itself was not edited. The owner decides whether to amend it.

## Routes

| Route | What |
|---|---|
| `GET /health` | `{"ok":true}` |
| `GET /tips?merchant=<key>` | summary: `best`, `bestWorked`, `bestTotal`, per-method counts, `source` (`community` or `none`). `Cache-Control: public, max-age=60`. A key not on the allow-list gives `source: "none"`. |
| `POST /report` | body `{"merchantKey","method","worked"}`, `Content-Type: application/json`, at most 1 KB. `202` on accept or drop. |
| `OPTIONS *` | CORS preflight |

Errors: 400 bad body, 403 origin not allowed, 413 too large, 415 not JSON, 429 slow down, 404 unknown route.
CORS: only origins in `GRIM_CORS_ORIGINS` (default `http://localhost:5173,http://127.0.0.1:5173,https://vanichitkara.github.io`).
No wildcard. `Vary: Origin` is always sent.

## How the best method is picked

Per method: the Wilson lower bound (95%) of the worked-rate, on counts weighted by age (full weight for 12 months, half to 36
months, dropped after). `best` needs at least 5 reports for that method AND a lower bound of at least 0.40. Otherwise
`best` is `null` and the UI says "not enough reports yet". Examples: 3 of 3 is not enough, 5 of 5 is, 7 of 9 is,
20 yes and 1 no stays settled. Ties go to more reports, then to the newer month.
`failed` is biased toward the method people try first: they fail there, then move on to another one.

## Run locally

```
npm run community        # http://127.0.0.1:8788, data in data/community.json (git-ignored)
```

Env: `PORT`, `HOST`, `GRIM_CORS_ORIGINS`, `STORE_FILE`, `TRUST_PROXY=1` (use the last `X-Forwarded-For` entry as the address).
To point the dev site at it: build with `GRIM_COMMUNITY_URL=http://127.0.0.1:8788` (http is allowed only for localhost).
The code is in `src/community/` (pure `handle()`, ranking, validation, stores, browser client) and `server/community-api.ts`
(sockets only; it re-exports `handle`). Pure code lives under `src/` so the tests and `tsc` cover it.

## Deploy to Cloud Run with Firestore (owner step: needs your Google Cloud account)

Cloud Run's disk is temporary, so the JSON-file store is for local runs only. Production needs a database behind the same
`TipStore` interface. Sketch (not built, no dependency added):

```ts
import { Firestore, FieldValue } from '@google-cloud/firestore';
import type { TipStore } from '../src/community/types.ts';

export function createFirestoreStore(db = new Firestore()): TipStore {
  const col = db.collection('tips'); // doc id: `${merchantKey}|${method}|${month}`
  return {
    async add(r) {
      await col.doc(`${r.merchantKey}|${r.method}|${r.month}`).set(
        { merchantKey: r.merchantKey, method: r.method, month: r.month,
          [r.worked ? 'worked' : 'failed']: FieldValue.increment(1) },
        { merge: true },
      );
    },
    async get(merchantKey) {
      const snap = await col.where('merchantKey', '==', merchantKey).get();
      return snap.docs.map((d) => ({ worked: 0, failed: 0, ...d.data() }) as never);
    },
  };
}
```

Steps: add `@google-cloud/firestore`, wire the store in `startServer`, containerise (`node:20`, run `npx tsx server/community-api.ts`
with `HOST=0.0.0.0`, `PORT` from Cloud Run, `TRUST_PROXY=1`), `gcloud run deploy`, set `GRIM_CORS_ORIGINS` to the Pages origin.
Then set the GitHub Actions variable `GRIM_COMMUNITY_URL` to the https service address (public, not a secret) and rebuild the site.
Check: `curl https://<service>/health`, then load the live site and confirm the page can call `/health` from the Pages origin.

## Known gaps

- **Cold start.** Cloud Run may start a new instance on the first request; the first answer can be slow. The client waits
  6 s, retries once, then shows the starter list.
- **Rate limits are per instance** and reset on restart. Several instances each count alone. The real answer is a platform
  limiter or Firestore counters.
- **Anyone can POST.** There is no sign-in, by design (no user ids). The 5-report minimum, the Wilson bound, the allow-list,
  the 1-per-day-per-company limit and the 20-per-hour limit make poisoning harder, not impossible. A determined person with many
  addresses can still skew a company's result.
- **Platform logs.** Cloud Run and its load balancer keep their own request logs (including addresses). The app does not log them,
  but the platform does. Set a short log retention.
- **Allow-list is manual.** A real company not on the list gets no shared tips until it is added.
- **Name-to-key guess.** A single display word such as "Netflix" becomes `netflix.com`; multi-word names get no key. A wrong guess
  is dropped by the allow-list or shows no tip.
