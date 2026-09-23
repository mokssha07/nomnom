import './Stepper.css';

/**
 * Quantity control, used on the menu and again in the cart. At qty 0 it is a
 * single "Add" button; past that it becomes − n +. Two controls would mean two
 * things to aim at on a phone, and an empty stepper sitting at 0 next to every
 * dish makes the menu look like a spreadsheet.
 */
export default function Stepper({ qty, onChange, label }) {
  if (qty === 0) {
    return (
      <button type="button" className="stepper__add" onClick={() => onChange(1)}>
        Add<span className="sr-only"> {label}</span>
      </button>
    );
  }

  return (
    <span className="stepper">
      <button type="button" className="stepper__key" onClick={() => onChange(qty - 1)}>
        <span aria-hidden="true">−</span>
        <span className="sr-only">Remove one {label}</span>
      </button>

      <span className="stepper__qty num" aria-live="polite">
        {qty}
        <span className="sr-only"> {label} in cart</span>
      </span>

      <button type="button" className="stepper__key" onClick={() => onChange(qty + 1)}>
        <span aria-hidden="true">+</span>
        <span className="sr-only">Add another {label}</span>
      </button>
    </span>
  );
}
