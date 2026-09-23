import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { HOME_FOR_ROLE } from '../api/shapes';
import ramen from '../assets/ramen.webp';
import { useAuth } from '../auth';
import './SignIn.css';

/**
 * One form, two doors. Registering asks for three more boxes than signing in
 * does, but everything around them — the layout, the error handling, where you
 * land afterwards — is identical, so this stays one component mounted at two
 * routes rather than two pages that would slowly drift apart.
 */
export default function SignIn({ mode }) {
  const isRegister = mode === 'register';
  const { signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [badField, setBadField] = useState(null); // which input the server blamed
  const [isSending, setIsSending] = useState(false);

  // The three the college needs and the canteen does not: they identify a real
  // student behind the username. Kept in one object because they are only ever
  // read together, and handed to the backend under its own field names.
  const [extra, setExtra] = useState({ roll_number: '', email: '', phone_number: '' });
  const edit = (key) => (event) => {
    const { value } = event.target;
    setExtra((current) => ({ ...current, [key]: value }));
    if (badField === key) setBadField(null); // they are fixing it; stop nagging
  };

  async function submit(event) {
    // The browser validates required and minlength before we get here; this
    // stops it reloading the page with the fields in the URL.
    event.preventDefault();
    setIsSending(true);
    setError(null);
    setBadField(null);
    try {
      const user = isRegister
        ? await signUp({ username, password, ...extra })
        : await signIn(username, password);
      // Back to whatever they were trying to reach, or to the screen their
      // role starts at. replace, so Back does not return to this form.
      const from = location.state?.from;
      navigate(from ?? HOME_FOR_ROLE[user.role], { replace: true });
    } catch (err) {
      setError(err.message);
      // The backend answers a duplicate roll number with the field name, not
      // just a sentence. Put the complaint beside that input instead of in a
      // banner at the bottom — nobody should have to work out which of five
      // boxes is wrong.
      setBadField(err.field ?? null);
      setIsSending(false); // stays mounted on failure, so no live check needed
    }
  }

  return (
    <main className="signin">
      {/* The partition: the form on one side, the bowl on the other. Above
          60rem they are two halves of the page; below it the bowl slides
          behind the card and becomes the backdrop, because a phone has one
          column and the form is the one that matters. */}
      <div className="signin__pane">
        <form className="signin__card" onSubmit={submit}>
          <h1 className="signin__title">{isRegister ? 'Create an account' : 'Campus Canteen'}</h1>
          <p className="signin__sub">
            {isRegister
              ? 'New accounts order food. Kitchen accounts are made by the canteen manager.'
              : 'Sign in to order, or to open the kitchen board.'}
          </p>

          <Field
            label="Username"
            name="username"
            autoComplete="username"
            required
            minLength={3}
            autoFocus
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            error={badField === 'username' ? error : null}
          />

          <Field
            label="Password"
            name="password"
            type="password"
            autoComplete={isRegister ? 'new-password' : 'current-password'}
            required
            minLength={4}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={badField === 'password' ? error : null}
          />

          {isRegister && (
            <>
              <Field
                label="Roll number"
                name="roll_number"
                autoComplete="off"
                required
                value={extra.roll_number}
                onChange={edit('roll_number')}
                error={badField === 'roll_number' ? error : null}
              />

              {/* type="email" and type="tel" do the obvious checking and give a
                  phone the right keyboard, so there is no validation code here
                  to keep in step with the backend's. */}
              <Field
                label="Email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={extra.email}
                onChange={edit('email')}
                error={badField === 'email' ? error : null}
              />

              <Field
                label="Phone"
                name="phone_number"
                type="tel"
                inputMode="tel"
                autoComplete="tel"
                required
                value={extra.phone_number}
                onChange={edit('phone_number')}
                error={badField === 'phone_number' ? error : null}
              />
            </>
          )}

          {/* Only when the server did not say which box was at fault — otherwise
              the same sentence would appear twice on one screen. */}
          {error && !badField && (
            <p className="signin__error" role="alert">
              {error}
            </p>
          )}

          <button type="submit" className="signin__go" disabled={isSending}>
            {isSending ? 'Just a moment…' : isRegister ? 'Create account' : 'Sign in'}
          </button>

          <p className="signin__swap">
            {isRegister ? (
              <>
                Already have one? <Link to="/login">Sign in</Link>
              </>
            ) : (
              <>
                No account yet? <Link to="/register">Create one</Link>
              </>
            )}
          </p>
        </form>
      </div>

      {/* A figure, not a bare image: the photograph is decoration and carries
          an empty alt, but the line under it is worth reading, so the caption
          stays in the accessibility tree. */}
      <figure className="signin__art">
        <img className="signin__bowl" src={ramen} alt="" width="1200" height="1200" />
        <figcaption className="signin__quote">
          <q>Nobody thinks straight on an empty stomach.</q>
        </figcaption>
      </figure>
    </main>
  );
}

/**
 * A labelled input, and the one place a server complaint about it is drawn.
 * Five near-identical labels is five chances for one of them to drift.
 */
function Field({ label, error, ...input }) {
  return (
    <label className={`field${error ? ' field--bad' : ''}`}>
      <span className="field__label">{label}</span>
      <input {...input} aria-invalid={error ? 'true' : undefined} />
      {error && (
        <span className="field__error" role="alert">
          {error}
        </span>
      )}
    </label>
  );
}
