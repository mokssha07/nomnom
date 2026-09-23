import { Link } from 'react-router-dom';
import api from '../api';
import { useAuth } from '../auth';
import StatusPill from '../components/StatusPill';
import { usePoll } from '../hooks/usePoll';
import { rupees } from '../lib/money';
import { token } from '../lib/token';
import './MyOrders.css';

/** Same poll as the kitchen board, for the same reason: a student standing at
 *  the counter needs "Ready" to appear without them refreshing the page. */
const POLL_MS = 5000;

/**
 * Every order this student has placed, newest first — the backend orders them,
 * we do not re-sort, so the page cannot disagree with the counter.
 */
export default function MyOrders() {
  const { data: orders, error, isLoading } = usePoll(api.getOrders, POLL_MS);
  const { signOut } = useAuth();

  return (
    <main className="orders">
      <header className="orders__head">
        <h1>Your orders</h1>
        {/* Signing out lives here rather than on the menu: this is the page
            about you, the menu is the page about food. */}
        <nav className="orders__nav">
          <Link to="/menu">Menu</Link>
          <button type="button" onClick={signOut}>
            Sign out
          </button>
        </nav>
      </header>

      {/* The banner sits above whatever is already on screen rather than
          replacing it, so a dropped request never hides an order someone is
          waiting on. Same rule as the kitchen board. */}
      {error && (
        <p className="orders__error" role="status">
          Not updating — {error.message}
        </p>
      )}

      {isLoading && <p className="orders__note">Loading your orders…</p>}

      {orders?.length === 0 && (
        <p className="orders__note">
          Nothing yet. <Link to="/menu">Pick something from the menu.</Link>
        </p>
      )}

      {orders?.length > 0 && (
        <ul className="orders__list">
          {orders.map((order) => (
            <li key={order.id}>
              <OrderRow order={order} />
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

function OrderRow({ order }) {
  const placed = new Date(order.created_at);
  const count = order.items.reduce((sum, i) => sum + i.qty, 0);

  return (
    <Link to={`/orders/${order.id}`} className="orow panel">
      {/* Source order is the grid's row order: token, status and money share
          the top line, the food and the time sit under them. */}
      <span className="orow__token num">#{token(order.id)}</span>
      <StatusPill status={order.status} />
      <span className="orow__total num">{rupees(order.total)}</span>

      <span className="orow__items">{order.items.map((i) => i.name).join(', ')}</span>

      <span className="orow__meta">
        {placed.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })} ·{' '}
        <span className="num">{count}</span> {count === 1 ? 'item' : 'items'}
      </span>
    </Link>
  );
}
