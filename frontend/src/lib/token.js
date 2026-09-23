/**
 * "042" — the order id as it is called out at the counter.
 *
 * Three digits, zero-padded, because a token board where the numbers are
 * different widths is read wrongly from across a room. Ids above 999 print at
 * their natural width rather than being truncated.
 */
export function token(id) {
  return String(id).padStart(3, '0');
}
