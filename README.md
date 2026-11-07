# Story Bridge

A proof of concept for sharing personal stories in their original language and voice, with author-entered translations and author-controlled visibility. Stage 1 remains available as an explicitly selected local file mode. Stage 2 adds Google sign-in, email one-time codes, a display-name profile, and a Supabase storage adapter. No paid services are required by the code. AI translation and generated speech are not included.

## Run it

Requires Node.js and npm. In PowerShell, from this project root, keep npm's cache and temporary files inside the project for this terminal session, then install once and start the app:

```powershell
$env:TEMP = Join-Path (Get-Location) '_tmp'
$env:TMP = Join-Path (Get-Location) '_tmp'
$env:npm_config_cache = Join-Path (Get-Location) '_npm-cache'
npm ci
npm run dev
```

Open `http://localhost:5173`. `npm run dev` explicitly selects the local `file/legacy` mode; the API listens on `127.0.0.1:3000`. To create two clearly fictional placeholder entries, run `npm run seed` before starting the server. To run automated tests use `npm test`; create a production frontend bundle with `npm run build`.

In `file/legacy` mode, runtime stories are stored in `data/stories.json` and recordings in `uploads/` under random names. The seed command replaces that JSON data file, so use it only before adding stories. Account mode uses its selected account storage adapter.

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

`npm test` runs the backend tests. `npm run test:all` builds first, then starts isolated API and static-serving browser test processes with per-run data under `.test-data/runs`; set `TEST_API_PORT` and `TEST_WEB_PORT` to unused local ports. It uses the local Playwright Chromium browser and saves screenshots and results under `test-evidence/`. The suite does not seed or write to `data/` or `uploads/`. A standalone `npm run test:browser` needs a current build first.

## Server safety settings

The server treats a missing store as empty only when there are no story-store backups or upload files suggesting prior data. Invalid, empty, unreadable, or missing-with-remnants stores return an error and are never replaced by a new write. Each successful update keeps up to three prior `stories.json` versions in the data directory; backups rotate before the atomic same-directory replacement.

Defaults can be adjusted with these environment variables:

| Variable | Default | Purpose |
|---|---:|---|
| `STORY_WRITE_RATE_LIMIT` | `60` | Write requests per client IP per `STORY_WRITE_RATE_WINDOW_MS` window |
| `STORY_WRITE_RATE_WINDOW_MS` | `60000` | Write-rate window in milliseconds |
| `STORY_MAX_STORIES_PER_OWNER` | `500` | Maximum stories associated with one browser owner token |
| `STORY_MAX_UPLOAD_BYTES` | `1073741824` | Total uploaded audio bytes allowed on disk (1 GiB) |
| `STORY_TRUST_PROXY` | off | Set to `1` only behind a trusted proxy to use forwarded client IPs |
| `STORY_HTTPS` | off | Set to `1` only when HTTPS is provided to enable HSTS |

Each audio file remains limited to 10 MiB and is streamed to a temporary file in the upload directory before it is attached to a story. The write-rate limiter is in memory and applies per process; running multiple server processes does not share counters. The server sends a restrictive CSP allowing same-origin scripts, styles, images, fonts, and connections, plus `blob:` media for the recorder preview and audio playback.

## Ownership and privacy

In `file/legacy` mode the browser creates a cryptographically random owner token once and stores it in localStorage. The API stores only its SHA-256 hash with each story. The token is sent in an HTTP header and never in a URL or API response. Losing browser storage or using a different browser means losing access to drafts and private stories. In account mode, verified Supabase user IDs own account stories; the browser token is accepted only by the one-time claim route. There is no account recovery feature beyond the configured sign-in provider.

Translations are entered by storytellers. A “checked” label is self-reported by the owner and does not mean a professional or independent translation review occurred.

Non-owners receive the same 404 for a draft, private, withdrawn, or nonexistent story. Audio is outside the static web root; the audio endpoint performs the same visibility and owner checks. Private audio is fetched with the owner header and played from a temporary browser object URL. A hidden author name is omitted from public responses.

The Share screen shows recording permission, active recording time, and a preview with duration and file size before saving. The preview remains available after a failed save so it can be retried. Retaking and removing unsaved audio require confirmation. The browser may discard an unsaved recording when leaving or reloading; the warning cannot guarantee recovery. Once audio is saved with a story, this version does not offer a recording delete or replacement control.

The default server and Vite dev server bind to localhost. `HOST=0.0.0.0 npm run dev` optionally exposes both to devices on your Wi-Fi. This is a local demo, shared stories are visible to anyone who can reach the app, and it is not a hardened production service. A phone on plain HTTP may block microphone recording: desktop localhost is the primary way to record. Phone use over Wi-Fi is for reading, playback, and typing unless a secure context is available. If recording is unavailable, type a story or choose an audio file.

## Stage 2 accounts (local code only; remote setup remains gated)

The Node server reads a project-root `.env` file using a small local loader. `.env` is ignored by git. Copy `.env.example` to `.env` and enter values on your own machine. `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` are browser-safe. `SUPABASE_SECRET_KEY` is server-only: never rename it with a `VITE_` prefix, paste it into browser code, or share it in chat. `SUPABASE_BUCKET` must be `story-bridge-audio`. Keep `STORY_BACKEND=supabase` and `STORY_AUTH_MODE=account` together for Supabase storage. Missing or invalid account configuration fails server startup; it never selects the file backend. Local development can explicitly select `file/account` to use Supabase for verified sign-in and the separate ignored `account-data/` directory for account storage. `file/legacy` remains the Stage 1 local mode. File modes are refused in production.

The Google button appears only when `STORY_GOOGLE_SIGN_IN=true`. The email code form appears only when `STORY_EMAIL_CODE_SIGN_IN=true`. Supabase email settings must use an OTP code template that says **Story Bridge** and contains only the code, for example `{{ .Token }}`. Supabase auth sends the email; no direct Resend runtime call is made by this app. The server verifies access-token signatures using the project's published signing keys, then checks expiry, issuer, and audience. It uses the server-only key for database and private audio operations. Audio is streamed through the server after each story access check; storage URLs are not returned to the browser.

Before enabling a real project, complete the user-controlled gates in the handoff: verify that a free project slot is available without opening existing projects; create a new project named Story Bridge; apply [the unapplied migration](supabase/migrations/202611070001_story_bridge_accounts.sql) only after confirming that project name; verify RLS and the private bucket; then configure a Google Web application consent screen named Story Bridge with only `openid`, `email`, and `profile`, configure email SMTP/template, and set exact redirect URLs. The app has not been tested against a real Supabase project, Google OAuth client, or email provider. The old local JSON data and uploads are not migrated or opened by this work. The claim endpoint can atomically claim legacy-hash rows already present in the selected database; this implementation does not transfer the existing local file data into Supabase.

### Status and limitations (read before trusting this)

- **Nothing here is production-ready.** The Supabase adapter, the SQL migration, Google sign-in and the email-code route are written but have never been run against a real Supabase project, Google client or email provider. Google sign-in and the email route are not configured. Tests use locally generated keys, a loopback key-set endpoint and mocks; they prove the interface and the authorization logic only.
- `npm start` (`server/start.js`) forces `NODE_ENV=production`, requires `STORY_BACKEND=supabase` with `STORY_AUTH_MODE=account`, refuses the file backend and refuses to start on missing or invalid account configuration. It serves the built `dist/` app. `npm run dev`/`npm run server` select `file/legacy` explicitly (unless `.env` says otherwise) and print the mode at startup.
- Access tokens are verified with `jose` (RS256 or ES256 only; issuer `<SUPABASE_URL>/auth/v1`; audience exactly `authenticated`; required `exp` and `sub`), against the project's published key set (cached for five minutes, refreshed on an unknown key id). The audience check is covered with local synthetic tokens; a real project's token claims and signing keys remain unverified. Key discovery fails closed for missing/invalid keys.
- `STORY_JWKS_URL` optionally overrides the key-set address. A non-loopback URL must use HTTPS and match the project host and port, with no user information. Loopback HTTP remains allowed for local key endpoints and the production-entry test. Fetches reject redirects and time out after five seconds. `STORY_TEST_JWKS` (an inline key set) is accepted only when `NODE_ENV=test`.
- The claim routes can only claim rows that already carry a legacy owner hash in the selected database. Nothing here copies the existing local `data/stories.json` or `uploads/` into Supabase, so those old stories cannot be claimed until a separate, user-approved migration exists.
- The Supabase session is kept by supabase-js in browser localStorage (standard behaviour, PKCE flow). The app copies the access token into memory and sends it only as an `Authorization` header to its own `/api`; it is never put in a URL. Sign-out clears it.
- The migration deletes a user's stories when the user is deleted (`on delete cascade`); their audio objects would remain in the bucket until removed by hand.
- The browser suite covers signed-in text draft creation and editing against the real account-mode app routes and isolated file account store. It mocks only the Supabase auth origin for that flow and verifies the session with a locally generated key. Other account screen checks still use API response mocks. No real provider calls are made.
- See [STAGE-2-REVIEW.md](STAGE-2-REVIEW.md) for the migration and adapter findings, including cascade behavior and the missing adapter-level timeout.
- The Stage 1 browser tests now run through an isolated static server in development mode, because the production entry refuses the file backend by design.

### Manual pre-push secret check

1. Confirm `.env` is ignored and `.env.example` contains placeholders only.
2. Run `npm run build` and `npm run check:dist-secrets` with your local environment loaded.
3. Confirm the Supabase secret key appears only in `.env` and server-side configuration, never in a `VITE_` variable or client source.
4. Review `git status --short` and the staged diff for credentials, local data, uploads, screenshots, and generated output before pushing.

`npm run check:dist-secrets` checks project source and built `dist` files for the configured server secret value and checks known/configured `VITE_` secret variable names. It is a narrow check, not a general credential scanner.

## Project origin and tools

The project owner's concept and instructions guided this workspace. Codex built the MVP and the visible implementation, documentation, and test iterations here. Earlier iterations and test-discovered fixes—including browser layout, audio handling, recording feedback, and the approved logo integration—are documented in `PLAN.md`, `REVIEW.md`, and `TEST-REPORT.md`. This statement covers work visible in this workspace and makes no claims about tools used elsewhere.
