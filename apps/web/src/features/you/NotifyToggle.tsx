import { useState } from 'react';
import { notify } from '../../app/store/walkStore';

type State = 'unsupported' | 'default' | 'granted' | 'denied';
const read = (): State => ('Notification' in window ? (Notification.permission as State) : 'unsupported');
const isIos = () => /iPhone|iPad|iPod/.test(navigator.userAgent);
const standalone = () => window.matchMedia('(display-mode: standalone)').matches;

/** "Tell me when I arrive": the system permission, asked only when the user switches it on. */
export function NotifyToggle() {
  const [state, setState] = useState<State>(read);

  if (state === 'unsupported') {
    return (
      <p className="mt-2">
        {isIos() && !standalone()
          ? 'Arrival notifications on iPhone: tap Share → Add to Home Screen, then open Ramble from there.'
          : "This browser can't show notifications; the in-app arrival banner still works."}
      </p>
    );
  }

  return (
    <label className="mt-2 flex items-start gap-2">
      <input
        type="checkbox"
        checked={state === 'granted'}
        disabled={state === 'denied' || state === 'granted'}
        onChange={async (e) => {
          if (!e.target.checked) return;
          const next = (await Notification.requestPermission()) as State;
          setState(next);
          if (next === 'granted') void notify('Notifications are on', "Ramble will tell you when you reach a stop on your trip.");
        }}
        className="mt-0.5 size-4 shrink-0 accent-forest"
      />
      <span>
        <b className="text-forest">Arrival notifications.</b>{' '}
        {state === 'denied'
          ? 'Blocked in your browser settings; allow notifications for this site to turn them on.'
          : state === 'granted'
            ? 'On. You get a ping when you reach each stop (turn off in your browser settings).'
            : 'A ping when you reach each stop of a trip, while Ramble is open.'}
      </span>
    </label>
  );
}
