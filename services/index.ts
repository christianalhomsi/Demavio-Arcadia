// Service layer — Supabase queries grouped by domain
// e.g. halls, bookings, payments, users

export { storeOtpRequest, getLatestOtpRequest, incrementOtpAttempts, markOtpVerified } from "./otp";
export { getHalls } from "./halls";
export { getDevice, setDeviceActive, setDeviceAvailable } from "./devices";
export { getReservation, createReservation, setReservationActive } from "./reservations";
export { verifyStaffHallAccess } from "./staff";
export { createSession, getActiveSession, endSession } from "./sessions";
export { createPayment, createLedgerEntry } from "./payments";
export { insertTransaction } from "./transactions";
export { openCashRegister, getCashRegister, closeCashRegister } from "./cash-registers";
