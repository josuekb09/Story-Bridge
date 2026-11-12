# Story Bridge — Codex Hackathon submission kit

Deadline: end of day **Wednesday 11 November 2026**, on the program LMS (learning modules completed ✔).

## Links

- Live demo: https://story-bridge.onrender.com
- Code: https://github.com/josuekb09/Story-Bridge
- Demo video: [Watch on YouTube](https://youtu.be/ZeZZXDgeU68?si=-k7mlvZJntilQ18X) · earlier 5:00 cut: [local walkthrough file](demo/story-bridge-demo.mp4)

## Tracks

Primary: **Voices & Languages**. Also: **Truth, Authorship & Ownership**, **Discovery & Audience**, and the **Consent & Community Safety** product strand.

## Project title

**Story Bridge — African stories, in your own voice**

## One-line pitch

Story Bridge is a learning-first social network where Africans share their culture in their own language, with sources and control, and readers can request a clearly labelled machine translation.

## Short description (≈100 words)

Stories about African cultures are too often told about Africans rather than by them, and rarely in their languages. Story Bridge lets people post stories, objects, songs, traditions and places from their culture in Tshiluba, isiZulu, Kiswahili or any language, with photos, voice recordings and sources. The original words always come first; author-written and machine translations are labelled by who made them. Every post carries documentation: region, people, sources, a trust label and a licence the author chooses. Drafts stay private, and authors can withdraw or delete their work. Readers explore a feed, culture pages and search, and can request browser-side translation. French and Tshiluba were checked live on Nosihle's public story; both results are machine output that has not been checked by a speaker.

## Full description

### The problem
African cultural knowledge is held by elders, families and communities and passed on orally, in languages the internet barely serves. Online, it is usually written by outsiders, stripped of its sources and only in English or French. Museum records of African objects describe how they were collected, rarely what they mean to the people who made them.

### What Story Bridge does
- **Tell it in your own language and voice.** Write, record audio or add photos. 36 story languages are suggested (31 African) and any other can be typed. The original is stored unchanged and always shown first.
- **Documentation under every post (Truth, Authorship & Ownership).** Post type, region, people, tags, sources with links, a trust label (*Told by a community member*, *Research note*, *Museum record*), image credits and a licence chosen by the author. A version history records every change.
- **The author stays in control.** Drafts are private. Nothing is public until the author reviews and approves it. Posts can be withdrawn or permanently deleted, including audio and images. The author's name is shown only if they choose.
- **Read across languages (Voices & Languages).** Authors can add their own translation or ask for an AI draft (OpenAI), which is labelled and saved only after approval. Readers can press *Read in*: translation runs from the browser when available, with a server fallback, and is always labelled as machine translation. Live French and Tshiluba results were checked on Nosihle's public story; a speaker has not checked either result.
- **Discover (Discovery & Audience).** A social feed with language and audio filters, culture pages for all five regions of Africa (with the languages of each country), search across stories and cultures, and museum-style records of Luluwa (Kasai, DR Congo) objects with *what we know*, *what we do not know*, sources and questions for the community.
- **Safe community.** Every new member's first post is reviewed before going public. Clear Terms, Privacy notice and Community guidelines (including respect for sacred or restricted knowledge), reporting of posts, moderator tools and account deletion.
- **Interface in 20 languages.** English and French written by hand; 18 more (including Kiswahili, Hausa, Yorùbá, Igbo, Amharic, isiZulu, isiXhosa, Lingála, Wolof and Arabic right-to-left) clearly labelled as machine drafts until a speaker checks them.

### Honesty by design
No invented translations of a person's words, and no invented cultural facts: culture pages say *Not yet documented — add what you know* rather than guess. Every image carries its author, licence and source; showcase images avoid identifiable people.

### How AI was used
- **In the product:** *Draft with AI* uses the OpenAI Responses API to propose a first translation, only when the author asks; it is labelled and stored only after the author approves it. Reader-side translation calls Google's browser-accessible translation endpoint first, then uses the server endpoint as a fallback. It remains separate from the original and is labelled as machine output.
- **To build it:** the idea and its direction are mine. I used AI software development tools to build it: OpenAI Codex wrote and iterated most of the application (React, Express, Supabase), its tests and documentation, and Claude was used for code review, debugging, design assets, research and writing support. Every change was reviewed and tested on the live site.

### Tech
React + Vite, Express (Node 24), Supabase (Auth with Google and email codes, Postgres with row-level security, private storage), OpenAI Responses API, Render. Automated test suite (API, privacy and moderation rules) plus browser checks.

### Known limits (proof of concept)
Video posts and sharing with selected people or groups are not supported yet. AI translation drafts need OpenAI configuration and API credit. Reader translation works without that credit but may fail if the browser endpoint and server fallback are unavailable. Interface text for 18 languages is machine-drafted, and voice recording has not been tested on every phone.

### What's next
Community translations reviewed by speakers; comments, reactions and follows; sharing with chosen people or groups; video; recording the first community testimonies in Grand Kasaï with consent.

## Demo video (4:18)

The linked walkthrough opens on the public home page, browses Discover and its member stories, shows a post read in French with the reader control, then covers culture pages, collections, search and the sharing wizard.

## Checklist before submitting

- [x] LMS learning modules completed
- [x] `STORY_BRIDGE_OBJECT_ADMIN_ID` set on Render
- [ ] Latest code pushed to `main`, Render deploy finished, site checked signed in and signed out
- [ ] At least 3 public posts in Discover (Ndebele + friends' posts approved in /admin)
- [ ] Google sign-in works for people other than you (consent screen published, or friends added as test users)
- [ ] Demo video uploaded, link set to "anyone with the link"
- [ ] LMS form: title, track, descriptions, live link, GitHub link, video link
