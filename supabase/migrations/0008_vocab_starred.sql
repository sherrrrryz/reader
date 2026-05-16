-- Star/favorite flag on vocabulary entries. Used by the WordCard star button
-- (both in the reader sidebar and the vocabulary page) and the "Starred"
-- filter in the vocabulary list.
alter table public.vocabulary
  add column if not exists starred boolean not null default false;

create index if not exists vocab_user_starred_idx
  on public.vocabulary(user_id, starred)
  where starred = true;
