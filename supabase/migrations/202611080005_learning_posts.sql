-- Phase 1: additive post fields on stories keep existing identity, fingerprint,
-- version_log, audio, and object_id data intact.
alter table public.stories
  add column if not exists title text not null default '',
  add column if not exists kind text not null default 'story' check (kind in ('story','object','language','music','tradition','place')),
  add column if not exists section text not null default 'stories' check (section in ('stories','objects-art','languages-proverbs','music-dance','traditions-daily-life','places-history')),
  add column if not exists trust_label text not null default 'Told by a community member' check (trust_label in ('Told by a community member','Research note','Museum record')),
  add column if not exists licence text not null default 'All rights reserved' check (licence in ('All rights reserved','CC BY 4.0','CC BY-SA 4.0')),
  add column if not exists region text not null default '',
  add column if not exists people text not null default '',
  add column if not exists tags text[] not null default '{}',
  add column if not exists sources jsonb not null default '[]'::jsonb,
  add column if not exists consent_confirmed boolean not null default false,
  add column if not exists access text not null default 'Public' check (access in ('Public','Community only')),
  add column if not exists first_post boolean not null default false,
  add column if not exists moderation_status text not null default 'approved' check (moderation_status in ('approved','pending_review')),
  add column if not exists requested_visibility text not null default 'private' check (requested_visibility in ('private','public'));

create table if not exists public.post_media (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.stories(id) on delete cascade,
  kind text not null check (kind in ('image','audio')),
  storage_key text not null unique,
  alt_text text,
  credit text not null default '',
  licence text not null check (licence in ('All rights reserved','CC BY 4.0','CC BY-SA 4.0')),
  width integer,
  height integer,
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  constraint post_media_image_alt_required check (kind <> 'image' or (alt_text is not null and length(trim(alt_text)) > 0))
);
create index if not exists post_media_post_idx on public.post_media(post_id, created_at);
alter table public.post_media enable row level security;
revoke all on public.post_media from anon, authenticated;
grant all on public.post_media to service_role;
