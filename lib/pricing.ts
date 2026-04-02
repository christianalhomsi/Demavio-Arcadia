/** Returns duration in fractional hours */
export function calculateDuration(startedAt: string, endedAt: string): number {
  const ms = new Date(endedAt).getTime() - new Date(startedAt).getTime();
  return ms / (1000 * 60 * 60);
}

/** Returns total price rounded to 2 decimal places */
export function calculatePrice(durationHours: number, ratePerHour: number): number {
  return Math.round(durationHours * ratePerHour * 100) / 100;
}
