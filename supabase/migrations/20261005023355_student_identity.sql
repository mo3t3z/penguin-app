-- Additive migration. Abort on existing objects instead of replacing user data.
begin;

create table public.institutions (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 200),
  slug text not null unique check (char_length(slug) between 1 and 120 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  country text not null check (country ~ '^[A-Z]{2}$'), -- ISO 3166-1 alpha-2
  city text check (char_length(btrim(city)) between 1 and 120),
  created_at timestamptz not null default now()
);

-- Global areas of study. Later institution-specific programs can reference these IDs.
create table public.fields (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  slug text not null unique check (char_length(slug) between 1 and 120 and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  created_at timestamptz not null default now()
);

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  display_name text,
  avatar_url text,
  institution_id uuid references public.institutions(id) on delete restrict,
  field_id uuid references public.fields(id) on delete restrict,
  study_level text,
  bio text,
  onboarding_completed boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Store canonical lowercase usernames: uniqueness is therefore case-insensitive.
  constraint profiles_username_format check (char_length(username) between 3 and 30 and username ~ '^[a-z0-9][a-z0-9_]*$'),
  constraint profiles_display_name_length check (char_length(btrim(display_name)) between 1 and 80 and char_length(display_name) <= 80),
  constraint profiles_avatar_url_format check (char_length(avatar_url) <= 2048 and avatar_url ~ '^https://[^[:space:]]+$'),
  constraint profiles_bio_length check (char_length(bio) <= 500),
  constraint profiles_study_level_values check (study_level in ('secondary', 'vocational', 'undergraduate', 'postgraduate', 'doctoral', 'other')),
  constraint profiles_onboarding_requirements check (
    not onboarding_completed or (
      username is not null and display_name is not null and
      institution_id is not null and field_id is not null and study_level is not null
    )
  )
);

create index profiles_institution_id_idx on public.profiles(institution_id);
create index profiles_field_id_idx on public.profiles(field_id);
-- Unique constraints already index username and reference slugs.
-- Reference lists are small; defer substring-search indexes until justified.

alter table public.profiles enable row level security;
alter table public.institutions enable row level security;
alter table public.fields enable row level security;

revoke all on public.profiles, public.institutions, public.fields from public, anon, authenticated;
grant select on public.profiles, public.institutions, public.fields to authenticated;
-- Identity and timestamps cannot be assigned by the mobile client.
grant update (username, display_name, avatar_url, institution_id, field_id, study_level, bio, onboarding_completed)
  on public.profiles to authenticated;
grant all on public.profiles, public.institutions, public.fields to service_role;

create policy profiles_authenticated_read on public.profiles for select to authenticated using (true);
create policy profiles_owner_update on public.profiles for update to authenticated
  using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
create policy institutions_authenticated_read on public.institutions for select to authenticated using (true);
create policy fields_authenticated_read on public.fields for select to authenticated using (true);
-- No client INSERT/DELETE policies or grants. Reference writes are administrative only.

create function public.penguin_prepare_profile_update()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  new.username := lower(btrim(new.username));
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.penguin_prepare_profile_update() from public, anon, authenticated;
create trigger penguin_profile_before_update before update on public.profiles
  for each row execute function public.penguin_prepare_profile_update();

create function public.penguin_create_auth_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  -- Never copy untrusted/optional auth metadata into constrained profile fields.
  insert into public.profiles (id) values (new.id) on conflict (id) do nothing;
  return new;
end;
$$;
-- Trigger-only definer: unavailable as a client RPC.
revoke all on function public.penguin_create_auth_profile() from public, anon, authenticated;
create trigger penguin_auth_user_created after insert on auth.users
  for each row execute function public.penguin_create_auth_profile();

-- Idempotent existing-user backfill. Never overwrites a profile or auth record.
insert into public.profiles (id)
select id from auth.users
on conflict (id) do nothing;

commit;
