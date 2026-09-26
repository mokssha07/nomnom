import { useCallback, useEffect, useState } from 'react';
import api from '../api';
import { BOARD_COLUMNS, columnFor, nextStatus, onBoard, STATUS_LABELS } from '../api/shapes';
import { useAuth } from '../auth';
import Icon from '../components/Icon';
import PanList from '../components/PanList';
import Vitals from '../components/Vitals';
import { usePoll } from '../hooks/usePoll';
import { useShiftLog } from '../hooks/useShiftLog';
import { flow, median, panList, vitals } from '../lib/kitchen';
import { elapsed, isLate } from '../lib/time';
import { token } from '../lib/token';
import './KitchenDisplay.css';

/**
 * The board behind the counter. Read across the room, tapped with one hand,
 * never scrolled carefully — every decision below follows from that.
 *
 * Top to bottom: the five readings that say how service is going, anything
 * that needs a shout, then the tickets themselves as cards with a filter on
 * top and the pan list beside them. All of it comes out of one poll — the
 * board asks the server for nothing the student pages do not already ask for.
 */

const POLL_MS = 4000;

// What the button on a ticket says. The chip on the card already says where
// the ticket is, so the button only has to say where it is going.
const ADVANCE_LABEL = {
  // PLACED and ACCEPTED share the New column, so the button is the only thing
  // that changes on the first tap. Same label for both made that tap look dead.
  PLACED: 'Accept',
  ACCEPTED: 'Start cooking',
  PREPARING: 'Mark ready',
  READY: 'Collected',
};

/** Keyed by COLUMN, not status — the chip says which pile, not which flag. */
const SHORT = { PLACED: 'New', PREPARING: 'Preparing', READY: 'Ready' };

const TABS = ['ALL', ...BOARD_COLUMNS];

export default function KitchenDisplay() {
  const { data: orders, error, isLoading, patch } = usePoll(api.getOrders, POLL_MS);
  const { signOut } = useAuth();
  const shift = useShiftLog(orders);

  // Push beats poll: any order event refetches straight away, so a new ticket
  // lands in under a second. The poll above stays as the safety net.
  useEffect(
    () => api.subscribeKitchen(() => api.getOrders().then(patch, () => {})),
    [patch],
  );

  const [tab, setTab] = useState('ALL');

  // Ids currently being advanced. A tap has to feel instant, but the request
  // behind it takes a few hundred milliseconds — without this, an impatient
  // second tap sends the same order forward twice and the server 409s.
  const [pending, setPending] = useState(() => new Set());

  // The elapsed clocks tick independently of the poll. Re-fetching every
  // second to keep a counter moving would be absurd; this is just arithmetic
  // against a `now` that advances on its own.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  const advance = useCallback(
    async (order) => {
      const target = nextStatus(order.status);
      if (!target || pending.has(order.id)) return;

      setPending((ids) => new Set(ids).add(order.id));

      // Move it on screen straight away, then confirm with the server. The
      // alternative — wait for the response — leaves staff tapping a ticket
      // that visibly does nothing for half a second, so they tap it again.
      patch((current) => current.map((o) => (o.id === order.id ? { ...o, status: target } : o)));

      try {
        const saved = await api.setStatus(order.id, target);
        patch((current) => current.map((o) => (o.id === order.id ? saved : o)));
      } catch {
        // Put it back where it was. The next poll would fix this anyway, but
        // four seconds of a ticket in the wrong state is four seconds of
        // someone cooking the wrong thing.
        patch((current) =>
          current.map((o) => (o.id === order.id ? { ...o, status: order.status } : o)),
        );
      } finally {
        setPending((ids) => {
          const next = new Set(ids);
          next.delete(order.id);
          return next;
        });
      }
    },
    [patch, pending],
  );

  if (isLoading) {
    return (
      <main className="board" data-surface="board">
        <p className="board__loading">Loading the board…</p>
      </main>
    );
  }

  const live = onBoard(orders ?? []);
  const shown = live
    // By column: the New tab holds PLACED and ACCEPTED alike, because to the
    // person at the pass they are the same pile of work.
    .filter((order) => tab === 'ALL' || columnFor(order.status) === tab)
    // Oldest first, whichever tab is open: that is the order they get cooked.
    .slice()
    .sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  // How long this board has been open. Every rate on the cards is measured
  // against it, because a board that opened four minutes ago has not seen
  // enough of the shift to have an opinion about it.
  const watchedMs = now - shift.startedAt;

  return (
    <div className="board" data-surface="board">
      {/* Not navigation — this app has one kitchen screen. The rail carries
          the mark and the only control here that is not a ticket. */}
      <nav className="rail" aria-label="Board">
        <span className="rail__mark" aria-hidden="true">
          <Icon name="cloche" />
        </span>
        <button type="button" className="rail__signout" onClick={signOut} aria-label="Sign out">
          <Icon name="exit" />
        </button>
      </nav>

      <main className="board__main">
        <header className="board__bar">
          <div>
            <h1 className="board__title">Kitchen</h1>
            <p className="board__sub">
              {live.length} {live.length === 1 ? 'order' : 'orders'} on the board · refreshes every{' '}
              {POLL_MS / 1000}s
            </p>
          </div>

          <div className="board__meta">
            {/* Only shown when something is wrong. A permanent "connected"
                light is noise; staff need to be told when to stop trusting
                the board, not reassured every second that it works. */}
            {error && (
              <p className="board__offline" role="status">
                Connection lost — showing the last update. Still retrying.
              </p>
            )}
            <p className="board__clock num">{clockFace(now)}</p>
          </div>
        </header>

        {/* Recomputed every second alongside the clocks. It is a few passes
            over a couple of dozen tickets — cheaper than rendering the
            result, and far cheaper than being four seconds out of date. */}
        <Vitals
          vitals={vitals(live, now)}
          flow={flow(live, shift.cleared, now, watchedMs)}
          medianPrepMs={median(shift.preps)}
          watchedMs={watchedMs}
        />

        <section className="live" aria-label="Tickets">
          <header className="live__head">
            <h2 className="live__title">Live tickets</h2>

            <div className="tabs">
              {TABS.map((key) => {
                const count =
                  key === 'ALL'
                    ? live.length
                    : live.filter((o) => columnFor(o.status) === key).length;
                return (
                  <button
                    key={key}
                    type="button"
                    className={`tab${tab === key ? ' tab--on' : ''}`}
                    aria-pressed={tab === key}
                    onClick={() => setTab(key)}
                  >
                    {key === 'ALL' ? 'All' : SHORT[key]}
                    <span className="tab__count num">{count}</span>
                  </button>
                );
              })}
            </div>
          </header>

          <div className="live__body">
            <div className="cards">
              {shown.map((order) => (
                <Ticket
                  key={order.id}
                  order={order}
                  now={now}
                  isPending={pending.has(order.id)}
                  onAdvance={advance}
                />
              ))}
              {shown.length === 0 && <p className="cards__empty">{emptyWord(tab)}</p>}
            </div>

            <PanList rows={panList(live, now)} />
          </div>
        </section>
      </main>
    </div>
  );
}

/** "09:42" — the board is the clock the kitchen actually looks at. */
function clockFace(now) {
  return new Date(now).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

function emptyWord(tab) {
  if (tab === 'ALL') return 'No orders on the board.';
  return 'Nothing ' + SHORT[tab].toLowerCase() + '.';
}

function Ticket({ order, now, isPending, onAdvance }) {
  const late = isLate(order.created_at, now);
  const num = token(order.id);
  const dishes = order.items.reduce((sum, item) => sum + item.qty, 0);
  const action = ADVANCE_LABEL[order.status];
  // The chip names the pile the ticket is in. ACCEPTED and PLACED both read
  // "New" — the extra state is the backend's bookkeeping, not the cook's.
  const column = columnFor(order.status);

  return (
    <article className={`card${late ? ' card--late' : ''}${isPending ? ' card--pending' : ''}`}>
      <header className="card__top">
        <span className="card__token num">#{num}</span>
        <span className={`chip chip--${column.toLowerCase()}`}>{SHORT[column]}</span>
      </header>

      <p className="card__meta">
        <Icon name="clock" className="icon icon--sm" />
        <span className="num">{elapsed(order.created_at, now)}</span> ago ·{' '}
        {/* The size of the job, for choosing between two tickets of the same
            age when only one pan is free. */}
        <span className="num">{dishes}</span> {dishes === 1 ? 'dish' : 'dishes'}
      </p>

      <ul className="card__items">
        {order.items.map((item) => (
          <li key={item.name} className="card__item">
            <span className="card__qty num">{item.qty}</span>
            <span className="card__name">{item.name}</span>
          </li>
        ))}
      </ul>

      <button
        type="button"
        className="card__action"
        onClick={() => onAdvance(order)}
        disabled={isPending}
        aria-label={`Order ${num}, ${STATUS_LABELS[order.status]}. ${action}.`}
      >
        {action}
      </button>
    </article>
  );
}
