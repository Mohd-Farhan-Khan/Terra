begin;

-- Classify each receipt or payment in integer paise. A linked refund uses the
-- original allocations even when the original is later reversed.
create view public.transaction_allocations with (security_invoker=true) as
with ordinary as (
  select t.id,t.category_id,t.amount from public.transactions t where t.category_id is not null
  union all
  select s.transaction_id,s.category_id,s.amount from public.transaction_splits s
), refund_parts as (
  select r.id,a.category_id,r.amount*100 as total,
    div(r.amount*100*a.amount,o.amount) as base,
    mod(r.amount*100*a.amount,o.amount) as remainder
  from public.transactions r join public.transactions o on o.id=r.linked_refund_of
  join ordinary a on a.id=o.id
), ranked as (
  select *,sum(base) over(partition by id) as assigned,
    row_number() over(partition by id order by remainder desc,category_id) as ordinal
  from refund_parts
)
select a.id as transaction_id,a.category_id,a.amount from ordinary a
join public.transactions t on t.id=a.id where t.linked_refund_of is null
union all
select id,category_id,((base + case when ordinal <= total-assigned then 1 else 0 end)/100)::numeric(14,2) from ranked;

create or replace view public.category_monthly_spend with (security_invoker=true) as
select t.user_id,date_trunc('month',t.date)::date as month,a.category_id,
  coalesce(sum(a.amount) filter(where t.type='expense'),0)::numeric(14,2) as expense_amount,
  coalesce(sum(a.amount) filter(where t.linked_refund_of is not null),0)::numeric(14,2) as refund_amount,
  sum(case when t.type='expense' then a.amount else -a.amount end)::numeric(14,2) as actual_spend
from public.transactions t join public.transaction_allocations a on a.transaction_id=t.id
where t.status='completed' and (t.type='expense' or t.linked_refund_of is not null)
group by t.user_id,date_trunc('month',t.date)::date,a.category_id;

-- Keep the existing view contract and append the refund link.
create or replace view public.transaction_list with (security_invoker=true) as
select t.user_id,t.id as transaction_id,t.date,t.created_at,t.account_id,a.name as account_name,t.category_id,
  case when t.type='transfer' then 'Transfer' when t.linked_refund_of is not null then 'Refund'
    else coalesce(c.name,'Split expense') end as category_name,
  t.note,t.type,t.direction,t.amount,t.status,t.linked_refund_of
from public.transactions t join public.accounts a on a.id=t.account_id
left join public.categories c on c.id=t.category_id where t.status<>'reversed';

create function public.filtered_ledger(p_from_date date default null,p_to_date date default null,
  p_account_id uuid default null,p_category_id uuid default null)
returns setof public.transaction_list language sql stable security invoker set search_path=public,pg_temp as $$
  select l.user_id,l.transaction_id,l.date,l.created_at,l.account_id,l.account_name,
    coalesce(p_category_id,l.category_id),coalesce(c.name,l.category_name),l.note,l.type,l.direction,
    coalesce(a.amount,l.amount),l.status,l.linked_refund_of
  from public.transaction_list l
  left join public.transaction_allocations a on p_category_id is not null and a.transaction_id=l.transaction_id and a.category_id=p_category_id
  left join public.categories c on c.id=a.category_id
  where l.user_id=auth.uid() and (p_from_date is null or l.date>=p_from_date)
    and (p_to_date is null or l.date<=p_to_date) and (p_account_id is null or l.account_id=p_account_id)
    and (p_category_id is null or a.transaction_id is not null);
$$;

create or replace function public.transaction_summary(p_from_date date default null,p_to_date date default null,
  p_account_id uuid default null,p_category_id uuid default null)
returns table(transaction_count bigint,income_amount numeric(14,2),outflow_amount numeric(14,2),net_amount numeric(14,2))
language sql stable security invoker set search_path=public,pg_temp as $$
  select count(*),coalesce(sum(amount) filter(where type='income' and linked_refund_of is null),0),
    coalesce(sum(case when type='expense' then amount when linked_refund_of is not null then -amount else 0 end),0),
    coalesce(sum(case when direction='credit' then amount else -amount end),0)
  from public.filtered_ledger(p_from_date,p_to_date,p_account_id,p_category_id) where status='completed';
$$;

create view public.account_recent_activity with (security_invoker=true) as
select id,account_id,date,created_at,amount,direction from (
  select t.*,row_number() over(partition by account_id order by date desc,created_at desc,id desc) as position
  from public.transactions t where status='completed'
) recent where position <= 8;

create view public.account_statement with (security_invoker=true) as
select id,account_id,amount,direction,type,date,note,created_at,
  sum(case when direction='credit' then amount else -amount end)
    over(partition by account_id order by date,created_at,id rows unbounded preceding) as running_balance
from public.transactions where status='completed';

create view public.recurring_paid_monthly with (security_invoker=true) as
select user_id,date_trunc('month',date)::date as month,count(*) as paid_count,sum(amount) as paid_amount
from public.transactions where status='completed' and recurring_rule_id is not null group by 1,2;

grant select on public.transaction_allocations,public.account_recent_activity,public.account_statement,public.recurring_paid_monthly to authenticated;
grant execute on function public.filtered_ledger(date,date,uuid,uuid) to authenticated;

-- These leaf projections have no downstream views in Terra. Recreate them
-- inside the transaction to widen the percentage output safely.
drop view public.dashboard_monthly_summary,public.category_monthly_spend_with_share,public.budget_vs_actual_with_progress;
drop view public.savings_rate_monthly;
create or replace view public.savings_rate_monthly
with (security_invoker = true)
as
with income_by_month as (
  select
    t.user_id,
    date_trunc('month', t.date)::date as month,
    sum(t.amount)::numeric(14, 2) as income_amount
  from public.transactions t
  where t.type = 'income'
    and t.direction = 'credit'
    and t.status = 'completed'
    and t.linked_refund_of is null
  group by t.user_id, date_trunc('month', t.date)::date
),
savings_by_month as (
  select
    credit_leg.user_id,
    date_trunc('month', credit_leg.date)::date as month,
    sum(credit_leg.amount)::numeric(14, 2) as savings_contribution_amount
  from public.transactions credit_leg
  join public.accounts destination on destination.id = credit_leg.account_id
  join public.transactions debit_leg
    on debit_leg.user_id = credit_leg.user_id
    and debit_leg.transfer_group_id = credit_leg.transfer_group_id
    and debit_leg.direction = 'debit'
  join public.accounts source on source.id = debit_leg.account_id
  where credit_leg.type = 'transfer'
    and credit_leg.direction = 'credit'
    and credit_leg.status = 'completed'
    and (destination.is_savings or destination.type = 'investment')
    and not (source.is_savings or source.type = 'investment')
  group by credit_leg.user_id, date_trunc('month', credit_leg.date)::date
),
months as (
  select user_id, month from income_by_month
  union
  select user_id, month from savings_by_month
)
select
  m.user_id,
  m.month,
  coalesce(i.income_amount, 0)::numeric(14, 2) as income_amount,
  coalesce(s.savings_contribution_amount, 0)::numeric(14, 2) as savings_contribution_amount,
  case
    when coalesce(i.income_amount, 0) = 0 then null
    else (coalesce(s.savings_contribution_amount, 0) / i.income_amount)::numeric(32, 6)
  end as savings_rate
from months m
left join income_by_month i using (user_id, month)
left join savings_by_month s using (user_id, month);
grant select on public.savings_rate_monthly to authenticated;

create or replace view public.dashboard_monthly_summary
with (security_invoker = true)
as
with income_by_month as (
  select
    t.user_id,
    date_trunc('month', t.date)::date as month,
    sum(t.amount)::numeric(14, 2) as income_amount
  from public.transactions t
  where t.type = 'income'
    and t.direction = 'credit'
    and t.status = 'completed'
    and t.linked_refund_of is null
  group by t.user_id, date_trunc('month', t.date)::date
),
expense_by_month as (
  select
    user_id,
    month,
    sum(actual_spend)::numeric(14, 2) as expense_amount
  from public.category_monthly_spend
  group by user_id, month
),
months as (
  select user_id, month from income_by_month
  union
  select user_id, month from expense_by_month
  union
  select user_id, month from public.savings_rate_monthly
)
select
  m.user_id,
  m.month,
  coalesce(i.income_amount, 0)::numeric(14, 2) as income_amount,
  coalesce(e.expense_amount, 0)::numeric(14, 2) as expense_amount,
  (coalesce(i.income_amount, 0) - coalesce(e.expense_amount, 0))::numeric(14, 2) as net_amount,
  coalesce(s.savings_contribution_amount, 0)::numeric(14, 2) as savings_contribution_amount,
  s.savings_rate,
  case
    when s.savings_rate is null then null
    else (s.savings_rate * 100)::numeric(32, 2)
  end as savings_rate_percent
from months m
left join income_by_month i using (user_id, month)
left join expense_by_month e using (user_id, month)
left join public.savings_rate_monthly s using (user_id, month);

create or replace view public.category_monthly_spend_with_share
with (security_invoker = true)
as
select
  s.*,
  case
    when sum(s.actual_spend) over (partition by s.user_id, s.month) = 0 then 0
    else (
      100 * s.actual_spend
      / sum(s.actual_spend) over (partition by s.user_id, s.month)
    )::numeric(32, 2)
  end as share_percent
from public.category_monthly_spend s;

create or replace view public.budget_vs_actual_with_progress
with (security_invoker = true)
as
select
  b.*,
  case
    when b.available_amount <= 0 then null
    else (100 * b.actual_spend / b.available_amount)::numeric(32, 2)
  end as utilization_percent,
  case
    when b.available_amount <= 0 then 0
    else least(100, greatest(0, 100 * b.actual_spend / b.available_amount))::numeric(32, 2)
  end as progress_percent
from public.budget_vs_actual b;

grant select on public.dashboard_monthly_summary,public.category_monthly_spend_with_share,public.budget_vs_actual_with_progress to authenticated;
commit;
