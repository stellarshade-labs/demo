// Side-effect import, first in the graph — see the module for why.
import './lib/fetchShim';

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import './styles.css';

// Register the service worker so Shade is installable and its shell is cached.
// `virtual:pwa-register` is a build-time stub in dev (registration is a no-op
// unless PWA dev mode is enabled), so this is safe to call unconditionally.
// `immediate: true` activates a waiting worker right away — paired with
// `registerType: 'autoUpdate'` new versions roll out without a manual reload.
registerSW({ immediate: true });

const container = document.getElementById('root');
if (!container) throw new Error('Root element not found.');

createRoot(container).render(
  <StrictMode>
    <BrowserRouter basename="/app">
      <App />
    </BrowserRouter>
  </StrictMode>,
);
