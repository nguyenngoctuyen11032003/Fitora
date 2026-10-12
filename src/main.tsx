import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import { ErrorBoundary, reloadOnce } from './components/ErrorBoundary';
import { installIosViewportFix } from './lib/iosViewport';
import './styles/index.css';

// Auth links (?code=… PKCE, ?token_hash=…&type=…, ?flow=recovery|signup) are handled
// by AuthProvider's bootstrap (src/context/AuthContext.tsx), mirroring Note_mytasks/src/main.js.

// A new deploy replaced the hashed chunks this tab still references: Vite reports the failed
// dependency preload here. Reload once (same 1/min guard as ErrorBoundary); if we can't, let the
// error reach the ErrorBoundary, which shows the "Tải lại" screen.
window.addEventListener('vite:preloadError', (event) => {
  if (reloadOnce()) event.preventDefault();
});

installIosViewportFix();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary variant="root">
      <App />
    </ErrorBoundary>
  </StrictMode>,
);
