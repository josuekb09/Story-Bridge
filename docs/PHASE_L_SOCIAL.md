# Phase L — From "a site with a feed" to a living social network

Brief for Codex, written by Claude after a full review of https://story-bridge.onrender.com on 2026-11-09.
Report to the owner in **French**. Code, comments and docs in English. Stop after each sub-phase (L0…L7) and report.

## 0. Rules (unchanged, read `docs/COLLAB.md` first)

- Never restore files from Git to "clean" them. Uncommitted changes you did not make are Claude's: commit them.
- Migrations: write a new additive file (next number `202611090007_…`) and **stop**. Claude reviews and applies it to production. Every new table: RLS enabled, no anon/authenticated grants, service_role grants only, indexes for the queries you write.
- Keep `npm test`, `npm run build`, `npm run test:browser`, `npm run check:dist-secrets` green. Add tests for every route, permission and validator.
- Honesty rules: no invented translations of a person's story (machine output labelled, original one click away), no invented cultural facts, every image credited.
- Accessibility WCAG 2.2 AA; keyboard usable; `prefers-reduced-motion` respected.
- Push to `main` only at the end of a sub-phase whose checks are green, then confirm the Render deploy.

## 1. What the review found

| # | Finding | Severity |
|---|---|---|
| 1 | Discover is empty: 0 public stories. | Critical (content — Claude + owner) |
| 2 | The owner is not admin in production (`/api/admin/posts/pending` → 403), so a first post can never be approved. Owner must set `STORY_BRIDGE_OBJECT_ADMIN_ID` on Render. There is also no visible admin screen. | Critical |
| 3 | AI translation fails in production (provider 502). Logs now record status/code/model; diagnose from Render logs. | Critical for the OpenAI capstone |
| 4 | The signed-in header shows the user's **full email** on every page — it will be on screen during the demo. | High (privacy) |
| 5 | The signed-in header (green band + tagline) does not match the landing header; no search, no notifications, no language picker, no avatar. | High (design) |
| 6 | Social basics missing: reactions, comments, follow, bookmarks, notifications, public profiles, search. | High (product) |
| 7 | "Explore cultures" cards are not links; no culture pages. | Medium |
| 8 | `robots.txt` and `sitemap.xml` return the SPA HTML. No web app manifest; not installable. | Medium (Claude added `public/robots.txt` and the manifest; Codex adds `/sitemap.xml`) |
| 9 | Only the landing page is translated; every other screen is English. | Medium |
| 10 | Build warns about bundle size; no route-level code splitting. | Medium |
| 11 | Stories cannot be read in the reader's language (no translate-on-read). | High (core promise) |

## 2. What Claude has already provided (use these, do not redraw)

- **Icons** `public/assets/icons/*.svg` (24×24, `stroke="currentColor"`, 1.8 stroke): `discover, cultures, share-story, profile, search, bell, comment, share-out, bookmark, translate, follow, audio, photo, flag, react-thanks, react-learned, react-my-culture`. Inline them (e.g. `?raw` import or a tiny `<Icon name>` component that fetches nothing at runtime) so `color` works.
- **PWA**: `public/manifest.webmanifest`, `public/assets/icons/app-192.png`, `app-512.png`, `app-maskable-512.png`, `apple-touch-icon.png`.
- **`public/robots.txt`** (disallows `/api/`, `/mine`, `/share`, `/profile`; points to the sitemap).
- Coming next from Claude: `src/data/cultures.json` + `docs/cultures/<slug>.md` (sourced), the first documented posts, and machine-draft locale files for new keys.

## 3. Sub-phases

### L0 — Header, privacy, installability (small, do first)

1. Replace the signed-in header with one consistent app header on every page:
   - left: logo (links to `/discover`);
   - centre (≥ 900 px): Discover · Cultures · Collections · Share — using the icons;
   - right: search icon (opens `/search`), bell with unread count (L2), language picker (reuse `useUiLanguage()` from `src/lib/i18n.js` and the picker markup from `LandingPage.jsx`), avatar button (photo or initials) opening a menu: *Profile*, *My stories*, *Settings*, *Sign out*.
   - **Never show the email in the header.** Show it only inside Settings/Profile → Account.
   - Mobile (< 760 px): logo + search + bell + avatar on top; the existing bottom navigation becomes 5 icon+label tabs: Discover, Cultures, Share (centre, emphasised), Notifications, Profile. My workspace moves into the avatar menu.
2. In `index.html`: `<link rel="manifest" href="/manifest.webmanifest">`, `<link rel="apple-touch-icon" href="/assets/icons/apple-touch-icon.png">`, keep `theme-color`.
3. Make sure static files win over the SPA fallback (`/robots.txt`, `/manifest.webmanifest`, icons). Add a server route `GET /sitemap.xml` (XML, cached 1 h) listing `/`, `/discover`, `/objects`, each `/objects/:id`, each public `/stories/:id`, and (L3) each `/cultures/:slug`.
4. Add a minimal service worker (`public/sw.js`): cache the app shell and static assets (stale-while-revalidate), never cache `/api/`, show an offline message when the network is down. Register it only in production.

Acceptance: email never visible outside Account settings; header identical across pages; Lighthouse "installable"; `/robots.txt` is `text/plain`; `/sitemap.xml` is XML.

### L1 — Social backend (migration + API)

Write `supabase/migrations/202611090007_social_layer.sql` and **stop for review**:

```sql
-- sketch, adapt names to the existing schema
alter table public.profiles add column if not exists handle text unique
  check (handle ~ '^[a-z0-9_]{3,30}$');
alter table public.stories add column if not exists culture text check (char_length(culture) <= 80),
  add column if not exists country text check (char_length(country) <= 80);

create table public.reactions (
  post_id uuid not null references public.stories(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('thanks','learned','my_culture')),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id, kind)
);
create table public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.stories(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  parent_id uuid references public.comments(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  language text check (char_length(language) <= 80),
  is_author_answer boolean not null default false,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz
);
create table public.follows (
  follower_id uuid not null references auth.users(id) on delete cascade,
  target_type text not null check (target_type in ('user','culture')),
  target_id text not null,
  created_at timestamptz not null default now(),
  primary key (follower_id, target_type, target_id)
);
create table public.bookmarks (
  user_id uuid not null references auth.users(id) on delete cascade,
  post_id uuid not null references public.stories(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('reaction','comment','reply','follow','approved','report_resolved')),
  actor_id uuid references auth.users(id) on delete set null,
  post_id uuid references public.stories(id) on delete cascade,
  comment_id uuid references public.comments(id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  target_type text not null check (target_type in ('post','comment','profile')),
  target_id text not null,
  reason text not null check (reason in ('wrong_or_harmful_information','disrespectful','sacred_or_restricted','privacy','spam','other')),
  details text check (char_length(details) <= 1000),
  status text not null default 'open' check (status in ('open','actioned','dismissed')),
  created_at timestamptz not null default now()
);
-- + RLS enable on each table, revoke from anon/authenticated, grant to service_role,
-- + indexes: comments(post_id, created_at), notifications(user_id, read_at, created_at),
--   follows(target_type, target_id), reactions(post_id), reports(status, created_at)
```

API (all JSON, all write routes authenticated + rate-limited + validated, all visible only on public posts unless owner):
- `PUT/DELETE /api/posts/:id/reactions/:kind` → `{counts, mine}`; `GET /api/posts/:id/social` → `{counts, mine, commentCount, bookmarked}`.
- `GET /api/posts/:id/comments?cursor=` (author name only if the commenter's profile shows it), `POST /api/posts/:id/comments`, `PATCH /api/comments/:id` (author, within 24 h), `DELETE /api/comments/:id` (author or post owner or admin → soft delete).
- `PUT/DELETE /api/follows/:type/:id`, `GET /api/me/following`.
- `PUT/DELETE /api/bookmarks/:postId`, `GET /api/me/bookmarks`.
- `GET /api/notifications?cursor=`, `POST /api/notifications/read` (ids or all). Create notifications server-side on reaction (aggregate per post per hour), comment, reply, follow, first-post approval. Never notify yourself.
- `POST /api/reports`; admin: `GET /api/admin/reports`, `POST /api/admin/reports/:id/{action|dismiss}` (hide post/comment).
- `GET /api/u/:handle` public profile (only fields the user made public) + their public posts.
- `GET /api/search?q=&type=posts|people|cultures` (Postgres full-text on title/text/tags/region/culture; `ilike` fallback for short queries; max 20 results, cursor).
- Feed: `GET /api/stories?culture=&language=&following=1&cursor=` with cursor pagination (keep the current unpaginated response shape for backward compatibility behind a version flag or a new `/api/feed` route).
- Delete account and delete story must also delete the user's reactions, comments, follows, bookmarks, notifications (cascade covers most — test it).

### L2 — Social UI

- Post card (`FeedPage.jsx` `PostCard`) and story detail: reaction bar with the three icons and labels **Thank you · I learned something · My culture too**, counts, pressed state, optimistic update with rollback on error. Comment button with count → opens the thread on the detail page. Bookmark. Share (existing). Report in a ⋯ menu.
- Story detail `/stories/:id` becomes the social page: header (author avatar, name → `/u/:handle`, culture/region, time, language), content, documentation block (sources, trust label, licence), reactions, comments (one level of replies, "Author's answer" badge, edit/delete own, report), "Read in my language" (L4).
- Public profile `/u/:handle`: cover band, avatar, name, headline, languages, cultures they write about, counts, Follow button, their public posts. Own profile gets "Edit profile" and a handle field (validated, unique).
- Notifications page `/notifications` + unread badge on the bell (poll every 60 s while the tab is visible; no websockets needed).
- Search page `/search` with tabs Posts · People · Cultures.
- Following feed tab on Discover: *For you* (all public, newest) · *Following*.
- Admin page `/admin` visible only to the admin: pending first posts (approve / keep private with a reason) and open reports.
- Empty states for every list. Skeletons while loading. No layout shift.

### L3 — Culture hubs

- Routes `/cultures` (directory with region filter and search) and `/cultures/:slug` (hero image with credit, sourced intro from `docs/cultures/<slug>.md` rendered as markdown, languages, feed filtered by `culture`, "Share a story about this culture", Follow culture).
- Data: `src/data/showcase.js` now; Claude adds `src/data/cultures.json` and `docs/cultures/*.md`. If a culture has no markdown, show "Not yet documented — add what you know" (never invent).
- Compose: add optional **Culture** (suggestions from the data, free text allowed) and **Country** (all 54 African countries + Other) to step 2; store in the new columns.
- "Explore cultures" cards in Discover and the landing page link to `/cultures/:slug`.

### L4 — Read any story in your own language (the core promise)

- Migration (same review rule): `post_translations(post_id, target_language, title, text, model, created_at, primary key(post_id, target_language))`, RLS + service_role only.
- `POST /api/posts/:id/translate { target }` for **public** posts (and the owner's own drafts): return cached if present; otherwise call the existing OpenAI service (reuse `createTranslationDraftService`), store, return. Per-user daily cap and global daily cap from env (`STORY_TRANSLATE_USER_DAILY`, default 30; `STORY_TRANSLATE_GLOBAL_DAILY`, default 500). Never send private posts of others or personal data.
- UI: on cards and detail, if the post language ≠ the reader's UI language, show **"Read in <language>"**. The result is labelled *Machine translation — not checked by the author* with *Show original*. Prefer the author's own translation when it matches the target ("Translated by the author").
- For languages with weak machine quality (Tshiluba, Kikongo, Wolof, Lingala…) show a stronger warning and a "This translation is wrong" flag (stored).

### L5 — Translate the app screens

- Move every user-facing string in pages/components to `t('…')` keys. English in `src/locales/en.json`, French in `fr.json` (natural French, not literal). Keep keys grouped by screen (`discover.*`, `share.*`, `profile.*`, `objects.*`, `auth.*`, `common.*`).
- Leave other locale files untouched; tell Claude the list of new keys — Claude drafts the 18 other languages and marks them `machine`.
- `<html lang dir>` already handled by `useUiLanguage()`; check RTL on every screen with Arabic.

### L6 — Performance

- Route-level code splitting with `React.lazy` + `Suspense` for every page except the shell and Discover. Target: initial JS < 250 kB gzip, no Vite chunk warning.
- Images: `loading="lazy"`, `decoding="async"`, width/height on every `<img>`; post images served at the right size.
- Lighthouse mobile on `/` and `/discover`: Performance ≥ 85, Accessibility ≥ 95, Best Practices ≥ 95, SEO ≥ 95. Put the reports in `docs/quality/`.

### L7 — Wrap-up

- Browser tests for: header (no email visible), reactions toggle, comment create/edit/delete, follow + Following feed, bookmark, notification created and marked read, report + admin action, public profile, search, culture hub, translate-on-read with a mocked provider, offline message.
- Update `README.md` (status table and features), `PLAN.md`, `docs/migrations.md`, the task board in `docs/COLLAB.md`.
- Final report in French: what works, what is mocked, what needs the owner (env vars, Google publishing), known gaps.

## 4. Split of work

| Who | What |
|---|---|
| Codex | L0–L7 code, migrations as files, tests, docs, pushes |
| Claude | review + apply migrations; `cultures.json` + `docs/cultures/*.md` (sourced); first documented posts; machine-draft locales for new keys; visual review of each sub-phase on the live site; small fixes when Codex is blocked (announced in COLLAB first) |
| Owner | `STORY_BRIDGE_OBJECT_ADMIN_ID` on Render; check OpenAI org credit/model access; publish the Google consent screen before the festival; record his own Grand Kasaï testimony |
