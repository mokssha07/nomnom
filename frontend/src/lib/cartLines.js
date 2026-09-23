/**
 * The cart's one piece of real logic, kept out of the component so it can be
 * tested without a browser. A line is `{ id, qty }`.
 *
 * Returns a new array every time — never edits the one passed in, so React
 * always sees a changed reference and re-renders.
 */
export function setQty(lines, id, qty) {
  if (qty <= 0) return lines.filter((line) => line.id !== id);

  // Changing a quantity must not move the line. Rebuilding the array as
  // "everything else, then this one" is the easy version of this function and
  // it silently reorders the cart under the shopper's thumb.
  if (lines.some((line) => line.id === id)) {
    return lines.map((line) => (line.id === id ? { id, qty } : line));
  }

  return [...lines, { id, qty }];
}
