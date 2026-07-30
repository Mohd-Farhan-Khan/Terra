-- Manual Supabase SQL Editor verification fixture.
-- It creates all data inside a transaction, prints the calculated rows, checks
-- the expected values, and finally rolls everything back.

create temp table finance_test_context (
  user_id uuid,
  checking_id uuid,
  savings_id uuid,
  investment_id uuid,
  receivable_id uuid,
  payable_id uuid,
  food_category_id uuid
);

begin;

do $$
declare
  v_user_id uuid := gen_random_uuid();
  v_checking_id uuid;
  v_savings_id uuid;
  v_investment_id uuid;
  v_receivable_id uuid;
  v_payable_id uuid;
  v_salary_category_id uuid;
  v_refund_category_id uuid;
  v_food_category_id uuid;
  v_food_expense_id uuid;
begin
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  )
  values (
    v_user_id,
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'calculation-test-' || v_user_id::text || '@example.test',
    crypt('not-used-in-test', gen_salt('bf')),
    now(),
    '{}'::jsonb,
    '{}'::jsonb,
    now(),
    now()
  );

  insert into public.categories (user_id, name, kind)
  values (v_user_id, 'Test salary', 'income')
  returning id into v_salary_category_id;

  insert into public.categories (user_id, name, kind)
  values (v_user_id, 'Test refunds', 'income')
  returning id into v_refund_category_id;

  insert into public.categories (user_id, name, kind)
  values (v_user_id, 'Test food', 'expense')
  returning id into v_food_category_id;

  insert into public.accounts (user_id, name, type)
  values (v_user_id, 'Test checking', 'bank')
  returning id into v_checking_id;

  insert into public.accounts (user_id, name, type, is_savings)
  values (v_user_id, 'Test savings', 'bank', true)
  returning id into v_savings_id;

  insert into public.accounts (user_id, name, type)
  values (v_user_id, 'Test investment', 'investment')
  returning id into v_investment_id;

  insert into public.accounts (user_id, name, type)
  values (v_user_id, 'Test receivable', 'receivable')
  returning id into v_receivable_id;

  insert into public.accounts (user_id, name, type)
  values (v_user_id, 'Test payable', 'payable')
  returning id into v_payable_id;

  -- July starts with income 1,000, a food expense of 200, and a linked refund
  -- of 50. August and September expenses exercise the budget rollover chain.
  insert into public.transactions (
    user_id, account_id, type, category_id, amount, direction, date
  ) values (
    v_user_id, v_checking_id, 'income', v_salary_category_id, 1000, 'credit', '2026-07-01'
  );

  insert into public.transactions (
    user_id, account_id, type, category_id, amount, direction, date
  ) values (
    v_user_id, v_checking_id, 'expense', v_food_category_id, 200, 'debit', '2026-07-02'
  ) returning id into v_food_expense_id;

  insert into public.transactions (
    user_id, account_id, type, category_id, amount, direction, date, linked_refund_of
  ) values (
    v_user_id, v_checking_id, 'income', v_refund_category_id, 50, 'credit', '2026-07-05', v_food_expense_id
  );

  insert into public.transactions (
    user_id, account_id, type, category_id, amount, direction, date
  ) values
    (v_user_id, v_checking_id, 'expense', v_food_category_id, 380, 'debit', '2026-08-04'),
    (v_user_id, v_checking_id, 'expense', v_food_category_id, 350, 'debit', '2026-09-04');

  insert into public.budgets (user_id, category_id, month, planned_amount, rollover_enabled)
  values
    (v_user_id, v_food_category_id, '2026-07-01', 300, true),
    (v_user_id, v_food_category_id, '2026-08-01', 300, true),
    (v_user_id, v_food_category_id, '2026-09-01', 300, true);

  insert into finance_test_context
  values (
    v_user_id, v_checking_id, v_savings_id, v_investment_id,
    v_receivable_id, v_payable_id, v_food_category_id
  );
end;
$$;

-- Every call below creates a complete debit/credit pair in one transaction.
select * from public.create_transfer(
  (select checking_id from finance_test_context),
  (select savings_id from finance_test_context),
  100, '2026-07-10', 'Fund savings', 'completed',
  (select user_id from finance_test_context)
);

select * from public.create_transfer(
  (select checking_id from finance_test_context),
  (select investment_id from finance_test_context),
  100, '2026-07-11', 'Fund investment', 'completed',
  (select user_id from finance_test_context)
);

select * from public.create_transfer(
  (select checking_id from finance_test_context),
  (select receivable_id from finance_test_context),
  80, '2026-07-12', 'Loan to friend', 'completed',
  (select user_id from finance_test_context)
);

select * from public.create_transfer(
  (select payable_id from finance_test_context),
  (select checking_id from finance_test_context),
  20, '2026-07-13', 'Borrowing received', 'completed',
  (select user_id from finance_test_context)
);

-- Force all deferred transaction and transfer-pair validations now.
set constraints all immediate;

-- Expected account balances: checking -140, savings 100, investment 100,
-- receivable 80, payable -20. Net worth is 60 because receivable/payable are
-- excluded. The July savings rate is 200 / 1,000 = 0.20.
select account_name, account_type, balance
from public.account_balances
where user_id = (select user_id from finance_test_context)
order by account_name;

select month, expense_amount, refund_amount, actual_spend
from public.category_monthly_spend
where user_id = (select user_id from finance_test_context)
  and category_id = (select food_category_id from finance_test_context)
order by month;

select * from public.net_worth
where user_id = (select user_id from finance_test_context);

select * from public.savings_rate_monthly
where user_id = (select user_id from finance_test_context)
order by month;

-- Expected budget rows:
-- Jul: 300 planned + 0 carry - 150 actual = 150 remaining
-- Aug: 300 planned + 150 carry - 380 actual = 70 remaining
-- Sep: 300 planned + 70 carry - 350 actual = 20 remaining
select month, planned_amount, carry_in, available_amount, actual_spend, remaining_amount, rollover_enabled
from public.budget_vs_actual
where user_id = (select user_id from finance_test_context)
  and category_id = (select food_category_id from finance_test_context)
order by month;

do $$
declare
  v_user_id uuid := (select user_id from finance_test_context);
begin
  if (select balance from public.account_balances where user_id = v_user_id and account_name = 'Test checking') <> -140 then
    raise exception 'Expected checking balance -140';
  end if;
  if (select net_worth from public.net_worth where user_id = v_user_id) <> 60 then
    raise exception 'Expected net worth 60';
  end if;
  if (select actual_spend from public.category_monthly_spend where user_id = v_user_id and month = '2026-07-01') <> 150 then
    raise exception 'Expected July food spend 150';
  end if;
  if (select savings_rate from public.savings_rate_monthly where user_id = v_user_id and month = '2026-07-01') <> 0.2 then
    raise exception 'Expected July savings rate 0.2';
  end if;
  if (select remaining_amount from public.budget_vs_actual where user_id = v_user_id and month = '2026-09-01') <> 20 then
    raise exception 'Expected September remaining budget 20';
  end if;
end;
$$;

-- A UI rollover toggle persists only the previous month's flag. The reporting
-- view must recalculate every following month from that authoritative value.
update public.budgets
set rollover_enabled = false
where user_id = (select user_id from finance_test_context)
  and category_id = (select food_category_id from finance_test_context)
  and month = '2026-08-01';

do $$
declare
  v_user_id uuid := (select user_id from finance_test_context);
begin
  if (select carry_in from public.budget_vs_actual where user_id = v_user_id and month = '2026-09-01') <> 0 then
    raise exception 'Expected September carry-in to be 0 when August rollover is disabled';
  end if;
  if (select remaining_amount from public.budget_vs_actual where user_id = v_user_id and month = '2026-09-01') <> -50 then
    raise exception 'Expected September remaining budget -50 when August rollover is disabled';
  end if;
end;
$$;

update public.budgets
set rollover_enabled = true
where user_id = (select user_id from finance_test_context)
  and category_id = (select food_category_id from finance_test_context)
  and month = '2026-08-01';

do $$
declare
  v_user_id uuid := (select user_id from finance_test_context);
begin
  if (select carry_in from public.budget_vs_actual where user_id = v_user_id and month = '2026-09-01') <> 70 then
    raise exception 'Expected September carry-in to restore to 70 when August rollover is re-enabled';
  end if;
  if (select remaining_amount from public.budget_vs_actual where user_id = v_user_id and month = '2026-09-01') <> 20 then
    raise exception 'Expected September remaining budget to restore to 20 when August rollover is re-enabled';
  end if;
end;
$$;

-- Confirming a rule atomically records an expense and moves the next due date.
-- This runs after the budget fixture because it intentionally adds an expense.
insert into public.recurring_rules (
  user_id, name, account_id, category_id, amount, frequency, next_due_date
)
values (
  (select user_id from finance_test_context), 'Test recurring confirmation',
  (select checking_id from finance_test_context), (select food_category_id from finance_test_context),
  25, 'weekly', '2026-07-15'
);

select * from public.confirm_recurring_occurrence(
  (select id from public.recurring_rules where user_id = (select user_id from finance_test_context) and name = 'Test recurring confirmation'),
  '2026-07-15', '2026-07-15', (select user_id from finance_test_context)
);

do $$
declare
  v_user_id uuid := (select user_id from finance_test_context);
  v_rule_id uuid := (select id from public.recurring_rules where user_id = v_user_id and name = 'Test recurring confirmation');
begin
  if not exists (
    select 1 from public.transactions
    where user_id = v_user_id
      and recurring_rule_id = v_rule_id
      and type = 'expense'
      and direction = 'debit'
      and amount = 25
      and date = '2026-07-15'
  ) then
    raise exception 'Expected confirmation to create a completed recurring expense';
  end if;
  if (select next_due_date from public.recurring_rules where id = v_rule_id) <> '2026-07-22' then
    raise exception 'Expected weekly recurring rule to advance to July 22';
  end if;
end;
$$;

rollback;
