begin;

alter table public.transactions add constraint transaction_direction_matches_type
  check (type = 'transfer' or (type = 'income' and direction = 'credit') or (type = 'expense' and direction = 'debit'));

create function public.check_classification(transaction_id_to_check uuid)
returns void language plpgsql set search_path = public, pg_temp as $$
declare
  transaction_record public.transactions%rowtype;
  split_total numeric;
  split_count integer;
  split_category_id uuid;
begin
  select * into transaction_record from public.transactions where id = transaction_id_to_check for update;
  if not found then
    return;
  end if;

  select count(*), coalesce(sum(amount), 0)
  into split_count, split_total
  from public.transaction_splits
  where transaction_id = transaction_id_to_check;

  if transaction_record.type <> 'expense' and exists (select 1 from public.transactions where linked_refund_of=transaction_record.id) then
    raise exception 'A refunded expense must remain an expense';
  end if;

  if transaction_record.type = 'transfer' then
    if split_count <> 0 or transaction_record.category_id is not null then
      raise exception 'Transfers cannot carry a category or category splits';
    end if;
    return;
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
    if split_count < 2 or split_total <> transaction_record.amount then
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

  return;
end;
$$;

create or replace function public.validate_transaction_classification()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_table_name = 'transactions' then
    perform public.check_classification(new.id);
  else
    if tg_op <> 'INSERT' then perform public.check_classification(old.transaction_id); end if;
    if tg_op = 'INSERT' or (tg_op = 'UPDATE' and new.transaction_id is distinct from old.transaction_id) then
      perform public.check_classification(new.transaction_id);
    end if;
  end if;
  return null;
end;
$$;

create function public.check_transfer_group(user_id_to_check uuid, group_id_to_check uuid)
returns void language plpgsql set search_path = public, pg_temp as $$
declare
  leg_count integer;
  account_count integer;
  debit_count integer;
  credit_count integer;
  amount_count integer;
  date_count integer;
  status_count integer;
begin
  if group_id_to_check is null then return; end if;
  perform pg_advisory_xact_lock(hashtextextended(group_id_to_check::text, 0));
  select
    count(*),
    count(distinct account_id),
    count(*) filter (where direction = 'debit'),
    count(*) filter (where direction = 'credit'),
    count(distinct amount),
    count(distinct date),
    count(distinct status)
  into leg_count, account_count, debit_count, credit_count, amount_count, date_count, status_count
  from public.transactions
  where user_id = user_id_to_check
    and transfer_group_id = group_id_to_check;

  if leg_count = 0 then return; end if;
  if leg_count <> 2
    or account_count <> 2
    or debit_count <> 1
    or credit_count <> 1
    or amount_count <> 1
    or date_count <> 1
    or status_count <> 1 then
    raise exception 'A transfer group must contain exactly one matched debit and credit between two accounts';
  end if;

end;
$$;

create or replace function public.validate_transfer_group()
returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_op <> 'INSERT' then perform public.check_transfer_group(old.user_id, old.transfer_group_id); end if;
  if tg_op = 'INSERT' or (tg_op = 'UPDATE' and (new.user_id,new.transfer_group_id) is distinct from (old.user_id,old.transfer_group_id)) then
    perform public.check_transfer_group(new.user_id,new.transfer_group_id);
  end if;
  return null;
end;
$$;

-- Fail the upgrade atomically if earlier versions left incomplete entries.
do $$
declare r record;
begin
  if exists (
    with recursive hierarchy(root_id,id,parent_id) as (
      select id,id,parent_category_id from public.categories
      union
      select h.root_id,c.id,c.parent_category_id from hierarchy h join public.categories c on c.id=h.parent_id
    ) select 1 from hierarchy where root_id=parent_id
  ) then raise exception 'A category hierarchy contains a cycle. Review ledger_preflight.sql before upgrading'; end if;
  if exists (
    select 1 from public.counterparties c join public.accounts a on a.id=c.linked_account_id
    where a.type not in ('receivable','payable')
  ) then raise exception 'A counterparty links to an incompatible account. Review ledger_preflight.sql before upgrading'; end if;
  for r in select distinct user_id, transfer_group_id from public.transactions where transfer_group_id is not null loop
    perform public.check_transfer_group(r.user_id,r.transfer_group_id);
  end loop;
  for r in select id from public.transactions loop
    perform public.check_classification(r.id);
  end loop;
end;
$$;

-- Kind and type determine how all historical references are interpreted.
create function public.guard_finance_classification() returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if tg_table_name = 'accounts' then
    if old.type <> new.type then raise exception 'Create a new account to change account type'; end if;
  else
    if tg_op = 'UPDATE' and old.kind <> new.kind then raise exception 'Create a new category to change category kind'; end if;
    if new.parent_category_id is not null then
      perform pg_advisory_xact_lock(hashtextextended(coalesce(new.user_id::text,'system-categories'), 1));
      if exists (with recursive ancestors(id,parent_category_id) as (
        select id,parent_category_id from public.categories where id = new.parent_category_id
        union
        select c.id,c.parent_category_id from public.categories c join ancestors a on c.id=a.parent_category_id
      ) select 1 from ancestors where id=new.id) then raise exception 'A category cannot be its own ancestor'; end if;
    end if;
  end if;
  return new;
end;
$$;
create trigger accounts_type_guard before update of type on public.accounts for each row execute function public.guard_finance_classification();
create trigger categories_hierarchy_guard before insert or update of kind,parent_category_id on public.categories for each row execute function public.guard_finance_classification();

-- Archive restricts future postings; historical records remain usable.
create function public.check_entry_references() returns trigger language plpgsql set search_path=public,pg_temp as $$
declare archived boolean;
begin
  if tg_table_name='transactions' then
    select is_archived into archived from public.accounts where id=new.account_id for share;
    if archived then
      raise exception 'Choose an active account';
    end if;
  end if;
  select is_archived into archived from public.categories where id=new.category_id and user_id is not null for share;
  if not found then
    select is_archived into archived from public.categories where id=new.category_id and user_id is null;
  end if;
  if archived then
    raise exception 'Choose an active category';
  end if;
  return new;
end;
$$;
create trigger transactions_active_refs before insert or update of account_id,category_id on public.transactions for each row execute function public.check_entry_references();
create trigger splits_active_refs before insert or update of category_id on public.transaction_splits for each row execute function public.check_entry_references();

commit;
