import { Component, type ReactNode } from 'react';
import { reportError } from '../lib/telemetry';

/**
 * Last line of defence: an unexpected render error shows a calm message with a reload button
 * instead of a blank screen. The user's data is safe on the device either way.
 */
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  override state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  override componentDidCatch(error: unknown) {
    reportError(error);
  }

  override render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className="grid h-full place-items-center bg-sand p-6 text-center">
        <div className="max-w-xs">
          <p className="font-display text-2xl font-semibold text-forest">Something went wrong</p>
          <p className="mt-2 text-sm text-ink/65">Your places and journal are safe on this device. Reloading usually fixes it.</p>
          <button type="button" onClick={() => location.reload()} className="mt-4 rounded-xl bg-forest px-5 py-2.5 text-sm font-semibold text-white">
            Reload Ramble
          </button>
        </div>
      </div>
    );
  }
}
