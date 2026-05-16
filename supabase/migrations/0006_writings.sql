-- Writing tab: writings, versioned content, inline comments.

-- ============ writings ============
create table if not exists public.writings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists writings_user_idx on public.writings(user_id, updated_at desc);
create index if not exists writings_title_trgm on public.writings using gin (title gin_trgm_ops);

alter table public.writings enable row level security;
create policy "writings_select_own" on public.writings for select using (auth.uid() = user_id);
create policy "writings_insert_own" on public.writings for insert with check (auth.uid() = user_id);
create policy "writings_update_own" on public.writings for update using (auth.uid() = user_id);
create policy "writings_delete_own" on public.writings for delete using (auth.uid() = user_id);

-- ============ writing_versions ============
create table if not exists public.writing_versions (
  id uuid primary key default gen_random_uuid(),
  writing_id uuid not null references public.writings(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null default '',
  version_number int not null,
  created_at timestamptz not null default now(),
  unique (writing_id, version_number)
);
create index if not exists writing_versions_writing_idx
  on public.writing_versions(writing_id, version_number desc);

alter table public.writing_versions enable row level security;
create policy "writing_versions_select_own" on public.writing_versions for select using (auth.uid() = user_id);
create policy "writing_versions_insert_own" on public.writing_versions for insert with check (auth.uid() = user_id);
create policy "writing_versions_update_own" on public.writing_versions for update using (auth.uid() = user_id);
create policy "writing_versions_delete_own" on public.writing_versions for delete using (auth.uid() = user_id);

-- ============ writing_comments ============
create table if not exists public.writing_comments (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references public.writing_versions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  selected_text text not null default '',
  range_start int not null,
  range_end int not null,
  body text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (range_end >= range_start)
);
create index if not exists writing_comments_version_idx on public.writing_comments(version_id);

alter table public.writing_comments enable row level security;
create policy "writing_comments_select_own" on public.writing_comments for select using (auth.uid() = user_id);
create policy "writing_comments_insert_own" on public.writing_comments for insert with check (auth.uid() = user_id);
create policy "writing_comments_update_own" on public.writing_comments for update using (auth.uid() = user_id);
create policy "writing_comments_delete_own" on public.writing_comments for delete using (auth.uid() = user_id);
