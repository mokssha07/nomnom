import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';

// Vite bundles the font files into dist/ — nothing is fetched from Google.
// The `opsz` cut is the important one: it carries Inter's optical-size axis,
// which is what lets one family behave like Apple's separate Text and Display
// faces. See the type notes in styles/tokens.css.
import '@fontsource-variable/inter/opsz.css';

import './styles/tokens.css';
import './styles/base.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
