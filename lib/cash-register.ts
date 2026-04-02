/** Returns expected closing balance: opening + income - outflows */
export function calculateExpectedBalance(
  openingBalance: number,
  totalIncome: number,
  totalOutflows: number
): number {
  return Math.round((openingBalance + totalIncome - totalOutflows) * 100) / 100;
}

/** Returns variance: actual - expected (positive = surplus, negative = shortage) */
export function calculateVariance(
  actualBalance: number,
  expectedBalance: number
): number {
  return Math.round((actualBalance - expectedBalance) * 100) / 100;
}
