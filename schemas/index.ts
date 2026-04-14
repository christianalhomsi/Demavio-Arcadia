// Zod validation schemas
// e.g. bookingSchema, paymentSchema, hallSchema

export { otpRequestSchema, type OtpRequestInput, otpVerifySchema, type OtpVerifyInput } from "./otp";
export { bookingSchema, type BookingInput } from "./booking";
export { checkInSchema, type CheckInInput } from "./check-in";
export { endSessionSchema, type EndSessionInput } from "./end-session";
export { openCashRegisterSchema, type OpenCashRegisterFormInput, closeCashRegisterSchema, type CloseCashRegisterFormInput } from "./cash-register";
export { agentCommandSchema, type AgentCommandInput } from "./agent";
export {
  hallBootstrapSchema,
  type HallBootstrapInput,
  inviteUserSchema,
  staffAssignmentSchema,
} from "./admin-hall";
