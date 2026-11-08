# Plan

Build Story Bridge as a proof of concept with an Express API and React/Vite interface. Stage 1 is the explicitly selected local `file/legacy` backend. Stage 2 adds a fail-closed Supabase account backend, verified bearer identity, private object storage, Google/email-code sign-in, and a display-name profile. No real provider has been configured or tested.

## Files

- `server/index.js`: API, local JSON persistence, authenticated audio access, and static production serving.
- `server/auth.js`, `server/account-routes.js`, `server/supabase-store.js`: explicit mode validation, published-key JWT verification (jose), account API and async Supabase storage interface.
- `server/env.js`, `server/dev.js`, `.env.example`: local ignored environment loading and explicit local file-mode startup.
- `supabase/migrations/202611070001_story_bridge_accounts.sql`: unapplied schema, RLS, private bucket, and storage policy.
- `vite.config.js`: local dev proxy and configurable build output for isolated test builds.
- `src/App.jsx`, `src/main.jsx`, `src/styles.css`: responsive Discover/Listen, account workspace, filtered My stories, profile, story detail, Share, and Review UI.
- `src/Landing.jsx`, `src/Brand.jsx`, `public/assets/logo/`, `public/assets/social/`: public landing, brand lockups, waveform motif, and share image.
- `server/story-record.js`: deterministic SHA-256 version fingerprints exposed on story detail; account-mode installs need the additive `version_log` column in the SQL migration.
- `src/RecordingCapture.jsx`, `src/recording.css`: microphone status, elapsed time, captured audio preview, and unsaved recording controls.
- `test/server.test.js`: automated API and access-control tests using isolated `.test-data` storage.
- `scripts/run-browser-tests.js`: isolated two-browser end-to-end checks and screenshot evidence.
- `scripts/capture-product-screens.mjs`: isolated public flow screenshots at 375px, 768px, and 1280px.
- `docs/demo-script.md`, `docs/submission.md`: judge walkthrough and concise capstone description with the feature limits stated.
- `scripts/seed.js`: six fictional public stories in English, French and Swahili for the landing and public feed.
- `README.md`, `AGENTS.md`, `REVIEW.md`: setup, project rules, and final review.

## Steps

1. Create the API and storage model; test privacy, ownership, audio access, and input limits. **Complete.** Stage 1 hardening adds fail-closed store validation, atomic writes with rotating backups, per-IP write limits, per-owner story limits, streamed uploads with a total on-disk cap, proxy trust off by default, restrictive response headers and CSP, generic client errors, and a self-reported checked-by label.
2. Build the browser interface and authenticated private audio playback.
3. Add seed data, run API and browser tests with isolated storage, inspect screenshots at phone and laptop widths, build, and record the review.
4. Improve recording permission, capture, preview, retry, cleanup, and navigation feedback; verify with a fake microphone against isolated data and keep the real-data hashes unchanged.
5. Stage 2 local implementation adds explicit fail-closed backends, account sessions, profile, Supabase storage, atomic database claiming, and a narrow dist-secret check. The continuation adds signed-in create/edit browser coverage through the real account-mode routes and isolated file account store, with a mocked Supabase auth boundary and locally served test JWKS; JWKS redirect/timeout handling is covered locally. **No real provider, project migration, or cloud call has been exercised.** Review findings: `STAGE-2-REVIEW.md`.
6. The local account workspace uses the existing `/api/mine` and public story list. It shows loaded collection totals, draft resumption, filtered/status-labelled stories, and recoverable list/profile errors. Creation and review changes get in-page navigation guards without persistent story caching. The browser checks use synthetic accounts and stories; they do not verify a deployed signed-in flow.
7. Current stabilization adds strict array validation for list API responses, retryable audio loading states, and a dialogue harness whose named handlers are removed after each action. The updated browser scenarios exercise malformed-list retry, private-audio retry, identity races, and profile/workspace recovery with synthetic fixtures.
8. Current product pass adds public landing and feed, four-step share, optional browser-native speech transcript, original-first detail, responsive brand tokens, and story version fingerprints. Browser-native speech recognition support varies.
9. The current AI pass adds an optional server-side OpenAI translation draft service. The storyteller must explicitly approve a generated draft before Share can continue or save it; editing clears approval. The service fails with a manual-translation fallback when no key is configured. Tests mock the provider; no live key or provider call has been verified. Supabase account deployments need `202611080001_add_translation_origin.sql` after the existing Story Bridge migration.
10. An additive Listen cultural-record seed introduces a clearly project-authored Luluwa/Lulua draft with sources and empty French/Tshiluba fields. There is no image pending a file-specific licence check. Restricted records are redacted in the non-owner view. Stories created from the record still use the existing story endpoint, author controls, and story fingerprints; the record association currently lives only in the browser session.

Stage 1 hardening is covered by `test/hardening.test.js`, the existing API tests, and isolated browser assertions. The browser run saves responsive screenshots for changed text and checks the CSP with both the recorder preview and playback. See `TEST-REPORT.md` for the latest run and known limitations.
