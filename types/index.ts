// Shared domain types
// e.g. Hall, Booking, Payment, User

export type { Hall } from "./hall";
export type { Reservation, ServiceResult } from "./reservation";
export type { FinancialTransaction, InsertTransactionInput, TransactionType } from "./transaction";
export type { CashRegister, CashRegisterStatus, OpenCashRegisterInput, CloseCashRegisterInput, CashRegisterSummary } from "./cash-register";
export type { AuditAction, AuditLogEntry, WriteAuditLogInput } from "./audit";
export type { AgentCommand, AgentCommandPayload, AgentCommandResult } from "./agent";
export type { AppUserRole } from "./user-role";
export { PROFILE_SUPER_ADMIN, HALL_DASHBOARD_ROLES, isHallDashboardRole } from "./user-role";
