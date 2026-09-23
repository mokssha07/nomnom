import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Icon from './Icon';
import { useAuth } from '../auth';
import './GooeyMenu.css';

/**
 * The student's account menu: one dot-symbol that opens into two options.
 *
 * It is drawn twice. The blobs are the shape — flat dark pills with no text
 * in them — and they sit inside an SVG goo filter, so on the way up they pull
 * away from the trigger like a drop of liquid instead of appearing whole. The
 * wells are a second, unfiltered layer sitting exactly on top: they carry the
 * gradient, the inset shadow and the words, because anything lit or written
 * inside a blurred subtree comes out fringed and unreadable.
 *
 * Only the label layer is interactive; the blobs are decoration and say so.
 */

export default function GooeyMenu() {
  const [open, setOpen] = useState(false);
  const root = useRef(null);
  const navigate = useNavigate();
  const { signOut } = useAuth();

  const items = [
    { label: 'Your orders', run: () => navigate('/orders') },
    { label: 'Sign out', run: signOut },
  ];

  // Escape closes it, and so does a tap anywhere else — a menu you can only
  // shut by hitting the same 44px you opened it with is a trap on a phone.
  useEffect(() => {
    if (!open) return;

    const onKey = (e) => e.key === 'Escape' && setOpen(false);
    const onDown = (e) => !root.current?.contains(e.target) && setOpen(false);

    document.addEventListener('keydown', onKey);
    document.addEventListener('pointerdown', onDown);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('pointerdown', onDown);
    };
  }, [open]);

  return (
    <div className="goo" ref={root} data-open={open ? '' : undefined}>
      <GooFilter />

      <div className="goo__blobs" aria-hidden="true">
        <span className="goo__blob goo__blob--trigger" />
        {items.map((item, i) => (
          <span key={item.label} className="goo__blob goo__blob--item" style={{ '--i': i }} />
        ))}
      </div>

      <button
        type="button"
        className="goo__trigger"
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={open ? 'Close account menu' : 'Account menu'}
        onClick={() => setOpen((was) => !was)}
      >
        <Icon name="dots" className="icon" strokeWidth="3" />
      </button>

      {/* inert rather than unmounted: the options have to be able to animate
          back into the trigger, and an inert subtree is already out of reach
          of both the keyboard and a screen reader. */}
      <div className="goo__list" inert={!open}>
        {items.map((item, i) => (
          <button
            key={item.label}
            type="button"
            className="goo__item"
            style={{ '--i': i }}
            onClick={() => {
              setOpen(false);
              item.run();
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Blur, then crush the alpha ramp back to an edge: anything the blurs overlap
 *  fuses into one shape. The whole effect is these two primitives. */
function GooFilter() {
  return (
    <svg className="goo__filter" aria-hidden="true" focusable="false">
      <filter id="goo-blend">
        <feGaussianBlur in="SourceGraphic" stdDeviation="8" result="soft" />
        <feColorMatrix
          in="soft"
          type="matrix"
          values="1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 20 -9"
        />
      </filter>
    </svg>
  );
}
