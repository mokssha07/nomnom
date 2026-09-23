import { STATUS_LABELS } from '../api/shapes';
import './StatusPill.css';

/**
 * The order's state, as a word. The colour is a second cue and never the only
 * one — the label is always there, so it still works for a colour-blind
 * student and in a screenshot printed in black and white.
 */
export default function StatusPill({ status }) {
  return <span className={`pill pill--${status.toLowerCase()}`}>{STATUS_LABELS[status]}</span>;
}
