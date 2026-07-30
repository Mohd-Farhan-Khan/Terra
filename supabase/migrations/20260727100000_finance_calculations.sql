-- Derived financial reporting and atomic transfer creation.
-- Amounts are represented as positive values in transactions; `direction`
-- determines their signed effect on an account.

begin;

-- A savings account is still a bank or cash account in the core model. This
-- explicit flag avoids relying on an account name to calculate savings rate.
alter table public.accounts
  add column if not exists is_savings boolean not null default false;

comment on column public.accounts.is_savings is
  'Marks a bank or cash account as a savings destination for savings-rate reporting.';

alter table public.accounts
  add constraint accounts_savings_type_check
  check (not is_savings or type in ('bank', 'cash'));

-- Every owned account is present, including accounts with no completed
-- transactions. Debit is money leaving the account; credit is money entering.
create or replace view public.account_balances
with (security_invoker = true)
as
select
  a.user_id,
  a.id as account_id,
  a.name as account_name,
  a.type as account_type,
  a.is_savings,
  coalesce(sum(
    case t.direction
      when 'credit' then t.amount
      when 'debit' then -t.amount
    end
  ) filter (where t.status = 'completed'), 0)::numeric(14, 2) as balance
from public.accounts a
left join public.transactions t on t.account_id = a.id
group by a.user_id, a.id, a.name, a.type, a.is_savings;

-- The expense allocation is a transaction's category when it is not split,
-- otherwise its individual split rows. A linked refund reverses the original
-- expense's allocation in the month the refund was received. Split refunds
-- are therefore apportioned across the original split categories.
create or replace view public.category_monthly_spend
with (security_invoker = true)
as
with expense_allocations as (
  select
    t.id as expense_transaction_id,
    t.user_id,
    t.date,
    t.amount as transaction_amount,
    t.category_id,
    t.amount as allocated_amount
  from public.transactions t
  where t.type = 'expense'
    and t.status = 'completed'
    and t.category_id is not null

  union all

  select
    t.id as expense_transaction_id,
    t.user_id,
    t.date,
    t.amount as transaction_amount,
    s.category_id,
    s.amount as allocated_amount
  from public.transactions t
  join public.transaction_splits s on s.transaction_id = t.id
  where t.type = 'expense'
    and t.status = 'completed'
    and t.category_id is null
),
monthly_movements as (
  select
    ea.user_id,
    date_trunc('month', ea.date)::date as month,
    ea.category_id,
    ea.allocated_amount as expense_amount,
    0::numeric as refund_amount
  from expense_allocations ea

  union all

  select
    refund.user_id,
    date_trunc('month', refund.date)::date as month,
    original_allocation.category_id,
    0::numeric as expense_amount,
    (refund.amount * original_allocation.allocated_amount / original_allocation.transaction_amount) as refund_amount
  from public.transactions refund
  join expense_allocations original_allocation
    on original_allocation.expense_transaction_id = refund.linked_refund_of
    and original_allocation.user_id = refund.user_id
  where refund.type = 'income'
    and refund.status = 'completed'
    and refund.linked_refund_of is not null
)
select
  user_id,
  month,
  category_id,
  sum(expense_amount)::numeric(14, 2) as expense_amount,
  sum(refund_amount)::numeric(14, 2) as refund_amount,
  (sum(expense_amount) - sum(refund_amount))::numeric(14, 2) as actual_spend
from monthly_movements
group by user_id, month, category_id;

-- Receivables and payables are intentionally excluded from personal net worth.
create or replace view public.net_worth
with (security_invoker = true)
as
select
  user_id,
  coalesce(sum(balance), 0)::numeric(14, 2) as net_worth
from public.account_balances
where account_type in ('bank', 'cash', 'investment')
group by user_id;

-- Savings rate is expressed as a fraction (0.20 means 20%). Linked refunds do
-- not count as income. A savings-to-investment movement is not counted twice.
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
    else (coalesce(s.savings_contribution_amount, 0) / i.income_amount)::numeric(18, 6)
  end as savings_rate
from months m
left join income_by_month i using (user_id, month)
left join savings_by_month s using (user_id, month);

-- Rollover is a recursive chain per user/category. A previous month's
-- remainder carries only when that previous budget enabled rollover. Missing
-- budget months intentionally break the chain.
create or replace view public.budget_vs_actual
with (security_invoker = true)
as
with recursive budget_chain as (
  select
    b.user_id,
    b.category_id,
    b.month,
    b.planned_amount,
    b.rollover_enabled,
    0::numeric as carry_in,
    coalesce(s.actual_spend, 0)::numeric as actual_spend,
    (b.planned_amount - coalesce(s.actual_spend, 0))::numeric as remaining_amount
  from public.budgets b
  left join public.category_monthly_spend s
    on s.user_id = b.user_id
    and s.category_id = b.category_id
    and s.month = b.month
  where not exists (
    select 1
    from public.budgets previous_budget
    where previous_budget.user_id = b.user_id
      and previous_budget.category_id = b.category_id
      and previous_budget.month = (b.month - interval '1 month')::date
  )

  union all

  select
    next_budget.user_id,
    next_budget.category_id,
    next_budget.month,
    next_budget.planned_amount,
    next_budget.rollover_enabled,
    case when chain.rollover_enabled then chain.remaining_amount else 0 end as carry_in,
    coalesce(s.actual_spend, 0)::numeric as actual_spend,
    (
      next_budget.planned_amount
      + case when chain.rollover_enabled then chain.remaining_amount else 0 end
      - coalesce(s.actual_spend, 0)
    )::numeric as remaining_amount
  from budget_chain chain
  join public.budgets next_budget
    on next_budget.user_id = chain.user_id
    and next_budget.category_id = chain.category_id
    and next_budget.month = (chain.month + interval '1 month')::date
  left join public.category_monthly_spend s
    on s.user_id = next_budget.user_id
    and s.category_id = next_budget.category_id
    and s.month = next_budget.month
)
select
  user_id,
  category_id,
  month,
  planned_amount::numeric(14, 2),
  carry_in::numeric(14, 2),
  (planned_amount + carry_in)::numeric(14, 2) as available_amount,
  actual_spend::numeric(14, 2),
  remaining_amount::numeric(14, 2),
  rollover_enabled
from budget_chain;

-- Creates both legs inside the database transaction. Client code should call
-- this RPC once, never insert the debit and credit transfer rows separately.
create or replace function public.create_transfer(
  p_from_account_id uuid,
  p_to_account_id uuid,
  p_amount numeric(14, 2),
  p_date date,
  p_note text default null,
  p_status text default 'completed',
  p_user_id uuid default null
)
returns table (
  debit_transaction_id uuid,
  credit_transaction_id uuid,
  transfer_group_id uuid
)
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_user_id uuid := coalesce(v_auth_user_id, p_user_id);
  v_group_id uuid := gen_random_uuid();
  v_debit_transaction_id uuid;
  v_credit_transaction_id uuid;
  v_account_count integer;
begin
  if v_user_id is null then
    raise exception 'An authenticated user is required to create a transfer'
      using errcode = '42501';
  end if;

  if v_auth_user_id is not null and p_user_id is not null and p_user_id <> v_auth_user_id then
    raise exception 'p_user_id must match the authenticated user'
      using errcode = '42501';
  end if;

  if p_from_account_id = p_to_account_id then
    raise exception 'A transfer requires two different accounts'
      using errcode = '22023';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'Transfer amount must be greater than zero'
      using errcode = '22023';
  end if;

  if p_date is null then
    raise exception 'Transfer date is required'
      using errcode = '22023';
  end if;

  if p_status not in ('completed', 'pending', 'reversed') then
    raise exception 'Transfer status must be completed, pending, or reversed'
      using errcode = '22023';
  end if;

  select count(*) into v_account_count
  from public.accounts
  where user_id = v_user_id
    and id in (p_from_account_id, p_to_account_id);

  if v_account_count <> 2 then
    raise exception 'Both transfer accounts must belong to the current user'
      using errcode = '42501';
  end if;

  insert into public.transactions (
    user_id, account_id, type, amount, direction, date, note, status, transfer_group_id
  )
  values (
    v_user_id, p_from_account_id, 'transfer', p_amount, 'debit', p_date, p_note, p_status, v_group_id
  )
  returning id into v_debit_transaction_id;

  insert into public.transactions (
    user_id, account_id, type, amount, direction, date, note, status, transfer_group_id
  )
  values (
    v_user_id, p_to_account_id, 'transfer', p_amount, 'credit', p_date, p_note, p_status, v_group_id
  )
  returning id into v_credit_transaction_id;

  return query
  select v_debit_transaction_id, v_credit_transaction_id, v_group_id;
end;
$$;

create index if not exists budgets_user_category_month_idx
  on public.budgets (user_id, category_id, month);

grant select on public.account_balances, public.category_monthly_spend,
  public.net_worth, public.savings_rate_monthly, public.budget_vs_actual to authenticated;
grant execute on function public.create_transfer(uuid, uuid, numeric, date, text, text, uuid) to authenticated;

commit;
