# Story Bridge

**A learning-first social network for African cultures.** People share stories, objects, language, music, traditions and places from their own culture — in their own language and voice — with sources and context underneath. Anyone can read them in their own language, while the original always stays one click away.

**Live demo:** https://story-bridge.onrender.com

Built for the Andela × OpenAI capstone *Telling African Stories*, and to be presented at the Africa Tech Festival (Cape Town).

---

## What you can do

- **Discover** a feed of public stories: author, region, time, original language, "See more", photos, audio, the storyteller's translation, and sharing.
- **Share** a post in four steps — language → tell → translate → review. A post can hold text, a voice recording or audio file, up to six photos, and documentation: post type and section, region, people, tags, sources, a trust label (*Told by a community member*, *Research note*, *Museum record*) and a licence.
- **Translate with AI** (optional): *Draft with AI* asks OpenAI for a first translation. It is marked unapproved until the storyteller approves it, and editing it clears the approval.
- **Stay in control**: every story starts as a private draft. The storyteller approves sharing, can withdraw it, or **delete it permanently** (text, audio, photos and translations).
- **Profiles**: photo, name, country, languages and counts, with an *Edit profile* form. Fields stay private unless shown on a story.
- **Objects**: four museum reference records for Luluwa (Lulua) objects from DR Congo, each with *What we know*, *What we do not know*, sources, and community questions. Museum records are kept separate from community stories.
- **Read the site in 20 languages**: English and French written by hand; Kiswahili, Hausa, Yorùbá, Igbo, Amharic, Afaan Oromoo, Somali, isiZulu, isiXhosa, Afrikaans, chiShona, Lingála, Ikinyarwanda, Malagasy, Wolof, Portuguese, Arabic (right-to-left) and Spanish as machine drafts, clearly labelled until a speaker checks them. Stories can be written in 36 languages (31 African), or any other language typed by hand.
- **Sign in** with Google or a 6-digit email code. New accounts get a short welcome step.

### Honesty rules built into the product

- No invented translations of a person's story: machine translations are labelled, and the original is always available.
- No invented cultural facts: object pages show sourced facts, our readings are marked as such, and unknowns say *Not recorded*.
- Every image carries its author, licence and source.

## Current status (9 November 2026)

| Area | Status |
|---|---|
| Public site, landing page, Discover, objects, profiles, posting, delete | Live and checked on the demo |
| Email-code and Google sign-in | Live. Google OAuth is in *Testing* mode: only accounts added as test users can sign in with Google until the app is published |
| Database migrations `202611070001` … `202611080006` | Applied to the production Supabase project |
| AI translation | Key configured on the host; the live provider call is still being verified (errors are now logged as status/code/model only) |
| Interface translation | Landing page in 20 languages; other screens are English for now |

This is a demonstration build, not a production service for sensitive stories or recordings.

## Tech stack

React + Vite (frontend), Express (API), Supabase (Auth, Postgres with row-level security, private storage), OpenAI Responses API (optional translation drafts), Render (hosting).

```
src/
  App.jsx                 entry point
  state/                  application state and routing
  pages/                  screens (Landing, Discover feed, Share, Review, Profile, Objects…)
  components/             audio player and previews
  lib/                    api.js (session headers), i18n.js, languages.js (language registry)
  locales/                interface text, one JSON file per language
  data/                   showcase cultures and generated image credits
  styles/                 tokens, base and per-screen CSS
server/                   Express API, auth (JWT/JWKS), stores (Supabase or file), CSP
supabase/migrations/      SQL migrations (review before applying)
scripts/                  image fetching, tests, secret check
docs/                     collaboration board, phase plan, object documentation, credits
```

Pages have real URLs: `/discover`, `/stories/:id`, `/profile`, `/mine`, `/share`, `/objects`, `/objects/:id`. Direct links and reloads work, signed in or not; private pages show the sign-in screen when no one is signed in.

## Run locally

Requires Node.js 24.x and npm.

```sh
npm ci
npm run dev
```

Open `http://localhost:5173`. The API listens on `127.0.0.1:3000`.

The server reads the ignored project-root `.env` before choosing its mode; process environment values take precedence. Values are trimmed, and a UTF-8 BOM or an inline ` # comment` is ignored. Restart the server after editing `.env`.

### Local file mode

```dotenv
STORY_BACKEND=file
STORY_AUTH_MODE=legacy
```

Stories are stored in `data/stories.json` and recordings in `uploads/`. The browser keeps an owner token in localStorage. This mode has no account sign-in and is refused by the production entry point. `npm run seed` creates six fictional public stories (it refuses to overwrite existing data).

### Supabase account mode

Use `.env.example` as a template:

```dotenv
STORY_BACKEND=supabase
STORY_AUTH_MODE=account
SUPABASE_URL=https://YOUR_PROJECT.supabase.co
SUPABASE_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
SUPABASE_SECRET_KEY=YOUR_SERVER_ONLY_SECRET_KEY
SUPABASE_BUCKET=story-bridge-audio
STORY_EMAIL_CODE_SIGN_IN=true
STORY_GOOGLE_SIGN_IN=false
OPENAI_API_KEY=             # optional, server-only, never prefix with VITE_
OPENAI_TRANSLATION_MODEL=   # optional, defaults to gpt-6-luna
STORY_BRIDGE_OBJECT_ADMIN_ID= # Supabase user id allowed to approve first posts
```

`SUPABASE_URL` and the publishable key are browser-safe. `SUPABASE_SECRET_KEY` and `OPENAI_API_KEY` are server-only: never commit them or expose them to the frontend.

For a new Supabase project:

1. Review, then apply every file in `supabase/migrations/` in order. See [docs/migrations.md](docs/migrations.md).
2. Configure email sign-in with a template that includes `{{ .Token }}`. Set *Email OTP length* to 6 (the code screen has six boxes).
3. Set the Site URL and redirect URLs for your local and deployed origins (for example `http://localhost:5173/**` and `https://your-domain/**`).
4. For Google: create an OAuth client whose redirect URI is `https://YOUR_PROJECT.supabase.co/auth/v1/callback`, enable the Google provider in Supabase, then set `STORY_GOOGLE_SIGN_IN=true`.

Missing or invalid account configuration stops server startup; it never silently falls back to local storage.

### Landing-page photos

`npm run images:fetch` downloads the landing-page photos from Wikimedia Commons. It accepts only public domain, CC0, CC BY and CC BY-SA files without personality-rights restrictions, skips files that describe people, re-encodes to WebP without metadata, and writes `src/data/africa-images.json` and `docs/image-manifest.json` with author, licence and source for each image. Review the manifest before publishing.

## Deploy

Set the account-mode variables in the host's private environment settings (on Render: *Environment*), then:

```sh
npm ci && npm run build
npm start
```

`npm start` forces production mode and serves `dist/`. Use the host's `PORT`, set `HOST=0.0.0.0` when needed, and serve over HTTPS. `STORY_TRUST_PROXY=1` enables proxy-aware IP handling behind a trusted proxy; `STORY_HTTPS=1` enables HSTS.

After deploying, check `/api/account/config` (`google` and `email` flags), sign in, save and delete a draft, and try *Draft with AI*.

## Tests

```sh
npm test                      # backend and unit tests
npx playwright install chromium
npm run test:all              # build + backend + browser tests + secret check
npm run test:screens          # screenshots at 375, 768 and 1280 px
npm run check:dist-secrets    # narrow check for configured secrets in source and build
```

Browser tests use isolated data under `.test-data/` and save evidence under `test-evidence/`; they never touch `data/` or `uploads/`. Authentication in tests uses local keys and a mocked provider: automated tests do not prove that a real Supabase, email, Google or OpenAI configuration works.

## Privacy, security and limits

- Account stories belong to verified Supabase user ids. Tokens are checked for signature, issuer, audience and expiry. The Supabase session lives in browser localStorage and is sent to the API as a bearer token; a strict Content Security Policy limits script sources.
- Drafts, private, withdrawn and nonexistent stories all return the same 404 to anyone but the owner. Hidden storyteller names are removed from public responses. Private files are served through the API, never through public storage URLs. The profile photo is fetched with the session token.
- Uploaded images are checked by file signature, re-encoded to WebP (up to 1600 px) and stripped of metadata. Audio uploads are limited to 10 MiB; each account is limited to 500 stories and 1 GiB of audio.
- Deleting a story removes its text, audio, photos and media records. Deleting an account also removes its stories, audio and post photos.
- Write requests are rate-limited per client IP (default 60 per 60 s; `STORY_WRITE_RATE_LIMIT`, `STORY_WRITE_RATE_WINDOW_MS`).
- The AI translation request sends the story to OpenAI only when the storyteller presses *Draft with AI*. Server logs record only the provider status, error code and model — never the key or the story.
- These controls and the automated tests are not a security audit.

## Image and content credits

- Landing-page photos: author, licence and source for each image are listed in the site footer (*Image credits*) and in [docs/image-manifest.json](docs/image-manifest.json).
- Luluwa object photos and records: [docs/credits.md](docs/credits.md) and [docs/object-documentation.md](docs/object-documentation.md).

## Project origin

Created by Josué Kabuya (Grand Kasaï, DR Congo), who set the vision, product direction and content. The code, documentation and tests were developed with AI coding assistants working under his direction. Design decisions, iterations and test reports are recorded in [PLAN.md](PLAN.md), [docs/COLLAB.md](docs/COLLAB.md), [REVIEW.md](REVIEW.md) and [TEST-REPORT.md](TEST-REPORT.md).
