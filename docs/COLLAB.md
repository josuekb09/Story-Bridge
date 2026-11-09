# How Claude and Codex work together on Story Bridge

The owner (Josué) gave both agents access to this repository. Claude edits files from a copy
and writes them back; Codex edits in place. To avoid overwriting each other, **each file has one
owner**. Read this file at the start of every phase.

## Task board (read first, update when you start or finish)

| Task | Owner | Status |
|---|---|---|
| Phase A–K items up to 2026-11-09 (routes, deep links, Discover home, language suggestions, README) | Codex + Claude | done, live |
| **Phase L — social network** (`docs/PHASE_L_SOCIAL.md`): L0 header/privacy/PWA/sitemap → L1 social backend (migration 0007, stop for review) → L2 social UI → L3 culture hubs → L4 read in your language → L5 translate app screens → L6 performance → L7 tests/docs | Codex | in progress — L0 complete locally; stopped before L1 |
| Icons (`public/assets/icons/*.svg`), PWA icons + `public/manifest.webmanifest`, `public/robots.txt` | Claude | done (local, commit with L0) |
| Review + apply migrations 0007 (social) and the translations table | Claude | waiting for Codex |
| `src/data/cultures.json` + `docs/cultures/<slug>.md` (sourced) | Claude | in progress |
| First documented posts (four Luluwa object notes) as private drafts in the owner's account | Claude | after admin id is set |
| Machine-draft locale files for every new `t()` key (18 languages) | Claude | after L5 key list |
| `STORY_BRIDGE_OBJECT_ADMIN_ID=897ea4e9-b42a-4401-ac70-d64c289ac2c3` on Render | Owner | to do |
| OpenAI: check the organisation's credit, key permissions and model access; send the `ai-translation-provider-error` log line | Owner | to do |

**Never restore a file from Git to "clean" it.** On 2026-11-09 a restore erased the private-page gate and the headline-contrast fix; Claude re-applied them. If `git status` shows changes you did not make, they are Claude's: commit them or ask.

## Ownership

| Area | Owner | Notes |
|---|---|---|
| `src/pages/LandingPage.jsx` | Claude | Props contract below. |
| `src/styles/components/home.css` | Claude | All rules scoped under `.home`. |
| `src/lib/languages.js`, `src/lib/i18n.js`, `src/locales/*.json` | Claude | Codex may **add** keys to locale files (English first; others fall back to English). Keep existing exports of `i18n.js`. |
| `src/data/*` (showcase, africa-images.json, future countries/cultures) | Claude | |
| `scripts/fetch-africa-images.mjs`, `public/assets/photos/africa/**` | Claude | |
| `docs/cultures/*.md`, `docs/image-manifest.json`, `docs/COLLAB.md`, `docs/PHASES_C_to_K.md` | Claude | |
| `server/env.js`, `test/env-parse.test.js`, `test/languages.test.js` | Claude | env.js now trims values, strips BOM and inline comments. |
| Everything else: `server/**`, `src/state/**`, other pages, components, `supabase/migrations/**`, browser/screen test scripts, README/PLAN | Codex | |
| Supabase production (applying migrations, buckets, auth settings) | Claude, after reviewing Codex's SQL | Codex never applies migrations. |

## Rules

1. Do not edit a file you do not own. If you need a change there, add a line under **Requests** below and stop or work around it.
2. Claude writes back only if the file on disk has not changed since Claude read it (modification-time check). If it changed, Claude re-reads and merges.
3. Neither agent reformats, renames or moves the other's files.
4. Both keep `npm test`, `npm run build` and `npm run check:dist-secrets` green.
5. No commits and no deploys unless the owner asks.

## Landing page contract

`StoryBridgeController` renders `<Landing onListen onShare onObjects onSignIn showSignIn repoUrl/>`.
Claude keeps these props working. New optional props (for example `onCultures`) will be listed here
before Claude depends on them.

The landing page reads public numbers from `GET /api/stories` (count, distinct `originalLanguage`,
three latest). If Codex adds a lighter endpoint (for example `GET /api/stats`), list it here.

## Interface languages

- `src/lib/languages.js` lists 36 languages (31 African). `uiStatus` says whether interface text
  is `reviewed` (English, French), `machine` (draft, shown with a notice) or `none` (usable for
  stories, no interface text yet).
- `useUiLanguage()` from `src/lib/i18n.js` returns `{ lang, t, setLanguage, status }`, stores the
  choice in localStorage, sets `<html lang dir>`, and lazy-loads locale files.
- Codex: when converting other pages to `t()`, add English keys to `src/locales/en.json` and the
  French text to `fr.json`; other locales fall back to English until Claude drafts them.

## Images

Run `npm run images:fetch` on the owner's machine (Wikimedia is not reachable from Claude's
workspace). The script accepts only public domain, CC0, CC BY and CC BY-SA files without
personality-rights restrictions, re-encodes to WebP without metadata, and writes
`src/data/africa-images.json` and `docs/image-manifest.json`. Claude reviews the manifest and pins
the chosen files in `src/data/showcase.js`.

## Requests

### Claude → Codex
- In `StoryBridgeController`, the signed-out landing passes `onShare={()=>setShowSignIn(true)}`: keep it, it is right.
- Browser suite: the landing's headline and nav labels changed ("Share your culture. Learn from every other.", "Explore stories", "Cultures", "Collections"). Update selectors that relied on "Tell it in your own voice.", "Listen" or "Objects" on the landing page.
- When you build `/cultures` and country/culture hubs (Phase E), read `src/data/showcase.js`; Claude will add `src/data/countries.json` and `src/data/cultures.json`.

- **Sign-in code length (urgent, 2026-11-08):** Supabase was sending 8-digit codes while `SignInPage.jsx` hard-codes 6 boxes. Claude set Supabase "Email OTP length" to 6 in production. Please stop hard-coding 6: read the length from one constant (default 6), accept a pasted code of 6 to 10 digits, and only submit when the expected number of digits is filled. Add a test.

- **Done by Claude in Codex files (2026-11-08, owner asked, minimal edits):**
  - `StoryBridgeController.jsx` `transitionTo`: the startup `pushState('/')` erased `?code=` before Supabase read it, so Google sign-in always returned to the landing page. It now keeps OAuth callback params (and uses `replaceState`) until `getSession()` clears them. Verified with a headless PKCE simulation (old code: no exchange; new code: exchange + signed in).
  - Profile photo: `<img src="/api/account/profile/avatar">` cannot send the Bearer token, so it was always broken. Added `authorizedObjectUrl()` in `src/lib/api.js` and `showAvatar()` in the controller (blob URL, revoked on replace). `server/csp.js` now allows `img-src 'self' blob:`.
  - Please add both cases to the browser suite.
- **Done by Claude (2026-11-08, owner asked to make it feel like a real social network):**
  - Permanent delete: `DELETE /api/stories/:id` (owner only) + `deleteStory()` in both stores (row, audio, post images and rows). Test: `test/story-delete.test.js`. `deleteAccount` now also removes post images. UI: "Delete" in My stories with a clear confirmation.
  - Profile: `saveProfile` always leaves the saving state for the latest request and returns true/false; profile page is a card (photo, name, country, languages, counts) with "Edit profile"; photo can be changed from the card (`changeAvatar`).
  - Feed (`FeedPage.jsx`): social post cards (author, region, relative time, language, See more, images, audio, translation, share), composer prompt, filter chips, "Show more", explore rail. Styles in `src/styles/components/social.css`.
  - Global toast (`app-toast`) for saved/deleted.
  - `.gitignore`: `data/` → `/data/` (it was ignoring `src/data/`, which would break the build on Render).

### Codex → Claude
- (none yet)
