import { describe, it, expect, beforeEach } from 'vitest';
import { loadState, saveState, clearState, loadStats, saveStats, recordWin } from './storage';

describe('storage', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns null when no state is saved', () => {
    expect(loadState()).toBeNull();
  });

  it('round-trips state', () => {
    const state = {
      board: [[{ type: 'white' as const, value: 1, correctValue: 1, notes: [] }]],
      timer: 42,
      hintsUsed: 0,
      difficulty: 'easy' as const,
      preRevealed: [[false]],
      editDirection: 'h' as const,
      pencilMode: false,
      showErrorsMode: true,
      startEpochMs: 1000,
    };
    saveState(state);
    const loaded = loadState();
    expect(loaded).toEqual(state);
  });

  it('clearState removes the saved state', () => {
    saveState({
      board: [],
      timer: 0,
      hintsUsed: 0,
      difficulty: 'easy',
      preRevealed: [],
      editDirection: 'h',
      pencilMode: false,
      showErrorsMode: true,
      startEpochMs: 0,
    });
    expect(loadState()).not.toBeNull();
    clearState();
    expect(loadState()).toBeNull();
  });

  it('returns empty stats on a fresh storage', () => {
    const stats = loadStats();
    expect(stats).toEqual({ bestTimes: {}, totalWins: 0 });
  });

  it('recordWin updates the best time only when improved', () => {
    const s0 = { bestTimes: {} as Record<string, number>, totalWins: 0 };
    const s1 = recordWin('easy', 100, s0);
    expect(s1.bestTimes.easy).toBe(100);
    expect(s1.totalWins).toBe(1);
    const s2 = recordWin('easy', 50, s1);
    expect(s2.bestTimes.easy).toBe(50);
    expect(s2.totalWins).toBe(2);
    const s3 = recordWin('easy', 200, s2);
    expect(s3.bestTimes.easy).toBe(50); // unchanged
    expect(s3.totalWins).toBe(3);
  });

  it('saveStats + loadStats round-trip', () => {
    const stats = { bestTimes: { easy: 42, medium: 100 }, totalWins: 7 };
    saveStats(stats);
    expect(loadStats()).toEqual(stats);
  });
});
