-- Group cover images. Additive; review and deploy manually.
-- The owner uploads the image to their own folder of the profile-photos bucket and
-- sets the link here. Everyone who can see the group can see the cover.
begin;

alter table public.groups
  add column cover_url text,
  add constraint groups_cover_url_format check (char_length(cover_url) <= 2048 and cover_url ~ '^https://[^[:space:]]+$');

grant select (cover_url) on public.groups to authenticated;

-- Sets or clears the cover. Owner only, in an active group: the same rule as
-- editing the name and description.
create function public.set_group_cover(p_group_id uuid, p_cover_url text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  caller uuid := (select auth.uid());
  clean text := nullif(pg_catalog.btrim(coalesce(p_cover_url, '')), '');
begin
  if caller is null then raise exception using errcode = '42501', message = 'Authentication required'; end if;
  if p_group_id is null then raise exception using errcode = '22023', message = 'Invalid group'; end if;
  perform penguin_groups_private.begin_staff_action(p_group_id, caller, true);
  update public.groups set cover_url = clean, updated_at = pg_catalog.clock_timestamp() where id = p_group_id;
  return clean;
end;
$$;

revoke all on function public.set_group_cover(uuid, text) from public, anon, authenticated;
grant execute on function public.set_group_cover(uuid, text) to authenticated;

commit;
