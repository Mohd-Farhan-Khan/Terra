-- Rollback-only integration fixture. Exercise the RPCs under an owner's JWT.
begin;
do $$
declare
  owner_id uuid := gen_random_uuid();
  checking uuid;
  savings uuid;
  food uuid;
  transport uuid;
  salary uuid;
  split_id uuid;
  transfer_id uuid;
  request_id uuid := gen_random_uuid();
  payload jsonb;
  summary record;
  rejected boolean;
  rule_id uuid;
  second_split uuid;
  third_category uuid;
begin
  insert into auth.users (id,email) values(owner_id,owner_id::text||'@example.test');
  perform set_config('request.jwt.claim.sub',owner_id::text,true);
  insert into public.accounts(user_id,name,type) values(owner_id,'Checking','bank') returning id into checking;
  insert into public.accounts(user_id,name,type) values(owner_id,'Savings','bank') returning id into savings;
  insert into public.categories(user_id,name,kind) values(owner_id,'Groceries','expense') returning id into food;
  insert into public.categories(user_id,name,kind) values(owner_id,'Transit','expense') returning id into transport;
  insert into public.categories(user_id,name,kind) values(owner_id,'Cash in','income') returning id into salary;
  update public.categories set parent_category_id=food where id=transport;
  rejected:=false;
  begin
    update public.categories set parent_category_id=transport where id=food;
  exception when raise_exception then rejected:=true; end;
  if not rejected then raise exception 'Category cycle accepted'; end if;
  payload:=jsonb_build_object('type','transfer','account',checking,'destination',savings,'amount',100,'date','2026-07-01');
  transfer_id:=public.post_entry(request_id,payload);
  if public.post_entry(request_id,payload) is distinct from transfer_id then raise exception 'Replay returned a different booking'; end if;
  rejected:=false;
  begin
    perform public.post_entry(request_id,payload || jsonb_build_object('amount',1));
  exception when raise_exception then rejected:=true; end;
  if not rejected then raise exception 'A retry changed its payload'; end if;
  select * into strict summary from public.transaction_summary();
  if (summary.net_amount,summary.outflow_amount,summary.transaction_count) is distinct from (0::numeric,0::numeric,2::bigint) then
    raise exception 'Transfer double counted: %',summary;
  end if;
  if (select net_amount from public.transaction_summary(null,null,savings)) is distinct from 100 then raise exception 'Receiving leg sign'; end if;

  set constraints all immediate;
  rejected:=false;
  begin
    delete from public.transactions where id=transfer_id;
  exception when raise_exception then rejected:=true; end;
  if not rejected then raise exception 'A single transfer leg was removed'; end if;
  delete from public.transactions where transfer_group_id=(select transfer_group_id from public.transactions where id=transfer_id);
  set constraints all deferred;

  split_id:=public.create_expense_with_splits(checking,100,'2026-07-01','Two categories',jsonb_build_array(
    jsonb_build_object('category_id',food,'amount',50),jsonb_build_object('category_id',transport,'amount',50)));
  insert into public.transactions(user_id,account_id,type,category_id,amount,direction,date,linked_refund_of)
    values(owner_id,checking,'income',salary,0.01,'credit','2026-08-01',split_id);
  if (select sum(refund_amount) from public.category_monthly_spend where user_id=owner_id and month='2026-08-01') is distinct from 0.01 then
    raise exception 'Partial split refund lost a paisa'; end if;
  if (select amount from public.filtered_ledger('2026-07-01','2026-07-31',null,food)) is distinct from 50 then raise exception 'Split filter amount'; end if;
  insert into public.transactions(user_id,account_id,type,category_id,amount,direction,date,status) values
    (owner_id,checking,'expense',food,15,'debit','2026-07-01','pending'),
    (owner_id,checking,'expense',food,15,'debit','2026-07-01','reversed');
  select * into strict summary from public.transaction_summary();
  if (summary.income_amount,summary.outflow_amount,summary.net_amount,summary.transaction_count) is distinct from
    (0::numeric,99.99::numeric,-99.99::numeric,2::bigint) then raise exception 'Refund/status summary mismatch: %',summary; end if;
  set constraints all immediate;
  rejected:=false;
  begin
    delete from public.transaction_splits where transaction_id=split_id and category_id=food;
  exception when raise_exception then rejected:=true; end;
  if not rejected then raise exception 'Split with a missing category committed'; end if;

  rejected:=false;
  begin
    insert into public.transactions(user_id,account_id,type,category_id,amount,direction,date)
      values(owner_id,checking,'expense',food,1,'credit',current_date);
  exception when check_violation then rejected:=true; end;
  if not rejected then raise exception 'Accepted expense credit'; end if;

  -- Construct a valid destination so rejection must come from the old parent.
  insert into public.categories(user_id,name,kind) values(owner_id,'Other','expense') returning id into third_category;
  set constraints all deferred;
  second_split:=public.create_expense_with_splits(checking,2,'2026-09-01','Move test',jsonb_build_array(
    jsonb_build_object('category_id',third_category,'amount',1),jsonb_build_object('category_id',transport,'amount',1)));
  set constraints all immediate;
  rejected:=false;
  begin
    set constraints all deferred;
    update public.transaction_splits set transaction_id=second_split where transaction_id=split_id and category_id=food;
    update public.transactions set amount=52 where id=second_split;
    set constraints all immediate;
  exception when raise_exception then rejected:=true; end;
  if not rejected then raise exception 'Moving a split left its old parent invalid'; end if;
  delete from public.transactions where id=second_split;
  if exists (select from public.transaction_splits where transaction_id=second_split) then raise exception 'Orphan split'; end if;

  insert into public.budgets(user_id,category_id,month,planned_amount) values(owner_id,food,'2026-07-01',0.01);
  insert into public.transactions(user_id,account_id,type,category_id,amount,direction,date) values(owner_id,checking,'expense',food,950,'debit','2026-07-01');
  if (select utilization_percent from public.budget_vs_actual_with_progress where user_id=owner_id and category_id=food) is distinct from 10000000 then
    raise exception 'Tiny budget ratio'; end if;
  update public.budgets set rollover_enabled=true where user_id=owner_id and category_id=food;
  insert into public.budgets(user_id,category_id,month,planned_amount) values
    (owner_id,food,'2026-08-01',0),(owner_id,food,'2026-10-01',1);
  if (select carry_in from public.budget_vs_actual where user_id=owner_id and category_id=food and month='2026-08-01') is distinct from -999.99 then
    raise exception 'Negative rollover was lost'; end if;
  if (select carry_in from public.budget_vs_actual where user_id=owner_id and category_id=food and month='2026-10-01') is distinct from 0 then
    raise exception 'A gap incorrectly carried a prior budget'; end if;
  if public.next_rule_date('2027-02-28','yearly',29) is distinct from date '2028-02-29' then raise exception 'Leap year drift'; end if;
  insert into public.recurring_rules(user_id,name,account_id,category_id,amount,frequency,next_due_date)
    values(owner_id,'Rent',checking,food,1,'monthly','2026-01-31') returning id into rule_id;
  perform public.confirm_recurring_occurrence(rule_id,'2026-01-31','2026-01-31');
  perform public.confirm_recurring_occurrence(rule_id,'2026-02-28','2026-02-28');
  if (select next_due_date from public.recurring_rules where id=rule_id) is distinct from date '2026-03-31' then raise exception 'Month end drift'; end if;
  rejected:=false;
  begin
    perform public.confirm_recurring_occurrence(rule_id,'2026-02-28','2026-02-28');
  exception when serialization_failure then rejected:=true; end;
  if not rejected then raise exception 'Duplicate recurring confirmation'; end if;
  set constraints all deferred;
  insert into public.transactions(user_id,account_id,type,category_id,amount,direction,date)
    select owner_id,savings,'income',salary,1,'credit',date '2026-07-01' from generate_series(1,1005);
  if (select count(*) from public.account_recent_activity where account_id=savings) <> 8 then
    raise exception 'Chart must read only the last eight movements'; end if;
  if (select running_balance from public.account_statement where account_id=savings order by date desc,created_at desc,id desc limit 1) is distinct from 1005 then
    raise exception 'Full-history statement balance was truncated'; end if;
  update public.accounts set is_archived=true where id=checking;
  rejected:=false;
  begin
    perform public.post_entry(gen_random_uuid(),payload);
  exception when raise_exception then rejected:=true; end;
  if not rejected then raise exception 'Stale archived reference accepted'; end if;
  set constraints all immediate;
end;
$$;
rollback;
