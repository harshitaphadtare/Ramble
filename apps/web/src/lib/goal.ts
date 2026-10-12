import { create } from 'zustand';

/**
 * "How many days a week do you want to get outside?" A preference, not personal data, so it
 * lives in plain storage on this device. null = not asked yet (show the welcome question).
 */
const KEY = 'ramble.weeklyGoal';

function read(): number | null | 'skipped' {
  try {
    const v = localStorage.getItem(KEY);
    if (v === 'skipped') return 'skipped';
    const n = Number(v);
    return v && Number.isInteger(n) && n >= 1 && n <= 7 ? n : null;
  } catch {
    return 'skipped'; // storage blocked: don't nag on every load
  }
}

interface GoalState {
  goal: number | null | 'skipped';
  setGoal: (n: number | 'skipped') => void;
}

export const useGoal = create<GoalState>((set) => ({
  goal: read(),
  setGoal: (goal) => {
    try {
      localStorage.setItem(KEY, String(goal));
    } catch {
      /* stays for this session */
    }
    set({ goal });
  },
}));
