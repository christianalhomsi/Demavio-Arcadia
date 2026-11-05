-- Hall cover image: shown on the hall card the player picks from on the home page.
-- The file lives in the public `hall-covers` bucket under <hall_id>/<file>; halls.cover_path holds that key.

alter table public.halls add column cover_path text
  check (cover_path is null or (length(cover_path) <= 200 and cover_path like id::text || '/%'));

create function public.set_hall_cover(p_hall_id uuid, p_path text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare v_before text;
begin
  if not public.has_hall_permission(p_hall_id, 'hall.settings.manage') then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  if p_path is not null and (length(p_path) > 200 or p_path not like p_hall_id::text || '/%') then
    perform public.raise_contract_error('VALIDATION', 'cover');
  end if;

  select cover_path into v_before from public.halls where id = p_hall_id for update;
  update public.halls set cover_path = p_path where id = p_hall_id;

  perform public.write_audit(p_hall_id, 'hall.cover.update', 'hall', p_hall_id::text, null,
    jsonb_build_object('cover_path', v_before), jsonb_build_object('cover_path', p_path));
end $$;

revoke all on function public.set_hall_cover(uuid, text) from public, anon;
grant execute on function public.set_hall_cover(uuid, text) to authenticated;

-- The public hall list now carries the cover so the player's card can show it.
drop function public.list_public_halls();
create function public.list_public_halls()
returns table (id uuid, name text, time_zone text, device_count integer, cover_path text)
language sql stable security definer set search_path = public, pg_temp as $$
  select h.id, h.name, h.time_zone,
         (select count(*)::int from public.devices d where d.hall_id = h.id and d.status = 'active'),
         h.cover_path
    from public.halls h
   where h.status = 'active'
   order by h.name;
$$;
revoke all on function public.list_public_halls() from public;
grant execute on function public.list_public_halls() to anon, authenticated;

-- Storage: a public bucket (covers are shown to anonymous visitors); only the hall's owner can write.
-- Skipped where the storage schema does not exist (the plain-Postgres test database).
do $$
begin
  if to_regclass('storage.objects') is null then
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('hall-covers', 'hall-covers', true, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
  on conflict (id) do nothing;

  execute $p$
    create policy hall_covers_insert on storage.objects for insert to authenticated
    with check (
      bucket_id = 'hall-covers'
      and (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and public.has_hall_permission(((storage.foldername(name))[1])::uuid, 'hall.settings.manage'))
  $p$;
  execute $p$
    create policy hall_covers_delete on storage.objects for delete to authenticated
    using (
      bucket_id = 'hall-covers'
      and (storage.foldername(name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      and public.has_hall_permission(((storage.foldername(name))[1])::uuid, 'hall.settings.manage'))
  $p$;
end $$;
