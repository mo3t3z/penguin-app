-- Sprint 8A: profile photos (avatar and cover) in Supabase Storage. Additive;
-- review and deploy manually.
--
-- A public bucket: profile photos are shown to every signed-in student, like the
-- rest of a profile. Each student writes only under their own folder,
-- "<user id>/...". Posts keep their private media pipeline; this bucket is for
-- profile photos only.
--
-- The storage schema exists on Supabase but not in a plain Postgres container, so
-- the body runs only where storage.buckets exists.
begin;

do $migration$
begin
  if to_regclass('storage.buckets') is null then
    raise notice 'storage schema not present: profile photo bucket skipped';
    return;
  end if;

  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('profile-photos', 'profile-photos', true, 5242880, array['image/jpeg', 'image/png', 'image/webp']);

  execute $sql$
    create policy profile_photos_owner_insert on storage.objects for insert to authenticated
      with check (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = (select auth.uid())::text)
  $sql$;
  execute $sql$
    create policy profile_photos_owner_update on storage.objects for update to authenticated
      using (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = (select auth.uid())::text)
      with check (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = (select auth.uid())::text)
  $sql$;
  execute $sql$
    create policy profile_photos_owner_delete on storage.objects for delete to authenticated
      using (bucket_id = 'profile-photos' and (storage.foldername(name))[1] = (select auth.uid())::text)
  $sql$;
end;
$migration$;

commit;
