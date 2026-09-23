/**
 * Where one photo sits on the arc.
 *
 * `distance` is how far the photo is from the middle of the rail, measured in
 * half-rail-widths: -1 at the left edge, 0 dead centre, 1 at the right edge.
 * The three numbers come back unitless so the component owns how far a photo
 * actually drops and tilts, and this file stays testable without a browser.
 */

/** Past this, a photo is off screen and its numbers stop changing. */
export const REACH = 1.4;

export function arcAt(distance) {
  const offset = Math.max(-REACH, Math.min(REACH, distance));
  const away = Math.abs(offset);

  return {
    // Squared, not linear: a parabola is an arc, a straight multiply is a ramp.
    lift: offset * offset,
    tilt: offset,
    // Never to zero — a photo you cannot see is a photo you cannot aim at.
    fade: Math.max(0.32, 1 - away * 0.75),
    // How much smaller a photo is drawn as it leaves the middle. Linear on
    // purpose: paired with the rail's perspective this reads as distance, and
    // squaring it as well would make the row collapse rather than recede.
    scale: 1 - away * 0.14,
  };
}
