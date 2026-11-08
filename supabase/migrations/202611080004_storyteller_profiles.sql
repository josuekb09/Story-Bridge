alter table public.profiles
  add column if not exists headline text not null default '',
  add column if not exists bio text not null default '',
  add column if not exists country text not null default '',
  add column if not exists region text not null default '',
  add column if not exists languages jsonb not null default '[]'::jsonb,
  add column if not exists links jsonb not null default '[]'::jsonb,
  add column if not exists privacy jsonb not null default '{"displayName":"Only me","headline":"Only me","bio":"Only me","country":"Only me","region":"Only me","languages":"Only me","links":"Only me","avatar":"Only me"}'::jsonb,
  add column if not exists avatar_key text not null default '';

alter table public.profiles
  add constraint profiles_headline_length_check check (char_length(headline) <= 80),
  add constraint profiles_bio_length_check check (char_length(bio) <= 500),
  add constraint profiles_avatar_key_check check (avatar_key = '' or avatar_key ~ '^[0-9a-f-]{36}$');
