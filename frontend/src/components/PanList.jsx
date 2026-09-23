import { LATE_AFTER_MS } from '../lib/kitchen';
import { duration } from '../lib/time';
import './PanList.css';

/**
 * What to cook next, and how much of it.
 *
 * The three ticket columns say what has been ordered. This says what to put
 * on the heat — the same orders added up by dish, oldest first — because a
 * cook works in pans, not in tickets. Everything here comes out of panList();
 * this file only decides how it looks.
 */
export default function PanList({ rows }) {
  return (
    <section className="pans" aria-labelledby="pans-head">
      <h2 className="pans__head" id="pans-head">
        On the pans
      </h2>

      {rows.length === 0 ? (
        <p className="pans__empty">Everything ordered is cooked.</p>
      ) : (
        // An ordered list, because the order is the information: top of this
        // list is what goes on next.
        <ol className="pans__list">
          {rows.map((row) => (
            <li key={row.name} className={`pan${row.waitMs >= LATE_AFTER_MS ? ' pan--late' : ''}`}>
              <span className="pan__qty num">{row.qty}</span>
              <span className="pan__name">{row.name}</span>
              <span className="pan__wait num">{duration(row.waitMs)}</span>
              {/* Only worth saying when the pile is split across tickets —
                  four dosas for one order plate together, four for four
                  orders do not. */}
              {row.tickets > 1 && (
                <span className="pan__split">
                  across <span className="num">{row.tickets}</span> tickets
                </span>
              )}
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
