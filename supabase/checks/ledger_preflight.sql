-- Read-only diagnostic for the legacy schema. Run with visibility of all tenants.
with recursive ancestry(root_id,id,parent_category_id) as (
  select id,id,parent_category_id from public.categories
  union
  select a.root_id,c.id,c.parent_category_id
  from ancestry a join public.categories c on c.id=a.parent_category_id
), issues(record_id,reason) as (
  select id,'Transaction type and direction disagree'
  from public.transactions
  where (type='income' and direction<>'credit') or (type='expense' and direction<>'debit')
  union all
  select transfer_group_id,'Transfer legs do not match'
  from public.transactions where type='transfer' group by user_id,transfer_group_id
  having count(*)<>2 or count(distinct account_id)<>2 or count(distinct direction)<>2
      or count(distinct amount)<>1 or count(distinct date)<>1 or count(distinct status)<>1
  union all
  select t.id,'Split count or total does not match its parent'
  from public.transactions t left join public.transaction_splits s on s.transaction_id=t.id
  where t.type<>'transfer' and t.category_id is null group by t.id
  having count(s.id)<2 or sum(s.amount) is distinct from t.amount
  union all
  select distinct t.id,'Unexpected split on a categorized transaction or transfer'
  from public.transactions t join public.transaction_splits s on s.transaction_id=t.id
  where t.category_id is not null or t.type='transfer'
  union all
  select id,'Refund or original has the wrong type'
  from public.transactions t where t.linked_refund_of is not null and (t.type<>'income' or not exists (
    select 1 from public.transactions o where o.id=t.linked_refund_of and o.user_id=t.user_id and o.type='expense'))
  union all
  select root_id,'Category hierarchy contains a cycle' from ancestry where root_id=parent_category_id
  union all
  select cp.id,'Counterparty funding account has the wrong type'
  from public.counterparties cp join public.accounts a on a.id=cp.linked_account_id
  where a.type not in ('payable','receivable')
  union all
  select t.id,'Transaction or split category has the wrong kind or owner'
  from public.transactions t join public.categories c on c.id=t.category_id
  where c.kind<>t.type or (c.user_id is not null and c.user_id<>t.user_id)
  union all
  select s.id,'Split category has the wrong kind or owner'
  from public.transaction_splits s join public.transactions t on t.id=s.transaction_id
  join public.categories c on c.id=s.category_id
  where c.kind<>t.type or (c.user_id is not null and c.user_id<>t.user_id)
)
select record_id,reason from issues order by reason,record_id;
