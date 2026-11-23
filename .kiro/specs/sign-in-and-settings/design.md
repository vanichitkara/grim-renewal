# Design: Sign-in and Settings

## Overview
`src/pipeline/session-auth.ts` holds the pure auth rules over an injected key-value store. `src/ui/settings.ts` is a native `<dialog>`. The page glue lives in `src/ui/app.html`.

## Architecture
```
page load -> readAuth -> liveToken?  yes: allow scan
                     -> shouldTrySilent? yes: markSilentTried, redirect buildAuthUrl({silent})
                     -> else: gate with Connect Gmail
Google return -> saveToken / saveEmail
Settings -> Sign out -> revokeToken -> clearAuth + forgetAccount -> reload
```

## Components and Interfaces
- `src/pipeline/session-auth.ts`: `AUTH_KEY = 'grim_auth'`, `SILENT_KEY`, `EXPIRY_MARGIN_MS = 60_000`, `SCOPE`, `readAuth`, `saveToken`, `saveEmail`, `liveToken`, `isSignedIn`, `dropToken`, `clearAuth`, `buildAuthUrl`, `shouldTrySilent`, `markSilentTried`, `clearSilentTried`, `isSilentMiss`, `revokeToken(token, fetcher)`.
- `src/pipeline/oauth-redirect.ts`: `redirectUriFor(loc)`.
- `src/ui/settings.ts`: `initSettings(openBtn, {getEmail, onSignOut})`, `forgetAccount(store)`, `ACCOUNT_KEYS`.
- `src/ui/consent-banner.ts`: `showConsentBanner`. `src/ui/email-entry.ts`: the email step (`isValidEmail`, `showEmailEntry`).
- `src/ui/landing.ts` and `src/ui/index.html`: landing page that hands a Google return to `app.html`.

## Data Models
`StoredAuth {token?, expiresAt?, email?}` in `grim_auth`. `KV` interface (`getItem`, `setItem`, `removeItem`).

## Error Handling
- `readAuth` returns `null` for bad JSON or wrong types.
- `revokeToken` never throws.
- `dropToken` removes the whole entry when there is no email.
- The silent try runs once per tab.

## Testing Strategy
- `src/pipeline/session-auth.test.ts`: expiry and drop, stored fields only, junk, sign out, one silent try, `prompt=none` URL, silent-miss errors, revoke POST.
- `src/pipeline/oauth-redirect.test.ts`, `src/pipeline/gmail-profile.test.ts`.
- `src/ui/app-gate.test.ts`, `src/ui/landing.test.ts`, `src/ui/email-entry.test.ts`.
- `src/ui/settings.ts` has no unit test; `forgetAccount` and the dialog were not covered by a repo test.
- Not run: a live Google sign-in and revoke.
