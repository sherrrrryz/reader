-- Per-document notes.

create table if not exists public.document_notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  body text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists document_notes_doc_idx
  on public.document_notes(document_id, created_at desc);
create index if not exists document_notes_user_idx
  on public.document_notes(user_id, updated_at desc);

alter table public.document_notes enable row level security;
create policy "document_notes_select_own" on public.document_notes for select using (auth.uid() = user_id);
create policy "document_notes_insert_own" on public.document_notes for insert with check (auth.uid() = user_id);
create policy "document_notes_update_own" on public.document_notes for update using (auth.uid() = user_id);
create policy "document_notes_delete_own" on public.document_notes for delete using (auth.uid() = user_id);
