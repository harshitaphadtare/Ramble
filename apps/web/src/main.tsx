import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './app/App';
import { ErrorBoundary } from './app/ErrorBoundary';
import { useUiStore } from './app/store/uiStore';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>,
);

// Updates wait for the user (docs/SECURITY.md §5.10): code never changes mid-session. A bar
// offers the new version; one tap reloads into it.
const updateSW = registerSW({
  onNeedRefresh() {
    useUiStore.setState({ applyUpdate: () => void updateSW(true) });
  },
});
