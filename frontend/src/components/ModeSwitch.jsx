import { useState } from 'react';
import './ModeSwitch.css';

/**
 * The menu's two ways of being read: the carousel, or the plain list.
 *
 * Drawn as a physical two-position switch — a well cut into the page with a
 * machined thumb sitting in it — because that is the one control on this
 * screen that changes what the whole page is, and it should feel like
 * throwing something rather than tapping a word.
 */
export default function ModeSwitch({ mode, onChange }) {
  const next = mode === 'carousel' ? 'list' : 'carousel';

  // A CSS one-shot only replays if the animation NAME changes, so the throw
  // alternates between two identical keyframes. It starts as null rather than
  // 'a' so nothing fires on the first paint — a switch that flinches when the
  // page loads looks broken, not alive.
  const [throwKey, setThrowKey] = useState(null);

  return (
    <button
      type="button"
      className="modeswitch"
      data-mode={mode}
      data-throw={throwKey ?? undefined}
      aria-label={`Switch to ${next} view`}
      onClick={() => {
        setThrowKey((k) => (k === 'a' ? 'b' : 'a'));
        onChange(next);
      }}
    >
      <span className="modeswitch__thumb" aria-hidden="true" />

      <span className="modeswitch__icons" aria-hidden="true">
        <svg viewBox="0 0 18 18" width="16" height="16" fill="currentColor">
          <rect x="2" y="6" width="2.5" height="6" rx="1.2" opacity=".55" />
          <rect x="6" y="3.5" width="6" height="11" rx="2" />
          <rect x="13.5" y="6" width="2.5" height="6" rx="1.2" opacity=".55" />
        </svg>

        <svg viewBox="0 0 18 18" width="16" height="16" fill="currentColor">
          <rect x="3" y="3.5" width="12" height="2.4" rx="1.2" />
          <rect x="3" y="7.8" width="12" height="2.4" rx="1.2" />
          <rect x="3" y="12.1" width="12" height="2.4" rx="1.2" />
        </svg>
      </span>
    </button>
  );
}
