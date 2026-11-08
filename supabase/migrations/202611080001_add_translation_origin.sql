-- Storyteller-approved AI drafts and human-entered translations carry distinct provenance.
alter table public.stories
  add column if not exists translation_origin text not null default 'storyteller'
  check (translation_origin in ('storyteller', 'ai_approved'));
