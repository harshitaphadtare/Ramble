import { LoaderCircle, LocateFixed } from 'lucide-react';
import { useMapStore } from '../../app/store/mapStore';

/** "Use my location" pill: the only place Ramble asks for the user's position. */
export function LocationButton() {
  const status = useMapStore((s) => s.locateStatus);
  const locate = useMapStore((s) => s.locate);
  const located = status === 'located';

  return (
    <button
      type="button"
      onClick={() => void locate()}
      disabled={status === 'locating'}
      className={`flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
        located ? 'bg-forest text-white' : 'bg-mist text-forest'
      }`}
    >
      {status === 'locating' ? <LoaderCircle size={14} className="animate-spin" aria-hidden="true" /> : <LocateFixed size={14} aria-hidden="true" />}
      {status === 'locating' ? 'Finding you…' : located ? 'Near you' : 'Use my location'}
    </button>
  );
}

/** Explains a failed location request in plain words; renders nothing otherwise. */
export function LocationError() {
  const error = useMapStore((s) => (s.locateStatus === 'error' ? s.locateError : null));
  if (!error) return null;
  return (
    <p role="alert" className="mb-3 rounded-xl bg-ember/10 px-3 py-2 text-sm font-medium text-ember">
      {error}
    </p>
  );
}
