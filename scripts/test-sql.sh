#!/usr/bin/env bash
set -euo pipefail
# Always use the disposable CLI database and stop at the first failed assertion.
for fixture in finance_calculations transaction_entry_verification archive_selection_verification counterparty_balances ledger_regressions; do
  psql -X --set ON_ERROR_STOP=1 --dbname "postgresql://postgres:postgres@127.0.0.1:54322/postgres" --file "supabase/tests/$fixture.sql"
done
