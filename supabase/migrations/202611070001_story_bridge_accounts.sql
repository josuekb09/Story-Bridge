-- Story Bridge account storage. Review the target project name before applying.
-- Run with the Supabase SQL editor while signed into the new Story Bridge project.
-- Server-only SUPABASE_SECRET_KEY performs story/profile CRUD, atomic claim updates,
-- and private bucket uploads/downloads. Browser clients receive no table or bucket grants.

create table if not exists public.profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '' check (char_length(display_name) <= 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.stories (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid references auth.users(id) on delete cascade,
  owner_hash text check (owner_hash is null or owner_hash ~ '^[a-fA-F0-9]{64}$'),
  original_language text not null check (char_length(original_language) between 1 and 80),
  text text not null default '' check (char_length(text) <= 12000),
  translation_language text not null default '' check (char_length(translation_language) <= 80),
  translation text not null default '' check (char_length(translation) <= 12000),
  translation_checked boolean not null default false,
  checked_by text not null default '' check (char_length(checked_by) <= 120),
  storyteller_name text not null default '' check (char_length(storyteller_name) <= 120),
  show_name boolean not null default false,
  visibility text not null default 'private' check (visibility in ('private','public')),
  status text not null default 'draft' check (status in ('draft','shared','withdrawn')),
  audio_key text unique,
  audio_mime text not null default '',
  created_at timestamptz not null default now(),
  constraint stories_one_owner check ((owner_user_id is null) <> (owner_hash is null))
);

alter table public.profiles enable row level security;
alter table public.stories enable row level security;
revoke all on public.profiles, public.stories from anon, authenticated;
grant all on public.profiles, public.stories to service_role;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('story-bridge-audio', 'story-bridge-audio', false, 10485760,
        array['audio/webm','audio/ogg','audio/wav','audio/x-wav','audio/mpeg','audio/mp3','audio/mp4','audio/x-m4a','audio/aac','audio/flac','audio/opus'])
on conflict (id) do update set public = false, file_size_limit = 10485760,
  allowed_mime_types = excluded.allowed_mime_types;

-- storage.objects already has RLS enabled by Supabase and is owned by the storage admin role, so the
-- SQL editor may refuse ALTER/REVOKE on it. We add no policy for anon or authenticated, so they get no access.
drop policy if exists "Story Bridge server audio access" on storage.objects;
create policy "Story Bridge server audio access" on storage.objects
  for all to service_role
  using (bucket_id = 'story-bridge-audio')
  with check (bucket_id = 'story-bridge-audio');
-- The server-only secret key bypasses RLS for these explicit server-mediated operations.
-- No browser policy or signed storage URL is created. The Express route checks story
-- ownership/visibility on every request, then streams from this private bucket.
