import { useEffect, useRef, useState } from 'react';
import { PLACEHOLDER, photoFor } from '../assets/photos';
import { arcAt } from '../lib/arc';
import { rupees } from '../lib/money';
import Stepper from './Stepper';
import './ArcPicker.css';

/** How far the outermost photo drops, how far it tilts in the page, and how
    far it turns to face the middle. SWING is the 3D one — it is what makes the
    row read as a wheel standing in space rather than a fan lying flat on the
    page. Kept well under the tilt you would use on a cover-flow: past about
    30° the photographs stop being food and start being an effect. */
const LIFT = 56;
const TILT = 10;
const SWING = 26;

/** How much of the remaining distance the rail covers each frame. */
const GLIDE = 0.16;

/** How long the wheel has to be quiet before the rail settles on a photo. */
const QUIET = 90;

/**
 * Today's picks, laid out on an arc.
 *
 * The rail is an ordinary horizontally scrolling strip, so swipe momentum,
 * scroll snapping, the scrollbar and keyboard focus all come from the browser.
 * Two things are added on top: a paint pass that puts each photo on the curve,
 * and a glide that gives a mouse wheel — which has no horizontal axis — a way
 * to drive the rail without the motion turning into notches.
 */
export default function ArcPicker({ items, title, qtyOf, onChange }) {
  const railRef = useRef(null);
  const aimRef = useRef(() => {});
  const [focus, setFocus] = useState(0);

  useEffect(() => {
    const rail = railRef.current;
    let frame = 0;
    let shown = -1; // the focus React has been told about
    let target = null; // the scrollLeft we are gliding to; null = the browser drives
    let settleAt = 0; // when to give up steering and rest on the nearest photo

    /** Every target goes through here. A target the rail cannot actually reach
        is a target the glide never arrives at, and the loop never stops. */
    const clamp = (x) => Math.max(0, Math.min(rail.scrollWidth - rail.clientWidth, x));

    /** The scrollLeft that puts this slot dead centre, as far as it can. */
    const home = (el) => clamp(el.offsetLeft + el.offsetWidth / 2 - rail.clientWidth / 2);

    function paint() {
      const middle = rail.scrollLeft + rail.clientWidth / 2;
      const reach = rail.clientWidth / 2;
      let nearest = 0;
      let best = Infinity;

      [...rail.children].forEach((el, i) => {
        const { lift, tilt, fade, scale } = arcAt(
          (el.offsetLeft + el.offsetWidth / 2 - middle) / reach,
        );
        if (Math.abs(tilt) < best) {
          best = Math.abs(tilt);
          nearest = i;
        }
        // Order matters: the perspective has to come first or the rotation is
        // flat, and the scale has to come last or it scales the distance too.
        // Positive rotateY sends the right edge away, which is exactly what a
        // photo to the right of the middle should do to face the centre.
        el.style.transform =
          `perspective(900px) translateY(${lift * LIFT}px) ` +
          `rotateY(${tilt * SWING}deg) rotate(${tilt * TILT}deg) scale(${scale})`;
        el.style.opacity = fade;
      });

      // Only when it actually changes. Calling this every frame re-renders the
      // whole block sixty times a second, which is most of what made the old
      // rail feel heavy under the finger.
      if (nearest !== shown) {
        shown = nearest;
        setFocus(nearest);
      }
      return nearest;
    }

    function tick() {
      frame = 0;

      let stuck = false;

      if (target !== null) {
        const gap = target - rail.scrollLeft;
        const was = rail.scrollLeft;
        // Each frame closes the same fraction of whatever is left, so the rail
        // decelerates on its own and there is no duration to guess at. A wheel
        // notch arrives as a jump; this is what turns it into a glide.
        rail.scrollLeft = Math.abs(gap) < 1.5 ? target : rail.scrollLeft + gap * GLIDE;
        // scrollWidth is rounded up, so the furthest target we can work out is
        // sometimes a pixel or two past where the rail will actually go. If the
        // write moved nothing, this is the end — without this the glide chases
        // a number it can never reach and the loop never stops.
        stuck = rail.scrollLeft === was;
      }

      const nearest = paint();

      // Wheel gone quiet: aim at the nearest photo so the rail always comes to
      // rest on one, the way the browser's own snap does for a finger.
      if (target !== null && !stuck && performance.now() > settleAt) {
        target = home(rail.children[nearest]);
        settleAt = Infinity;
      }

      if (target !== null && (stuck || Math.abs(target - rail.scrollLeft) < 1.5)) {
        target = null;
        rail.style.scrollSnapType = ''; // hand the rail back to the browser
      }

      if (target !== null) wake();
    }

    function wake() {
      frame ||= requestAnimationFrame(tick);
    }

    function steer(to, hold) {
      // Snap has to be off while we drive scrollLeft ourselves, or the browser
      // yanks the rail back to the nearest photo between every frame.
      rail.style.scrollSnapType = 'none';
      target = clamp(to);
      settleAt = hold ? Infinity : performance.now() + QUIET;
      wake();
    }

    function onWheel(event) {
      // A mouse wheel only has a vertical axis, and on this rail down means
      // further along. A trackpad's sideways swipe means the same thing.
      const axis = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
      // Firefox reports lines rather than pixels when deltaMode is 1.
      const push = event.deltaMode === 1 ? axis * 16 : axis;
      const from = target ?? rail.scrollLeft;
      const to = clamp(from + push);

      // At either end the rail has nowhere left to go, so the gesture belongs
      // to the page — swallowing it there is what makes a carousel feel like a
      // trap you have to steer around.
      if (to === from) return;

      event.preventDefault();
      steer(to, false);
    }

    aimRef.current = (el) => steer(home(el), true);

    paint();
    rail.addEventListener('scroll', wake, { passive: true });
    rail.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('resize', wake);
    return () => {
      cancelAnimationFrame(frame);
      rail.removeEventListener('scroll', wake);
      rail.removeEventListener('wheel', onWheel);
      window.removeEventListener('resize', wake);
    };
    // Length, not the array. This effect only ever measures the DOM, and the
    // caller rebuilds its list on every render — depending on the array itself
    // tore the glide down mid-flight every time the focused dish changed.
  }, [items.length]);

  // Clamped, not indexed straight. Changing category can hand us a shorter list
  // than the focus we are still holding, and the paint pass only corrects that
  // on the next frame — one render too late to avoid a caption blinking out.
  const picked = items[Math.min(focus, items.length - 1)];

  return (
    <section className="arc" aria-label={title}>
      <h2 className="arc__title">{title}</h2>

      <div className="arc__rail" ref={railRef}>
        {items.map((item, i) => (
          <button
            key={item.id}
            type="button"
            className="arc__slot"
            aria-current={i === focus ? 'true' : undefined}
            aria-label={`Show ${item.name}, ${rupees(item.price)}`}
            onClick={(event) => aimRef.current(event.currentTarget)}
          >
            {/* Every slot is the same size whether or not there is a photo,
                otherwise the arc maths would be measuring a ragged rail. */}
            <img
              className="arc__photo"
              src={photoFor(item) ?? PLACEHOLDER}
              alt=""
              width="132"
              height="132"
            />
          </button>
        ))}
      </div>

      {picked && (
        <div className="arc__caption">
          <p className="arc__name">{picked.name}</p>
          <p className="arc__price num">{rupees(picked.price)}</p>
          <Stepper
            qty={qtyOf(picked.id)}
            label={picked.name}
            onChange={(next) => onChange(picked.id, next)}
          />
        </div>
      )}
    </section>
  );
}
