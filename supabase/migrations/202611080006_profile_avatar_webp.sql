-- Allow the existing server-only profile avatar upload to store re-encoded WebP.
-- Keeps the bucket private and preserves every currently allowed audio format.
do $$
begin
  if not exists (select 1 from storage.buckets where id = 'story-bridge-audio') then
    raise exception 'Required private bucket story-bridge-audio was not found';
  end if;

  update storage.buckets
  set allowed_mime_types = case
    when allowed_mime_types is null then null
    when 'image/webp' = any(allowed_mime_types) then allowed_mime_types
    else array_append(allowed_mime_types, 'image/webp')
  end
  where id = 'story-bridge-audio';
end
$$;
