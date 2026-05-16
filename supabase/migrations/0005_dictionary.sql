-- Global self-hosted dictionary (Wiktionary via Kaikki + dictionaryapi.dev fallback)

create table if not exists public.dictionary (
  word citext primary key,
  pos text,
  phonetic text,
  definition_en text,
  definition_zh text,
  synonyms jsonb not null default '[]'::jsonb,
  examples jsonb not null default '[]'::jsonb,
  sounds jsonb not null default '[]'::jsonb,
  forms jsonb not null default '[]'::jsonb,
  source text not null default 'wiktionary',
  updated_at timestamptz not null default now()
);
create index if not exists dictionary_word_trgm on public.dictionary using gin (word gin_trgm_ops);

-- Inflected form -> lemma map (running -> run)
create table if not exists public.dictionary_forms (
  form citext primary key,
  lemma citext not null references public.dictionary(word) on delete cascade
);
create index if not exists dictionary_forms_lemma_idx on public.dictionary_forms(lemma);

alter table public.dictionary enable row level security;
alter table public.dictionary_forms enable row level security;

-- Public read; writes only via service role
create policy "dictionary_public_read"       on public.dictionary       for select using (true);
create policy "dictionary_forms_public_read" on public.dictionary_forms for select using (true);

-- Carry sounds/forms through the per-user vocabulary cache so the UI gets them.
alter table public.vocabulary add column if not exists sounds jsonb not null default '[]'::jsonb;
alter table public.vocabulary add column if not exists forms  jsonb not null default '[]'::jsonb;
alter table public.vocabulary add column if not exists source text;
