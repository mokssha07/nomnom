import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { HOME_FOR_ROLE } from './api/shapes';
import { AuthProvider, useAuth } from './auth';
import { CartProvider } from './cart';
import OrderAlerts from './components/OrderAlerts';
import Cart from './pages/Cart';
import KitchenDisplay from './pages/KitchenDisplay';
import Menu from './pages/Menu';
import MyOrders from './pages/MyOrders';
import OrderDetail from './pages/OrderDetail';
import SignIn from './pages/SignIn';

/**
 * Every route in the app.
 *
 * AuthProvider wraps the routes because the guard below has to be inside it.
 * CartProvider wraps them for a different reason: the cart has to survive the
 * walk from /menu to /cart, so it cannot live inside either page.
 */
export default function App() {
  return (
    <AuthProvider>
      <CartProvider>
        <OrderAlerts />
        <Routes>
          <Route path="/login" element={<SignIn mode="login" />} />
          <Route path="/register" element={<SignIn mode="register" />} />

          <Route
            path="/menu"
            element={
              <Require role="student">
                <Menu />
              </Require>
            }
          />
          <Route
            path="/cart"
            element={
              <Require role="student">
                <Cart />
              </Require>
            }
          />
          <Route
            path="/orders"
            element={
              <Require role="student">
                <MyOrders />
              </Require>
            }
          />
          <Route
            path="/orders/:id"
            element={
              <Require role="student">
                <OrderDetail />
              </Require>
            }
          />

          <Route
            path="/kitchen"
            element={
              <Require role={['staff', 'manager']}>
                <KitchenDisplay />
              </Require>
            }
          />

          {/* "/" and anything unknown. Not a 404 page: there is nowhere in a
              canteen app to be lost, so send people to their own front door. */}
          <Route path="*" element={<Home />} />
        </Routes>
      </CartProvider>
    </AuthProvider>
  );
}

/**
 * The gate. Three answers, in this order:
 *
 *   still asking  → render nothing, because bouncing to /login before getMe()
 *                   answers would sign a signed-in user out on every refresh
 *   signed out    → /login, remembering where they were headed
 *   wrong role    → their own home, not an error — a student who opens
 *                   /kitchen has made a typo, not an attack
 *
 * This is convenience, not security. The board is safe because the server
 * refuses setStatus for a student (403 in both mock.js and real.js); a guard
 * that only lives in the browser is a guard anyone can open devtools and lift.
 */
function Require({ role, children }) {
  const { user, isLoading } = useAuth();
  const location = useLocation();

  if (isLoading) return null;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;

  const allowed = Array.isArray(role) ? role : [role];
  if (!allowed.includes(user.role)) return <Navigate to={HOME_FOR_ROLE[user.role]} replace />;

  return children;
}

/** Where "/" lands: the menu, the board, or the login form. */
function Home() {
  const { user, isLoading } = useAuth();
  if (isLoading) return null;
  return <Navigate to={user ? HOME_FOR_ROLE[user.role] : '/login'} replace />;
}
