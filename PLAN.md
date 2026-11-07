# Plan

Build a local-first story sharing proof of concept with an Express API, React/Vite interface, and a JSON file store. Each browser generates an owner token; only its SHA-256 hash is saved with a story. The API gates private stories and their audio by that hash, supports drafts, self-declared translation checks, visibility approval, and withdrawal.

## Files

- `server/index.js`: API, local JSON persistence, authenticated audio access, and static production serving.
- `vite.config.js`: local dev proxy and configurable build output for isolated test builds.
- `src/App.jsx`, `src/main.jsx`, `src/styles.css`: responsive Listen, story detail, Share, Review, and My stories UI.
- `src/RecordingCapture.jsx`, `src/recording.css`: microphone status, elapsed time, captured audio preview, and unsaved recording controls.
- `test/server.test.js`: automated API and access-control tests using isolated `.test-data` storage.
- `scripts/run-browser-tests.js`: isolated two-browser end-to-end checks and screenshot evidence.
- `scripts/seed.js`: two clearly labelled fictional placeholders in Language A and B.
- `README.md`, `AGENTS.md`, `REVIEW.md`: setup, project rules, and final review.

## Steps

1. Create the API and storage model; test privacy, ownership, audio access, and input limits.
2. Build the browser interface and authenticated private audio playback.
3. Add seed data, run API and browser tests with isolated storage, inspect screenshots at phone and laptop widths, build, and record the review.
4. Improve recording permission, capture, preview, retry, cleanup, and navigation feedback; verify with a fake microphone against isolated data and keep the real-data hashes unchanged.
