/** "Smarter suggestions" (TabPFN) is opt-in: off until the user turns it on (SECURITY.md §11). */
const KEY = 'ramble.personalize';

export function personalizeOptedIn(): boolean {
  try {
    return localStorage.getItem(KEY) === 'on';
  } catch {
    return false;
  }
}

export function setPersonalizeOptIn(on: boolean) {
  try {
    if (on) localStorage.setItem(KEY, 'on');
    else localStorage.removeItem(KEY);
  } catch {
    /* storage blocked: stays off */
  }
}
