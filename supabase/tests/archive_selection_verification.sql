-- SQL Editor verification for non-destructive category and account archival.
-- Archived rows are excluded from future selectors but remain attached to
-- historical transactions. All fixture data is rolled back.

begin;

create temp table archive_test_context (
  user_id uuid,
  account_id uuid,
  category_id uuid,
  transaction_id uuid
);

do $$
declare
  v_user_id uuid := gen_random_uuid();
  v_account_id uuid;
  v_category_id uuid;
  v_transaction_id uuid;
begin
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values (
    v_user_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'archive-test-' || v_user_id::text || '@example.test', crypt('not-used', gen_salt('bf')),
    now(), '{}'::jsonb, '{}'::jsonb, now(), now()
  );

  insert into public.accounts (user_id, name, type)
  values (v_user_id, 'Archive test cash', 'cash')
  returning id into v_account_id;

  insert into public.categories (user_id, name, kind)
  values (v_user_id, 'Archive test expense', 'expense')
  returning id into v_category_id;

  insert into public.transactions (
    user_id, account_id, type, category_id, amount, direction, date
  ) values (
    v_user_id, v_account_id, 'expense', v_category_id, 75, 'debit', '2026-07-01'
  ) returning id into v_transaction_id;

  insert into archive_test_context values (v_user_id, v_account_id, v_category_id, v_transaction_id);
end;
$$;

update public.categories set is_archived = true
where id = (select category_id from archive_test_context);

update public.accounts set is_archived = true
where id = (select account_id from archive_test_context);

set constraints all immediate;

do $$
declare
  v_context archive_test_context%rowtype;
begin
  select * into v_context from archive_test_context;

  if not exists (
    select 1 from public.transactions
    where id = v_context.transaction_id
      and account_id = v_context.account_id
      and category_id = v_context.category_id
  ) then
    raise exception 'Expected archived account and category to remain linked to historical transaction';
  end if;

  if exists (
    select 1 from public.categories
    where id = v_context.category_id and not is_archived
  ) then
    raise exception 'Expected archived category to be excluded from new transaction selection';
  end if;

  if exists (
    select 1 from public.accounts
    where id = v_context.account_id and not is_archived
  ) then
    raise exception 'Expected archived account to be excluded from new transaction selection';
  end if;
end;
$$;

rollback;
