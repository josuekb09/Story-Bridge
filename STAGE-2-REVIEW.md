# Stage 2 continuation review

This review describes the local source and migration text only. No real Supabase project, cloud key endpoint, email provider, or authenticated provider call was used. The migration remains unapplied.

## Task B: authentication and JWKS

- **JWKS URL restrictions — medium, tightened locally.** The configured Supabase project URL must be HTTPS on `*.supabase.co`. A non-loopback `STORY_JWKS_URL` must use HTTPS and now must match the project's host including its port. User information is rejected. HTTP is accepted for `127.0.0.1`, `localhost`, and `[::1]`, including in production, to preserve the existing production-entry loopback test. Setting this URL requires control of the server environment; a browser cannot select it. No additional loopback-to-project host coupling was added because the environment is already the trust boundary and the local production-entry test explicitly relies on this override.
- **Redirects and timeout — medium, fixed locally.** JWKS fetch now sets `redirect: 'error'` and a five-second abort signal. Discovery failures remain a sanitized `key-discovery-failed` error.
- **Issuer — verified in code.** `jwtVerify` pins `iss` to `${SUPABASE_URL}/auth/v1`, regardless of the configured JWKS URL.
- **Audience — verified in code and mocks.** `jwtVerify` requires audience `authenticated`; the mock tests reject `aud: 'anon'`. This establishes what the verifier accepts, not what a real Supabase token contains.
- **Algorithms and claims — verified in code.** Accepted algorithms are RS256 and ES256; `exp` and `sub` are required, with five seconds of clock tolerance. The verifier refreshes keys when a token's `kid` is not found, subject to a 30-second refresh limit.
- **Not established here.** The actual project issuer, real token audience/claims, published asymmetric keys, key rotation behavior, TLS path, and provider sign-in behavior were not tested against Supabase.

## Task C: unapplied SQL migration and Supabase adapter

- **Medium — audio can be orphaned after auth-user deletion.** Both profile and story rows reference `auth.users` with `ON DELETE CASCADE`; deleting an auth user removes those database rows. Audio objects in the private Storage bucket are outside that relational cascade and remain in Storage. The row cascade is explicit and appears intentional; object cleanup is not implemented. Minimal future fix: add a trusted deletion cleanup path or scheduled orphan cleanup before enabling account deletion.
- **No finding — table access model.** RLS is enabled on `profiles` and `stories`, all table grants are revoked from `anon` and `authenticated`, and `service_role` receives table privileges. No browser table policy is defined. The Storage bucket is private; the migration adds a `service_role` policy and no `anon` or `authenticated` policy. This matches server-mediated public browsing and private-draft access.
- **No fresh-project failure found by text review.** The migration assumes the standard Supabase `auth` and `storage` schemas, roles, and tables exist. These are Supabase platform objects. No migration was executed, so SQL syntax/permissions against a real project remain unverified.
- **Low — existing bucket settings are overwritten.** The bucket upsert forces this bucket private, sets a 10 MiB limit, and replaces allowed MIME types. This is appropriate for a newly reserved Story Bridge bucket; if a project reuses the same bucket for other content, that existing configuration would be changed. Minimal fix: use a dedicated bucket or preflight its existing configuration before applying.
- **No silent local-write fallback.** `server/index.js` selects the Supabase adapter only for explicit `STORY_BACKEND=supabase`; its errors are converted to storage-unavailable responses. It does not retry or write through to the local account store. File account storage is selected only with explicit `STORY_BACKEND=file`, and production rejects that backend.
- **Medium — adapter calls have no explicit timeout.** Supabase SDK queries and the direct audio `fetch` do not set an adapter-level deadline. Errors are surfaced as storage-unavailable, but a stalled provider request can hold a route open. Minimal fix: provide a bounded fetch implementation to the Supabase client and use an abort signal for direct audio fetch. Not changed because this task requested a read-only adapter review.

## Task A: browser coverage

The added signed-in browser flow runs the account-mode app server with isolated `file` account storage, including real app routes, real local JWT verification, and normal CSP headers. It mocks only the Supabase auth HTTP boundary; it creates an offline local RSA key and serves its public JWKS from a loopback endpoint. It signs in, checks the account header, creates a text draft, edits and saves it, opens it from My stories, and checks the CSP violation event list. The existing sign-in/profile screen checks continue to use their prior response mocks.

The run result and exact commands are recorded in the session handoff. All test data is under that run's `.test-data/runs/<run-id>/` directory.

## Scope confirmation

No SQL was edited or applied. No real provider or cloud call was made. No UI source was changed.
