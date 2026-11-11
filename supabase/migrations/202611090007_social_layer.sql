-- Phase L1 social schema. Additive only; review before applying to production.

alter table public.profiles
  add column if not exists handle text;

do $migration$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.profiles'::regclass
      and conname = 'profiles_handle_format_check'
  ) then
    alter table public.profiles
      add constraint profiles_handle_format_check
      check (handle is null or (
        char_length(handle) between 3 and 30
        and handle !~ '[^a-z0-9_]'
      ));
  end if;
end
$migration$;

alter table public.stories
  add column if not exists culture text,
  add column if not exists country text;

do $migration$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.stories'::regclass
      and conname = 'stories_culture_length_check'
  ) then
    alter table public.stories
      add constraint stories_culture_length_check
      check (culture is null or char_length(culture) <= 80);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.stories'::regclass
      and conname = 'stories_country_length_check'
  ) then
    alter table public.stories
      add constraint stories_country_length_check
      check (country is null or char_length(country) <= 80);
  end if;
end
$migration$;

create table if not exists public.reactions (
  post_id uuid not null references public.stories(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('thanks', 'learned', 'my_culture')),
  created_at timestamptz not null default now(),
  primary key (post_id, user_id, kind)
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.stories(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  parent_id uuid references public.comments(id) on delete cascade,
  body text not null check (char_length(body) between 1 and 2000),
  language text check (language is null or char_length(language) <= 80),
  is_author_answer boolean not null default false,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  deleted_at timestamptz,
  constraint comments_not_self_parent_check
    check (parent_id is null or parent_id <> id)
);

create table if not exists public.follows (
  follower_id uuid not null references auth.users(id) on delete cascade,
  target_type text not null check (target_type in ('user', 'culture')),
  target_id text not null check (char_length(target_id) between 1 and 120),
  created_at timestamptz not null default now(),
  primary key (follower_id, target_type, target_id)
);

create table if not exists public.bookmarks (
  user_id uuid not null references auth.users(id) on delete cascade,
  post_id uuid not null references public.stories(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('reaction', 'comment', 'reply', 'follow', 'approved', 'report_resolved')),
  actor_id uuid references auth.users(id) on delete set null,
  post_id uuid references public.stories(id) on delete cascade,
  comment_id uuid references public.comments(id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint notifications_no_self_check
    check (actor_id is null or actor_id <> user_id)
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  target_type text not null check (target_type in ('post', 'comment', 'profile')),
  target_id text not null check (char_length(target_id) between 1 and 120),
  reason text not null check (reason in (
    'wrong_or_harmful_information', 'disrespectful', 'sacred_or_restricted',
    'privacy', 'spam', 'other'
  )),
  details text check (details is null or char_length(details) <= 1000),
  status text not null default 'open' check (status in ('open', 'actioned', 'dismissed')),
  created_at timestamptz not null default now()
);

create unique index if not exists profiles_handle_unique_idx
  on public.profiles (handle) where handle is not null;

create index if not exists stories_public_feed_created_idx
  on public.stories (created_at desc, id desc)
  where status = 'shared' and visibility = 'public'
    and moderation_status = 'approved' and access = 'Public';
create index if not exists stories_public_culture_created_idx
  on public.stories (culture, created_at desc, id desc)
  where culture is not null and status = 'shared' and visibility = 'public'
    and moderation_status = 'approved' and access = 'Public';
create index if not exists stories_public_country_created_idx
  on public.stories (country, created_at desc, id desc)
  where country is not null and status = 'shared' and visibility = 'public'
    and moderation_status = 'approved' and access = 'Public';

create index if not exists reactions_post_kind_idx
  on public.reactions (post_id, kind);
create index if not exists comments_post_created_idx
  on public.comments (post_id, created_at desc);
create index if not exists comments_parent_created_idx
  on public.comments (parent_id, created_at);
create index if not exists comments_user_created_idx
  on public.comments (user_id, created_at desc);
create index if not exists follows_target_idx
  on public.follows (target_type, target_id);
create index if not exists follows_follower_created_idx
  on public.follows (follower_id, created_at desc);
create index if not exists bookmarks_user_created_idx
  on public.bookmarks (user_id, created_at desc);
create index if not exists bookmarks_post_idx
  on public.bookmarks (post_id);
create index if not exists notifications_user_read_created_idx
  on public.notifications (user_id, read_at, created_at desc);
create index if not exists notifications_user_created_idx
  on public.notifications (user_id, created_at desc);
create index if not exists reports_status_created_idx
  on public.reports (status, created_at desc);
create index if not exists reports_reporter_created_idx
  on public.reports (reporter_id, created_at desc);
create index if not exists reports_target_idx
  on public.reports (target_type, target_id);

alter table public.profiles enable row level security;
alter table public.stories enable row level security;
alter table public.reactions enable row level security;
alter table public.comments enable row level security;
alter table public.follows enable row level security;
alter table public.bookmarks enable row level security;
alter table public.notifications enable row level security;
alter table public.reports enable row level security;

revoke all on table
  public.profiles, public.stories, public.reactions, public.comments,
  public.follows, public.bookmarks, public.notifications, public.reports
from PUBLIC, anon, authenticated;

grant all on table
  public.profiles, public.stories, public.reactions, public.comments,
  public.follows, public.bookmarks, public.notifications, public.reports
to service_role;
