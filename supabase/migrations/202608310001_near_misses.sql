-- Unresolved participants now get their own email, so the closing sweep has to record
-- why they went unmatched and who was nearest.
alter table public.final_assignments
  add column if not exists unresolved_reason text check (unresolved_reason in ('thin_answers', 'no_strong_match')),
  add column if not exists near_misses jsonb not null default '[]'::jsonb;
