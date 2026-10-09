-- Sprint 6A: additive private-chat foundation. Review and deploy manually.
-- Creates new objects only; no existing table, policy, trigger or function is changed.
begin;

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

-- One row per pair of students. user_low/user_high hold the two participants in
-- canonical order. When a student deletes their account their side becomes NULL:
-- the other participant keeps the history and sees no identity for the deleted
-- student, and no live profile is kept for the sake of chat.
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  user_low uuid,
  user_high uuid,
  created_by uuid,
  created_at timestamptz not null default now(),
  last_message_at timestamptz,
  last_message_sender_id uuid,
  last_message_preview text,
  constraint conversations_user_low_fkey foreign key (user_low)
    references public.profiles(id) on delete set null,
  constraint conversations_user_high_fkey foreign key (user_high)
    references public.profiles(id) on delete set null,
  constraint conversations_created_by_fkey foreign key (created_by)
    references public.profiles(id) on delete set null,
  constraint conversations_last_message_sender_id_fkey foreign key (last_message_sender_id)
    references public.profiles(id) on delete set null,
  constraint conversations_canonical_pair check (user_low < user_high),
  constraint conversations_pair_unique unique (user_low, user_high),
  constraint conversations_preview_length check (char_length(last_message_preview) <= 140)
);

create index conversations_user_low_recent_idx
  on public.conversations (user_low, last_message_at desc, id desc);
create index conversations_user_high_recent_idx
  on public.conversations (user_high, last_message_at desc, id desc);
create index conversations_created_by_idx
  on public.conversations (created_by, created_at);
create index conversations_last_message_sender_idx
  on public.conversations (last_message_sender_id);

-- sender_id becomes NULL when the sender deletes their account. In a one-to-one
-- conversation a NULL sender is always "the other, deleted, student".
create table public.messages (
  id uuid primary key,
  conversation_id uuid not null,
  sender_id uuid,
  content text not null,
  created_at timestamptz not null default now(),
  constraint messages_conversation_id_fkey foreign key (conversation_id)
    references public.conversations(id) on delete cascade,
  constraint messages_sender_id_fkey foreign key (sender_id)
    references public.profiles(id) on delete set null,
  constraint messages_content_length check (
    char_length(content) between 1 and 2000 and content ~ '[^[:space:]]'
  )
);

create index messages_conversation_cursor_idx
  on public.messages (conversation_id, created_at desc, id desc);
create index messages_sender_recent_idx
  on public.messages (sender_id, created_at);

-- Per-participant read cursor, prepared for unread state in Sprint 6B.
create table public.conversation_reads (
  conversation_id uuid not null,
  user_id uuid not null,
  last_read_at timestamptz not null default now(),
  primary key (conversation_id, user_id),
  constraint conversation_reads_conversation_id_fkey foreign key (conversation_id)
    references public.conversations(id) on delete cascade,
  constraint conversation_reads_user_id_fkey foreign key (user_id)
    references public.profiles(id) on delete cascade
);

create index conversation_reads_user_idx on public.conversation_reads (user_id);

create table public.user_blocks (
  blocker_id uuid not null,
  blocked_id uuid not null,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint user_blocks_blocker_id_fkey foreign key (blocker_id)
    references public.profiles(id) on delete cascade,
  constraint user_blocks_blocked_id_fkey foreign key (blocked_id)
    references public.profiles(id) on delete cascade,
  constraint user_blocks_not_self check (blocker_id <> blocked_id)
);

create index user_blocks_blocked_idx on public.user_blocks (blocked_id, blocker_id);

-- ---------------------------------------------------------------------------
-- Privileges and row-level security
-- ---------------------------------------------------------------------------

alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.conversation_reads enable row level security;
alter table public.user_blocks enable row level security;

revoke all on public.conversations, public.messages, public.conversation_reads, public.user_blocks
  from public, anon, authenticated;

-- Clients read; every write goes through the functions below. No INSERT, UPDATE
-- or DELETE is granted on conversations, messages or conversation_reads, so
-- blocking, rate limits, sender identity, timestamps and summaries cannot be
-- bypassed by calling the Data API directly.
grant select (id, user_low, user_high, created_at, last_message_at, last_message_sender_id, last_message_preview)
  on public.conversations to authenticated;
grant select (id, conversation_id, sender_id, content, created_at)
  on public.messages to authenticated;
grant select (conversation_id, user_id, last_read_at)
  on public.conversation_reads to authenticated;
-- A student sees and removes only their own blocks. Creating one goes through
-- block_user so it is ordered against sends for the same pair.
grant select (blocker_id, blocked_id, created_at), delete
  on public.user_blocks to authenticated;
grant all on public.conversations, public.messages, public.conversation_reads, public.user_blocks
  to service_role;

create policy conversations_participant_read on public.conversations
  for select to authenticated
  using ((select auth.uid()) in (user_low, user_high));

create policy messages_participant_read on public.messages
  for select to authenticated
  using (exists (
    select 1 from public.conversations c
    where c.id = conversation_id and (select auth.uid()) in (c.user_low, c.user_high)
  ));

create policy conversation_reads_owner_read on public.conversation_reads
  for select to authenticated
  using (user_id = (select auth.uid()));

create policy user_blocks_blocker_read on public.user_blocks
  for select to authenticated
  using (blocker_id = (select auth.uid()));

create policy user_blocks_blocker_delete on public.user_blocks
  for delete to authenticated
  using (blocker_id = (select auth.uid()));

-- ---------------------------------------------------------------------------
-- Account deletion
-- ---------------------------------------------------------------------------

-- A conversation whose two participants have both deleted their accounts can be
-- read by nobody, so it is removed together with its messages.
create function public.penguin_remove_abandoned_conversation()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.user_low is null and new.user_high is null then
    delete from public.conversations c where c.id = new.id;
  end if;
  return null;
end;
$$;
-- Trigger-only definer: unavailable as a client RPC.
revoke all on function public.penguin_remove_abandoned_conversation() from public, anon, authenticated;
create trigger penguin_conversation_abandoned
  after update of user_low, user_high on public.conversations
  for each row execute function public.penguin_remove_abandoned_conversation();

-- ---------------------------------------------------------------------------
-- Write path
-- ---------------------------------------------------------------------------
-- Error codes returned to the app:
--   42501  not signed in, or not allowed to use this conversation
--   22023  invalid argument, or a request identifier reused for something else
--   23514  message text outside 1-2,000 characters or blank (table constraint)
--   PC001  messaging is unavailable between these two students (blocked either
--          way, or the other account no longer exists); deliberately one code
--   PC002  rate limit reached
--
-- Ordering. Every function that creates a conversation, sends a message or
-- creates a block takes a transaction-level advisory lock on the pair of
-- students before it checks anything. For one pair these operations therefore
-- run one at a time: a send that obtains the lock first is stored before the
-- block exists; a send that obtains it after the block commits is refused.
-- Sends and conversation creation also take a lock on the sender first, so the
-- rate-limit counts cannot be bypassed by sending in parallel.

-- Limits are provisional. To change them, replace the two functions below with
-- new numbers in a later migration; nothing else refers to the values.
create function public.penguin_chat_message_limit_per_minute()
returns integer language sql immutable set search_path = '' as $$ select 30 $$;
create function public.penguin_chat_conversation_limit_per_day()
returns integer language sql immutable set search_path = '' as $$ select 20 $$;
revoke all on function public.penguin_chat_message_limit_per_minute() from public, anon, authenticated;
revoke all on function public.penguin_chat_conversation_limit_per_day() from public, anon, authenticated;

create function public.penguin_chat_lock_sender(p_user_id uuid)
returns void language sql security invoker set search_path = '' as $$
  select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('penguin-chat-sender:' || p_user_id::text, 0));
$$;
create function public.penguin_chat_lock_pair(p_first uuid, p_second uuid)
returns void language sql security invoker set search_path = '' as $$
  select pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    'penguin-chat-pair:' || least(p_first, p_second)::text || ':' || greatest(p_first, p_second)::text, 0));
$$;
create function public.penguin_chat_pair_blocked(p_first uuid, p_second uuid)
returns boolean language sql stable security invoker set search_path = '' as $$
  select exists (
    select 1 from public.user_blocks b
    where (b.blocker_id = p_first and b.blocked_id = p_second)
       or (b.blocker_id = p_second and b.blocked_id = p_first)
  );
$$;
-- Internal helpers: only reachable from the definer functions below.
revoke all on function public.penguin_chat_lock_sender(uuid) from public, anon, authenticated;
revoke all on function public.penguin_chat_lock_pair(uuid, uuid) from public, anon, authenticated;
revoke all on function public.penguin_chat_pair_blocked(uuid, uuid) from public, anon, authenticated;

-- Returns the caller's conversation with another student, creating it if needed.
-- An existing conversation is returned even when the pair is blocked, so its
-- history stays readable; only creating a new one is refused.
create function public.get_or_create_conversation(p_other_user_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  low_id uuid;
  high_id uuid;
  found_id uuid;
begin
  if caller is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if p_other_user_id is null or p_other_user_id = caller then
    raise exception using errcode = '22023', message = 'Choose another student';
  end if;
  if not exists (select 1 from public.profiles p where p.id = caller and p.onboarding_completed) then
    raise exception using errcode = '42501', message = 'Complete your profile first';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_other_user_id and p.onboarding_completed) then
    raise exception using errcode = 'PC001', message = 'Messaging unavailable';
  end if;

  low_id := least(caller, p_other_user_id);
  high_id := greatest(caller, p_other_user_id);
  perform public.penguin_chat_lock_sender(caller);
  perform public.penguin_chat_lock_pair(low_id, high_id);

  select c.id into found_id from public.conversations c
    where c.user_low = low_id and c.user_high = high_id;
  if found_id is not null then
    return found_id;
  end if;

  if public.penguin_chat_pair_blocked(caller, p_other_user_id) then
    raise exception using errcode = 'PC001', message = 'Messaging unavailable';
  end if;
  if (select count(*) from public.conversations c
        where c.created_by = caller and c.created_at > pg_catalog.clock_timestamp() - interval '1 day')
      >= public.penguin_chat_conversation_limit_per_day() then
    raise exception using errcode = 'PC002', message = 'Conversation limit reached';
  end if;

  insert into public.conversations (user_low, user_high, created_by, created_at)
    values (low_id, high_id, caller, pg_catalog.clock_timestamp())
    returning id into found_id;
  return found_id;
end;
$$;

-- Stores one message. p_message_id is generated by the client and makes the call
-- safe to repeat: the same identifier with the same conversation and text returns
-- the stored row; with anything different it is rejected.
create function public.send_message_idempotent(
  p_message_id uuid,
  p_conversation_id uuid,
  p_content text
)
returns table (
  id uuid,
  conversation_id uuid,
  sender_id uuid,
  content text,
  created_at timestamptz,
  idempotent_replay boolean
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
  existing public.messages%rowtype;
  conversation public.conversations%rowtype;
  other_id uuid;
  stored_at timestamptz;
begin
  if caller is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if p_message_id is null or p_conversation_id is null or p_content is null then
    raise exception using errcode = '22023', message = 'Invalid message';
  end if;

  perform public.penguin_chat_lock_sender(caller);

  -- A repeated request is answered before any block or limit check, so a retry
  -- after a lost response never fails and never counts twice.
  select m.* into existing from public.messages m where m.id = p_message_id;
  if existing.id is not null then
    if existing.sender_id is distinct from caller
      or existing.conversation_id is distinct from p_conversation_id
      or existing.content is distinct from p_content then
      raise exception using errcode = '22023', message = 'Request identifier belongs to a different message';
    end if;
    return query select existing.id, existing.conversation_id, existing.sender_id,
      existing.content, existing.created_at, true;
    return;
  end if;

  select c.* into conversation from public.conversations c where c.id = p_conversation_id;
  -- Same answer for "does not exist" and "not yours".
  if conversation.id is null
    or (conversation.user_low is distinct from caller and conversation.user_high is distinct from caller) then
    raise exception using errcode = '42501', message = 'Conversation unavailable';
  end if;
  other_id := case when conversation.user_low = caller then conversation.user_high else conversation.user_low end;
  if other_id is null then
    raise exception using errcode = 'PC001', message = 'Messaging unavailable';
  end if;

  perform public.penguin_chat_lock_pair(caller, other_id);

  if public.penguin_chat_pair_blocked(caller, other_id) then
    raise exception using errcode = 'PC001', message = 'Messaging unavailable';
  end if;
  if (select count(*) from public.messages m
        where m.sender_id = caller and m.created_at > pg_catalog.clock_timestamp() - interval '1 minute')
      >= public.penguin_chat_message_limit_per_minute() then
    raise exception using errcode = 'PC002', message = 'Message limit reached';
  end if;

  -- Taken after the locks, so messages in one conversation are stamped in the
  -- order they are stored.
  stored_at := pg_catalog.clock_timestamp();
  insert into public.messages as stored (id, conversation_id, sender_id, content, created_at)
    values (p_message_id, p_conversation_id, caller, p_content, stored_at)
    returning stored.id, stored.conversation_id, stored.sender_id, stored.content, stored.created_at
    into existing;

  update public.conversations c
    set last_message_at = existing.created_at,
        last_message_sender_id = caller,
        last_message_preview = pg_catalog.left(existing.content, 140)
    where c.id = p_conversation_id;

  return query select existing.id, existing.conversation_id, existing.sender_id,
    existing.content, existing.created_at, false;
end;
$$;

-- Blocks another student for the caller. Repeating it is harmless.
create function public.block_user(p_blocked_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
begin
  if caller is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if p_blocked_id is null or p_blocked_id = caller then
    raise exception using errcode = '22023', message = 'Choose another student';
  end if;
  if not exists (select 1 from public.profiles p where p.id = p_blocked_id) then
    raise exception using errcode = '22023', message = 'Choose another student';
  end if;
  perform public.penguin_chat_lock_pair(caller, p_blocked_id);
  insert into public.user_blocks (blocker_id, blocked_id)
    values (caller, p_blocked_id)
    on conflict on constraint user_blocks_pkey do nothing;
end;
$$;

-- Removes the caller's own block. Never sends anything.
create function public.unblock_user(p_blocked_id uuid)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  -- Row-level security limits this to the caller's own rows.
  delete from public.user_blocks b
    where b.blocker_id = (select auth.uid()) and b.blocked_id = p_blocked_id;
end;
$$;

-- Moves the caller's own read cursor for one of their conversations to now.
create function public.mark_conversation_read(p_conversation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller uuid := (select auth.uid());
begin
  if caller is null then
    raise exception using errcode = '42501', message = 'Authentication required';
  end if;
  if not exists (
    select 1 from public.conversations c
    where c.id = p_conversation_id and caller in (c.user_low, c.user_high)
  ) then
    raise exception using errcode = '42501', message = 'Conversation unavailable';
  end if;
  insert into public.conversation_reads as r (conversation_id, user_id, last_read_at)
    values (p_conversation_id, caller, pg_catalog.clock_timestamp())
    on conflict on constraint conversation_reads_pkey
    do update set last_read_at = excluded.last_read_at;
end;
$$;

revoke all on function public.get_or_create_conversation(uuid) from public, anon, authenticated;
revoke all on function public.send_message_idempotent(uuid, uuid, text) from public, anon, authenticated;
revoke all on function public.block_user(uuid) from public, anon, authenticated;
revoke all on function public.unblock_user(uuid) from public, anon, authenticated;
revoke all on function public.mark_conversation_read(uuid) from public, anon, authenticated;
grant execute on function public.get_or_create_conversation(uuid) to authenticated;
grant execute on function public.send_message_idempotent(uuid, uuid, text) to authenticated;
grant execute on function public.block_user(uuid) to authenticated;
grant execute on function public.unblock_user(uuid) to authenticated;
grant execute on function public.mark_conversation_read(uuid) to authenticated;

comment on table public.conversations is
  'One-to-one conversations. A participant column is NULL after that student deleted their account.';
comment on table public.messages is
  'Chat messages. Written only by send_message_idempotent. No automatic expiry.';
comment on function public.send_message_idempotent(uuid, uuid, text) is
  'Definer write path: validates sender, membership, blocks and rate limits, then stores the message and summary.';

commit;
