-- Dashboard-shaped reporting views. Financial calculations stay in Postgres;
-- the client only formats and lays out values returned by these views.

begin;

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
    else (s.savings_rate * 100)::numeric(8, 2)
  end as savings_rate_percent
from months m
left join income_by_month i using (user_id, month)
left join expense_by_month e using (user_id, month)
left join public.savings_rate_monthly s using (user_id, month);

-- Daily net-worth deltas make an accurate trend line without calculating
-- cumulative balances in React. Dates with no activity can be interpolated by
-- the chart without changing the underlying financial values.
create or replace view public.net_worth_daily
with (security_invoker = true)
as
with daily_deltas as (
  select
    t.user_id,
    t.date,
    sum(case t.direction when 'credit' then t.amount when 'debit' then -t.amount end)::numeric(14, 2) as net_worth_delta
  from public.transactions t
  join public.accounts a on a.id = t.account_id
  where t.status = 'completed'
    and a.type in ('bank', 'cash', 'investment')
  group by t.user_id, t.date
)
select
  user_id,
  date,
  net_worth_delta,
  sum(net_worth_delta) over (
    partition by user_id
    order by date
    rows between unbounded preceding and current row
  )::numeric(14, 2) as net_worth
from daily_deltas;

-- The share and bar percentage are calculated in SQL so category bars never
-- need to derive a total in the client.
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
    )::numeric(8, 2)
  end as share_percent
from public.category_monthly_spend s;

-- Progress values are database calculations, including any carried budget
-- balance, so a dashboard cannot accidentally use the planned amount alone.
create or replace view public.budget_vs_actual_with_progress
with (security_invoker = true)
as
select
  b.*,
  case
    when b.available_amount <= 0 then null
    else (100 * b.actual_spend / b.available_amount)::numeric(8, 2)
  end as utilization_percent,
  case
    when b.available_amount <= 0 then 0
    else least(100, greatest(0, 100 * b.actual_spend / b.available_amount))::numeric(8, 2)
  end as progress_percent
from public.budget_vs_actual b;

create or replace view public.upcoming_recurring_bills
with (security_invoker = true)
as
select
  r.user_id,
  r.id as recurring_rule_id,
  r.name,
  r.amount,
  r.next_due_date,
  r.category_id,
  (r.next_due_date - current_date) as days_until_due
from public.recurring_rules r
where r.is_active
  and r.next_due_date >= current_date
  and r.next_due_date <= current_date + 30;

grant select on public.dashboard_monthly_summary, public.net_worth_daily,
  public.category_monthly_spend_with_share, public.budget_vs_actual_with_progress,
  public.upcoming_recurring_bills to authenticated;

commit;
