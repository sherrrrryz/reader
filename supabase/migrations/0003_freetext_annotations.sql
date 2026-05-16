-- FreeText annotations (draggable text boxes the user creates with the
-- toolbar Text tool, or that come embedded in an imported PDF).
create table if not exists public.freetext_annotations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  page_number int not null,
  contents text not null default '',
  range_v2 jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists freetext_doc_idx on public.freetext_annotations(document_id, page_number);
create index if not exists freetext_user_idx on public.freetext_annotations(user_id, created_at desc);

alter table public.freetext_annotations enable row level security;
create policy "freetext_select_own" on public.freetext_annotations for select using (auth.uid() = user_id);
create policy "freetext_insert_own" on public.freetext_annotations for insert with check (auth.uid() = user_id);
create policy "freetext_update_own" on public.freetext_annotations for update using (auth.uid() = user_id);
create policy "freetext_delete_own" on public.freetext_annotations for delete using (auth.uid() = user_id);
