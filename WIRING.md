# Supabase wiring map

Local preparation only. No Supabase connection was made while preparing this file.

## Required configuration

| Variable | Read in code | Purpose and supported value |
|---|---|---|
| `STORY_BACKEND` | `server/auth.js` → `parseAccountConfig()` (called by `server/index.js`) | Selects the storage backend. Use `supabase` for this setup. |
| `STORY_AUTH_MODE` | `server/auth.js` → `parseAccountConfig()` | Selects account authentication. Supabase requires `account`. |
| `SUPABASE_URL` | `server/auth.js` → `parseAccountConfig()`; passed to browser via `/api/account/config` in `server/account-routes.js`; consumed by `src/App.jsx` | HTTPS Supabase project URL. Prefilled below; this is not a secret. |
| `SUPABASE_PUBLISHABLE_KEY` | `server/auth.js` → `parseAccountConfig()` and JWKS fetch; passed to `src/App.jsx` through `/api/account/config` and used by `@supabase/supabase-js` browser client | The code accepts a dashboard-issued `sb_publishable_…` key or a JWT-shaped legacy `anon` key. The browser client uses it for Supabase Auth. Access tokens issued by Auth are separately verified by the server using the project's JWKS and must be signed with a supported asymmetric algorithm (RS256 or ES256). |
| `SUPABASE_SECRET_KEY` | `server/auth.js` → `parseAccountConfig()`; used by `server/supabase-store.js` to create its Supabase client and for privileged Storage requests | Server only. The code accepts a dashboard-issued `sb_secret_…` key or a JWT-shaped legacy `service_role` key. Keep it out of browser variables and frontend code. |
| `SUPABASE_BUCKET` | `server/auth.js` → `parseAccountConfig()`; used by `server/supabase-store.js` | Must be `story-bridge-audio`, the configured private audio bucket. |

## Optional settings and overrides

| Variable | Read in code | Purpose |
|---|---|---|
| `STORY_GOOGLE_SIGN_IN` | `server/auth.js` → `parseAccountConfig()` | Set to `true` only if Google sign-in is configured for the project; otherwise `false`. |
| `STORY_EMAIL_CODE_SIGN_IN` | `server/auth.js` → `parseAccountConfig()` | Set to `true` to show email-code sign-in; otherwise `false`. |
| `STORY_JWKS_URL` | `server/auth.js` → `parseAccountConfig()` and `createTokenVerifier()` | Optional override for published signing-key discovery. By default the server fetches `${SUPABASE_URL}/auth/v1/.well-known/jwks.json`. An override must be HTTPS on this project's host (or loopback for local development). Leave unset unless needed. |
| `STORY_TEST_JWKS` | `server/auth.js` → `parseAccountConfig()` and `createTokenVerifier()` | Automated-test-only local signing keys. Production configuration rejects this variable. Leave empty and do not use for project wiring. |
| `VITE_API_PROXY_TARGET` | `vite.config.js` | Optional local Vite `/api` proxy target. Defaults to `http://127.0.0.1:3000`; it is not a Supabase credential. |

## Where to get the values

The project URL is already filled in. The publishable and secret keys are available on the project's API keys page in the Supabase dashboard; use the labels shown there and paste each value into its matching variable in your private local `.env` editor. Do not put the secret key in any `VITE_*` variable. The sign-in toggles should reflect which providers you intend to configure.

## Ready-to-fill `.env` lines

```dotenv
STORY_BACKEND=supabase
STORY_AUTH_MODE=account
SUPABASE_URL=https://dstttnakywbcatnbraut.supabase.co
SUPABASE_PUBLISHABLE_KEY=<paste-project-publishable-key-here>
SUPABASE_SECRET_KEY=<paste-project-secret-key-here>
STORY_GOOGLE_SIGN_IN=false
STORY_EMAIL_CODE_SIGN_IN=false
SUPABASE_BUCKET=story-bridge-audio
# Optional; normally leave unset so the project JWKS URL is discovered automatically.
# STORY_JWKS_URL=
# Test-only. Leave unset/empty; production rejects this variable.
# STORY_TEST_JWKS=
```

`.gitignore` excludes `.env` and `.env.*` and explicitly re-includes `.env.example`.
