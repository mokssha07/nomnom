import { useEffect, useRef, useState } from 'react';
import './CategoryPicker.css';

export const ALL = 'All dishes';

/**
 * The category dropdown, drawn as a physical control.
 *
 * The trigger is a well cut into the page — the same dark recess the mode
 * switch sits in, so the two controls at the top of the menu read as parts of
 * one machine. The list is its opposite: a solid panel that lifts off the page
 * and floats above it, with the rows arriving one after another rather than
 * all at once.
 */
export default function CategoryPicker({ categories, value, onChange }) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);
  const options = [ALL, ...categories];

  useEffect(() => {
    if (!open) return;

    function dismiss(event) {
      if (event.key === 'Escape' || !rootRef.current.contains(event.target)) setOpen(false);
    }

    document.addEventListener('keydown', dismiss);
    document.addEventListener('pointerdown', dismiss);
    return () => {
      document.removeEventListener('keydown', dismiss);
      document.removeEventListener('pointerdown', dismiss);
    };
  }, [open]);

  return (
    <div ref={rootRef} className={`picker${open ? ' picker--open' : ''}`}>
      <button
        type="button"
        className="picker__trigger"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        <span className="picker__value">{value}</span>
        <span className="picker__chev" aria-hidden="true" />
      </button>

      {/* inert takes the closed options out of the tab order and away from
          screen readers without hidden, which would kill the transition. */}
      <ul className="picker__list" inert={!open}>
        {options.map((name, i) => (
          <li key={name} style={{ '--i': i }}>
            <button
              type="button"
              aria-current={name === value ? 'true' : undefined}
              onClick={() => {
                onChange(name);
                setOpen(false);
              }}
            >
              {name}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
