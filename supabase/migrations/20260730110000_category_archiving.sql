-- Categories need the same non-destructive archival behavior as accounts.
-- Historical transactions keep their foreign-key references; archived
-- categories are excluded only from future entry choices.

begin;

alter table public.categories
  add column if not exists is_archived boolean not null default false;

create index if not exists categories_user_archived_idx
  on public.categories (user_id, is_archived, kind, name);

comment on column public.categories.is_archived is
  'Hides a category from future selection without removing historical references.';

commit;
