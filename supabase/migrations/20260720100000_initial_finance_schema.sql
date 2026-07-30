-- Terra V1: core financial model and tenant isolation.
-- All money locations are accounts. Transfers are exactly two matched legs and
-- never carry categories; income and expenses have one category or splits.

begin;

create extension if not exists pgcrypto;

create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) > 0),
  type text not null check (type in ('bank', 'cash', 'investment', 'receivable', 'payable')),
  is_archived boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  unique (id, user_id)
);

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) > 0),
  parent_category_id uuid references public.categories (id) on delete restrict,
  kind text not null check (kind in ('income', 'expense')),
  created_at timestamptz not null default timezone('utc', now())
);

create unique index categories_system_name_unique
  on public.categories (kind, name, coalesce(parent_category_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where user_id is null;

create unique index categories_user_name_unique
  on public.categories (user_id, kind, name, coalesce(parent_category_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where user_id is not null;

create table public.recurring_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) > 0),
  account_id uuid not null,
  category_id uuid not null references public.categories (id) on delete restrict,
  amount numeric(14, 2) not null check (amount > 0),
  frequency text not null check (frequency in ('monthly', 'weekly', 'yearly')),
  next_due_date date not null,
  is_active boolean not null default true,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (id, user_id),
  foreign key (account_id, user_id)
    references public.accounts (id, user_id) on delete restrict
);

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  account_id uuid not null,
  type text not null check (type in ('income', 'expense', 'transfer')),
  category_id uuid references public.categories (id) on delete restrict,
  amount numeric(14, 2) not null check (amount > 0),
  direction text not null check (direction in ('debit', 'credit')),
  date date not null,
  note text,
  status text not null default 'completed' check (status in ('completed', 'reversed', 'pending')),
  transfer_group_id uuid,
  linked_refund_of uuid,
  recurring_rule_id uuid,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (id, user_id),
  foreign key (account_id, user_id)
    references public.accounts (id, user_id) on delete restrict,
  foreign key (linked_refund_of, user_id)
    references public.transactions (id, user_id) on delete restrict,
  foreign key (recurring_rule_id, user_id)
    references public.recurring_rules (id, user_id) on delete set null (recurring_rule_id),
  check (
    (type = 'transfer'
      and category_id is null
      and transfer_group_id is not null
      and linked_refund_of is null)
    or
    (type in ('income', 'expense') and transfer_group_id is null)
  )
);

create unique index transactions_transfer_direction_unique
  on public.transactions (user_id, transfer_group_id, direction)
  where type = 'transfer';

create index transactions_user_date_idx on public.transactions (user_id, date desc);
create index transactions_account_date_idx on public.transactions (account_id, date desc);
create index transactions_transfer_group_idx on public.transactions (transfer_group_id)
  where transfer_group_id is not null;
create index transactions_linked_refund_idx on public.transactions (linked_refund_of)
  where linked_refund_of is not null;

create table public.transaction_splits (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete restrict,
  amount numeric(14, 2) not null check (amount > 0),
  unique (transaction_id, category_id)
);

create index transaction_splits_transaction_idx on public.transaction_splits (transaction_id);

create table public.counterparties (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) > 0),
  relationship_tag text not null check (relationship_tag in ('parent', 'friend', 'other')),
  linked_account_id uuid not null,
  created_at timestamptz not null default timezone('utc', now()),
  unique (id, user_id),
  unique (linked_account_id),
  foreign key (linked_account_id, user_id)
    references public.accounts (id, user_id) on delete restrict
);

create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  category_id uuid not null references public.categories (id) on delete restrict,
  month date not null check (month = date_trunc('month', month)::date),
  planned_amount numeric(14, 2) not null check (planned_amount >= 0),
  rollover_enabled boolean not null default false,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (user_id, category_id, month)
);

create table public.goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(btrim(name)) > 0),
  target_amount numeric(14, 2) not null check (target_amount > 0),
  target_date date,
  linked_account_id uuid not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (id, user_id),
  foreign key (linked_account_id, user_id)
    references public.accounts (id, user_id) on delete restrict
);

-- A category can be a system category (user_id is null) or belong to this user.
-- Its kind must match the financial record that uses it.
create function public.assert_usable_category(
  p_category_id uuid,
  p_user_id uuid,
  p_kind text
)
returns void
language plpgsql
set search_path = public
as $$
declare
  category_record public.categories%rowtype;
begin
  select * into category_record from public.categories where id = p_category_id;

  if not found
    or category_record.kind <> p_kind
    or (category_record.user_id is not null and category_record.user_id <> p_user_id) then
    raise exception 'Category % is not an available % category for this user', p_category_id, p_kind;
  end if;
end;
$$;

create function public.validate_category_parent()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  parent_record public.categories%rowtype;
begin
  if new.parent_category_id is null then
    return new;
  end if;

  select * into parent_record from public.categories where id = new.parent_category_id;

  if not found
    or parent_record.kind <> new.kind
    or (parent_record.user_id is not null and parent_record.user_id <> new.user_id) then
    raise exception 'A category parent must have the same kind and be system-owned or owned by the same user';
  end if;

  return new;
end;
$$;

create trigger categories_validate_parent
before insert or update of parent_category_id, kind, user_id on public.categories
for each row execute function public.validate_category_parent();

create function public.validate_recurring_rule()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  perform public.assert_usable_category(new.category_id, new.user_id, 'expense');
  return new;
end;
$$;

create trigger recurring_rules_validate_category
before insert or update of category_id, user_id on public.recurring_rules
for each row execute function public.validate_recurring_rule();

create function public.validate_budget_category()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  perform public.assert_usable_category(new.category_id, new.user_id, 'expense');
  return new;
end;
$$;

create trigger budgets_validate_category
before insert or update of category_id, user_id on public.budgets
for each row execute function public.validate_budget_category();

-- This deferred check permits a transaction and its split rows to be inserted
-- atomically, while requiring exactly one representation at commit time.
create function public.validate_transaction_classification()
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

create constraint trigger transactions_validate_classification
after insert or update of type, category_id, amount, linked_refund_of on public.transactions
deferrable initially deferred
for each row execute function public.validate_transaction_classification();

create constraint trigger transaction_splits_validate_classification
after insert or update or delete on public.transaction_splits
deferrable initially deferred
for each row execute function public.validate_transaction_classification();

-- A transfer group represents one movement between two accounts: one debit and
-- one credit, same user/amount/date/status, and different accounts.
create function public.validate_transfer_group()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  group_id_to_check uuid;
  user_id_to_check uuid;
  leg_count integer;
  account_count integer;
  debit_count integer;
  credit_count integer;
  amount_count integer;
  date_count integer;
  status_count integer;
begin
  if tg_op = 'delete' then
    group_id_to_check := old.transfer_group_id;
    user_id_to_check := old.user_id;
  else
    group_id_to_check := new.transfer_group_id;
    user_id_to_check := new.user_id;
  end if;

  if group_id_to_check is null then
    if tg_op = 'delete' then
      return old;
    end if;
    return new;
  end if;

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

  if leg_count <> 2
    or account_count <> 2
    or debit_count <> 1
    or credit_count <> 1
    or amount_count <> 1
    or date_count <> 1
    or status_count <> 1 then
    raise exception 'A transfer group must contain exactly one matched debit and credit between two accounts';
  end if;

  if tg_op = 'delete' then
    return old;
  end if;
  return new;
end;
$$;

create constraint trigger transactions_validate_transfer_group
after insert or update or delete on public.transactions
deferrable initially deferred
for each row execute function public.validate_transfer_group();

create function public.validate_counterparty_account()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.accounts
    where id = new.linked_account_id
      and user_id = new.user_id
      and type in ('receivable', 'payable')
  ) then
    raise exception 'A counterparty must be linked to a receivable or payable account owned by the same user';
  end if;
  return new;
end;
$$;

create trigger counterparties_validate_linked_account
before insert or update of linked_account_id, user_id on public.counterparties
for each row execute function public.validate_counterparty_account();

create function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

create trigger recurring_rules_set_updated_at
before update on public.recurring_rules
for each row execute function public.set_updated_at();

create trigger transactions_set_updated_at
before update on public.transactions
for each row execute function public.set_updated_at();

create trigger budgets_set_updated_at
before update on public.budgets
for each row execute function public.set_updated_at();

create trigger goals_set_updated_at
before update on public.goals
for each row execute function public.set_updated_at();

-- System-owned categories use user_id = null. Users can read them but cannot
-- edit or delete them; user-created categories always carry their auth user id.
insert into public.categories (user_id, name, parent_category_id, kind)
values
  (null, 'Salary', null, 'income'),
  (null, 'Refunds & Reimbursements', null, 'income'),
  (null, 'Gifts Received', null, 'income'),
  (null, 'Interest/Returns', null, 'income'),
  (null, 'Other Income', null, 'income'),
  (null, 'Housing & Utilities', null, 'expense'),
  (null, 'Food', null, 'expense'),
  (null, 'Transport', null, 'expense'),
  (null, 'Health', null, 'expense'),
  (null, 'Shopping', null, 'expense'),
  (null, 'Entertainment & Lifestyle', null, 'expense'),
  (null, 'Family & Relationships', null, 'expense'),
  (null, 'Debt & EMI', null, 'expense'),
  (null, 'Education & Self-development', null, 'expense'),
  (null, 'Personal Care', null, 'expense'),
  (null, 'Miscellaneous', null, 'expense')
on conflict do nothing;

with category_children (parent_name, child_name) as (
  values
    ('Housing & Utilities', 'Rent'),
    ('Housing & Utilities', 'Electricity'),
    ('Housing & Utilities', 'Water'),
    ('Housing & Utilities', 'Internet'),
    ('Housing & Utilities', 'Maintenance'),
    ('Food', 'Groceries'),
    ('Food', 'Eating Out'),
    ('Food', 'Food Delivery'),
    ('Transport', 'Fuel'),
    ('Transport', 'Public Transport'),
    ('Transport', 'Cab/Auto'),
    ('Transport', 'Vehicle Maintenance'),
    ('Health', 'Medical'),
    ('Health', 'Pharmacy'),
    ('Health', 'Insurance Premium'),
    ('Shopping', 'Clothing'),
    ('Shopping', 'Electronics'),
    ('Shopping', 'Household Items'),
    ('Entertainment & Lifestyle', 'Subscriptions'),
    ('Entertainment & Lifestyle', 'Movies'),
    ('Entertainment & Lifestyle', 'Hobbies'),
    ('Family & Relationships', 'Family Support'),
    ('Family & Relationships', 'Gifts Given'),
    ('Debt & EMI', 'Loan EMI'),
    ('Debt & EMI', 'Credit Card Payment'),
    ('Education & Self-development', 'Courses'),
    ('Education & Self-development', 'Books'),
    ('Education & Self-development', 'Certifications'),
    ('Personal Care', 'Grooming'),
    ('Personal Care', 'Fitness')
)
insert into public.categories (user_id, name, parent_category_id, kind)
select null, children.child_name, parents.id, 'expense'
from category_children children
join public.categories parents
  on parents.user_id is null
  and parents.kind = 'expense'
  and parents.name = children.parent_name
  and parents.parent_category_id is null
on conflict do nothing;

alter table public.accounts enable row level security;
alter table public.categories enable row level security;
alter table public.transactions enable row level security;
alter table public.transaction_splits enable row level security;
alter table public.counterparties enable row level security;
alter table public.recurring_rules enable row level security;
alter table public.budgets enable row level security;
alter table public.goals enable row level security;

create policy accounts_owner_access on public.accounts
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy categories_read_system_or_owned on public.categories
  for select to authenticated
  using (user_id is null or auth.uid() = user_id);

create policy categories_insert_owned on public.categories
  for insert to authenticated
  with check (auth.uid() = user_id);

create policy categories_update_owned on public.categories
  for update to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy categories_delete_owned on public.categories
  for delete to authenticated
  using (auth.uid() = user_id);

create policy transactions_owner_access on public.transactions
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy transaction_splits_owner_access on public.transaction_splits
  for all to authenticated
  using (
    exists (
      select 1 from public.transactions
      where transactions.id = transaction_splits.transaction_id
        and transactions.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.transactions
      where transactions.id = transaction_splits.transaction_id
        and transactions.user_id = auth.uid()
    )
  );

create policy counterparties_owner_access on public.counterparties
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy recurring_rules_owner_access on public.recurring_rules
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy budgets_owner_access on public.budgets
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy goals_owner_access on public.goals
  for all to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.accounts to authenticated;
grant select, insert, update, delete on public.categories to authenticated;
grant select, insert, update, delete on public.transactions to authenticated;
grant select, insert, update, delete on public.transaction_splits to authenticated;
grant select, insert, update, delete on public.counterparties to authenticated;
grant select, insert, update, delete on public.recurring_rules to authenticated;
grant select, insert, update, delete on public.budgets to authenticated;
grant select, insert, update, delete on public.goals to authenticated;

commit;
