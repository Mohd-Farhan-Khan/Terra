# Hosted verification record

## 23 November 2026 · Terra Finance

The hosted project was Healthy. The ledger preflight returned zero exceptions and all eight public application tables had row-level security enabled. The upgrade registered the eight existing migration versions and applied four new ones through `20261123093000`. It compared account balances across the upgrade and checked RLS on the private request-receipt table before committing.

A separate SQL Editor transaction exercised the same entry and reporting RPCs used by the frontend. It created two temporary identities, switched to the PostgreSQL `authenticated` role, and asserted that RLS was active.

| Check                                           | Observed result                                                                          |
| ----------------------------------------------- | ---------------------------------------------------------------------------------------- |
| Submit a ₹100 transfer and retry its request ID | Both calls returned the same booking ID. The owner saw exactly two ledger legs.          |
| Read the cleared summary                        | Net movement across accounts was ₹0. The destination account showed +₹100.               |
| Switch to the second identity                   | The owner’s ledger entries, statement lines and matching request receipt were invisible. |
| Finish the check                                | The transaction rolled back both identities, the accounts and the booking.               |

This run exercised PostgreSQL permissions and the application RPCs. It used SQL role and claim settings. Browser login, network requests through the Data API, and concurrent client submissions have separate integration tests.

## Earlier hosted run

On 5 November 2026 the email signup quota blocked the JavaScript two-user test before it obtained both sessions. That historical result describes the signup-based test only.

## Repeatable tests

Use the disposable stack in [Operations](../../docs/OPERATIONS.md) for `npm run test:sql`, `npm run test:database`, `npm run test:schema`, and `npm run test:browser`. The JavaScript database verifier writes one JSON result per run under `coverage/database/`.
