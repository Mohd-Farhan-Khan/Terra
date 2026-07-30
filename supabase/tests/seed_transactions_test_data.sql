-- Transaction-list verification seed. Replace the UUID below with an existing
-- authenticated user's id, then run once in Supabase SQL Editor.
-- It writes 25 visible entries (three pages at 12 rows/page) and one reversed
-- entry. The reversed entry must not appear in `transaction_list` or totals.

begin;

do $$
declare
  v_user_id uuid := '00000000-0000-0000-0000-000000000000'; -- REPLACE ME
  v_month date := date_trunc('month', current_date)::date;
  v_account_id uuid;
  v_category_id uuid;
  v_visible_count integer;
begin
  if v_user_id = '00000000-0000-0000-0000-000000000000'::uuid then
    raise exception 'Replace v_user_id with an auth.users id before running this seed';
  end if;

  insert into public.categories (user_id, name, kind)
  values (v_user_id, 'Transaction pagination sample', 'expense')
  returning id into v_category_id;

  insert into public.accounts (user_id, name, type)
  values (v_user_id, 'Transaction pagination account', 'bank')
  returning id into v_account_id;

  insert into public.transactions (
    user_id, account_id, type, category_id, amount, direction, date, note, status
  )
  select
    v_user_id,
    v_account_id,
    'expense',
    v_category_id,
    (10 + day_number)::numeric(14, 2),
    'debit',
    v_month + day_number,
    '__transaction_pagination_seed__ #' || day_number,
    'completed'
  from generate_series(1, 25) as day_number;

  insert into public.transactions (
    user_id, account_id, type, category_id, amount, direction, date, note, status
  )
  values (
    v_user_id, v_account_id, 'expense', v_category_id, 999, 'debit',
    v_month + 26, '__transaction_pagination_seed__ reversed', 'reversed'
  );

  select count(*) into v_visible_count
  from public.transaction_list
  where user_id = v_user_id
    and note like '__transaction_pagination_seed__%';

  if v_visible_count <> 25 then
    raise exception 'Expected 25 visible seed rows, got %', v_visible_count;
  end if;
end;
$$;

set constraints all immediate;
commit;

-- Expected: 25 rows; the row with amount 999 and status reversed is absent.
select date, note, amount, status
from public.transaction_list
where note like '__transaction_pagination_seed__%'
order by date desc;
