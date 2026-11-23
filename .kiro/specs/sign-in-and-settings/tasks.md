# Tasks: Sign-in and Settings

- [x] 1. Session auth
  - [x] 1.1 Token storage and expiry in `src/pipeline/session-auth.ts`
  - [x] 1.2 Silent re-auth with `prompt=none`, one try per tab
  - [x] 1.3 `revokeToken` and `clearAuth`
  - [x] 1.4 Tests in `src/pipeline/session-auth.test.ts`
  - _Requirements: 1.1, 1.2, 1.3, 1.4, 2.1, 2.2, 2.3, 2.4, 3.1, 3.2_

- [x] 2. Gate and redirect
  - [x] 2.1 Sign-in gate with consent text in `src/ui/app.html`
  - [x] 2.2 `redirectUriFor` in `src/pipeline/oauth-redirect.ts`
  - [x] 2.3 Tests `src/ui/app-gate.test.ts`, `src/pipeline/oauth-redirect.test.ts`, `src/ui/landing.test.ts`
  - _Requirements: 4.1, 4.2, 4.3_

- [x] 3. Settings panel
  - [x] 3.1 Account and sound sections in `src/ui/settings.ts`
  - [x] 3.2 `forgetAccount` clears `ACCOUNT_KEYS`
  - _Requirements: 3.3, 3.4, 5.1, 5.2, 5.3, 5.4_

- [ ] 4. Not covered
  - [ ] 4.1 Unit test for `forgetAccount` and the dialog
  - [ ] 4.2 Live check: real Google sign-in, silent re-auth after 1 hour, revoke
  - _Requirements: 2.1, 3.1, 3.3_
