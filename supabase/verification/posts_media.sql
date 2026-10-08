-- Manual verification ONLY, on an isolated development database after migrations.
-- Run as its administrative database role. Every fixture is rolled back.
begin;
insert into auth.users(id, email) values
 ('a0000000-0000-4000-8000-000000000001','posts-a@example.invalid'),
 ('a0000000-0000-4000-8000-000000000002','posts-b@example.invalid');
insert into public.institutions(id,name,slug,country) values
 ('b0000000-0000-4000-8000-000000000001','Post test institution','post-test-institution','TN');
insert into public.fields(id,name,slug) values
 ('c0000000-0000-4000-8000-000000000001','Post test field','post-test-field');
update public.profiles set username = case when id::text like '%1' then 'post_test_a' else 'post_test_b' end,
 display_name='Post test', institution_id='b0000000-0000-4000-8000-000000000001',
 field_id='c0000000-0000-4000-8000-000000000001',study_level='undergraduate',onboarding_completed=true
 where id in ('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000002');
set local role authenticated;
select set_config('request.jwt.claim.sub','a0000000-0000-4000-8000-000000000001',true);
insert into public.posts(content) values ('Sprint 3A fixture');
do $$
begin
  if not exists(select 1 from public.posts where content='Sprint 3A fixture' and author_id=auth.uid()) then
    raise exception 'Default author failed';
  end if;
  begin
    insert into public.posts(author_id,content) values ('a0000000-0000-4000-8000-000000000002','spoof');
    raise exception 'Author spoof unexpectedly allowed';
  exception when insufficient_privilege then null; end;
  begin
    update public.posts set author_id='a0000000-0000-4000-8000-000000000002' where content='Sprint 3A fixture';
    raise exception 'Author reassignment unexpectedly allowed';
  exception when insufficient_privilege then null; end;
  begin
    insert into public.posts(content) values (repeat('x',5001));
    raise exception 'Oversized text allowed';
  exception when check_violation then null; end;
end $$;
reset role;
insert into public.post_media(post_id,storage_provider,storage_key,upload_key,upload_expires_at,mime_type,size_bytes,position,status,width,height,storage_version)
 select p.id,'b2','posts/test/'||n,'uploads/test/'||n,now()+interval '5 minutes','image/png',100,n,
   case when n=0 then 'ready' else 'pending' end,
   case when n=0 then 10 end,case when n=0 then 10 end,case when n=0 then 'fixture-version' end
 from public.posts p cross join generate_series(0,3) n where p.content='Sprint 3A fixture';
do $$
begin
  begin
    insert into public.post_media(post_id,storage_provider,storage_key,upload_key,upload_expires_at,mime_type,size_bytes,position)
      select id,'b2','fifth','fifth-upload',now(),'image/png',100,4 from public.posts where content='Sprint 3A fixture';
    raise exception 'Fifth slot unexpectedly allowed';
  exception when check_violation then null; end;
  begin
    insert into public.post_media(post_id,storage_provider,storage_key,upload_key,upload_expires_at,mime_type,size_bytes,position)
      select id,'b2','duplicate','duplicate-upload',now(),'image/png',100,0 from public.posts where content='Sprint 3A fixture';
    raise exception 'Duplicate slot unexpectedly allowed';
  exception when unique_violation then null; end;
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub','a0000000-0000-4000-8000-000000000002',true);
do $$
declare affected integer;
begin
  if (select count(*) from public.post_media where post_id in (select id from public.posts where content='Sprint 3A fixture')) <> 1 then
    raise exception 'Pending rows visible / ready row hidden';
  end if;
  update public.posts set content='unauthorized' where content='Sprint 3A fixture';
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Cross-owner post update allowed'; end if;
  delete from public.posts where content='Sprint 3A fixture';
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Cross-owner post delete allowed'; end if;
  update public.post_media set position=3 where position=0;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Cross-owner media update allowed'; end if;
  delete from public.post_media where position=0;
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'Cross-owner media delete allowed'; end if;
  begin
    insert into public.post_media(post_id,storage_provider,storage_key,upload_key,upload_expires_at,mime_type,size_bytes,position)
      select id,'b2','bad','bad-upload',now(),'image/png',100,0 from public.posts limit 1;
    raise exception 'Client media insert allowed';
  exception when insufficient_privilege then null; end;
  begin
    perform storage_key from public.post_media;
    raise exception 'Internal storage keys exposed';
  exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','a0000000-0000-4000-8000-000000000001',true);
delete from public.posts where content='Sprint 3A fixture';
reset role;
do $$
begin
  if exists(select 1 from public.post_media where storage_key like 'posts/test/%') then
    raise exception 'Media cascade failed';
  end if;
  if (select count(*) from penguin_private.media_cleanup_queue where storage_key like 'posts/test/%' or storage_key like 'uploads/test/%') <> 8 then
    raise exception 'Cleanup intents did not survive cascade';
  end if;
end $$;
set local role anon;
do $$
begin
  begin perform id from public.posts; raise exception 'Anonymous read allowed';
  exception when insufficient_privilege then null; end;
end $$;
reset role;
rollback;
