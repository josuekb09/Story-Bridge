-- Object-linked speaker stories and admin-controlled object visibility.
alter table public.stories add column if not exists object_id text;
alter table public.stories drop constraint if exists stories_object_id_check;
alter table public.stories add constraint stories_object_id_check
  check (object_id is null or object_id in (
    'luluwa-mask', 'berlin-statue', 'ile-aix-statuette', 'brooklyn-squatting-male'
  ));
create index if not exists stories_object_public_idx
  on public.stories (object_id, created_at desc)
  where status = 'shared' and visibility = 'public';

create table if not exists public.object_records (
  id text primary key check (id in (
    'luluwa-mask', 'berlin-statue', 'ile-aix-statuette', 'brooklyn-squatting-male'
  )),
  access text not null default 'Public' check (access in ('Public', 'Community only')),
  updated_at timestamptz not null default now()
);
insert into public.object_records (id, access) values
  ('luluwa-mask', 'Public'),
  ('berlin-statue', 'Public'),
  ('ile-aix-statuette', 'Public'),
  ('brooklyn-squatting-male', 'Public')
on conflict (id) do nothing;
alter table public.object_records enable row level security;
revoke all on public.object_records from anon, authenticated;
grant all on public.object_records to service_role;
