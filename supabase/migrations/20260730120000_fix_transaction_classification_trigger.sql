-- The classification function is shared by triggers on transactions and
-- transaction_splits. Accessing OLD.transaction_id directly makes PostgreSQL
-- validate that field against a transactions OLD record, even in an unused
-- CASE branch. Read the trigger row through JSON instead so both row shapes
-- are supported safely.

begin;

create or replace function public.validate_transaction_classification()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  transaction_id_to_check uuid;
  transaction_record public.transactions%rowtype;
  split_total numeric(14, 2);
  split_count integer;
  split_category_id uuid;
begin
  if tg_table_name = 'transactions' then
    if tg_op = 'delete' then
      transaction_id_to_check := (to_jsonb(old) ->> 'id')::uuid;
    else
      transaction_id_to_check := (to_jsonb(new) ->> 'id')::uuid;
    end if;
  else
    if tg_op = 'delete' then
      transaction_id_to_check := (to_jsonb(old) ->> 'transaction_id')::uuid;
    else
      transaction_id_to_check := (to_jsonb(new) ->> 'transaction_id')::uuid;
    end if;
  end if;

  select * into transaction_record from public.transactions where id = transaction_id_to_check;
  if not found then
    return new;
  end if;

  select count(*), coalesce(sum(amount), 0)
  into split_count, split_total
  from public.transaction_splits
  where transaction_id = transaction_id_to_check;

  if transaction_record.type = 'transfer' then
    if split_count <> 0 or transaction_record.category_id is not null then
      raise exception 'Transfers cannot carry a category or category splits';
    end if;
    return new;
  end if;

  if transaction_record.category_id is not null then
    if split_count <> 0 then
      raise exception 'A categorized transaction cannot also have splits';
    end if;
    perform public.assert_usable_category(
      transaction_record.category_id,
      transaction_record.user_id,
      transaction_record.type
    );
  else
    if split_count = 0 or split_total <> transaction_record.amount then
      raise exception 'Split amounts must be present and add exactly to the transaction amount';
    end if;

    for split_category_id in
      select category_id from public.transaction_splits where transaction_id = transaction_id_to_check
    loop
      perform public.assert_usable_category(
        split_category_id,
        transaction_record.user_id,
        transaction_record.type
      );
    end loop;
  end if;

  if transaction_record.linked_refund_of is not null then
    if transaction_record.type <> 'income' then
      raise exception 'Only income transactions can link to an original expense as a refund';
    end if;

    if not exists (
      select 1
      from public.transactions original_expense
      where original_expense.id = transaction_record.linked_refund_of
        and original_expense.user_id = transaction_record.user_id
        and original_expense.type = 'expense'
    ) then
      raise exception 'linked_refund_of must reference an expense transaction owned by the same user';
    end if;
  end if;

  return new;
end;
$$;

commit;
