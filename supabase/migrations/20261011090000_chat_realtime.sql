-- Sprint 6B: live one-to-one chat.
--
-- NOT APPLIED to the hosted project. Apply only after approval.
--
-- Adds, without changing any Sprint 6A function, policy or grant:
--   1. Read receipts through one function that answers "which of my messages has
--      the other student read?". The read cursor itself stays visible to its owner
--      only, exactly as in 6A: no timestamp of the other student is exposed.
--   2. Authorization for one private broadcast topic per conversation
--      ("chat:<conversation id>"), used for typing and "I just read this" signals.
--      Presence is not allowed.
--   3. The three chat tables in the Realtime publication, so row changes are
--      streamed. Realtime applies row-level security and column grants per
--      subscriber, so a student still receives only rows they could select.
--
-- It changes no existing row. Nothing here stores typing or presence, and clients
-- gain no write access.

-- Helpers live in a schema of their own that the API does not expose, so they
-- cannot be called as remote procedures. It is separate from penguin_private
-- (media cleanup), whose access for signed-in students stays revoked. A plain
-- "create schema" is used on purpose: if the name were ever taken, the migration
-- must fail, not reuse it.
create schema penguin_chat_private;
revoke all on schema penguin_chat_private from public, anon, authenticated, service_role;
grant usage on schema penguin_chat_private to authenticated;

-- ---------------------------------------------------------------------------
-- 1. Read receipts
-- ---------------------------------------------------------------------------

-- What the other participant may learn from a read cursor. It follows
-- last_read_at while the two students can message each other and stands still
-- while either has blocked the other. So a block never turns "Read" back into
-- "Sent", and opening the conversation during a block tells the other side nothing.
-- Clients cannot select this column: 6A grants SELECT column by column.
alter table public.conversation_reads add column receipt_at timestamptz;

create function penguin_chat_private.set_read_receipt()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  pair record;
begin
  select c.user_low, c.user_high into pair
  from public.conversations c where c.id = new.conversation_id;
  if pair.user_low is not null and pair.user_high is not null
     and not public.penguin_chat_pair_blocked(pair.user_low, pair.user_high) then
    new.receipt_at := new.last_read_at;
  elsif tg_op = 'UPDATE' then
    new.receipt_at := old.receipt_at;
  else
    new.receipt_at := null;
  end if;
  return new;
end;
$$;
revoke all on function penguin_chat_private.set_read_receipt() from public, anon, authenticated, service_role;

create trigger penguin_read_receipt
  before insert or update on public.conversation_reads
  for each row execute function penguin_chat_private.set_read_receipt();

-- The newest message the caller sent in this conversation that the other
-- participant has read, or null. Null also for a conversation that does not
-- exist or is not the caller's, so it cannot be used to probe for either.
-- It returns an identifier of the caller's own message and nothing else.
create function public.get_read_receipt(p_conversation_id uuid)
returns uuid language sql stable security definer set search_path = '' as $$
  select m.id
  from public.conversations c
  join public.conversation_reads r
    on r.conversation_id = c.id
   and r.user_id = case when c.user_low = (select auth.uid()) then c.user_high else c.user_low end
  join public.messages m
    on m.conversation_id = c.id
   and m.sender_id = (select auth.uid())
   and m.created_at <= r.receipt_at
  where c.id = p_conversation_id
    and (select auth.uid()) in (c.user_low, c.user_high)
  order by m.created_at desc, m.id desc
  limit 1;
$$;
revoke all on function public.get_read_receipt(uuid) from public, anon, authenticated;
grant execute on function public.get_read_receipt(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Private conversation topic (typing, "just read")
-- ---------------------------------------------------------------------------

-- True when the caller is one of the two participants of the conversation, both
-- accounts still exist, and neither has blocked the other. Definer, because it
-- must see a block made by the other student, which the caller cannot read.
create function penguin_chat_private.chat_peer_visible(p_conversation_id uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.conversations c
    where c.id = p_conversation_id
      and c.user_low is not null
      and c.user_high is not null
      and (select auth.uid()) in (c.user_low, c.user_high)
      and not public.penguin_chat_pair_blocked(c.user_low, c.user_high)
  );
$$;
revoke all on function penguin_chat_private.chat_peer_visible(uuid) from public, anon, authenticated, service_role;
grant execute on function penguin_chat_private.chat_peer_visible(uuid) to authenticated;

-- A topic is allowed only in the exact form "chat:<lower-case uuid>" and only for
-- that conversation's two participants, under the rule above. Anything else,
-- including another prefix or trailing text, is refused.
create function penguin_chat_private.chat_topic_allowed(p_topic text)
returns boolean language plpgsql stable security definer set search_path = '' as $$
begin
  if p_topic is null
     or p_topic !~ '^chat:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    return false;
  end if;
  return penguin_chat_private.chat_peer_visible(substr(p_topic, 6)::uuid);
end;
$$;
revoke all on function penguin_chat_private.chat_topic_allowed(text) from public, anon, authenticated, service_role;
grant execute on function penguin_chat_private.chat_topic_allowed(text) to authenticated;

-- Realtime checks these when a client joins a private channel. Only broadcast is
-- covered; with no policy for presence, presence on these topics is refused.
-- The table exists on Supabase projects; a bare Postgres used for tests may lack it.
do $$
begin
  if to_regclass('realtime.messages') is not null then
    execute $policy$
      create policy penguin_chat_typing_receive on realtime.messages
        for select to authenticated
        using (extension = 'broadcast' and penguin_chat_private.chat_topic_allowed((select realtime.topic())))
    $policy$;
    execute $policy$
      create policy penguin_chat_typing_send on realtime.messages
        for insert to authenticated
        with check (extension = 'broadcast' and penguin_chat_private.chat_topic_allowed((select realtime.topic())))
    $policy$;
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Row changes
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime
      add table public.messages, public.conversations, public.conversation_reads;
  end if;
end;
$$;
