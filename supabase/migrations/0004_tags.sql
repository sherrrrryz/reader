-- User-scoped tags + document<->tag join. Tags are reusable across the
-- user's documents; renaming a tag updates every document that references it.

create table if not exists public.tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name citext not null,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);
create index if not exists tags_user_idx on public.tags(user_id, name);

alter table public.tags enable row level security;
create policy "tags_select_own" on public.tags for select using (auth.uid() = user_id);
create policy "tags_insert_own" on public.tags for insert with check (auth.uid() = user_id);
create policy "tags_update_own" on public.tags for update using (auth.uid() = user_id);
create policy "tags_delete_own" on public.tags for delete using (auth.uid() = user_id);

create table if not exists public.document_tags (
  document_id uuid not null references public.documents(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (document_id, tag_id)
);
create index if not exists document_tags_tag_idx on public.document_tags(tag_id);
create index if not exists document_tags_user_idx on public.document_tags(user_id);

alter table public.document_tags enable row level security;
create policy "document_tags_select_own" on public.document_tags for select using (auth.uid() = user_id);
create policy "document_tags_insert_own" on public.document_tags for insert with check (auth.uid() = user_id);
create policy "document_tags_delete_own" on public.document_tags for delete using (auth.uid() = user_id);
