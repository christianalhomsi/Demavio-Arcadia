-- Account page: any signed-in person can change their own username and display name.
-- Username rules are the same as set_my_username (3-20 lowercase letters/digits/underscore, unique,
-- not just their account name) but, unlike it, may be changed more than once.

set local search_path = public, extensions;

create function public.update_my_account(p_username text, p_display_name text) returns void
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_p public.profiles;
  v_name text := lower(btrim(coalesce(p_username, '')));
  v_display text := nullif(btrim(coalesce(p_display_name, '')), '');
  v_account text;
begin
  select * into v_p from public.profiles where id = auth.uid() for update;
  if not found or v_p.status <> 'active' then
    perform public.raise_contract_error('PERMISSION_DENIED');
  end if;
  if v_display is not null and char_length(v_display) > 80 then
    perform public.raise_contract_error('VALIDATION', 'display_name');
  end if;
  if v_name !~ '^[a-z0-9_]{3,20}$' then
    perform public.raise_contract_error('VALIDATION', 'username');
  end if;

  if v_name is distinct from v_p.username then
    foreach v_account in array array[
      regexp_replace(lower(coalesce(v_display, v_p.display_name, '')), '[^a-z0-9]', '', 'g'),
      regexp_replace(lower(split_part(coalesce(v_p.email, ''), '@', 1)), '[^a-z0-9]', '', 'g')
    ] loop
      if v_account <> '' and v_account = regexp_replace(v_name, '[^a-z0-9]', '', 'g') then
        perform public.raise_contract_error('VALIDATION', 'username_same_as_account');
      end if;
    end loop;
  end if;

  begin
    update public.profiles set username = v_name, display_name = v_display where id = v_p.id;
  exception when unique_violation then
    perform public.raise_contract_error('CONFLICT', 'username_taken');
  end;
end $$;

revoke execute on function public.update_my_account(text, text) from public, anon, authenticated;
grant execute on function public.update_my_account(text, text) to authenticated;
