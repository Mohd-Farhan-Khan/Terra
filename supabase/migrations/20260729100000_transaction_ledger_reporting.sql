-- Read model for the transaction workspace. Reversed records are excluded at
-- the source, so neither rows nor totals can accidentally include them.

begin;

create or replace view public.transaction_list
with (security_invoker = true)
as
select
  t.user_id,
  t.id as transaction_id,
  t.date,
  t.created_at,
  t.account_id,
  a.name as account_name,
  t.category_id,
  case when t.type = 'transfer' then 'Transfer' else c.name end as category_name,
  t.note,
  t.type,
  t.direction,
  t.amount,
  t.status
from public.transactions t
join public.accounts a on a.id = t.account_id
left join public.categories c on c.id = t.category_id
where t.status <> 'reversed';

create or replace function public.transaction_summary(
  p_from_date date default null,
  p_to_date date default null,
  p_account_id uuid default null,
  p_category_id uuid default null
)
returns table (
  transaction_count bigint,
  income_amount numeric(14, 2),
  outflow_amount numeric(14, 2),
  net_amount numeric(14, 2)
)
language sql
stable
set search_path = public, pg_temp
as $$
  select
    count(*) as transaction_count,
    coalesce(sum(amount) filter (where type = 'income'), 0)::numeric(14, 2) as income_amount,
    coalesce(sum(amount) filter (where type in ('expense', 'transfer')), 0)::numeric(14, 2) as outflow_amount,
    (
      coalesce(sum(amount) filter (where type = 'income'), 0)
      - coalesce(sum(amount) filter (where type in ('expense', 'transfer')), 0)
    )::numeric(14, 2) as net_amount
  from public.transaction_list
  where user_id = auth.uid()
    and (p_from_date is null or date >= p_from_date)
    and (p_to_date is null or date <= p_to_date)
    and (p_account_id is null or account_id = p_account_id)
    and (p_category_id is null or category_id = p_category_id);
$$;

create index if not exists transactions_active_ledger_idx
  on public.transactions (user_id, date desc, created_at desc)
  where status <> 'reversed';

grant select on public.transaction_list to authenticated;
grant execute on function public.transaction_summary(date, date, uuid, uuid) to authenticated;

commit;
