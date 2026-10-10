import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
import './styles/index.css';

// Auth links (?code=… PKCE, ?token_hash=…&type=…, ?flow=recovery|signup) are handled
// by AuthProvider's bootstrap (src/context/AuthContext.tsx), mirroring Note_mytasks/src/main.js.

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
