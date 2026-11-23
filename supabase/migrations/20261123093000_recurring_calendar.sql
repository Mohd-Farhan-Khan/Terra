begin;
alter table public.recurring_rules add column anchor_day integer check(anchor_day between 1 and 31);
update public.recurring_rules set anchor_day=extract(day from next_due_date) where anchor_day is null;
alter table public.recurring_rules alter column anchor_day set not null;

create function public.next_rule_date(due date, frequency text, anchor_day integer)
returns date language sql immutable strict as $$
  select case when frequency='weekly' then due+7
    else least((base + (anchor_day-1))::date,(base+interval '1 month'-interval '1 day')::date) end
  from (select (date_trunc('month',due) +
    case when frequency='yearly' then interval '1 year' else interval '1 month' end)::date as base) n;
$$;

create function public.set_rule_anchor() returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if tg_op='INSERT' then new.anchor_day:=extract(day from new.next_due_date);
  elsif new.frequency<>old.frequency or (new.next_due_date<>old.next_due_date and
    new.next_due_date<>public.next_rule_date(old.next_due_date,old.frequency,old.anchor_day)) then
    new.anchor_day:=extract(day from new.next_due_date);
  end if;
  return new;
end;
$$;
create trigger recurring_anchor before insert or update of next_due_date,frequency on public.recurring_rules
for each row execute function public.set_rule_anchor();
create or replace function public.confirm_recurring_occurrence(
  p_recurring_rule_id uuid,
  p_expected_next_due_date date,
  p_occurred_on date default current_date,
  p_user_id uuid default null
)
returns table (
  transaction_id uuid,
  next_due_date date
)
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_user_id uuid := coalesce(v_auth_user_id, p_user_id);
  v_rule public.recurring_rules%rowtype;
  v_transaction_id uuid;
  v_next_due_date date;
begin
  if v_user_id is null then
    raise exception 'An authenticated user is required to confirm a recurring occurrence'
      using errcode = '42501';
  end if;

  if v_auth_user_id is not null and p_user_id is not null and p_user_id <> v_auth_user_id then
    raise exception 'p_user_id must match the authenticated user'
      using errcode = '42501';
  end if;

  if p_expected_next_due_date is null or p_occurred_on is null then
    raise exception 'A due date and occurrence date are required'
      using errcode = '22023';
  end if;

  select * into v_rule
  from public.recurring_rules
  where id = p_recurring_rule_id
    and user_id = v_user_id
    and is_active
  for update;

  if not found then
    raise exception 'The recurring rule is not available to this user'
      using errcode = '42501';
  end if;

  if v_rule.next_due_date <> p_expected_next_due_date then
    raise exception 'This recurring rule has already been confirmed or changed. Refresh and try again.'
      using errcode = '40001';
  end if;

  v_next_due_date := public.next_rule_date(v_rule.next_due_date, v_rule.frequency, v_rule.anchor_day);

  insert into public.transactions (
    user_id, account_id, type, category_id, amount, direction, date, note, status, recurring_rule_id
  )
  values (
    v_user_id, v_rule.account_id, 'expense', v_rule.category_id, v_rule.amount, 'debit',
    p_occurred_on, v_rule.name, 'completed', v_rule.id
  )
  returning id into v_transaction_id;

  update public.recurring_rules
  set next_due_date = v_next_due_date
  where id = v_rule.id;

  return query select v_transaction_id, v_next_due_date;
end;
$$;

commit;
