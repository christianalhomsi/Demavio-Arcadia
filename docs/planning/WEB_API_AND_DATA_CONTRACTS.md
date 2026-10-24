# Web API & Data Contracts

**Status: none of these exist yet** (`backend/` is empty). They are *proposed* contracts derived from spec §18 (entities) and §20 (illustrative operations). The spec states a custom REST endpoint is not mandatory (§20); this plan proposes Postgres RPC functions (and Edge Functions where external I/O is needed). Names are proposals to be confirmed with the backend owner (DEC-W01).

## 1. Conventions

- Identity: always from the validated JWT (`auth.uid()`); never a parameter.
- Hall scope: `p_hall_id` is a *request*; RPC verifies membership + permission.
- Money: `bigint` minor units + `currency char(3)`; responses include both.
- Time: `timestamptz` (UTC); hall `time_zone` provided for display.
- Idempotency: mutating financial/session/command RPCs take `p_idempotency_key uuid`; a repeated key with the same payload returns the original result; with a different payload returns `IDEMPOTENCY_MISMATCH` (§19.2).
- Errors: `RAISE EXCEPTION USING ERRCODE = 'P0001', MESSAGE = '<CODE>', DETAIL = '<safe json>'` where `<CODE>` ∈ `PERMISSION_DENIED, NOT_FOUND, VALIDATION, CONFLICT, STALE_STATE, INSUFFICIENT_FUNDS, PRECONDITION_FAILED, IDEMPOTENCY_MISMATCH`. Web maps to `ErrorCode`.
- Audit: every mutating RPC writes `audit_logs` in the same transaction (§21.3).
- Reads: RLS-protected views prefixed `v_`; list views support `limit/offset` or keyset on `(created_at, id)`.

## 2. Identity & context

| Spec op | Proposed contract | Permission | Tables | Notes |
|---|---|---|---|---|
| `GET /me/permissions` | `rpc get_my_context() → { profile:{id,display_name,email,status,avatar_url}, platform_roles: Role[], memberships:[{hall_id,hall_name,tenant_id,hall_status,role,permissions: Permission[], discount_limit_minor}] }` | authenticated | profiles, user_role_assignments, hall_memberships, role_permissions | Single round trip per request |
| `GET /profile` | covered by above | self | profiles | |
| `PATCH /profile` | `rpc update_my_profile(p_display_name)` | self | profiles | |
| — | `rpc invite_member(p_hall_id, p_email, p_role, p_permissions[], p_idempotency_key) → invitation` | `employee.manage` | hall_memberships / invitations (**not in §18 — BE-PREREQ-08**) | Privileged access only via invitation (§5.2) |
| — | `rpc accept_invitation(p_token)` | authenticated | same | |
| — | `rpc update_member(p_membership_id, p_role, p_permissions[], p_discount_limit_minor)` | `employee.manage` | hall_memberships, user_role_assignments | audited before/after |
| — | `rpc set_member_status(p_membership_id, p_status, p_reason)` | `employee.manage` | hall_memberships | |

## 3. Halls & devices

| Spec op | Contract | Permission | Tables |
|---|---|---|---|
| `GET /halls` | `v_my_halls` | membership | halls |
| `GET /halls/{id}` | `v_hall_detail` | membership | halls, hall_settings, hall_working_hours |
| — | `v_hall_overview(hall_id)` → KPI row (financial fields null unless `invoice.view`) | `device.view` | many |
| — | `rpc update_hall_settings(p_hall_id, p_patch jsonb)` | `hall.settings.manage` | halls, hall_settings |
| — | `rpc set_working_hours(p_hall_id, p_hours jsonb)` | `hall.settings.manage` | hall_working_hours |
| `GET /halls/{id}/devices` | `v_device_live_status` {device_id, name, type, category, operational_status, maintenance_status, reservation_status, session_id, session_state, scheduled_end_at, next_reservation_at, agent_status, last_heartbeat_at, effective_availability} | `device.view` | devices, device_maintenance, sessions, reservations, agents |
| `GET /devices/{id}` | `v_device_detail` | `device.view` | + agent_commands |
| — | `rpc upsert_device(p_hall_id, p_device jsonb)` | `hall.settings.manage` | devices |
| — | `rpc preview_maintenance_impact(p_device_id, p_from, p_to)` → reservations[] | `device.view` | reservations |
| — | `rpc start_maintenance(p_device_id, p_reason, p_expected_end)` / `end_maintenance(p_maintenance_id)` | maintenance perm (DEC-01) | device_maintenance |
| `GET /halls/{id}/availability` | `rpc get_availability(p_hall_id, p_from, p_to, p_device_type?)` | `reservation.view` | — |

## 4. Reservations & sessions

| Spec op | Contract | Permission | Idempotent |
|---|---|---|---|
| `GET /reservations` | `v_reservations` filters hall, date range, status, device | `reservation.view` | — |
| `GET /reservations/{id}` | `v_reservation_detail` + `reservation_events` | `reservation.view` | — |
| `POST /reservations` | `rpc create_reservation(p_hall_id, p_customer_id, p_device_id|p_category, p_start, p_end, p_key)` | `reservation.create` | yes |
| `POST /reservations/{id}/cancel` | `rpc cancel_reservation(p_id, p_reason, p_key)` → {status, financial_effect} | `reservation.cancel` | yes |
| `POST /reservations/{id}/check-in` | `rpc check_in_reservation(p_id, p_override_reason?, p_key)` → {session_id, command_id?} | `reservation.check_in` (+ override perm) | yes |
| `GET /reservations/risks` | `rpc get_reservation_risks(p_hall_id, p_from, p_to)` (computed dynamically §16.2) | `reservation.view` | — |
| `POST /sessions/walk-in` | `rpc start_walk_in(p_hall_id, p_device_id, p_type, p_duration_min?, p_package_id?, p_customer_id?, p_key)` → {session_id, command_id?} | `session.start` | yes |
| — | `rpc quote_session(p_hall_id, p_device_id, p_type, p_duration_min, p_package_id?)` → estimate | `session.start` | — |
| `GET /sessions` / `{id}` | `v_sessions`, `v_active_sessions`, `v_session_detail` (+ `session_pricing_snapshots`, `session_events`) | session view | — |
| `POST /sessions/{id}/start` | `rpc start_session(p_id, p_key)` (for pre-created sessions in Starting) | `session.start` | yes |
| `POST /sessions/{id}/end` | `rpc end_session(p_id, p_end_type, p_reason?, p_key)` → {invoice_id, invoice_status, amount_due_minor} | `session.end` | yes |
| `POST /sessions/{id}/extend` | `rpc extend_session(p_id, p_minutes, p_reason, p_key)` | `session.extend` | yes |
| `POST /sessions/{id}/convert-to-open` | `rpc convert_session_to_open(p_id, p_reason, p_key)` | `session.extend` (DEC-01) | yes |
| — | `GET server time` via `rpc server_now()` | authenticated | — |

## 5. Financial operations — **trusted backend ownership**

The web dashboard is **never** the source of truth for wallet balances, payment status, invoice totals, or accounting records. Each mutation below is a single atomic, idempotent, audited backend function. The web submits intent + idempotency key and refetches.

| Workflow | Trusted operation | Permission | Atomic effects (backend) | Web role |
|---|---|---|---|---|
| Invoice finalization | `end_session` → internal `finalize_invoice` | `session.end` | invoice + items from snapshot | display result |
| Apply discount | `rpc apply_discount(p_target_type, p_target_id, p_discount_id|p_amount_minor, p_reason, p_key)` | discount perm + limit | invoice items, usage counters | collect intent |
| Cash payment | `rpc record_invoice_payment(p_invoice_id, p_method='cash', p_amount_minor, p_shift_id, p_key)` | `payment.collect` | payment, invoice paid/outstanding/status, cash_movement | collect intent |
| Wallet payment | `rpc pay_invoice_from_wallet(p_wallet_id, p_invoice_id, p_amount_minor, p_key)` | `payment.collect` | wallet_transaction debit (locked), payment, invoice | collect intent |
| Wallet top-up | `rpc wallet_top_up(p_wallet_id, p_amount_minor, p_method='cash', p_shift_id, p_key)` | `wallet.top_up` | wallet_transaction credit, cash_movement (liability) | collect intent |
| Refund request | `rpc request_refund(p_payment_id, p_amount_minor, p_reason_code, p_method, p_note, p_key)` | `refund.request` | refunds (pending) | collect intent |
| Refund approval | `rpc decide_refund(p_refund_id, p_decision, p_comment, p_key)` | `refund.approve` | refund, reversal payment/wallet credit, cash_movement | collect intent |
| Withdrawal | `rpc request_wallet_withdrawal(...)`, `rpc decide_wallet_withdrawal(...)` | `wallet.withdraw` | wallet_transaction, approvals | collect intent |
| Freeze wallet | `rpc set_wallet_status(p_wallet_id, p_status, p_reason)` | owner perm | wallets | collect intent |
| Adjustment / reversal | `rpc create_financial_adjustment(p_target_type, p_target_id, p_amount_minor, p_reason, p_key)` | `payment.adjust` | financial_adjustments | collect intent |
| Void / write-off | `rpc void_invoice(p_id, p_reason, p_key)` / `write_off_invoice(...)` | owner perm (DEC-01) | invoice status | collect intent |
| Open shift | `rpc open_shift(p_hall_id, p_register_id, p_opening_cash_minor, p_key)` | `shift.open` | shifts | collect intent |
| Unpaid summary | `rpc get_shift_unpaid_summary(p_shift_id)` | `shift.close` | read | display |
| Close shift | `rpc close_shift(p_shift_id, p_counted_cash_minor, p_override_reason?, p_key)` → {expected, counted, difference, status} | `shift.close` (+ override perm) | shifts, discrepancy record | collect intent |
| Cash movement | `rpc record_cash_movement(p_shift_id, p_type, p_amount_minor, p_reason, p_key)` | owner/permitted | cash_movements | collect intent |
| Expense | `rpc create_expense(...)`, `rpc decide_expense(...)` | finance perm | expenses, approvals | collect intent |

Reads: `v_invoices`, `v_invoice_detail`, `v_payments`, `v_payment_detail` (+ `payment_attempts`), `v_refunds`, `v_wallets`, `v_wallet_transactions`, `v_shifts`, `v_shift_detail`, `v_cash_movements`, `v_expenses`.

Reports (`GET /reports/revenue|payments|expenses`): `rpc report_financial_summary(p_hall_id, p_from, p_to)` returning the §13.3 categories as separate fields: `gross_session_charges, discounts, net_billed, collections_cash, collections_wallet, collections_online, refunds, outstanding_invoices, wallet_top_ups, wallet_liability, expenses, register_differences`. Breakdown RPCs (P2): by device/category/employee/period.

## 6. Agent commands (web side only)

| Spec op | Contract | Permission |
|---|---|---|
| `POST /devices/{id}/commands` | `rpc request_device_command(p_device_id, p_type, p_session_id?, p_key)` → {command_id, status:'Queued'} — payload built server-side from type; no free-form payload | `device.control` |
| `GET /commands` | `v_agent_commands` filters | `device.view` |
| `GET /commands/{id}` | `v_agent_command_detail` + `agent_command_events` | `device.view` |
| Agent health | `v_agent_status` {agent_id, device_id, version, connection_state, last_heartbeat_at, last_success_command_at, last_error, sync_state} | `device.view` |

Agent-facing operations (`heartbeat`, `command-acknowledgements`) are out of scope; the web only reads their results.

## 7. Admin & sales

| Contract | Permission |
|---|---|
| `v_tenants`, `rpc create_tenant`, `rpc create_hall(p_tenant_id, ...)`, `rpc set_tenant_status(p_id, p_status, p_reason)` | `platform.tenants.manage` |
| `v_platform_users`, `rpc assign_platform_role(p_user_id, p_role)`, `rpc revoke_platform_role(...)` | `platform.tenants.manage` |
| `rpc admin_search(p_query, p_reason)` (audited) | platform (P2) |
| `v_platform_metrics` | platform |
| `v_sales_leads` (RLS: own/assigned for SAG, all for SAD), `rpc upsert_lead`, `rpc submit_onboarding(p_lead_id, p_payload)`, `rpc assign_lead`, `v_sales_attributions`, `rpc resolve_attribution_dispute`, `rpc sales_report(...)` | `sales.leads.manage` / sales admin |

## 8. Realtime channels

Subscribed per hall; RLS-authorized (Supabase Realtime Postgres Changes with RLS, or Broadcast from triggers with private channels — BE-PREREQ-10). Payloads used only as invalidation signals.

| Channel | Source | Invalidates |
|---|---|---|
| `hall:{id}:devices` | devices, device_maintenance, agent status | device grid, overview, device detail |
| `hall:{id}:reservations` | reservations | calendar, queue |
| `hall:{id}:sessions` | sessions | active sessions, grid |
| `hall:{id}:invoices` | invoices, payments | invoices, overview |
| `hall:{id}:commands` | agent_commands | command center, command dialog |
| `user:{id}:notifications` | notifications | bell |

## 9. Backend prerequisites (required before dependent web phases)

| ID | Prerequisite | Needed by phase |
|---|---|---|
| BE-PREREQ-01 | Supabase project per environment (dev/test/staging/prod), migrations in repo, local dev via Supabase CLI | W1 |
| BE-PREREQ-02 | Google OAuth provider configured; redirect URLs per environment; identity-linking safeguards | W3 |
| BE-PREREQ-03 | `profiles` auto-creation on sign-up; `get_my_context` | W3 |
| BE-PREREQ-04 | Final permission matrix (DEC-01) + `roles/permissions/role_permissions/user_role_assignments/hall_memberships` + RLS helper `has_hall_permission(hall_id, perm)` | W4 |
| BE-PREREQ-05 | Tenants/halls/settings/working hours tables + RPCs + RLS | W5 |
| BE-PREREQ-06 | Devices, maintenance, availability, live status view | W6 |
| BE-PREREQ-07 | Reservations with exclusion constraints, check-in, cancel, sessions RPCs, pricing snapshot | W7 |
| BE-PREREQ-08 | Invitations table/flow (not named in §18) | W4 |
| BE-PREREQ-09 | Agent commands tables + status view (Agent itself may be stubbed) | W7 |
| BE-PREREQ-10 | Realtime authorization model | W6 |
| BE-PREREQ-11 | Pricing rules/windows/packages/discounts; invoices/payments; idempotency_records | W8 |
| BE-PREREQ-12 | Wallets/ledger; refunds; adjustments | W8 |
| BE-PREREQ-13 | Shifts/registers/cash movements; unpaid summary; report RPCs | W9 |
| BE-PREREQ-14 | Audit log writes in all RPCs + `v_audit_logs` | W4 onward |
| BE-PREREQ-15 | Seed scripts: 2 tenants × 2 halls, users for every role, fixtures for financial states | W1 / tests |
| BE-PREREQ-16 | Sales leads/attributions RPCs | W10 |
| BE-PREREQ-17 | Storage bucket for receipts (private) | W9 (expenses, P2) |

Mitigation while backend lags: web develops against MSW handlers implementing these contracts, plus contract tests that run against local Supabase once available.

## 10. Shared contracts for other applications (documentation only)

These must be identical for Flutter and the Windows Agent; the web consumes but does not own them.

| Contract | Consumers | Notes |
|---|---|---|
| `profiles`, `get_my_context`, permission identifiers | web, mobile | Customer role used by mobile |
| Reservation states & events | web, mobile, jobs | `Confirmed, CheckedIn, Canceled, NoShow, Expired` (proposal) |
| Session states | web, agent, jobs | `Starting, InProgress, Ending, Completed, Interrupted, Canceled` (§9.3) |
| Invoice states | web, mobile | `Draft, Open, PartiallyPaid, Paid, Voided, WrittenOff` (§11.1) |
| Wallet transaction types | web, mobile | `TopUp, Payment, Refund, Withdrawal, Adjustment, Reversal` |
| Command types & states | web, agent | §15.2, §15.4 |
| Money representation | all | minor units + ISO 4217 |
| Error code set | all | §1 above |
| Idempotency semantics | all | §19.2 |

Generated `database.ts` is regenerated from the shared schema; the web never hand-edits it.
