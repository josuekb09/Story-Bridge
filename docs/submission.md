# Story Bridge — Codex Hackathon submission kit

Deadline: end of day **Wednesday 11 November 2026** (learning modules on the LMS must be completed first).

## Links

- Live demo: https://story-bridge.onrender.com
- Code: https://github.com/josuekb09/Story-Bridge
- Demo video: _add your link (YouTube unlisted / Loom / Google Drive)_

## One-line pitch

**Story Bridge is a social network where Africans share their own culture in their own language — and anyone can read it in theirs.**

## Short description (≈100 words)

Most stories about African cultures are told about Africans, not by them, and rarely in their languages. Story Bridge lets people post stories, objects, songs, traditions and places from their culture — in Tshiluba, isiZulu, Kiswahili or any language — with photos, voice recordings and sources. Every post keeps the original words and records how the author knows what they share. Readers browse a feed and culture pages, and translations are always labelled and never replace the original. The storyteller controls everything: posts stay private until approved, and can be withdrawn or permanently deleted. The interface already speaks 20 languages.

## Full description

### The problem
African cultural knowledge is often held by elders and families, passed on orally, in languages the internet barely serves. When it does appear online, it is usually written by outsiders, stripped of its sources, and only in English or French. Museum records of African objects describe *how they were collected*, rarely *what they mean to the people who made them*.

### What Story Bridge does
- **Share in your own language and voice** — write, record audio or upload photos; 36 story languages (31 African) are suggested, and any other can be typed.
- **Documentation under every post** — post type and section, region, people, sources, a trust label (*Told by a community member*, *Research note*, *Museum record*) and a licence.
- **Read across languages** — the original is always one click away; translations are labelled by origin (written by the storyteller, or an AI draft the storyteller approved).
- **Discover** — a feed with filters by language and audio, and a showcase of cultures from all five regions of Africa, from Table Mountain and Ndebele painted walls to Lalibela, Djenné and the Kuba kingdom.
- **Objects** — museum records of Luluwa (Kasai, DR Congo) objects with *What we know*, *What we do not know*, sources and questions for the community, kept separate from community stories.
- **Control and privacy** — private drafts, approval before publishing, withdrawal, permanent deletion of text, audio and photos, account deletion, no email shown publicly.
- **Interface in 20 languages** — English and French written by hand; 18 others (Kiswahili, Hausa, Yorùbá, Igbo, Amharic, Afaan Oromoo, Somali, isiZulu, isiXhosa, Afrikaans, chiShona, Lingála, Kinyarwanda, Malagasy, Wolof, Portuguese, Arabic right-to-left, Spanish) clearly labelled as machine drafts until a speaker checks them.

### Honesty by design
No invented translations of a person's words. No invented cultural facts: our own readings are marked as such, unknowns say *Not recorded*. Every image carries its author, licence and source.

### How AI was used
- **In the product:** *Draft with AI* uses the OpenAI Responses API to propose a first translation of a story. It is sent only when the storyteller asks, marked unapproved, and stored only after explicit approval.
- **To build it:** Codex built and iterated the application (React, Express, Supabase), its tests and documentation, phase by phase, with each phase reviewed before the next. AI assistance was also used for reviews, design assets and research, always checked against sources.

### Tech
React + Vite, Express, Supabase (Auth with Google and email codes, Postgres with row-level security, private storage), OpenAI Responses API, Render. 65 automated tests plus a browser test suite.

### What's next
Reactions, comments and follows; culture pages; one-tap "Read in my language" with cached translations; speaker review of the 18 machine-drafted interface languages; recording the first community testimonies in Grand Kasaï.

## Demo video script (≈3 minutes)

1. **0:00 – 0:20 — Why.** "I'm Josué Kabuya, from Grand Kasaï in DR Congo. The stories of my people are told in Tshiluba, at home, by elders. Online, they're told by others, in English. Story Bridge changes who tells the story."
2. **0:20 – 0:50 — Landing.** Open https://story-bridge.onrender.com. Table Mountain, the cultures of the five regions, switch the language to Kiswahili, then Arabic (right-to-left).
3. **0:50 – 1:30 — Share.** Sign in. Share → language → write a short story, add a photo and sources, choose the trust label. Translation step: *Draft with AI* (or your own translation). Review → save draft.
4. **1:30 – 2:00 — Control.** My stories: draft, approve, withdraw, delete permanently — "the storyteller stays in control".
5. **2:00 – 2:30 — Discover and objects.** The feed with the Ndebele post; open the Luluwa museum record: what we know, what we don't, sources, questions for the community.
6. **2:30 – 3:00 — Close.** "Share your culture. Learn from every other. Built with Codex and the OpenAI API. Next: comments, culture pages and reading every story in your own language."

Record at 1280×720 or higher, with your voice. Close other tabs, hide notifications, use a test-safe account screen (no email visible).

## Checklist before submitting

- [ ] LMS learning modules completed
- [ ] `STORY_BRIDGE_OBJECT_ADMIN_ID` set on Render (so first posts can be approved)
- [ ] At least 3 public posts in Discover (Ndebele painted walls + Luluwa objects + one personal story)
- [ ] *Draft with AI* works live, or the video uses a manual translation and says AI drafts need the organisation key
- [ ] Latest code pushed to `main`, Render deploy finished, site checked signed in and signed out
- [ ] Google sign-in: your account is a test user (or the consent screen is published)
- [ ] Demo video uploaded and link set to "anyone with the link"
- [ ] Submission form: live link, GitHub link, video link, descriptions above
