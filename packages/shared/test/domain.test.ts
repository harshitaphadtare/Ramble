import { describe, expect, it } from 'vitest';
import { levelFor, touchedGrassStreak, weekKey } from '../src/domain';

describe('levels', () => {
  it('derives the level and what is next from the visit count', () => {
    expect(levelFor(0)).toMatchObject({ id: 'want', next: { id: 'visited', visitsToGo: 1 } });
    expect(levelFor(1)).toMatchObject({ id: 'visited', next: { id: 'favourite', visitsToGo: 1 } });
    expect(levelFor(4)).toMatchObject({ id: 'favourite', next: { id: 'regular', visitsToGo: 1 } });
    expect(levelFor(10)).toMatchObject({ id: 'legend', next: null });
  });
});

describe('weekKey', () => {
  it('matches known ISO weeks, including year boundaries', () => {
    const at = (y: number, m: number, d: number) => new Date(y, m - 1, d, 12).getTime();
    expect(weekKey(at(2026, 10, 10))).toBe('2026-W41'); // Saturday
    expect(weekKey(at(2026, 10, 12))).toBe('2026-W42'); // Monday
    expect(weekKey(at(2021, 1, 1))).toBe('2020-W53'); // Friday that belongs to last year's week 53
    expect(weekKey(at(2024, 12, 30))).toBe('2025-W01'); // Monday that belongs to next year's week 1
  });
});

describe('touchedGrassStreak', () => {
  const now = new Date(2026, 9, 10, 12).getTime(); // Sat, W41
  const weeksAgo = (n: number) => now - n * 7 * 86_400_000;

  it('counts consecutive weeks with a visit', () => {
    expect(touchedGrassStreak([now, weeksAgo(1), weeksAgo(2)], now)).toBe(3);
  });

  it("doesn't break the streak just because this week has no walk yet", () => {
    expect(touchedGrassStreak([weeksAgo(1), weeksAgo(2)], now)).toBe(2);
  });

  it('stops at the first gap', () => {
    expect(touchedGrassStreak([now, weeksAgo(2)], now)).toBe(1);
    expect(touchedGrassStreak([], now)).toBe(0);
  });
});
