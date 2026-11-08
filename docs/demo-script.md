# Story Bridge demo · 2 minutes

1. **0:00–0:15 — Landing:** introduce the promise: storytellers keep their language, review before sharing, and see a record of changes. Open Listen.
2. **0:15–0:35 — Listen:** browse fictional English, French and Kiswahili stories. Open one to hear or read the original first, inspect the storyteller-labelled translation, and show its Story record fingerprint.
3. **0:35–1:20 — Tell:** choose Kiswahili, continue, and record a short line if the browser supports microphone and speech recognition. Point out that the transcript is editable; if recognition is unavailable, type the story and keep the recording. If an OpenAI key is configured, request an English translation draft, edit it, and click **Approve translation**. Otherwise enter a human translation.
4. **1:20–1:45 — Review:** show the original first, verify translation provenance, choose public or private, and note that publishing requires a separate explicit approval. Save the draft, then approve it for public sharing.
5. **1:45–2:00 — Carry:** open My stories, then Listen. Open the newly shared story and show the recorded version timestamp and SHA-256 fingerprint. Withdraw it from My stories to demonstrate ongoing control.

All seeded stories and browser fixtures are fictional. Browser speech recognition is native to the browser and varies by browser/device; Story Bridge does not call an OpenAI transcription API. AI translation calls the Responses API only when the storyteller requests a draft and the server has a key; tests mock the provider. No automated safety review is implemented in this proof of concept.
