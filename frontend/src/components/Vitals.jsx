import { FLOW_WINDOW_MS, LATE_AFTER_MS } from '../lib/kitchen';
import { token } from '../lib/token';
import { duration } from '../lib/time';
import Icon from './Icon';
import './Vitals.css';

/**
 * How the counter is doing, across the top of the board.
 *
 * Five readings, one card each: how much work is on, where it is stuck, how
 * fast tickets clear, what has come and gone lately, and whether the queue is
 * growing. Below them, the two nudges — the only lines on the board that ask
 * for something that is not cooking, shown only when they are true.
 */

const FLOW_WORD = { filling: 'Filling up', clearing: 'Clearing', steady: 'Steady' };

export default function Vitals({ vitals, flow, medianPrepMs, watchedMs }) {
  const { counts, itemsToCook, oldestMs, late, uncollected } = vitals;
  const onBoard = counts.PLACED + counts.PREPARING + counts.READY;
  const windowMins = Math.round(FLOW_WINDOW_MS / 60_000);

  const cards = [
    {
      icon: 'pan',
      tint: 'work',
      label: itemsToCook === 1 ? 'Dish to cook' : 'Dishes to cook',
      value: itemsToCook,
      note: `across ${onBoard} ${onBoard === 1 ? 'ticket' : 'tickets'}`,
    },
    {
      icon: 'clock',
      tint: 'wait',
      label: 'Longest wait',
      value: onBoard === 0 ? '—' : duration(oldestMs),
      note: `${counts.PLACED} waiting to start`,
      late: oldestMs >= LATE_AFTER_MS,
    },
    {
      icon: 'timer',
      tint: 'done',
      // Two or three cooked tickets is not a typical anything, so kitchen.js
      // hands back null until it has enough of them.
      label: 'Typical ticket',
      value: medianPrepMs === null ? '—' : duration(medianPrepMs),
      note: medianPrepMs === null ? 'not enough cooked yet' : 'start to ready',
    },
    {
      icon: 'swap',
      tint: 'wait',
      label: `Last ${windowMins} min`,
      value: `${flow.arrived} in · ${flow.left} out`,
      note: `${counts.READY} on the pass now`,
    },
    {
      icon: 'trend',
      tint: 'work',
      label: 'Queue',
      value: flow.verdict ? FLOW_WORD[flow.verdict] : 'Watching',
      note: flow.verdict ? `over the last ${windowMins} min` : `${duration(watchedMs)} so far`,
    },
  ];

  return (
    <>
      <section className="stats" aria-label="Service">
        {cards.map((card) => (
          <article key={card.label} className="stat">
            <p className="stat__head">
              <span className={`stat__icon stat__icon--${card.tint}`}>
                <Icon name={card.icon} />
              </span>
              {card.label}
            </p>
            <p className={`stat__value num${card.late ? ' stat__value--late' : ''}`}>
              {card.value}
            </p>
            <p className="stat__note">{card.note}</p>
          </article>
        ))}
      </section>

      {(uncollected || late > 0) && (
        <div className="nudges" role="status">
          {uncollected && (
            <p className="nudge">
              <span className="nudge__token num">#{token(uncollected.id)}</span> has been ready{' '}
              <span className="num">{duration(uncollected.waitMs)}</span> — call it again.
            </p>
          )}

          {late > 0 && (
            <p className="nudge nudge--late">
              <span className="num">{late}</span> {late === 1 ? 'ticket is' : 'tickets are'} past{' '}
              <span className="num">{Math.round(LATE_AFTER_MS / 60_000)}</span> minutes.
            </p>
          )}
        </div>
      )}
    </>
  );
}
