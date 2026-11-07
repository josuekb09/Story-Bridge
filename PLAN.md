# Plan

Build Story Bridge as a proof of concept with an Express API and React/Vite interface. Stage 1 is the explicitly selected local `file/legacy` backend. Stage 2 adds a fail-closed Supabase account backend, verified bearer identity, private object storage, Google/email-code sign-in, and a display-name profile. No real provider has been configured or tested.

## Files

- `server/index.js`: API, local JSON persistence, authenticated audio access, and static production serving.
- `server/auth.js`, `server/account-routes.js`, `server/supabase-store.js`: explicit mode validation, published-key JWT verification (jose), account API and async Supabase storage interface.
- `server/env.js`, `server/dev.js`, `.env.example`: local ignored environment loading and explicit local file-mode startup.
- `supabase/migrations/202611070001_story_bridge_accounts.sql`: unapplied schema, RLS, private bucket, and storage policy.
- `vite.config.js`: local dev proxy and configurable build output for isolated test builds.
- `src/App.jsx`, `src/main.jsx`, `src/styles.css`: responsive Listen, story detail, Share, Review, and My stories UI.
- `src/RecordingCapture.jsx`, `src/recording.css`: microphone status, elapsed time, captured audio preview, and unsaved recording controls.
- `test/server.test.js`: automated API and access-control tests using isolated `.test-data` storage.
- `scripts/run-browser-tests.js`: isolated two-browser end-to-end checks and screenshot evidence.
- `scripts/seed.js`: two clearly labelled fictional placeholders in Language A and B.
- `README.md`, `AGENTS.md`, `REVIEW.md`: setup, project rules, and final review.

## Steps

1. Create the API and storage model; test privacy, ownership, audio access, and input limits. **Complete.** Stage 1 hardening adds fail-closed store validation, atomic writes with rotating backups, per-IP write limits, per-owner story limits, streamed uploads with a total on-disk cap, proxy trust off by default, restrictive response headers and CSP, generic client errors, and a self-reported checked-by label.
2. Build the browser interface and authenticated private audio playback.
3. Add seed data, run API and browser tests with isolated storage, inspect screenshots at phone and laptop widths, build, and record the review.
4. Improve recording permission, capture, preview, retry, cleanup, and navigation feedback; verify with a fake microphone against isolated data and keep the real-data hashes unchanged.
5. Stage 2 local implementation adds explicit fail-closed backends, account sessions, profile, Supabase storage, atomic database claiming, and a narrow dist-secret check. The continuation adds signed-in create/edit browser coverage through the real account-mode routes and isolated file account store, with a mocked Supabase auth boundary and locally served test JWKS; JWKS redirect/timeout handling is covered locally. **No real provider, project migration, or cloud call has been exercised.** Review findings: `STAGE-2-REVIEW.md`.

Stage 1 hardening is covered by `test/hardening.test.js`, the existing API tests, and isolated browser assertions. The browser run saves responsive screenshots for changed text and checks the CSP with both the recorder preview and playback. See `TEST-REPORT.md` for the latest run and known limitations.
