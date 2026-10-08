-- Sprint 4A.1 forward-only security patch for the already-applied likes migration.
begin;

drop policy if exists post_likes_authenticated_read on public.post_likes;
drop policy if exists post_likes_owner_read on public.post_likes;

create policy post_likes_owner_read on public.post_likes
  for select to authenticated
  using (
    user_id = (select auth.uid())
    and exists (select 1 from public.posts p where p.id = post_id)
  );

comment on policy post_likes_owner_read on public.post_likes is
  'Authenticated clients can read only their own like rows; aggregate counts use get_post_like_summaries().';

commit;
