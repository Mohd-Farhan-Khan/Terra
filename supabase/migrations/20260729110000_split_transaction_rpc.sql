-- A split transaction must insert its parent row and all classification rows
-- in one database transaction because classification is a deferred constraint.

begin;

create or replace function public.create_expense_with_splits(
  p_account_id uuid,
  p_amount numeric(14, 2),
  p_date date,
  p_note text,
  p_splits jsonb,
  p_user_id uuid default null
)
returns uuid
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_user_id uuid := coalesce(v_auth_user_id, p_user_id);
  v_transaction_id uuid;
  v_split_total numeric(14, 2);
  v_split_count integer;
  v_split record;
begin
  if v_user_id is null then
    raise exception 'An authenticated user is required to create an expense'
      using errcode = '42501';
  end if;

  if v_auth_user_id is not null and p_user_id is not null and p_user_id <> v_auth_user_id then
    raise exception 'p_user_id must match the authenticated user'
      using errcode = '42501';
  end if;

  if p_amount is null or p_amount <= 0 or p_date is null then
    raise exception 'Amount must be greater than zero and date is required'
      using errcode = '22023';
  end if;

  if jsonb_typeof(p_splits) <> 'array' then
    raise exception 'p_splits must be a JSON array'
      using errcode = '22023';
  end if;

  select count(*), coalesce(sum((split.value ->> 'amount')::numeric), 0)
  into v_split_count, v_split_total
  from jsonb_array_elements(p_splits) as split(value);

  if v_split_count < 2 or v_split_total <> p_amount then
    raise exception 'At least two split amounts must add exactly to the expense amount'
      using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.accounts where id = p_account_id and user_id = v_user_id
  ) then
    raise exception 'The selected account is not available to this user'
      using errcode = '42501';
  end if;

  for v_split in
    select (value ->> 'category_id')::uuid as category_id, (value ->> 'amount')::numeric as amount
    from jsonb_array_elements(p_splits)
  loop
    if v_split.amount <= 0 then
      raise exception 'Split amounts must be greater than zero'
        using errcode = '22023';
    end if;
    perform public.assert_usable_category(v_split.category_id, v_user_id, 'expense');
  end loop;

  insert into public.transactions (
    user_id, account_id, type, category_id, amount, direction, date, note
  )
  values (
    v_user_id, p_account_id, 'expense', null, p_amount, 'debit', p_date, nullif(btrim(p_note), '')
  )
  returning id into v_transaction_id;

  insert into public.transaction_splits (transaction_id, category_id, amount)
  select
    v_transaction_id,
    (value ->> 'category_id')::uuid,
    (value ->> 'amount')::numeric
  from jsonb_array_elements(p_splits);

  return v_transaction_id;
end;
$$;

grant execute on function public.create_expense_with_splits(uuid, numeric, date, text, jsonb, uuid) to authenticated;

commit;
