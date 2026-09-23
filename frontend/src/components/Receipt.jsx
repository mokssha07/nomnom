import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { rupees } from '../lib/money';
import { token } from '../lib/token';
import './Receipt.css';

/**
 * The confirmation screen: the receipt printed in front of you.
 *
 * The paper is one tall block that starts parked inside the machine with only
 * its last line — the footer stub — showing. Printing is one transform on that
 * block, travelling from `rest` to 0 in three bursts with a pause between each,
 * which is what a thermal printer actually does and what a single smooth slide
 * never sounds like.
 *
 * The height is measured rather than guessed, because the item list is however
 * long the order is. `rest` is recomputed whenever the paper resizes, so a
 * font swap or a rotation cannot leave the roll hanging out of the machine.
 */

/** The feed. Three pulls with a beat between them, as fractions of the travel
 *  (0 = fully inside, 1 = fully out) against fractions of the duration. */
const BURSTS = [
  [0, 0, 'cubic-bezier(.45,.05,.3,1)'],
  [0.27, 0.26, 'linear'],
  [0.27, 0.31, 'cubic-bezier(.45,.05,.3,1)'],
  [0.61, 0.6, 'linear'],
  [0.61, 0.65, 'cubic-bezier(.45,.05,.2,1)'],
  [1, 1, undefined],
];

/** 19 → 19TH. The date on a printed bill, not in an app. */
function ordinal(n) {
  const suffix = ['TH', 'ST', 'ND', 'RD'];
  const v = n % 100;
  return n + (suffix[(v - 20) % 10] || suffix[v] || suffix[0]);
}

export default function Receipt({ order }) {
  const slotRef = useRef(null);
  const wrapRef = useRef(null);
  const paperRef = useRef(null);
  const noteRef = useRef(null);

  /** Where the paper sits before printing: a negative translate that hides all
   *  of it but the footer. Held in a ref because the animation reads it on the
   *  frame it starts, not on the render that scheduled it. */
  const rest = useRef(0);
  const out = useRef(false); // has the roll finished coming out?

  const [state, setState] = useState('idle'); // idle → printing → done
  const [run, setRun] = useState(0); // bumped by Replay to print again

  // Measure before paint, so the paper is never seen at full height first.
  useLayoutEffect(() => {
    const paper = paperRef.current;

    const layout = () => {
      const height = paper.offsetHeight;
      rest.current = -(height - noteRef.current.offsetHeight);
      slotRef.current.style.setProperty('--paper-h', `${height}px`);
      wrapRef.current.style.transform = `translateY(${out.current ? 0 : rest.current}px)`;
    };

    const observer = new ResizeObserver(layout);
    observer.observe(paper);
    layout();
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const wrap = wrapRef.current;
    const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const at = (progress) => `translateY(${rest.current * (1 - progress)}px)`;

    let running = null;
    let stopped = false;

    // Every await below can be cut short by the cleanup — React runs effects
    // twice in development, and Replay re-enters this one mid-print.
    const play = async () => {
      if (run > 0) {
        setState('resetting');
        running = wrap.animate([{ transform: 'translateY(0px)' }, { transform: at(0) }], {
          duration: reduce ? 200 : 750,
          easing: 'cubic-bezier(.6,0,.3,1)',
          fill: 'forwards',
        });
        await running.finished.catch(() => {});
        if (stopped) return;
      }

      out.current = false;
      wrap.style.transform = at(0);
      setState('printing');

      running = wrap.animate(
        reduce
          ? [{ transform: at(0) }, { transform: at(1) }]
          : BURSTS.map(([progress, offset, easing]) => ({
              transform: at(progress),
              offset,
              easing,
            })),
        { duration: reduce ? 400 : 2900, fill: 'forwards' },
      );
      await running.finished.catch(() => {});
      if (stopped) return;

      // Hand the transform back to the element and drop the animation, rather
      // than leaving a forwards fill holding it — a filling animation wins over
      // the inline style, so the next run could not park the paper again.
      out.current = true;
      wrap.style.transform = 'translateY(0px)';
      running.cancel();
      running = null;
      setState('done');

      if (!reduce) {
        wrap.animate(
          [
            { transform: 'translateY(0)' },
            { transform: 'translateY(5px)' },
            { transform: 'translateY(0)' },
          ],
          { duration: 420, easing: 'ease-out' },
        );
      }
    };

    play();
    return () => {
      stopped = true;
      running?.cancel();
    };
  }, [run]);

  const placed = new Date(order.created_at);
  const date = `${ordinal(placed.getDate())} ${placed
    .toLocaleString('en-GB', { month: 'long' })
    .toUpperCase()} ${placed.getFullYear()}`;
  const time = placed.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
  const count = order.items.reduce((sum, line) => sum + line.qty, 0);

  return (
    <main className="printout" data-state={state}>
      <div className="stage">
        <div className="stage__glow" aria-hidden="true" />

        <div className="printer" aria-hidden="true">
          <div className="printer__bar" />
          <div className="printer__cap printer__cap--l" />
          <div className="printer__cap printer__cap--r" />
        </div>

        <div className="slot" ref={slotRef}>
          <div className="slot__feed" ref={wrapRef}>
            <article className="receipt" ref={paperRef} aria-label="Receipt">
              <header className="receipt__head">
                <div>
                  <p className="receipt__label">ORDER PLACED</p>
                  <p className="receipt__amount">{rupees(order.total)}</p>
                  <p className="receipt__meta">
                    {date} | PAY AT COUNTER
                    <br />
                    TOKEN #{token(order.id)} · {time}
                  </p>
                </div>
                <span className="receipt__seal" aria-hidden="true">
                  <span>Canteen</span>
                </span>
              </header>

              <hr className="receipt__rule" />

              <ul className="receipt__items">
                {order.items.map((line) => (
                  <li className="receipt__row" key={line.name}>
                    <span>
                      {line.qty}X {line.name}
                    </span>
                    <span>{rupees(line.price * line.qty)}</span>
                  </li>
                ))}
              </ul>

              <hr className="receipt__rule" />

              {/* Where a till receipt prints subtotal and tax. The canteen has
                  neither, so the space says the two things a student checks. */}
              <div className="receipt__sums">
                <p className="receipt__row">
                  <span>Items</span>
                  <span>{count}</span>
                </p>
                <p className="receipt__row">
                  <span>Payment</span>
                  <span>At the counter</span>
                </p>
              </div>

              <hr className="receipt__rule receipt__rule--gold" />

              <p className="receipt__row receipt__total">
                <span>TOTAL</span>
                <span>{rupees(order.total)}</span>
              </p>

              <p className="receipt__note" ref={noteRef}>
                SHOW THIS TOKEN AT THE COUNTER
              </p>
            </article>
          </div>

          <div className="slot__shade" aria-hidden="true" />
        </div>

        <p className="sr-only" aria-live="polite">
          {state === 'done' ? 'Receipt printed.' : 'Printing receipt…'}
        </p>

        <div className="printout__after">
          <Link to={`/orders/${order.id}`} className="printout__go">
            Track this order
          </Link>
          <button type="button" className="printout__replay" onClick={() => setRun((n) => n + 1)}>
            ↺ Print again
          </button>
        </div>
      </div>
    </main>
  );
}
