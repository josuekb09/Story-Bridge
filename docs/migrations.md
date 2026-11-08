# Database migrations

Apply SQL migrations in timestamp order using the Supabase SQL editor or the project's reviewed migration workflow. This repository only prepares migrations; none are applied to a live project from this workspace.

Phase 1 posts: apply `supabase/migrations/202611080005_learning_posts.sql` after migrations `202611070001` through `202611080004`. It adds documentation and consent columns to `stories` and creates the service-role-only `post_media` table. Existing `version_log`, audio hashes, story fingerprints, and object links are preserved. The existing storage bucket is used for WebP media under random keys; ensure the configured bucket permits server-side service-role access.

Environment variable names used for first-post moderation: `STORY_BRIDGE_OBJECT_ADMIN_ID`.

The owner reports migrations `202611070001` through `202611080005` are already applied in production; do not replay them. The owner confirmed `supabase/migrations/202611080006_profile_avatar_webp.sql` is also applied. It adds `image/webp` to the existing private `story-bridge-audio` bucket's allowed MIME types and preserves the existing allowlist. No new migration was needed for email/Google sign-in or welcome profile fields because the profile columns and avatar storage support were already present.
