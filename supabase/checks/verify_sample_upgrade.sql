-- The CI upgrade fixture seeds the prior schema using seed_dashboard_test_data.sql.
do $$
declare
  owner_id constant uuid := '00000001-0000-0000-0000-000000000001';
  totals record;
begin
  perform set_config('request.jwt.claim.sub', owner_id::text, true);
  select * into strict totals from public.transaction_summary();
  if (totals.income_amount,totals.outflow_amount,totals.net_amount,totals.transaction_count)
    is distinct from (6240::numeric,3487.21::numeric,2752.79::numeric,11::bigint) then
    raise exception 'The upgraded ledger differs from the legacy postings: %',totals;
  end if;
  if (select count(*) from public.recurring_rules where user_id=owner_id and anchor_day=extract(day from next_due_date))<>5 then
    raise exception 'Existing recurrence dates were lost';
  end if;
end;
$$;
