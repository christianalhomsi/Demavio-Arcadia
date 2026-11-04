import { fail, type ActionResult, type ErrorCode } from "./result";

/** Safe, user-facing messages. Never include SQL, stack traces, tokens or other tenants' data. */
export const ERROR_MESSAGES: Record<ErrorCode, string> = {
  UNAUTHENTICATED: "Your session has expired. Please sign in again.",
  FORBIDDEN: "You don't have permission to do this.",
  NOT_FOUND: "That item could not be found.",
  VALIDATION: "Please check the highlighted fields.",
  CONFLICT: "This conflicts with existing data. Refresh and try again.",
  STALE_STATE: "This item changed since you opened it. Refresh and try again.",
  DUPLICATE: "This action was already completed.",
  INSUFFICIENT_FUNDS: "The balance is not sufficient for this operation.",
  PRECONDITION_FAILED: "This action isn't allowed in the current state.",
  UNAVAILABLE: "The service is temporarily unavailable. Please try again.",
  UNKNOWN: "Something went wrong. Please try again.",
};

/** More specific wording for known backend detail codes (the DETAIL of a contract error). */
export const DETAIL_DEFS = {
  already_member: "This person is already a member of this hall.",
  already_invited: "There is already a pending invitation for this email.",
  cannot_modify_self: "You can't change your own access.",
  last_owner: "A hall must keep at least one active owner.",
  overlap: "Opening hours overlap.",
  reservation_conflict: "That time overlaps another reservation or session on this device.",
  device_in_use: "The device is in use during that time.",
  maintenance: "The device is in maintenance.",
  outside_working_hours: "That time is outside the hall's opening hours.",
  in_the_past: "The start time is in the past.",
  time_range: "Choose a valid start and end time (5 minutes to 24 hours).",
  name: "Enter a name of 1 to 60 characters.",
  price: "Enter a valid price.",
  quantity: "Choose a quantity from 1 to 99.",
  product_name_taken: "A product with this name already exists in this hall.",
  product_inactive: "This product is inactive, so it can't be added.",
  session_ended: "This session has ended, so its products can no longer be changed.",
  players: "Choose how many players.",
  not_pending: "This request has already been handled.",
  plan_inactive:
    "The subscription asked for is no longer offered. Reject this request so it is sent again with another one.",
  plan: "This subscription is not available.",
  past_deadline: "It is too late to cancel this booking. Contact the hall.",
  too_many: "You already have 5 upcoming bookings. Cancel one or wait until one ends.",
  customer: "Enter a customer name.",
  duration: "Choose a duration between 5 minutes and 12 hours.",
  minutes: "Choose between 1 minute and 12 hours.",
  expired: "This reservation has already ended.",
  not_checkable: "This reservation can't be checked in.",
  not_cancelable: "This reservation can't be canceled.",
  late_override: "Only an owner can check in after the grace period.",
  override_reason: "A reason is required to check in late.",
  administrative_end: "Only an owner can end a session administratively.",
  already_ended: "This has already ended.",
  not_extendable: "Only a running fixed-time session can be extended.",
  exceeds_outstanding: "That is more than the amount still owed on this invoice.",
  partial_not_allowed: "This hall requires the invoice to be paid in full.",
  method_disabled: "This payment method is not enabled for this hall.",
  invoice_voided: "This invoice has been voided.",
  already_paid: "This invoice is already paid.",
  has_payments: "An invoice with payments can't be voided. Use a refund instead.",
  wallet_frozen: "This wallet is frozen.",
  currency_mismatch: "The wallet's currency doesn't match the invoice.",
  wrong_customer: "This wallet belongs to a different customer than the one on the invoice.",
  exceeds_refundable: "That is more than can still be refunded for this payment.",
  self_approval: "You can't approve a refund you requested yourself. Ask another approver.",
  already_decided: "This request has already been decided.",
  amount: "Enter a valid amount.",
  rate: "Enter a valid hourly rate.",
  name_taken: "A device with this name already exists in this hall.",
  already_in_maintenance: "This device is already in maintenance.",
  no_agent: "This device has no Agent installed, so it can't receive commands.",
  unsupported_command: "This device doesn't support that command.",
  device_disabled: "This device is disabled.",
  no_open_shift: "Open a shift first: cash is recorded in the hall's open shift.",
  shift_already_open: "A shift is already open for this register.",
  unpaid_invoices:
    "There are unpaid invoices. Settle them, or have an owner override with a reason.",
  already_closed: "This shift is already closed.",
  shift_closed: "This shift is closed.",
  override: "Only an owner can close a shift over unpaid invoices.",
  close_reason: "Enter a reason of 3 to 300 characters.",
  reason: "Enter a reason of 3 to 300 characters.",
  exceeds_drawer: "That is more cash than the shift currently holds.",
  period: "Choose a valid period of up to one year.",
  kind: "Choose a type.",
  days: "Choose at least one day of the week.",
  window_range: "Choose a valid time range (the end must be after the start).",
  window_overlap: "This overlaps another window for the same target and day.",
  package_target: "Limit a package to one device or one category, not both.",
  package_name_taken: "A package with this name already exists in this hall.",
  package_inactive: "This package is inactive.",
  package_not_valid: "This package is not valid at this time.",
  package_device: "This package can't be used on that device.",
  package_time: "This package can't be started at this time of day.",
  package_exhausted: "This package has reached its usage limit.",
  discount_name_taken: "A discount with this name already exists in this hall.",
  discount_inactive: "This discount is inactive.",
  discount_not_valid: "This discount is not valid at this time.",
  discount_exhausted: "This discount has reached its usage limit.",
  exceeds_discount_limit: "That discount is more than you are allowed to give. Ask an owner.",
  validity: "The end of the validity period must be after its start.",
  max_uses: "Enter a usage limit of 1 or more, or leave it empty.",
  value: "Enter a valid discount value.",
  category: "Enter a category.",
  spent_on: "Enter a valid date (not far in the future).",
  paid_with: "Choose how it was paid.",
  description: "Keep the description under 300 characters.",
  receipt: "That receipt file is not valid for this expense.",
  expense_voided: "This expense has been voided and can't be changed.",
  status: "Choose a valid status.",
  username: "Username must be 3 to 20 letters, digits or underscores.",
  username_taken: "That username is already taken.",
  username_same_as_account: "Choose a username that is different from your account name and email.",
  username_set: "You have already chosen a username.",
  email_taken: "An account with this email already exists.",
  password: "Use 8 to 72 characters for the password.",
  responsible: "Choose an active super admin or sales admin as the responsible person.",
  email: "Enter a valid email address.",
  role: "Choose a role.",
  self_delete: "You cannot delete your own account.",
  owns_hall: "This account owns a hall. Delete the hall first.",
  has_history: "This account still appears in a hall's records. Deactivate it instead.",
  last_super_admin: "The last super admin cannot be deleted.",
  idempotency_mismatch: "This request was already used for a different action. Please try again.",
};

export const DETAIL_MESSAGES: Record<string, string> = DETAIL_DEFS;

const BACKEND_CODES: Record<string, ErrorCode> = {
  PERMISSION_DENIED: "FORBIDDEN",
  NOT_FOUND: "NOT_FOUND",
  VALIDATION: "VALIDATION",
  CONFLICT: "CONFLICT",
  STALE_STATE: "STALE_STATE",
  INSUFFICIENT_FUNDS: "INSUFFICIENT_FUNDS",
  PRECONDITION_FAILED: "PRECONDITION_FAILED",
  IDEMPOTENCY_MISMATCH: "CONFLICT",
};

export interface BackendError {
  code?: string;
  message?: string;
  /** Postgres DETAIL; contract errors put a short machine-readable token here. */
  details?: string | null;
}

/**
 * Maps a Postgres/Supabase error to an ActionResult failure.
 * Backend RPCs raise P0001 with the contract code in `message` (see WEB_API_AND_DATA_CONTRACTS.md §1).
 */
export function mapBackendError(error: BackendError | null | undefined): ActionResult<never> {
  const code = toErrorCode(error);
  const detail = safeDetail(error?.details);

  if (code === "VALIDATION" && detail) {
    // A validation detail names the offending field (e.g. "email", "time_zone").
    return fail(code, DETAIL_MESSAGES[detail] ?? ERROR_MESSAGES[code], {
      [detail]: DETAIL_MESSAGES[detail] ?? "Invalid value",
    });
  }
  return fail(code, (detail && DETAIL_MESSAGES[detail]) || ERROR_MESSAGES[code]);
}

/** Only short snake_case tokens are trusted as details; anything else is dropped. */
function safeDetail(details: string | null | undefined): string | undefined {
  return details && /^[a-z][a-z0-9_]{0,40}$/.test(details) ? details : undefined;
}

function toErrorCode(error: BackendError | null | undefined): ErrorCode {
  if (!error) return "UNKNOWN";
  if (error.code === "42501") return "FORBIDDEN";
  if (error.code === "23505") return "DUPLICATE";
  if (error.code === "P0001" && error.message) {
    return BACKEND_CODES[error.message.trim()] ?? "UNKNOWN";
  }
  if (error.code === "PGRST301" || error.code === "401") return "UNAUTHENTICATED";
  return "UNKNOWN";
}
