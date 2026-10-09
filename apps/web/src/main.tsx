import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './app/App';
import { ErrorBoundary } from './app/ErrorBoundary';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

// Updates wait for the user (docs/SECURITY.md §5.10): code never changes mid-session.
registerSW({
  onNeedRefresh() {
    // TODO(P1): replace with an in-app "Update available → Reload" toast.
    console.info('Ramble update available');
  },
});
