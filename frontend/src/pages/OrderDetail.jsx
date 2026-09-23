import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import api from '../api';
import { STATUS_LABELS, STATUSES, canCancel, isFinished } from '../api/shapes';
import { usePoll } from '../hooks/usePoll';
import { rupees } from '../lib/money';
import { token } from '../lib/token';
import './OrderDetail.css';

const POLL_MS = 5000;

/** One line under the bill, saying what to do now rather than what happened.
 *  The status word above is the state; this is the instruction. */
const ADVICE = {
  PLACED: 'Show this token at the counter and pay when you collect.',
  ACCEPTED: 'The kitchen has your order. Cooking starts shortly.',
  PREPARING: 'Being cooked now. Show this token at the counter.',
  READY: 'Ready — collect it at the counter and pay there.',
  COMPLETED: 'Collected. Thanks!',
  CANCELLED: 'This order was cancelled. Nothing to pay.',
};

/**
 * One order, live. This is the screen a student holds up at the counter, so
 * the token number is the biggest thing on it and everything else is smaller
 * than the food.
 */
export default function OrderDetail() {
  const { id } = useParams();

  // usePoll restarts its loop whenever the fetcher changes, so this has to be
  // stable — it may only be rebuilt when the id in the URL actually changes.
  const fetchOrder = useCallback(() => api.getOrder(id), [id]);
  const [pollMs, setPollMs] = useState(POLL_MS);
  const { data: order, error, isLoading, patch } = usePoll(fetchOrder, pollMs);

  // A collected or cancelled order will never change again, so stop asking.
  // Without this a phone left on this screen keeps waking the server every
  // five seconds until the battery gives up.
  useEffect(() => {
    setPollMs(order && isFinished(order.status) ? 0 : POLL_MS);
  }, [order]);

  // Cancelling cannot be undone, so the button asks twice. A plain confirm()
  // would do the same job, but it blocks the page and reads like an error.
  const [isArmed, setIsArmed] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);
  const [cancelError, setCancelError] = useState(null);

  async function cancel() {
    setIsCancelling(true);
    setCancelError(null);
    try {
      // patch shows the cancelled order at once instead of leaving the student
      // looking at a stale "Placed" until the next poll comes round.
      patch(await api.cancelOrder(order.id));
    } catch (failure) {
      // Most likely the kitchen accepted it a second before the tap landed.
      setCancelError(failure.message);
      setIsArmed(false);
    } finally {
      setIsCancelling(false);
    }
  }

  if (isLoading) {
    return (
      <main className="order">
        <p className="order__note">Loading…</p>
      </main>
    );
  }

  // Only a first fetch that failed lands here — after that the last good order
  // stays on screen and the banner below carries the failure.
  if (!order) {
    return (
      <main className="order">
        <p className="order__note">{error?.message ?? 'That order does not exist.'}</p>
        <p className="order__note">
          <Link to="/orders">Back to your orders</Link>
        </p>
      </main>
    );
  }

  const placed = new Date(order.created_at);

  return (
    <main className="order">
      <header className="order__head">
        <Link to="/orders" className="order__back">
          Your orders
        </Link>
      </header>

      <section className="order__token">
        <p className="order__label">Token</p>
        <p className="order__number num">#{token(order.id)}</p>
        <p className="order__placed">
          Placed at {placed.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
        </p>
      </section>

      <Track status={order.status} />

      {error && (
        <p className="order__error" role="status">
          Not updating — {error.message}
        </p>
      )}

      <ul className="order__lines panel">
        {order.items.map((item) => (
          <li key={item.name} className="oline">
            <span className="oline__qty num">{item.qty}×</span>
            <span className="oline__name">{item.name}</span>
            <span className="oline__price num">{rupees(item.price * item.qty)}</span>
          </li>
        ))}

        <li className="oline oline--total">
          <span className="oline__name">Total</span>
          <span className="oline__price num">{rupees(order.total)}</span>
        </li>
      </ul>

      <p className="order__terms">{ADVICE[order.status]}</p>

      {canCancel(order.status) && (
        <>
          {cancelError && (
            <p className="order__error" role="alert">
              {cancelError}
            </p>
          )}
          <button
            type="button"
            className={`order__cancel${isArmed ? ' is-armed' : ''}`}
            onClick={() => (isArmed ? cancel() : setIsArmed(true))}
            disabled={isCancelling}
          >
            {isCancelling ? 'Cancelling…' : isArmed ? 'Tap again to cancel' : 'Cancel this order'}
          </button>
        </>
      )}
    </main>
  );
}

/**
 * The five states as a row of steps, with everything up to and including the
 * current one filled. A student wants "how far along is my food", and a list
 * of steps answers that in one look — a single word does not say what comes
 * next or what has already happened.
 */
function Track({ status }) {
  const reached = STATUSES.indexOf(status);

  // CANCELLED is not a point on the line, it is a way off it, so drawing it as
  // a step would be a lie — there is no progress to show. One flat bar instead.
  if (status === 'CANCELLED') {
    return (
      <p className="track track--void" role="status">
        {STATUS_LABELS.CANCELLED}
      </p>
    );
  }

  return (
    <ol className="track" aria-label={`Status: ${STATUS_LABELS[status]}`}>
      {STATUSES.map((step, i) => (
        <li
          key={step}
          className={`track__step${i <= reached ? ' is-done' : ''}${i === reached ? ' is-now' : ''}`}
          aria-current={i === reached ? 'step' : undefined}
        >
          <span className="track__dot" />
          <span className="track__name">{STATUS_LABELS[step]}</span>
        </li>
      ))}
    </ol>
  );
}
