Story Bridge — African stories, in your own voice
Live proof of concept: https://story-bridge.onrender.com
Code: https://github.com/josuekb09/Story-Bridge
Demo video: https://youtu.be/ZeZZXDgeU68?si=-k7mlvZJntilQ18X
Tracks: Voices & Languages (primary) · Truth, Authorship & Ownership · Discovery & Audience

WHY I BUILT IT
I am from Grand Kasaï in DR Congo. The stories of my people live in Tshiluba, at home, with our elders. When they appear online, they are usually told by others, in English or French, without sources and without the people they belong to. Story Bridge changes who tells the story.

THE REAL CHALLENGE
African cultural knowledge is held by families and communities and passed on orally, in languages the internet barely serves. Online it is written by outsiders, stripped of its sources and only in colonial languages, and museum records describe how objects were collected, rarely what they mean to the people who made them. Storytellers lack a place that respects their language, credits their knowledge and lets them decide how far it travels.

WHAT IT DOES (a working proof of concept, live today)
1. Voices & Languages: people tell stories, objects, songs, traditions and places in their own language (36 suggested, 31 African, any other can be typed), with text, photos and voice recordings. The original is stored unchanged and always shown first. Authors can add their own translation or ask for an AI draft (OpenAI API), labelled and saved only if they approve it. Readers press "Read in my language" to translate on their own device, always labelled as machine translation. The interface itself speaks 20 languages, including Kiswahili, Hausa, Yorùbá, Amharic, isiZulu, Lingála, Wolof and Arabic right-to-left.
2. Truth, Authorship & Ownership: every post carries documentation (region, people, linked sources, image credits), a trust label saying how the author knows it (community member, research note, museum record), a licence the author chooses, and a version history. Drafts are private; nothing is public until the author approves it; posts can be withdrawn or permanently deleted with their audio and images; the name is shown only if the author chooses. The platform never invents facts: a culture with no contributions says "Not yet documented — add what you know". Community guidelines protect sacred or restricted knowledge, the first post of every new member is reviewed, and anyone can report a post.
3. Discovery & Audience: a social feed filtered by language and audio, culture pages across the five regions of Africa that gather stories and show the languages of each country, search across stories and cultures, link previews for sharing on WhatsApp and LinkedIn, and museum-style records of Luluwa (Kasai) objects that state what is known, what is not, and which questions the community can answer.

MORE THAN PRESENTING A STORY
Story Bridge is a tool, not a showcase: it lets people tell (in their language and voice), reach (across languages and through discovery) and own (consent, licence, credit, withdrawal) their stories in a lasting way. Each post builds a documented, sourced, multilingual record that a community can correct and grow.

WHY IT IS VIABLE
It runs today on low-cost infrastructure (Render, Supabase, pay-per-use AI), works on phones, and needs no AI credit for its core: writing, recording, translating by hand and on-device reading are free. The first members from my own network are joining and posting this week. Next steps: community translations checked by speakers, sharing with chosen families or groups, video, and partnerships with cultural centres to record consented testimonies from elders, starting in Grand Kasaï.

HOW I USED AI SOFTWARE DEVELOPMENT TOOLS
The idea and product decisions are mine. I built it with AI development tools: OpenAI Codex wrote and iterated most of the code, automated tests and documentation, phase by phase; I also used AI assistants for code review, debugging and research. I reviewed and tested every change on the live site. In the product, AI is a helper, never the author: it only drafts translations when a storyteller asks, and those drafts stay labelled.

STACK
React + Vite, Express (Node), Supabase (Google and email-code sign-in, Postgres with row-level security, private storage), OpenAI Responses API, Render. Automated tests cover the API, privacy rules and moderation.

KNOWN LIMITS
No video posts yet; audiences are private or public (no chosen groups yet); AI translation drafts need API credit, while on-device reading already works without it.
