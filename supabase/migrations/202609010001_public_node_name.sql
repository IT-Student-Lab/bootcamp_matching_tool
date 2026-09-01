-- Hovering a dot on /screen now shows the person's first name, so the ambient
-- feed needs to carry it (a deliberate, explicit deviation from the original
-- "anonymous until featured" design in docs/technical-plan.md §5.2/§7).
alter table public.public_nodes add column if not exists name text;

create or replace function public.sync_public_node() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.superseded_by is null then insert into public.public_nodes (participant_id, created_at, country, source, name) values (new.id, new.created_at, new.country, new.source, new.first_name) on conflict (participant_id) do update set country = excluded.country, source = excluded.source, name = excluded.name;
  else delete from public.public_nodes where participant_id = new.id; end if;
  return new;
end; $$;

update public.public_nodes n set name = p.first_name from public.participants p where p.id = n.participant_id and n.name is null;

alter table public.public_nodes alter column name set not null;
