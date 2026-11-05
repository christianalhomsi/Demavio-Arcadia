-- The player's hall card shows the hall's address and which kinds of devices it has (PC, PS5, ...).
drop function public.list_public_halls();
create function public.list_public_halls()
returns table (id uuid, name text, time_zone text, device_count integer, cover_path text,
               address text, device_kinds text[])
language sql stable security definer set search_path = public, pg_temp as $$
  select h.id, h.name, h.time_zone,
         (select count(*)::int from public.devices d where d.hall_id = h.id and d.status = 'active'),
         h.cover_path, h.address,
         coalesce((select array_agg(k order by k)
                     from (select distinct coalesce(nullif(btrim(d.category), ''), upper(d.device_type)) as k
                             from public.devices d
                            where d.hall_id = h.id and d.status = 'active') x), '{}')
    from public.halls h
   where h.status = 'active'
   order by h.name;
$$;
revoke all on function public.list_public_halls() from public;
grant execute on function public.list_public_halls() to anon, authenticated;
