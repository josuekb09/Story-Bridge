# Story Bridge

Story Bridge is a proof of concept for sharing African stories in the storyteller's original language and voice. Storytellers can write or record a story, add their own translation, save a draft, and choose whether to share it publicly.

Translations and translation checks are human-entered. Automatic translation and generated speech are not implemented.

## Demo and current status

[Open the Story Bridge demo](https://story-bridge.onrender.com/).

As of 7 November 2026:

- The public sign-in page is reachable. Email-code sign-in is enabled for this demo; Google sign-in is not configured.
- Email-code sign-in, text draft persistence, and private audio saving and playback have been checked locally against the configured Supabase project.
- The signed-in flow on the deployed site and the exact commit served by the deployment have not yet been verified.

This is a demonstration build, not a production service for sensitive stories or recordings. The status above describes this demo, not every installation of the project.

## Features

- Write a story, record audio in the browser, or choose an audio file.
- Preview a recording before saving and retry after a failed save.
- Save private drafts, edit story text and translations, and choose whether to show the storyteller's name.
- Share a story publicly or withdraw it from public view.
- Add a translation and record the name of a person who checked it. A checked label is self-reported by the owner, not independent certification.
- Use email one-time codes and a display-name profile in account mode. Google sign-in is optional and requires separate provider configuration.

The app uses React and Vite for the frontend, Express for the API, and Supabase for account authentication, database storage, and private audio storage in the deployed mode.

## Run locally

Requires Node.js 24.x and npm. Run these commands from the project root:

```sh
npm ci
npm run dev
```

Open `http://localhost:5173`. The API normally listens on `127.0.0.1:3000`; the frontend development server binds to `127.0.0.1`.

The server reads the ignored project-root `.env` file before choosing its mode. Existing process environment values take precedence. With no mode configured, `npm run dev` defaults to `file/legacy`. An existing `.env` can select account mode instead, so check it before assuming which storage is active.

### Local file mode

Use these settings for the original browser-token demo:

```dotenv
STORY_BACKEND=file
STORY_AUTH_MODE=legacy
```

Stories are stored in `data/stories.json` and recordings in `uploads/`. The browser keeps an owner token in localStorage; losing it or switching browsers means losing access to private stories and drafts. This mode does not provide account sign-in and is refused by the production entry point.

`npm run seed` creates two clearly fictional placeholder stories for a disposable local demo. It refuses to overwrite an existing nonempty or invalid story file by default. Seeding is not required, and should not be run against real story data.

### Supabase account mode

Use `.env.example` as a template for a local `.env`; do not overwrite an existing configuration. Set:

```dotenv
STORY_BACKEND=supabase
STORY_AUTH_MODE=account
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
SUPABASE_SECRET_KEY=YOUR_SERVER_ONLY_SECRET_KEY
SUPABASE_BUCKET=story-bridge-audio
STORY_EMAIL_CODE_SIGN_IN=true
STORY_GOOGLE_SIGN_IN=false
```

Replace the placeholders locally. `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` are browser-safe configuration. `SUPABASE_SECRET_KEY` is server-only: never commit it, put it in frontend code, or give it a `VITE_` prefix. Leave `STORY_TEST_JWKS` unset outside automated tests.

For a new installation:

1. Select a dedicated Supabase project. Review [the account migration](supabase/migrations/202611070001_story_bridge_accounts.sql) before applying it to the intended project. It creates the tables, access controls, and private `story-bridge-audio` bucket. Do not apply it to an unrelated project.
2. Configure Supabase email delivery and the email templates used for sign-in. Include `{{ .Token }}` so users can enter a code, and identify the app as Story Bridge. Supabase sends the email; the app does not call Resend directly.
3. Configure the Site URL and permitted redirect URLs for the actual local or deployed origin. If enabling Google, configure the Google provider and its callback and redirect settings before setting `STORY_GOOGLE_SIGN_IN=true`.
4. Restart the app after changing the environment. Check sign-in, saving and reopening a text draft, and saving and playing a private recording against your own configuration.

Missing or invalid account configuration stops server startup; it does not silently fall back to local storage. For development only, `file/account` can use Supabase authentication with a separate ignored `account-data/` store. It is not a production storage option.

Existing local JSON stories and recordings are not automatically migrated to Supabase. The claim routes only attach rows that already contain a matching legacy owner hash in the selected database.

## Deploy

Configure the Supabase account-mode variables above in the hosting service's private environment settings, then use:

```sh
npm ci && npm run build
npm start
```

`npm start` forces production mode, requires `supabase/account`, and serves the built frontend from `dist/`. The server uses the host's `PORT` when provided. Set `HOST=0.0.0.0` in the hosting environment when the service must accept external connections. Use HTTPS for the public site.

`STORY_TRUST_PROXY=1` enables proxy-aware client IP handling and should only be used behind a trusted proxy. `STORY_HTTPS=1` enables the app's HSTS header when HTTPS is provided. Neither setting provisions HTTPS.

A successful build or a visible login page does not establish that authentication and storage work in a deployment. Check the deployed signed-in flow separately.

## Tests

```sh
npm test
npx playwright install chromium
npm run test:all
```

Install Playwright Chromium once for a new environment. `npm test` runs the backend tests. `npm run test:all` builds the frontend, runs backend and browser tests, then runs the configured-secret check. A standalone `npm run test:browser` requires a current build.

Browser tests choose available local ports by default. `TEST_API_PORT` and `TEST_WEB_PORT` can override them. Test data is isolated under `.test-data/runs/`, and browser evidence is saved under `test-evidence/`; the suite does not seed or write to the normal `data/` or `uploads/` directories.

Account-mode browser coverage includes signed-in text draft creation and editing through app routes with isolated local account storage. Authentication uses local keys and a mocked provider boundary. Other account-screen checks use API mocks. These automated tests do not establish that a real Supabase, email, or Google configuration works.

Before committing or pushing, confirm `.env` is ignored and review the staged diff for credentials, local data, recordings, and generated files. `npm run check:dist-secrets` checks source and built output for the configured server secret and known/configured `VITE_` secret variable names. It is a narrow check, not a general credential scanner.

## Privacy and limits

Account stories are owned by verified Supabase user IDs. The app sends the session access token to its own API as a bearer header; the Supabase session is persisted in browser localStorage. In legacy mode, ownership instead depends on the browser token described above.

Draft, private, withdrawn, and nonexistent stories return the same 404 to non-owners. Publicly shared stories are accessible to other people who can reach the app. A hidden storyteller name is omitted from public responses. Audio access follows the story's visibility and ownership checks; private storage URLs are not returned to the browser.

Each audio upload is limited to 10 MiB. Account mode buffers uploads in memory before storing them in Supabase, and the routes check a 500-story limit per account and a 1 GiB total audio limit. Legacy mode writes uploads to temporary disk files and supports configurable story and disk quotas. These are application checks, not guarantees about provider billing or concurrent usage.

Write-rate limiting is per client IP and per server process, with defaults of 60 requests per 60 seconds. `STORY_WRITE_RATE_LIMIT` and `STORY_WRITE_RATE_WINDOW_MS` adjust it. In legacy mode, `STORY_MAX_STORIES_PER_OWNER` and `STORY_MAX_UPLOAD_BYTES` adjust its story and disk quotas; they do not change the account-mode limits.

The app checks token signatures, issuer, audience, and expiry. Its CSP permits same-origin resources and the configured authentication origins as needed. These controls and the automated tests are not a security audit.

Browser recording requires microphone permission and a secure context, such as HTTPS or desktop localhost. An unsaved recording can be lost when leaving or reloading. The app warns about unsaved audio but cannot guarantee recovery. This version has no control for deleting or replacing audio after it has been saved.

Account deletion does not clean up stored audio objects, and the Supabase adapter has no explicit per-request timeout. See [STAGE-2-REVIEW.md](STAGE-2-REVIEW.md) for the code review and details. That document is a historical source review; its statements about provider setup and an unapplied migration describe the review session, not the demo's current setup.

## Project origin and tools

The project owner's concept and instructions guided this workspace. Codex built the MVP and the visible implementation, documentation, and test iterations here. Earlier iterations and test-discovered fixes, including browser layout, audio handling, recording feedback, and the approved logo integration, are documented in [PLAN.md](PLAN.md), [REVIEW.md](REVIEW.md), and [TEST-REPORT.md](TEST-REPORT.md). This statement covers work visible in this workspace and makes no claims about tools used elsewhere.
