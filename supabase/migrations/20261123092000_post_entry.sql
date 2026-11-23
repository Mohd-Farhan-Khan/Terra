begin;

create schema if not exists terra_private;
grant usage on schema terra_private to authenticated;
create table terra_private.entry_requests (
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  payload jsonb not null,
  transaction_id uuid,
  primary key(user_id, request_id)
);
alter table terra_private.entry_requests enable row level security;
create policy entry_request_owner on terra_private.entry_requests for all to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());
grant select,insert on terra_private.entry_requests to authenticated;
grant update(transaction_id) on terra_private.entry_requests to authenticated;

create function public.post_entry(p_request_id uuid,p_entry jsonb)
returns uuid language plpgsql security invoker set search_path=public,pg_temp as $$
declare
  owner_id uuid := auth.uid();
  saved terra_private.entry_requests%rowtype;
  entry_type text := p_entry->>'type';
  account uuid := (p_entry->>'account')::uuid;
  amount numeric := (p_entry->>'amount')::numeric;
  posting_date date := (p_entry->>'date')::date;
  note text := nullif(trim(p_entry->>'note'),'');
  posted uuid;
begin
  if owner_id is null then raise exception 'Sign in before saving an entry' using errcode='42501'; end if;
  if p_request_id is null or jsonb_typeof(p_entry) is distinct from 'object' then raise exception 'Invalid request'; end if;
  insert into terra_private.entry_requests(user_id,request_id,payload)
  values(owner_id,p_request_id,p_entry) on conflict (user_id,request_id) do nothing;
  select * into strict saved from terra_private.entry_requests
    where user_id=owner_id and request_id=p_request_id for update;
  if saved.payload <> p_entry then raise exception 'This request was already used for a different entry'; end if;
  if saved.transaction_id is not null then return saved.transaction_id; end if;
  if amount is null or amount <= 0 or amount > 999999999999.99 or amount <> round(amount,2) then
    raise exception 'Enter a positive amount with at most two decimal places';
  end if;

  if entry_type='transfer' then
    select debit_transaction_id into strict posted from public.create_transfer(account,(p_entry->>'destination')::uuid,amount,posting_date,note);
  elsif entry_type='expense' and p_entry ? 'splits' then
    if exists(select 1 from jsonb_array_elements(p_entry->'splits') s
      where (s->>'amount')::numeric <> round((s->>'amount')::numeric,2)) then
      raise exception 'Split amounts must be in whole paise';
    end if;
    posted := public.create_expense_with_splits(account,amount,posting_date,note,p_entry->'splits');
  elsif entry_type in ('income','expense') then
    insert into public.transactions(user_id,account_id,type,category_id,amount,direction,date,note)
    values(owner_id,account,entry_type,(p_entry->>'category')::uuid,amount,
      case when entry_type='income' then 'credit' else 'debit' end,posting_date,note) returning id into posted;
  else raise exception 'Unknown transaction type';
  end if;
  update terra_private.entry_requests set transaction_id=posted where user_id=owner_id and request_id=p_request_id;
  return posted;
end;
$$;
revoke all on function public.post_entry(uuid,jsonb) from public,anon;
grant execute on function public.post_entry(uuid,jsonb) to authenticated;
commit;
