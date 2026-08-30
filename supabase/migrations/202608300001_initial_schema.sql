create extension if not exists "pgcrypto";

create table public.participants (
  id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  first_name text not null check (char_length(trim(first_name)) between 1 and 80), last_name text, country text, department text, email text,
  good_at text not null, wants_to_learn text not null, privacy_notice_version text not null default '2026-08-30',
  source text not null default 'live' check (source in ('seed', 'live')), person_key text not null, seed_import_key text unique,
  superseded_by uuid references public.participants(id), status text not null default 'new' check (status in ('new', 'matched')),
  check (source = 'seed' or (country is not null and email is not null))
);
create unique index participants_live_email on public.participants (lower(email)) where source = 'live' and email is not null;
create index participants_active_created on public.participants (created_at, id) where superseded_by is null;

create table public.matches (
  id uuid primary key default gen_random_uuid(), created_at timestamptz not null default now(), participant_a uuid not null references public.participants(id),
  participant_b uuid not null references public.participants(id), score integer not null check (score between 0 and 100), reason text not null,
  shown_at timestamptz, check (participant_a <> participant_b)
);
create unique index matches_unique_pair on public.matches (least(participant_a::text, participant_b::text), greatest(participant_a::text, participant_b::text));
create table public.final_assignments (
  participant_id uuid primary key references public.participants(id) on delete cascade, match_id uuid references public.matches(id) on delete cascade,
  status text not null check (status in ('matched', 'unresolved')), email_status text not null default 'pending' check (email_status in ('pending', 'sending', 'sent', 'failed', 'not_applicable')),
  email_message_id text, email_error_code text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check ((status = 'matched' and match_id is not null) or (status = 'unresolved' and match_id is null))
);
create table public.runs (id integer primary key default 1 check (id = 1), running boolean not null default false, started_at timestamptz, finished_at timestamptz, round_count integer not null default 0, last_latency_ms integer, last_outcome text, last_error_code text);
insert into public.runs (id) values (1);
create table public.rate_limit_buckets (key_hash text not null, window_started_at timestamptz not null, request_count integer not null default 1 check (request_count > 0), primary key (key_hash, window_started_at));
create table public.show_control (id integer primary key default 1 check (id = 1), mode text not null default 'live' check (mode in ('live', 'fallback')), score_floor integer not null default 70 check (score_floor between 0 and 100), forced_match_id uuid references public.matches(id), force_version bigint not null default 0, updated_at timestamptz not null default now());
insert into public.show_control (id) values (1);
create table public.public_nodes (participant_id uuid primary key, created_at timestamptz not null, country text, source text not null check (source in ('seed', 'live')));
create table public.public_matches (
  match_id uuid primary key, created_at timestamptz not null, participant_a uuid not null, participant_b uuid not null, score integer not null check (score between 0 and 100), reason text not null,
  a_name text not null, a_country text, a_good_at text not null, a_source text not null check (a_source in ('seed', 'live')),
  b_name text not null, b_country text, b_wants_to_learn text not null, b_source text not null check (b_source in ('seed', 'live')), shown_at timestamptz
);

create or replace function public.sync_public_node() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.superseded_by is null then insert into public.public_nodes (participant_id, created_at, country, source) values (new.id, new.created_at, new.country, new.source) on conflict (participant_id) do update set country = excluded.country, source = excluded.source;
  else delete from public.public_nodes where participant_id = new.id; end if;
  return new;
end; $$;
create trigger participants_sync_public_node after insert or update of country, source, superseded_by on public.participants for each row execute function public.sync_public_node();

create or replace function public.sync_public_match() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.public_matches (match_id, created_at, participant_a, participant_b, score, reason, a_name, a_country, a_good_at, a_source, b_name, b_country, b_wants_to_learn, b_source, shown_at)
  select new.id, new.created_at, new.participant_a, new.participant_b, new.score, new.reason, a.first_name, a.country, a.good_at, a.source, b.first_name, b.country, b.wants_to_learn, b.source, new.shown_at
  from public.participants a join public.participants b on b.id = new.participant_b where a.id = new.participant_a
  on conflict (match_id) do update set score = excluded.score, reason = excluded.reason, shown_at = excluded.shown_at;
  return new;
end; $$;
create trigger matches_sync_public_match after insert or update of score, reason, shown_at on public.matches for each row execute function public.sync_public_match();

create or replace function public.try_acquire_round(stale_after_seconds integer default 60) returns boolean language plpgsql security definer set search_path = public as $$
declare acquired boolean;
begin
  update public.runs set running = true, started_at = now(), finished_at = null, last_outcome = null, last_error_code = null
  where id = 1 and (not running or started_at < now() - make_interval(secs => stale_after_seconds)) returning true into acquired;
  return coalesce(acquired, false);
end; $$;
create or replace function public.release_round(outcome text, latency_ms integer, error_code text default null) returns void language sql security definer set search_path = public as $$
  update public.runs set running = false, finished_at = now(), round_count = round_count + 1, last_latency_ms = latency_ms, last_outcome = outcome, last_error_code = error_code where id = 1;
$$;
create or replace function public.consume_rate_limit(bucket_key_hash text, bucket_started_at timestamptz, maximum_requests integer) returns boolean language plpgsql security definer set search_path = public as $$
declare accepted boolean;
begin
  insert into public.rate_limit_buckets (key_hash, window_started_at, request_count) values (bucket_key_hash, bucket_started_at, 1)
  on conflict (key_hash, window_started_at) do update set request_count = public.rate_limit_buckets.request_count + 1 where public.rate_limit_buckets.request_count < maximum_requests returning true into accepted;
  delete from public.rate_limit_buckets where window_started_at < now() - interval '2 hours';
  return coalesce(accepted, false);
end; $$;
create or replace function public.submit_live_participant(submitted_first_name text, submitted_country text, submitted_email text, submitted_good_at text, submitted_wants_to_learn text, submitted_name_key text, submitted_email_key text) returns uuid language plpgsql security definer set search_path = public as $$
declare participant_id uuid; seed_id uuid; seed_key text;
begin
  perform pg_advisory_xact_lock(hashtext(lower(trim(submitted_email))));
  select p.id into participant_id from public.participants p where p.source = 'live' and lower(p.email) = lower(trim(submitted_email));
  if participant_id is null then
    select p.id, p.person_key into seed_id, seed_key from public.participants p where p.source = 'seed' and p.superseded_by is null and p.person_key = submitted_name_key;
    insert into public.participants (first_name, country, email, good_at, wants_to_learn, source, person_key, status)
    values (trim(submitted_first_name), trim(submitted_country), lower(trim(submitted_email)), trim(submitted_good_at), trim(submitted_wants_to_learn), 'live', coalesce(seed_key, submitted_email_key), 'new') returning id into participant_id;
  else
    update public.participants set first_name = trim(submitted_first_name), country = trim(submitted_country), good_at = trim(submitted_good_at), wants_to_learn = trim(submitted_wants_to_learn), status = 'new', updated_at = now() where id = participant_id;
    select p.id into seed_id from public.participants p where p.source = 'seed' and p.superseded_by is null and p.person_key = (select person_key from public.participants where id = participant_id) order by p.created_at limit 1;
  end if;
  if seed_id is not null then update public.participants set superseded_by = participant_id, updated_at = now() where id = seed_id; end if;
  return participant_id;
end; $$;

alter table public.participants enable row level security; alter table public.matches enable row level security; alter table public.final_assignments enable row level security;
alter table public.runs enable row level security; alter table public.rate_limit_buckets enable row level security; alter table public.show_control enable row level security;
alter table public.public_nodes enable row level security; alter table public.public_matches enable row level security;
create policy "anon reads public nodes" on public.public_nodes for select to anon using (true);
create policy "anon reads public matches" on public.public_matches for select to anon using (true);
create policy "anon reads show control" on public.show_control for select to anon using (true);
revoke all on public.participants from anon, authenticated; revoke all on public.matches from anon, authenticated; revoke all on public.final_assignments from anon, authenticated;
revoke all on public.runs from anon, authenticated; revoke all on public.rate_limit_buckets from anon, authenticated;
grant select on public.public_nodes to anon; grant select on public.public_matches to anon; grant select on public.show_control to anon;
revoke all on function public.try_acquire_round(integer) from public, anon, authenticated; revoke all on function public.release_round(text, integer, text) from public, anon, authenticated;
revoke all on function public.consume_rate_limit(text, timestamptz, integer) from public, anon, authenticated; revoke all on function public.submit_live_participant(text, text, text, text, text, text, text) from public, anon, authenticated;
grant execute on function public.try_acquire_round(integer) to service_role; grant execute on function public.release_round(text, integer, text) to service_role;
grant execute on function public.consume_rate_limit(text, timestamptz, integer) to service_role; grant execute on function public.submit_live_participant(text, text, text, text, text, text, text) to service_role;
do $$ begin alter publication supabase_realtime add table public.public_nodes; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.public_matches; exception when duplicate_object then null; end $$;
do $$ begin alter publication supabase_realtime add table public.show_control; exception when duplicate_object then null; end $$;
