-- Persistent dashboard demo data for one existing auth user.
-- Replace the UUID below with the id from: select id, email from auth.users;
-- This file intentionally commits so the authenticated dashboard can read it.

begin;

do $$
declare
  v_user_id uuid := '00000000-0000-0000-0000-000000000000'; -- REPLACE ME
  v_month date := date_trunc('month', current_date)::date;
  v_checking_id uuid;
  v_savings_id uuid;
  v_investment_id uuid;
  v_income_category_id uuid;
  v_housing_category_id uuid;
  v_food_category_id uuid;
  v_transport_category_id uuid;
  v_lifestyle_category_id uuid;
  v_utilities_category_id uuid;
  v_other_category_id uuid;
begin
  if v_user_id = '00000000-0000-0000-0000-000000000000'::uuid then
    raise exception 'Replace v_user_id with an auth.users id before running this seed';
  end if;

  if not exists (select 1 from auth.users where id = v_user_id) then
    raise exception 'Auth user % does not exist', v_user_id;
  end if;

  -- These names are deliberately unique to this fixture. Run once per test
  -- user, or remove the sample rows before running it again.
  insert into public.categories (user_id, name, kind) values
    (v_user_id, 'Dashboard sample income', 'income'),
    (v_user_id, 'Housing', 'expense'),
    (v_user_id, 'Food', 'expense'),
    (v_user_id, 'Transport', 'expense'),
    (v_user_id, 'Lifestyle', 'expense'),
    (v_user_id, 'Utilities', 'expense'),
    (v_user_id, 'Other', 'expense');

  select id into v_income_category_id from public.categories where user_id = v_user_id and name = 'Dashboard sample income';
  select id into v_housing_category_id from public.categories where user_id = v_user_id and name = 'Housing';
  select id into v_food_category_id from public.categories where user_id = v_user_id and name = 'Food';
  select id into v_transport_category_id from public.categories where user_id = v_user_id and name = 'Transport';
  select id into v_lifestyle_category_id from public.categories where user_id = v_user_id and name = 'Lifestyle';
  select id into v_utilities_category_id from public.categories where user_id = v_user_id and name = 'Utilities';
  select id into v_other_category_id from public.categories where user_id = v_user_id and name = 'Other';

  insert into public.accounts (user_id, name, type) values
    (v_user_id, 'Dashboard sample checking', 'bank')
  returning id into v_checking_id;

  insert into public.accounts (user_id, name, type, is_savings) values
    (v_user_id, 'Dashboard sample savings', 'bank', true)
  returning id into v_savings_id;

  insert into public.accounts (user_id, name, type) values
    (v_user_id, 'Dashboard sample investments', 'investment')
  returning id into v_investment_id;

  -- Month summary: income 6,240; expense 3,487.21; net 2,752.79.
  insert into public.transactions (user_id, account_id, type, category_id, amount, direction, date, note) values
    (v_user_id, v_checking_id, 'income', v_income_category_id, 6240.00, 'credit', v_month + 1, '__dashboard_seed__'),
    (v_user_id, v_checking_id, 'expense', v_housing_category_id, 1450.00, 'debit', v_month + 3, '__dashboard_seed__'),
    (v_user_id, v_checking_id, 'expense', v_food_category_id, 648.21, 'debit', v_month + 5, '__dashboard_seed__'),
    (v_user_id, v_checking_id, 'expense', v_transport_category_id, 428.15, 'debit', v_month + 8, '__dashboard_seed__'),
    (v_user_id, v_checking_id, 'expense', v_lifestyle_category_id, 307.40, 'debit', v_month + 11, '__dashboard_seed__'),
    (v_user_id, v_checking_id, 'expense', v_utilities_category_id, 239.45, 'debit', v_month + 14, '__dashboard_seed__'),
    (v_user_id, v_checking_id, 'expense', v_other_category_id, 414.00, 'debit', v_month + 17, '__dashboard_seed__');

  -- 2,745.60 / 6,240 = 44% savings rate. Transfers are created only through
  -- the matched-pair RPC, never two separate insert statements.
  perform public.create_transfer(v_checking_id, v_savings_id, 1745.60, v_month + 20, '__dashboard_seed__', 'completed', v_user_id);
  perform public.create_transfer(v_checking_id, v_investment_id, 1000.00, v_month + 22, '__dashboard_seed__', 'completed', v_user_id);

  insert into public.budgets (user_id, category_id, month, planned_amount, rollover_enabled) values
    (v_user_id, v_food_category_id, v_month, 700.00, true),
    (v_user_id, v_transport_category_id, v_month, 500.00, true),
    (v_user_id, v_lifestyle_category_id, v_month, 400.00, true),
    (v_user_id, v_utilities_category_id, v_month, 300.00, true),
    (v_user_id, v_housing_category_id, v_month, 1600.00, true);

  insert into public.recurring_rules (user_id, name, account_id, category_id, amount, frequency, next_due_date) values
    (v_user_id, 'Rent', v_checking_id, v_housing_category_id, 1250.00, 'monthly', current_date + 3),
    (v_user_id, 'Electricity', v_checking_id, v_utilities_category_id, 85.40, 'monthly', current_date + 6),
    (v_user_id, 'Internet', v_checking_id, v_utilities_category_id, 65.00, 'monthly', current_date + 12),
    (v_user_id, 'Phone plan', v_checking_id, v_utilities_category_id, 54.99, 'monthly', current_date + 17),
    (v_user_id, 'Music subscription', v_checking_id, v_lifestyle_category_id, 10.99, 'monthly', current_date + 22);
end;
$$;

set constraints all immediate;
commit;

-- Expected current-month dashboard values:
-- income 6,240.00 | expenses 3,487.21 | net 2,752.79 | savings rate 44.00%
select * from public.dashboard_monthly_summary
where month = date_trunc('month', current_date)::date;
