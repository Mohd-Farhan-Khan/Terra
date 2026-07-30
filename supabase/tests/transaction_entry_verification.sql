-- SQL Editor verification for ordinary income, ordinary expense, split expense,
-- and atomic transfer. It prints the account balances and rolls back.

begin;

create temp table entry_test_context (
  user_id uuid,
  checking_id uuid,
  savings_id uuid,
  income_category_id uuid,
  food_category_id uuid,
  transport_category_id uuid
);

do $$
declare
  v_user_id uuid := gen_random_uuid();
  v_checking_id uuid;
  v_savings_id uuid;
  v_income_category_id uuid;
  v_food_category_id uuid;
  v_transport_category_id uuid;
begin
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values (
    v_user_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'entry-test-' || v_user_id::text || '@example.test', crypt('not-used', gen_salt('bf')),
    now(), '{}'::jsonb, '{}'::jsonb, now(), now()
  );

  insert into public.categories (user_id, name, kind) values (v_user_id, 'Entry test income', 'income') returning id into v_income_category_id;
  insert into public.categories (user_id, name, kind) values (v_user_id, 'Entry test food', 'expense') returning id into v_food_category_id;
  insert into public.categories (user_id, name, kind) values (v_user_id, 'Entry test transport', 'expense') returning id into v_transport_category_id;
  insert into public.accounts (user_id, name, type) values (v_user_id, 'Entry test checking', 'bank') returning id into v_checking_id;
  insert into public.accounts (user_id, name, type, is_savings) values (v_user_id, 'Entry test savings', 'bank', true) returning id into v_savings_id;

  insert into entry_test_context values (v_user_id, v_checking_id, v_savings_id, v_income_category_id, v_food_category_id, v_transport_category_id);
end;
$$;

-- Plain income insert: checking +1,000.
insert into public.transactions (user_id, account_id, type, category_id, amount, direction, date)
select user_id, checking_id, 'income', income_category_id, 1000, 'credit', current_date from entry_test_context;

-- Plain expense insert: checking -200.
insert into public.transactions (user_id, account_id, type, category_id, amount, direction, date)
select user_id, checking_id, 'expense', food_category_id, 200, 'debit', current_date from entry_test_context;

-- Split expense RPC: checking -300, with two categorized splits of 120 + 180.
select public.create_expense_with_splits(
  (select checking_id from entry_test_context),
  300,
  current_date,
  'Entry test split',
  jsonb_build_array(
    jsonb_build_object('category_id', (select food_category_id from entry_test_context), 'amount', 120),
    jsonb_build_object('category_id', (select transport_category_id from entry_test_context), 'amount', 180)
  ),
  (select user_id from entry_test_context)
);

-- Atomic transfer RPC: checking -150; savings +150.
select * from public.create_transfer(
  (select checking_id from entry_test_context),
  (select savings_id from entry_test_context),
  150,
  current_date,
  'Entry test transfer',
  'completed',
  (select user_id from entry_test_context)
);

set constraints all immediate;

-- Expected: checking 350.00 (= 1000 - 200 - 300 - 150); savings 150.00.
select account_name, balance
from public.account_balances
where user_id = (select user_id from entry_test_context)
order by account_name;

do $$
begin
  if (select balance from public.account_balances where account_name = 'Entry test checking') <> 350 then
    raise exception 'Expected checking balance 350';
  end if;
  if (select balance from public.account_balances where account_name = 'Entry test savings') <> 150 then
    raise exception 'Expected savings balance 150';
  end if;
end;
$$;

rollback;
