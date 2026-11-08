# Story Bridge — Phases C to K (master brief for Codex)

Read this whole file before touching code. Report to the owner in **French**. Write code, comments and docs in English.

## 0. Rules of engagement (non-negotiable)

1. **Finish Phase B first** (email + Google sign-in, welcome/profile flow, and the two object-page fixes: only that object's community questions, and a single "Speak about this object" button). Then continue with C onward.
2. **Stop at the end of every phase.** Report: what changed, what you tested (npm test, npm run build, npm run check:dist-secrets, browser suite, test:screens at 375/768/1280), what you could NOT verify, what is left. Wait for the owner to say "continue".
3. **No commit, no deploy.**
4. **Migrations:** 202611070001 through 202611080006 are already applied in production. Never replay them. For any schema change, write a new additive migration file and STOP; the owner applies it after review. Never put a service-role key in client code.
5. **Honesty rules (product-critical):**
   - Never invent a translation of a person's story. Machine translations are always labelled "Machine translation — not checked by the author" and the original stays one click away.
   - Never invent cultural facts. Culture/country pages show only text that exists in `docs/cultures/<slug>.md` (with sources). If the file is missing, show "Not yet documented — add what you know" and an invitation to contribute.
   - Every image carries author, licence, source URL, visible credit. No stock photos with unknown licence. No AI-generated pictures of people or sacred objects.
   - Do not exoticise. No "tribal", "primitive", "mystical". People speak for themselves.
6. Keep existing tests green. Add tests for every new server route, validator and permission rule.
7. Accessibility: WCAG 2.2 AA, keyboard-only usable, visible focus, alt text mandatory for images, real labels.
8. Performance: images served as AVIF/WebP with `srcset`, lazy loaded below the fold, explicit width/height (no layout shift). Largest Contentful Paint under 2.5 s on a throttled mobile profile for the landing page. Many users will be on slow, expensive mobile data: keep JS bundle lean, split by route (`React.lazy`), fix the existing >500 kB warning.

## 1. Product vision

Story Bridge is a **learning-first social network for African cultures**. People post about their own culture, history, art, language and everyday life: photo, audio, text (video later). Each post has documentation underneath (context, sources, who/where/when). Anyone reads it in their own language (translation on read; the original is always available). Think "a respectful, sourced, multilingual cultural commons" — not a feed of random content.

Two axes, both first-class:
- **Country** (all 54 African countries listed; start with real content for a seed set) → contains **cultures / peoples** (e.g. South Africa → Zulu, Xhosa, Ndebele, Khoisan communities…; DR Congo → Luluwa, Kongo, Mongo…) → each with **languages**.
- Never equate a country with one culture. A culture can span several countries (e.g. Swahili coast, Fulani, Amazigh).

Audience of the first launch: the Africa Tech Festival (Cape Town) and the Andela × OpenAI "Telling African Stories" capstone judges. The landing page must sell the idea in 10 seconds to someone who has never heard of it.

## 2. Phase C — Landing page and identity

Goal: a landing page that **shows the diversity of African cultures**, feels alive, and explains the platform instantly.

Structure (single page, anchored sections, sticky minimal header):
1. **Hero.** Headline (EN default, translated per selected language): "Share your culture. Learn from every other." Sub-line: "Post in your own language. Read anyone's story in yours." Two buttons: "Explore stories" and "Share yours". Behind/beside: a slowly cross-fading image set (6–8 images, 7 s each, 1.2 s fade) drawn from `docs/image-manifest.json`, covering different regions (North, West, Central, East, Southern Africa). Each image shows its country + culture + credit in a small caption that changes with the image.
2. **How it works** in 3 steps (Tell it → Check it → Carry it), with the language switcher demo (the same sentence in 3 languages).
3. **Cultures of Africa.** A grid of country/culture cards from the data registry (see Phase E), each with a photo, country name, and number of real stories (0 is shown honestly as "Be the first"). Horizontal scroll on mobile.
4. **Live strip.** Real counters pulled from the API: stories shared, languages used, countries represented. If a number is 0, show a welcoming empty state instead of a fake number. Never hard-code or invent counters. Show the 3 latest approved public stories (title, language badge, author, country).
5. **Collections.** Featured reference collections (Kasai objects; South African beadwork; more as data arrives), clearly labelled "Museum reference records" versus "Community stories".
6. **Languages.** A band showing all supported language names written in their own script.
7. **Your rights.** Consent, withdrawal, original kept, data protection — short.
8. **Footer.** About, Credits (image credits page), Privacy, Terms, Contact.

Motion (subtle, "alive"):
- Hero cross-fade; gentle 2–3% Ken-Burns scale on the current image (CSS only, `will-change` kept minimal).
- Sections fade/slide in once on scroll (IntersectionObserver, no library).
- Waveform in the logo animates slowly.
- Card hover lift (transform + shadow, 150 ms).
- **Must respect `prefers-reduced-motion: reduce`** (no cross-fade movement, no parallax, instant state changes). Pause the hero rotation on hover/focus and provide a visible pause button.
- No autoplay audio or video, ever.

Design: keep the existing forest green / gold / warm paper tokens from `src/styles/tokens.css`; add typographic hierarchy (Fraunces for display, a clean sans for UI). Warm, dignified, modern. No stereotyped patterns, no generic "safari" clichés.

Image pipeline: a script `scripts/build-images.mjs` reads originals from `public/assets/photos/africa/original/`, outputs AVIF + WebP at 480/960/1600 widths into `.../web/`, and writes `src/data/images.generated.json`. Credits come from `docs/image-manifest.json` (provided by the owner's assistant; schema: `file, title, country, culture, subject, author, licence, licenceUrl, sourceUrl, altText, caption, dateAccessed`). Build must FAIL if an image in use lacks any of those fields. Add a public `/credits` page generated from the manifest. If the manifest is missing an image, do not substitute a placeholder photo; use a typographic card.

Acceptance: Lighthouse performance ≥ 90 mobile on the landing page, accessibility ≥ 95; reduced-motion test in the browser suite; screenshots at 375/768/1280.

## 3. Phase D — Languages and translation

### 3.1 Language registry
Create `src/lib/languages.js` (single source of truth; the server imports the same data) with: `code` (BCP-47), `name` (English), `nativeName`, `script`, `dir` ("ltr"|"rtl"), `uiStatus` ("reviewed"|"machine"|"none"), `region`.

Include **15 African languages** chosen for reach across regions (the owner may reorder):
Swahili (sw), Hausa (ha), Yoruba (yo), Igbo (ig), Amharic (am, Ge'ez script), Oromo (om), Somali (so), isiZulu (zu), isiXhosa (xh), Afrikaans (af), Shona (sn), Lingala (ln), Kinyarwanda (rw), Malagasy (mg), Wolof (wo).
Also support as **content languages** (post and read in them, UI "machine" status): Tshiluba (lua), Kikongo (kg), Twi/Akan (ak), Tigrinya (ti), Setswana (tn), Sesotho (st), Chichewa (ny), Fula (ff), Tamazight/Kabyle (kab/zgh), Egyptian/Modern Standard Arabic (ar).
And **international languages**: English (en), French (fr), Portuguese (pt), Arabic (ar), Spanish (es).
The post language field is a searchable select over this registry plus "Other (type the name)" so no one is excluded.

### 3.2 UI internationalisation
- Replace hard-coded strings with an i18n layer (`src/lib/i18n.js` + `src/locales/<code>.json`), ICU-style plurals if feasible, lazy-load the locale file.
- Language picker in the header (shows native names), persisted in localStorage and, when signed in, in the profile (`ui_language`). Default from `navigator.languages`, falling back to English.
- Set `<html lang>` and `dir` correctly; RTL layout for Arabic (use CSS logical properties; test the whole app in RTL).
- Fonts: load only the scripts needed (e.g. Noto Sans Ethiopic for Amharic/Tigrinya, Noto Naskh Arabic), with `font-display: swap`, self-hosted (no Google Fonts CDN, for privacy and offline).
- `uiStatus` "machine" locales show a discreet notice: "This language was translated automatically. Help us improve it" with a link that opens a correction form (stores suggestions; admin reviews).
- English and French are written by hand and must be complete. For the other locales, generate a first draft from the English file using a script (`scripts/translate-locales.mjs`, uses the OpenAI API with a server-side key, run by the owner, output committed as JSON, flagged `machine`). Do not run it in CI and never ship the key to the browser.

### 3.3 Translation of stories on read
- Server endpoint `POST /api/posts/:id/translate { target }` (auth optional for public posts; rate-limited).
- Cache in a new table `post_translations(post_id, target_lang, text, title, model, created_at, status)`; write the migration and STOP for the owner to apply it.
- Cost control: per-user and global daily caps from env; if the cap is hit, show the original with a friendly message. Cache hits are free.
- OpenAI key stays server-side (`OPENAI_API_KEY`); validate input length; strip HTML; never send private posts or personal data to the model; log only the post id, target language, status, and token counts.
- The reader UI always shows: the original text + a "Read in <my language>" toggle + the label "Machine translation — not checked by the author" + "Show original". When the author has supplied their own translation, prefer it and label it "Translated by the author".
- Audio posts: show the author's transcript if provided; offer machine transcription as a later phase (do not build now).
- Low-resource caution: for languages where quality is known to be weak (e.g. Tshiluba, Wolof, Kikongo) show a stronger warning and let readers flag a bad translation (stores the flag).

## 4. Phase E — Countries, cultures, collections

Data (static JSON + markdown, no invented content):
- `src/data/countries.json`: all 54 countries (ISO code, name, native name, region).
- `src/data/cultures.json`: seed entries with `slug, name, countries[], languages[], image, docPath`. Seed with: Luluwa (DRC), Zulu, Xhosa, Ndebele (South Africa), plus structure ready for the owner's assistant to add more (e.g. Yoruba, Amazigh, Swahili coast, Amhara/Oromo, Ashanti, Maasai, Wolof, Kikuyu, Berber, Hausa, Fulani, Shona, Igbo, Ovambo, Malagasy). Only entries with an image and a `docs/cultures/<slug>.md` appear in the landing grid; others exist as empty-state hubs reachable from the directory.
- Collections: keep the Kasai object records; add a data-driven collection model so South African beadwork records can be added the same way as the Luluwa ones (museum record separate from community stories, "What we know / What we do not know").

Pages:
- `/cultures` directory: filter by region, country, language; search.
- `/countries/:code` and `/cultures/:slug` hubs: hero image with credit, sourced intro (from markdown), languages spoken, community stories feed filtered to that culture/country, collections, "Share a story about this culture" button, "Questions for the community" (specific to that hub).
- Posts carry optional `country` and `culture` tags (extend compose in Phase F). Also free-text tags.

## 5. Phase F — Posting (real content creation)

Compose flow (mobile-first, stepper, autosave draft):
1. Type: Story, Photo essay, Audio, Object note. (Video: design the UI slot but ship it disabled with "coming soon"; do not build upload yet.)
2. Content: title, body (plain text with limited formatting: paragraphs, bold, italic, links; sanitise on the server), up to 6 photos (server-side re-encode to WebP with `sharp`, strip EXIF/GPS, sniff real MIME, max size, alt text REQUIRED per image, optional credit/licence), optional audio (existing flow).
3. Documentation: country, culture, language, people/places, date or period, sources (list of URL/book/oral source), "How do I know this?" (first-hand, family tradition, research, museum record). Trust label derived from the answer; show it on the post.
4. Rights: licence choice (all rights reserved by default, CC BY, CC BY-SA, CC BY-NC) and consent confirmation (people/photos shown). Sacred or restricted knowledge flag: "Community only" visibility.
5. Review → publish. First public post goes to moderation (existing `pending_review`); later posts publish directly unless reported.
Edit and delete: authors can edit (versions logged) and delete their drafts and posts (hard delete of media after a 30-day grace with the audit log kept without content). Add the missing "Delete draft" action.

Media storage: new private bucket `story-bridge-media` (the owner creates it; document the exact name and settings in `docs/migrations.md`); served via short-lived signed URLs from the server. Quotas per user.

## 6. Phase G — The social layer (what makes it a network)

- **Feed** ("Discover"): public approved posts; filters by language, country, culture, type; sort by newest / most appreciated; cursor pagination; empty states.
- **Following:** follow people, cultures and countries; "Following" feed.
- **Reactions:** one gentle reaction set (e.g. "Thank you", "I learned something", "This is my culture too"), not a generic like counter. One per user per post, undoable.
- **Comments:** threaded one level deep, in any language with the same translate-on-read, author edit/delete, report. Comments by the post's author can be marked "Author's answer".
- **"I can add to this" contributions:** a structured way to add a correction, source or personal testimony to a post/object (extends the existing "Speak about this object").
- **Save/bookmark** and **collections** of saved posts (private by default).
- **Share:** stable public URLs per post (`/s/:id`), Open Graph/Twitter cards with the first image and title, "Copy link".
- **Search:** posts, people, cultures, tags (PostgreSQL full-text via server endpoint; language-aware where possible).
- **Notifications:** in-app list (new follower, reaction, comment, approval of your post), optional email digest later; settings to mute.
- **Mentions** (@name) in comments with notification.
All write endpoints: authenticated, validated, rate-limited, and covered by tests. Write the migration(s) for new tables (follows, reactions, comments, bookmarks, notifications, reports, translation_flags) and STOP for the owner to apply; every table gets RLS enabled, service-role-only grants, and indexes for the access patterns above.

## 7. Phase H — Trust, safety, privacy

- Report buttons on posts/comments/profiles with reasons; admin moderation queue (existing admin check via `STORY_BRIDGE_OBJECT_ADMIN_ID`; plan for a proper `roles` table in a migration), actions: approve, hide, remove, warn; every action logged.
- Block and mute users.
- Rate limits per IP and per user on sign-in codes, posting, commenting, translating, reporting.
- Content rules page (Community guidelines) and clear handling of sensitive cultural material (sacred objects, ceremonies): authors can mark "Community only".
- Privacy controls per profile field (already modelled: default "Only me"); public profile page `/u/:handle` shows only fields set public.
- **Data protection:** "Download my data" (JSON + media zip) and "Delete my account" (removes profile, posts, media, comments; anonymises what must remain, e.g. reports); privacy policy and terms pages (draft text, flagged for legal review by the owner). Comply in spirit with POPIA (South Africa), GDPR, and the DRC/Nigeria/Kenya equivalents: data minimisation, purpose, consent, retention.
- Security: strict CSP (keep existing), no inline scripts, HSTS and the usual headers in production, sanitise all user HTML, verify uploaded file signatures, signed URLs for private media, no secrets in the bundle (keep `check:dist-secrets`), dependency audit (`npm audit`) with a note of results, cookies/token handling reviewed and documented (note: Supabase tokens currently live in browser storage; document the XSS mitigation and evaluate httpOnly-cookie sessions as a follow-up).
- Never log emails, tokens or story content.

## 8. Phase I — Profiles and onboarding (finish what Phase B started)

- Welcome flow after first sign-in: display name, handle (unique, validated), photo (WebP re-encode), languages I speak, country/culture (optional, never required), what I want to do (share / learn / both).
- Profile page (LinkedIn-style but for culture): photo, headline (≤80), bio (≤500), country/region, languages, links, "stories shared", "cultures I write about", follow button, public/private per field.
- Settings: UI language, privacy, notifications, data export/deletion.

## 9. Phase J — Navigation, performance, accessibility, SEO

- Primary nav: Discover · Cultures · Collections · Share · (Profile/Sign in). Mobile bottom bar with the same items. Breadcrumbs on hubs and posts. Global search in the header.
- Real URLs for everything (React Router or equivalent), so links are shareable and the back button works; deep links work signed in or out.
- SEO: server-rendered meta/Open Graph for public posts and hubs (at minimum a prerender or meta-injection route), `sitemap.xml`, `robots.txt`, canonical URLs, `hreflang` for the UI languages.
- Offline-tolerant basics: cache the shell and last feed (service worker), friendly offline message.
- Analytics: none by default; if added, privacy-friendly and aggregate only, documented.
- Error and empty states written for humans in every language.

## 10. Phase K — Quality gate and docs

- Browser suite covers: landing (incl. reduced motion and language switch to an RTL language), sign-in, welcome flow, compose with images, translate-on-read (with a mocked model), follow/react/comment, report/moderate, search, delete account/export.
- `npm audit` summary, bundle-size report, Lighthouse report committed under `docs/quality/`.
- Update README.md, PLAN.md, `docs/migrations.md` (list every new migration and what it does), `docs/architecture.md` (diagram of data flow), `docs/image-credits.md`, `docs/security.md` (threat model in one page).
- Final report to the owner: what works, what is partial, what is mocked, what needs the owner's action (keys, buckets, migrations, legal text), and a honest list of known gaps.

## 11. Order of work and inputs you will receive from the owner's assistant

Order: finish B → C → D → E → F → G → H → I → J → K (stop after each).
You will receive: `docs/image-manifest.json` plus the image files in `public/assets/photos/africa/original/`, and `docs/cultures/*.md` with sourced text. Build the loaders and templates now with fixtures so that dropping new files in requires no code change.
