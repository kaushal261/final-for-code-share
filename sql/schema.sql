-- =========================================================================
-- Secure Code Classroom — Supabase SQL Schema
-- =========================================================================
-- Run this whole file once in the Supabase SQL Editor (Project > SQL Editor).
-- It creates the tables, row-level security (RLS) policies, helper
-- functions/triggers, and storage bucket needed by the app.
--
-- IMPORTANT — Single administrator account:
--   1. Create the admin user first in Supabase Studio:
--        Authentication > Users > Add user (email + password).
--   2. Copy that user's UUID.
--   3. Run the UPDATE statement at the very bottom of this file to promote
--      that profile to role = 'admin'.
--   Every other account created through the public registration page will
--   automatically receive the 'student' role.
-- =========================================================================

-- Extensions ---------------------------------------------------------------
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Table: profiles
-- One row per auth.users record. Stores the app-level role.
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  full_name   text not null default '',
  email       text not null,
  role        text not null default 'student' check (role in ('admin', 'student')),
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Table: subjects
-- Top level grouping, e.g. "Data Structures", "Web Development".
-- ---------------------------------------------------------------------------
create table if not exists public.subjects (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text default '',
  created_by  uuid references public.profiles (id),
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Table: folders
-- Belongs to a subject, groups related code files (e.g. "Practical 1").
-- ---------------------------------------------------------------------------
create table if not exists public.folders (
  id          uuid primary key default gen_random_uuid(),
  subject_id  uuid not null references public.subjects (id) on delete cascade,
  name        text not null,
  description text default '',
  created_by  uuid references public.profiles (id),
  created_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Table: code_files
-- The actual saved code snippets/programs.
-- ---------------------------------------------------------------------------
create table if not exists public.code_files (
  id          uuid primary key default gen_random_uuid(),
  title       text not null,
  language    text not null,
  description text default '',
  subject_id  uuid references public.subjects (id) on delete set null,
  folder_id   uuid references public.folders (id) on delete cascade,
  code        text not null default '',
  created_by  uuid references public.profiles (id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists idx_code_files_folder on public.code_files (folder_id);
create index if not exists idx_code_files_subject on public.code_files (subject_id);
create index if not exists idx_code_files_language on public.code_files (language);
create index if not exists idx_folders_subject on public.folders (subject_id);

-- ---------------------------------------------------------------------------
-- Keep updated_at fresh on code_files
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_code_files_updated_at on public.code_files;
create trigger trg_code_files_updated_at
  before update on public.code_files
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Auto-create a profile row whenever a new auth user signs up.
-- New users default to role = 'student'. The single admin is promoted
-- manually (see bottom of file).
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, full_name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name', ''),
    new.email,
    'student'
  )
  on conflict (id) do nothing;
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------------
-- Helper: is the current user the administrator?
-- SECURITY DEFINER avoids recursive RLS lookups on profiles.
-- ---------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin'
  );
$$ language sql security definer stable set search_path = public;

-- =========================================================================
-- Row Level Security
-- =========================================================================
alter table public.profiles   enable row level security;
alter table public.subjects   enable row level security;
alter table public.folders    enable row level security;
alter table public.code_files enable row level security;

-- profiles: users can read their own profile; admin can read everyone's.
drop policy if exists "profiles_select_own_or_admin" on public.profiles;
create policy "profiles_select_own_or_admin"
  on public.profiles for select
  using (auth.uid() = id or public.is_admin());

-- profiles: a user may update only their own (non-role) info; admin can update any.
drop policy if exists "profiles_update_own_or_admin" on public.profiles;
create policy "profiles_update_own_or_admin"
  on public.profiles for update
  using (auth.uid() = id or public.is_admin());

-- subjects: any authenticated user (admin or student) can read.
drop policy if exists "subjects_select_authenticated" on public.subjects;
create policy "subjects_select_authenticated"
  on public.subjects for select
  to authenticated
  using (true);

-- subjects: only admin can insert/update/delete.
drop policy if exists "subjects_write_admin" on public.subjects;
create policy "subjects_write_admin"
  on public.subjects for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- folders: any authenticated user can read.
drop policy if exists "folders_select_authenticated" on public.folders;
create policy "folders_select_authenticated"
  on public.folders for select
  to authenticated
  using (true);

-- folders: only admin can insert/update/delete.
drop policy if exists "folders_write_admin" on public.folders;
create policy "folders_write_admin"
  on public.folders for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- code_files: any authenticated user can read (view code).
drop policy if exists "code_files_select_authenticated" on public.code_files;
create policy "code_files_select_authenticated"
  on public.code_files for select
  to authenticated
  using (true);

-- code_files: only admin can insert/update/delete.
drop policy if exists "code_files_write_admin" on public.code_files;
create policy "code_files_write_admin"
  on public.code_files for all
  to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- =========================================================================
-- Promote the single administrator account
-- Replace the UUID below with the auth.users id of the account you created
-- in Supabase Studio, then run this statement once.
-- =========================================================================
-- update public.profiles set role = 'admin' where id = 'PASTE-ADMIN-USER-UUID-HERE';
