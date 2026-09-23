import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../api';
import { photoFor } from '../assets/photos';
import ArcPicker from '../components/ArcPicker';
import CategoryPicker, { ALL } from '../components/CategoryPicker';
import GooeyMenu from '../components/GooeyMenu';
import ModeSwitch from '../components/ModeSwitch';
import Stepper from '../components/Stepper';
import { useCart } from '../cart';
import { rupees } from '../lib/money';
import './Menu.css';

/**
 * The student's first screen: today's menu, grouped the way the counter board
 * groups it, with the cart following you down the page.
 *
 * Two ways to read it, thrown by the switch in the corner. The carousel is one
 * dish at a time, photograph first — how you browse when you have not decided.
 * The list is all of them at once — how you browse when you have. Both are fed
 * by the same category filter, so the switch changes the shape of the page and
 * never what is on it.
 */
export default function Menu() {
  const [menu, setMenu] = useState(null);
  const [error, setError] = useState(null);
  const [category, setCategory] = useState(ALL);
  const [mode, setMode] = useState('carousel');
  const cart = useCart();

  useEffect(() => {
    let live = true;
    api.getMenu().then(
      (items) => live && setMenu(items),
      (err) => live && setError(err.message),
    );
    return () => {
      live = false;
    };
  }, []);

  if (error) {
    return (
      <main className="menu">
        <p className="menu__note">
          Could not load the menu — {error}. Check your connection and reload.
        </p>
      </main>
    );
  }

  if (!menu) {
    return (
      <main className="menu">
        <p className="menu__note">Loading the menu…</p>
      </main>
    );
  }

  // Map.groupBy keeps the menu's own order, so the categories come out in the
  // order the kitchen listed them rather than alphabetically.
  const groups = Map.groupBy(menu, (item) => item.category);
  const categories = [...groups.keys()];

  const shown = category === ALL ? groups : new Map([[category, groups.get(category) ?? []]]);

  // The carousel has a quantity control on the dish in the middle, so putting a
  // sold-out one there offers something that cannot be bought.
  const spotlit = [...shown].flatMap(([, items]) => items).filter((item) => item.available);

  // Nothing to show happens two ways: the kitchen has published no menu at all,
  // or the chosen category is sold out — and in carousel mode "sold out" empties
  // the rail entirely, because the spotlight cannot offer a dish nobody can buy.
  const isEmpty = mode === 'carousel' ? spotlit.length === 0 : menu.length === 0;

  const count = cart.lines.reduce((sum, line) => sum + line.qty, 0);
  const total = cart.lines.reduce((sum, line) => {
    const item = menu.find((m) => m.id === line.id);
    return sum + (item ? item.price * line.qty : 0);
  }, 0);

  return (
    <main className={`menu${mode === 'carousel' ? ' menu--spotlight' : ''}`}>
      <header className="menu__head">
        <div className="menu__top">
          <h1>Menu</h1>
          <ModeSwitch mode={mode} onChange={setMode} />
        </div>

        <p className="menu__hours">Counter open 8am – 8pm. Pay when you collect.</p>
      </header>

      <CategoryPicker categories={categories} value={category} onChange={setCategory} />

      {isEmpty ? (
        <p className="menu__note">
          {menu.length === 0
            ? 'The counter has not put up a menu yet.'
            : 'Nothing left in this category today. Try another.'}
        </p>
      ) : mode === 'carousel' ? (
        <ArcPicker
          items={spotlit}
          title={category === ALL ? 'Everything today' : category}
          qtyOf={cart.qtyOf}
          onChange={cart.setQty}
        />
      ) : (
        [...shown].map(([name, items]) => (
          <section key={name} className="group">
            <h2 className="group__name">{name}</h2>

            <ul className="group__items">
              {items.map((item) => (
                <li key={item.id}>
                  <Item item={item} qty={cart.qtyOf(item.id)} onChange={cart.setQty} />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      {/* Bottom left, floating over the page rather than parked in the header:
          it is about you, not about the menu, and the one corner a thumb
          reaches without crossing anything it could buy by accident. */}
      <GooeyMenu />

      {/* The bar only exists once there is something in it. An empty cart bar
          parked at the bottom of every screen is a permanent nag. */}
      {count > 0 && (
        <div className="cartbar">
          <div className="cartbar__inner">
            <p className="cartbar__count">
              <span className="num">{count}</span> {count === 1 ? 'item' : 'items'}
              <span className="cartbar__total num">{rupees(total)}</span>
            </p>
            <Link to="/cart" className="cartbar__go">
              View cart
            </Link>
          </div>
        </div>
      )}
    </main>
  );
}

function Item({ item, qty, onChange }) {
  const photo = photoFor(item);

  return (
    <article className={`item panel${item.available ? '' : ' item--out'}`}>
      {/* The photo is decoration — the dish name is right beside it — so it
          carries an empty alt rather than reading the name out twice. */}
      {photo && <img className="item__photo" src={photo} alt="" width="88" height="88" />}

      <div className="item__body">
        <h3 className="item__name">{item.name}</h3>
        <p className="item__desc">{item.description}</p>

        <div className="item__foot">
          <span className="item__price num">{rupees(item.price)}</span>
          {item.available ? (
            <Stepper qty={qty} label={item.name} onChange={(next) => onChange(item.id, next)} />
          ) : (
            <span className="item__out">Sold out today</span>
          )}
        </div>
      </div>
    </article>
  );
}
