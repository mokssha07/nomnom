/**
 * The handful of line icons the kitchen board uses.
 *
 * Inline SVG rather than an icon package: seven paths is not worth a
 * dependency, and drawing them here means they inherit `currentColor` and
 * the palette without a wrapper.
 */

import './Icon.css';

const PATHS = {
  cloche: 'M3 18h18M5 18a7 7 0 0 1 14 0M12 8V5',
  pan: 'M3 11h11v3a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5v-3ZM14 12l7-4',
  clock: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18ZM12 7.5V12l3 2',
  timer: 'M10 2.5h4M12 8v4.5l2.5 1.5M12 21.5a7.5 7.5 0 1 0 0-15 7.5 7.5 0 0 0 0 15Z',
  swap: 'M4 9h14l-3.5-3.5M20 15H6l3.5 3.5',
  trend: 'M3 17l6-6 4 4 8-8M21 7v5h-5',
  exit: 'M14 12H3m0 0 4-4m-4 4 4 4M10 4h8a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-8',
  // Zero-length segments with a round cap: three dots, no extra markup.
  dots: 'M12 5h.01M12 12h.01M12 19h.01',
};

export default function Icon({ name, className = 'icon', strokeWidth = '1.6' }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
