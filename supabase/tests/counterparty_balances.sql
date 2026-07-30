-- SQL Editor verification for counterparty lending and repayment transfers.
-- All work is rolled back; the final linked-account balances are authoritative.

begin;

create temp table counterparty_test_context (
  user_id uuid,
  checking_id uuid,
  receivable_id uuid,
  payable_id uuid,
  mom_id uuid,
  friend_id uuid
);

do $$
declare
  v_user_id uuid := gen_random_uuid();
  v_checking_id uuid;
  v_receivable_id uuid;
  v_payable_id uuid;
  v_mom_id uuid;
  v_friend_id uuid;
begin
  insert into auth.users (
    id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
    raw_app_meta_data, raw_user_meta_data, created_at, updated_at
  ) values (
    v_user_id, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
    'counterparty-test-' || v_user_id::text || '@example.test', crypt('not-used', gen_salt('bf')),
    now(), '{}'::jsonb, '{}'::jsonb, now(), now()
  );

  insert into public.accounts (user_id, name, type) values (v_user_id, 'Counterparty test checking', 'bank') returning id into v_checking_id;
  insert into public.accounts (user_id, name, type) values (v_user_id, 'Counterparty test Mom', 'receivable') returning id into v_receivable_id;
  insert into public.accounts (user_id, name, type) values (v_user_id, 'Counterparty test Friend', 'payable') returning id into v_payable_id;
  insert into public.counterparties (user_id, name, relationship_tag, linked_account_id) values (v_user_id, 'Mom', 'parent', v_receivable_id) returning id into v_mom_id;
  insert into public.counterparties (user_id, name, relationship_tag, linked_account_id) values (v_user_id, 'Friend', 'friend', v_payable_id) returning id into v_friend_id;
  insert into counterparty_test_context values (v_user_id, v_checking_id, v_receivable_id, v_payable_id, v_mom_id, v_friend_id);
end;
$$;

-- Lending ₹100 gives the linked receivable account a ₹100 balance; a ₹40
-- repayment moves it toward zero to ₹60. Borrowing ₹80 gives the payable
-- account a -₹80 balance; repaying ₹50 moves it toward zero to -₹30.
select * from public.create_transfer((select checking_id from counterparty_test_context), (select receivable_id from counterparty_test_context), 100, '2026-07-01', 'Loan to Mom', 'completed', (select user_id from counterparty_test_context));
select * from public.create_transfer((select receivable_id from counterparty_test_context), (select checking_id from counterparty_test_context), 40, '2026-07-05', 'Mom repaid', 'completed', (select user_id from counterparty_test_context));
select * from public.create_transfer((select payable_id from counterparty_test_context), (select checking_id from counterparty_test_context), 80, '2026-07-02', 'Borrowed from Friend', 'completed', (select user_id from counterparty_test_context));
select * from public.create_transfer((select checking_id from counterparty_test_context), (select payable_id from counterparty_test_context), 50, '2026-07-06', 'Repaid Friend', 'completed', (select user_id from counterparty_test_context));

set constraints all immediate;

select c.name, a.balance
from public.counterparties c
join public.account_balances a on a.account_id = c.linked_account_id
where c.user_id = (select user_id from counterparty_test_context)
order by c.name;

do $$
begin
  if (select balance from public.account_balances where account_id = (select receivable_id from counterparty_test_context)) <> 60 then
    raise exception 'Expected Mom receivable balance to be 60 after repayment';
  end if;
  if (select balance from public.account_balances where account_id = (select payable_id from counterparty_test_context)) <> -30 then
    raise exception 'Expected Friend payable balance to be -30 after repayment';
  end if;
end;
$$;

rollback;
