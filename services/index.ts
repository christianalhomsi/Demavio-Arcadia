// Service layer — Supabase queries grouped by domain
// e.g. halls, bookings, payments, users

export { storeOtpRequest, getLatestOtpRequest, incrementOtpAttempts, markOtpVerified } from "./otp";
export { getHalls } from "./halls";
export { getDevice, setDeviceActive, setDeviceAvailable, setDevicePaused } from "./devices";
export { getDeviceTypes, getHallDevices } from "./device-types";
export { getReservation, createReservation, setReservationActive } from "./reservations";
export { verifyStaffHallAccess } from "./staff";
export { isSuperAdmin, verifyHallManagementAccess } from "./access";
export { createSession, getActiveSession, endSession } from "./sessions";
export { createPayment, createLedgerEntry } from "./payments";
export { insertTransaction } from "./transactions";
export { openCashRegister, getCashRegister, closeCashRegister } from "./cash-registers";
export { getHallProducts, createProduct, updateProduct, toggleProductActive } from "./products";
export { getSessionItems, addSessionItem, removeSessionItem, calculateSessionTotal } from "./session-items";
export { getOrCreateWallet, getWalletBalance, getWalletWithBalance, addWalletTopUp, deductFromWallet, getWalletTransactions } from "./wallets";
