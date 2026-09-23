/** Rupees, the way a bill prints them: ₹1,250 — no paise, the canteen has none. */
export function rupees(amount) {
  return `₹${amount.toLocaleString('en-IN')}`;
}
