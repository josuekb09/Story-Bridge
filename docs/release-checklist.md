# Story Bridge release checklist

Local preparation is committed on `redesign-stabilization`. No push, deployment, Render setting, Supabase setting, or migration has been performed.

## Local commit

Commit message used:

```text
Add Luluwa cultural record and speaker story flow
```

The optional AI translation feature remains disabled until the owner deliberately supplies a server-side key.

## Supabase migration

- On a new Story Bridge project, review and apply `supabase/migrations/202611070001_story_bridge_accounts.sql`, followed by the two 8 November migrations in timestamp order: `202611080001_add_translation_origin.sql` and `202611080002_add_story_record_columns.sql`.
- `202611080002_add_story_record_columns.sql` is the separate, idempotent migration for `version_log` and `audio_sha256`; the bootstrap migration already includes them for fresh projects.
- On an existing project, review the deployed schema and apply only the additive migration steps whose columns are absent. Do not run migrations against an unrelated Supabase project. No migration has been applied in this session.

## Render environment variable names

Existing account-mode configuration:

- `STORY_BACKEND`
- `STORY_AUTH_MODE`
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`
- `SUPABASE_BUCKET`
- `STORY_EMAIL_CODE_SIGN_IN`
- `STORY_GOOGLE_SIGN_IN`

Optional server-side translation draft configuration:

- `OPENAI_API_KEY`
- `OPENAI_TRANSLATION_MODEL` (optional)

Never use a `VITE_` prefix for a server secret. If `OPENAI_API_KEY` is absent, the app should keep working and explain that storytellers can write their own translation. Setting a key may incur API charges and requires the project owner's explicit authorization.

## Live smoke test after the owner authorizes deployment

1. Open the live URL in a signed-out browser. Confirm Landing and Listen load, open a public story, verify the original is shown first and that the record panel has timestamps and SHA-256 fingerprints.
2. Sign in with an authorized test account. Write a fictional story, choose a target language, and click Draft with AI only if the owner has enabled the feature. Verify the returned text is labelled `AI draft: not yet approved by you`, that it is not yet stored, and that Share cannot continue until approval.
3. Edit the AI draft; verify approval clears. Approve the edited draft and save it as a draft. Confirm My stories and Story record label its origin `AI draft approved by the storyteller`.
4. Review again, explicitly choose public, and publish. Open the story from a signed-out browser and verify original-first reading and translation attribution.
5. Withdraw the story with confirmation. Confirm a signed-out browser receives no access while the owner can still see it in My stories.
6. If no OpenAI key is configured, verify Draft with AI shows the recoverable “write the translation yourself” message and that manual translation, save, review, and publication still work.

This smoke test has not been run against a live URL in this session.
