import { createContext, useContext, useMemo, useState } from 'react';
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

export function CartProvider({ children }) {
  const [lines, setLines] = useState([]);

  /**
   * One key per basket, minted when the cart is created and kept until the
   * order actually lands. If "Place order" fails on a flaky campus wifi, the
   * retry carries the SAME key, so a request that quietly succeeded the first
   * time gives back the original order instead of cooking everything twice.
   * Living here rather than in the Cart page matters: the page unmounts if you
   * wander back to the menu, and a key that resets is no key at all.
   */
  const [orderKey, setOrderKey] = useState(newOrderKey);

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
