-- Additive release step for stored version history and content/audio fingerprints.
-- The earlier bootstrap already includes these fields for new projects; this is
-- safe to apply to projects created from an older schema.
alter table public.stories
  add column if not exists version_log jsonb not null default '[]'::jsonb;

alter table public.stories
  add column if not exists audio_sha256 text not null default '';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'stories_version_log_array_check') then
    alter table public.stories add constraint stories_version_log_array_check
      check (jsonb_typeof(version_log) = 'array');
  end if;
  if not exists (select 1 from pg_constraint where conname = 'stories_audio_sha256_digest_check') then
    alter table public.stories add constraint stories_audio_sha256_digest_check
      check (audio_sha256 = '' or audio_sha256 ~ '^[a-f0-9]{64}$');
  end if;
end $$;
