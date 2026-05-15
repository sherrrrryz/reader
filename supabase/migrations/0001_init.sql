-- Reader app initial schema
-- Extensions
create extension if not exists pgcrypto;
create extension if not exists pg_trgm;
create extension if not exists citext;

-- ============ documents ============
create table if not exists public.documents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  storage_path text not null,
  page_count int default 0,
  ocr_used boolean default false,
  extraction_status text not null default 'pending', -- pending|processing|done|error
  extraction_error text,
  created_at timestamptz not null default now()
);
create index if not exists documents_user_idx on public.documents(user_id, created_at desc);
create index if not exists documents_title_trgm on public.documents using gin (title gin_trgm_ops);

alter table public.documents enable row level security;
create policy "documents_select_own" on public.documents for select using (auth.uid() = user_id);
create policy "documents_insert_own" on public.documents for insert with check (auth.uid() = user_id);
create policy "documents_update_own" on public.documents for update using (auth.uid() = user_id);
create policy "documents_delete_own" on public.documents for delete using (auth.uid() = user_id);

-- ============ document_pages ============
create table if not exists public.document_pages (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  page_number int not null,
  text_content text not null default '',
  unique (document_id, page_number)
);
create index if not exists pages_doc_idx on public.document_pages(document_id, page_number);
create index if not exists pages_text_trgm on public.document_pages using gin (text_content gin_trgm_ops);

alter table public.document_pages enable row level security;
create policy "pages_select_own" on public.document_pages for select using (auth.uid() = user_id);
create policy "pages_insert_own" on public.document_pages for insert with check (auth.uid() = user_id);
create policy "pages_update_own" on public.document_pages for update using (auth.uid() = user_id);
create policy "pages_delete_own" on public.document_pages for delete using (auth.uid() = user_id);

-- ============ vocabulary ============
create table if not exists public.vocabulary (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  word citext not null,
  phonetic text,
  definition_en text,
  definition_zh text,
  synonyms jsonb default '[]'::jsonb,
  examples jsonb default '[]'::jsonb,
  status text not null default 'unlearned', -- learned|unlearned
  created_at timestamptz not null default now(),
  unique (user_id, word)
);
create index if not exists vocab_user_idx on public.vocabulary(user_id, created_at desc);
create index if not exists vocab_word_trgm on public.vocabulary using gin (word gin_trgm_ops);

alter table public.vocabulary enable row level security;
create policy "vocab_select_own" on public.vocabulary for select using (auth.uid() = user_id);
create policy "vocab_insert_own" on public.vocabulary for insert with check (auth.uid() = user_id);
create policy "vocab_update_own" on public.vocabulary for update using (auth.uid() = user_id);
create policy "vocab_delete_own" on public.vocabulary for delete using (auth.uid() = user_id);

-- ============ highlights ============
create table if not exists public.highlights (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  vocabulary_id uuid references public.vocabulary(id) on delete set null,
  page_number int not null,
  word text not null,
  context_sentence text,
  range_json jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists highlights_doc_idx on public.highlights(document_id, page_number);
create index if not exists highlights_user_idx on public.highlights(user_id, created_at desc);

alter table public.highlights enable row level security;
create policy "highlights_select_own" on public.highlights for select using (auth.uid() = user_id);
create policy "highlights_insert_own" on public.highlights for insert with check (auth.uid() = user_id);
create policy "highlights_update_own" on public.highlights for update using (auth.uid() = user_id);
create policy "highlights_delete_own" on public.highlights for delete using (auth.uid() = user_id);

-- ============ underlines (saved sentences) ============
create table if not exists public.underlines (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  document_id uuid not null references public.documents(id) on delete cascade,
  page_number int not null,
  sentence text not null,
  range_json jsonb not null,
  created_at timestamptz not null default now()
);
create index if not exists underlines_doc_idx on public.underlines(document_id, page_number);
create index if not exists underlines_user_idx on public.underlines(user_id, created_at desc);
create index if not exists underlines_sentence_trgm on public.underlines using gin (sentence gin_trgm_ops);

alter table public.underlines enable row level security;
create policy "underlines_select_own" on public.underlines for select using (auth.uid() = user_id);
create policy "underlines_insert_own" on public.underlines for insert with check (auth.uid() = user_id);
create policy "underlines_update_own" on public.underlines for update using (auth.uid() = user_id);
create policy "underlines_delete_own" on public.underlines for delete using (auth.uid() = user_id);

-- ============ storage bucket policies (bucket created via dashboard or supabase storage api) ============
-- Bucket 'pdfs' is expected to exist; policies below assume user_id prefix in object name.
do $$
begin
  -- Only create policies if bucket exists (idempotent)
  if exists (select 1 from storage.buckets where id = 'pdfs') then
    -- read own
    if not exists (select 1 from pg_policies where policyname = 'pdfs_read_own' and tablename = 'objects' and schemaname = 'storage') then
      execute $p$create policy "pdfs_read_own" on storage.objects for select to authenticated using (bucket_id = 'pdfs' and (storage.foldername(name))[1] = auth.uid()::text)$p$;
    end if;
    if not exists (select 1 from pg_policies where policyname = 'pdfs_insert_own' and tablename = 'objects' and schemaname = 'storage') then
      execute $p$create policy "pdfs_insert_own" on storage.objects for insert to authenticated with check (bucket_id = 'pdfs' and (storage.foldername(name))[1] = auth.uid()::text)$p$;
    end if;
    if not exists (select 1 from pg_policies where policyname = 'pdfs_update_own' and tablename = 'objects' and schemaname = 'storage') then
      execute $p$create policy "pdfs_update_own" on storage.objects for update to authenticated using (bucket_id = 'pdfs' and (storage.foldername(name))[1] = auth.uid()::text)$p$;
    end if;
    if not exists (select 1 from pg_policies where policyname = 'pdfs_delete_own' and tablename = 'objects' and schemaname = 'storage') then
      execute $p$create policy "pdfs_delete_own" on storage.objects for delete to authenticated using (bucket_id = 'pdfs' and (storage.foldername(name))[1] = auth.uid()::text)$p$;
    end if;
  end if;
end $$;
