import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useAuth } from './auth';
import { setQty as nextLines } from './lib/cartLines';

/**
 * The cart. Lives above the routes because /menu unmounts when you walk over
 * to /cart, and a cart that empties itself on navigation is not a cart.
 *
 * A line is `{ id, qty }` and nothing else. Names and prices are read from the
 * menu when we need to show them, and the total is computed by the server when
 * the order is placed — the client never sends money it worked out itself.
 */
const CartContext = createContext(null);

/* randomUUID needs a secure context; localhost counts, but a phone opening the
   dev server over http://192.168.x.x does not, and that is how this gets demoed.
   ponytail: the fallback is not a real v4 UUID, it only has to be unique. */
const newOrderKey = () =>
  globalThis.crypto?.randomUUID?.() ?? `k-${Date.now()}-${Math.random().toString(16).slice(2)}`;

/* Kept in sessionStorage so a refresh doesn't empty the basket. Per tab, like
   the sign-in token, so it dies with the tab too. Anything that doesn't look
   like our own saved cart is ignored rather than trusted. */
const STORE_KEY = 'canteen.cart';

function readSaved() {
  try {
    const saved = JSON.parse(globalThis.sessionStorage?.getItem(STORE_KEY) ?? 'null');
    const valid =
      Array.isArray(saved?.lines) &&
      saved.lines.every((l) => Number.isInteger(l?.id) && Number.isInteger(l?.qty) && l.qty > 0) &&
      typeof saved.orderKey === 'string';
    return valid ? saved : null;
  } catch {
    return null;
  }
}

export function CartProvider({ children }) {
  const { user, isLoading } = useAuth();
  const [lines, setLines] = useState(() => readSaved()?.lines ?? []);

  /**
   * One key per basket, minted when the cart is created and kept until the
   * order actually lands. If "Place order" fails on a flaky campus wifi, the
   * retry carries the SAME key, so a request that quietly succeeded the first
   * time gives back the original order instead of cooking everything twice.
   * Living here rather than in the Cart page matters: the page unmounts if you
   * wander back to the menu, and a key that resets is no key at all.
   */
  const [orderKey, setOrderKey] = useState(() => readSaved()?.orderKey ?? newOrderKey());

  useEffect(() => {
    try {
      globalThis.sessionStorage?.setItem(STORE_KEY, JSON.stringify({ lines, orderKey }));
    } catch {
      // storage full or blocked: the cart still works, it just won't survive a refresh
    }
  }, [lines, orderKey]);

  // Signing out empties the basket, so the next person on a shared lab
  // machine doesn't inherit it. Waits for isLoading so a refresh doesn't wipe it.
  useEffect(() => {
    if (!isLoading && !user) {
      setLines([]);
      setOrderKey(newOrderKey());
    }
  }, [isLoading, user]);

  const value = useMemo(
    () => ({
      lines,
      orderKey,

      qtyOf: (id) => lines.find((line) => line.id === id)?.qty ?? 0,

      /** One setter for add, change and remove. qty 0 drops the line.
       *  The logic itself lives in lib/cartLines.js, where it is tested. */
      setQty(id, qty) {
        setLines((current) => nextLines(current, id, qty));
      },

      /** The order is in. Next basket is a new basket, so it gets a new key. */
      clear() {
        setLines([]);
        setOrderKey(newOrderKey());
      },
    }),
    [lines, orderKey],
  );

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const cart = useContext(CartContext);
  if (!cart) throw new Error('useCart must be used inside <CartProvider>');
  return cart;
}
