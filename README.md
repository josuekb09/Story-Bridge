# Story Bridge

A local proof of concept for sharing personal stories in their original language and voice, with author-entered translations and author-controlled visibility. It uses React, Vite, Express, and a local JSON file. It has no accounts, paid services, runtime third-party API calls, AI translation, or generated speech.

## Run it

Requires Node.js and npm. In PowerShell, from this project root, keep npm's cache and temporary files inside the project for this terminal session, then install once and start the app:

```powershell
$env:TEMP = Join-Path (Get-Location) '_tmp'
$env:TMP = Join-Path (Get-Location) '_tmp'
$env:npm_config_cache = Join-Path (Get-Location) '_npm-cache'
npm ci
npm run dev
```

Open `http://localhost:5173`. The API listens on `127.0.0.1:3000` by default. To create two clearly fictional placeholder entries, run `npm run seed` before starting the server. To run automated tests use `npm test`; create a production frontend bundle with `npm run build`.

All runtime data is stored in `data/stories.json`; recordings are stored in `uploads/` under random names. The seed command replaces that JSON data file, so use it only before adding stories.

## Test the app

For repeatable automated and browser checks, set project-local temporary/cache paths in PowerShell, then run the full suite:

```powershell
$env:TEMP = Join-Path (Get-Location) '_tmp'
$env:TMP = Join-Path (Get-Location) '_tmp'
$env:npm_config_cache = Join-Path (Get-Location) '_npm-cache'
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path (Get-Location) '.test-data\playwright-browsers'
$buildId = [guid]::NewGuid().ToString('N')
$env:STORY_BRIDGE_BUILD_DIR = Join-Path (Get-Location) ('.test-data\build-' + $buildId)
# For a new clone, install Chromium once into the project-local browser cache.
npx playwright install chromium
npm run test:all
```

`npm test` runs the backend tests. `npm run test:browser` starts isolated services on ports 4317 and 4318 with per-run data under `.test-data/runs`; it uses a local Playwright Chromium browser and saves screenshots and results under `test-evidence/`. The suite does not seed or write to `data/` or `uploads/`.

## Ownership and privacy

The browser creates a cryptographically random owner token once and stores it in localStorage. The API stores only its SHA-256 hash with each story. The token is sent in an HTTP header and never in a URL or API response. Losing browser storage or using a different browser means losing access to drafts and private stories. There is no account recovery.

Translations are entered by storytellers. A “checked” label is self-reported by the owner and does not mean a professional or independent translation review occurred.

Non-owners receive the same 404 for a draft, private, withdrawn, or nonexistent story. Audio is outside the static web root; the audio endpoint performs the same visibility and owner checks. Private audio is fetched with the owner header and played from a temporary browser object URL. A hidden author name is omitted from public responses.

The Share screen shows recording permission, active recording time, and a preview with duration and file size before saving. The preview remains available after a failed save so it can be retried. Retaking and removing unsaved audio require confirmation. The browser may discard an unsaved recording when leaving or reloading; the warning cannot guarantee recovery. Once audio is saved with a story, this version does not offer a recording delete or replacement control.

The default server and Vite dev server bind to localhost. `HOST=0.0.0.0 npm run dev` optionally exposes both to devices on your Wi-Fi. This is a local demo, shared stories are visible to anyone who can reach the app, and it is not a hardened production service. A phone on plain HTTP may block microphone recording: desktop localhost is the primary way to record. Phone use over Wi-Fi is for reading, playback, and typing unless a secure context is available. If recording is unavailable, type a story or choose an audio file.

## Project origin and tools

The project owner's concept and instructions guided this workspace. Codex built the MVP and the visible implementation, documentation, and test iterations here. Earlier iterations and test-discovered fixes—including browser layout, audio handling, recording feedback, and the approved logo integration—are documented in `PLAN.md`, `REVIEW.md`, and `TEST-REPORT.md`. This statement covers work visible in this workspace and makes no claims about tools used elsewhere.
