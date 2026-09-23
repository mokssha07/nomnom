import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import api from './api';

/**
 * Who is signed in, for the whole app.
 *
 * The only place in the frontend that knows a session exists. Pages ask this
 * for `user` and never for a token, a cookie or a header — which is why
 * moving the backend from session auth to tokens changed `api/real.js` and
 * nothing else, this file included.
 *
 * `user` is null when signed out, and `isLoading` is true only while the first
 * getMe() is in flight. Routes have to wait for that answer: rendering a guard
 * before it lands would bounce a signed-in student to the login page on every
 * refresh.
 */
const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // Ask the server who we are on boot. The tab may still be holding a token
  // from earlier in the session, and asking is the only way to find out whether
  // the server still honours it. getMe() answers null when it does not.
  useEffect(() => {
    let live = true;
    api
      .getMe()
      .then((me) => live && setUser(me))
      .catch(() => live && setUser(null)) // not signed in is not an error here
      .finally(() => live && setIsLoading(false));
    return () => {
      live = false;
    };
  }, []);

  // These three deliberately let the error through to the caller: the form
  // that submitted knows where to show "wrong password", and this context
  // does not have a place to put it.
  const signIn = useCallback(async (username, password) => {
    const me = await api.login(username, password);
    setUser(me);
    return me;
  }, []);

  const signUp = useCallback(async (details) => {
    const me = await api.register(details);
    setUser(me);
    return me;
  }, []);

  const signOut = useCallback(async () => {
    await api.logout();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside <AuthProvider>');
  return value;
}
