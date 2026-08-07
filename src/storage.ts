import type { Board } from './kakuroEngine';
import type { Difficulty } from './types';

interface SavedState {
  board: Board;
  timer: number;
  hintsUsed: number;
  difficulty: Difficulty;
  preRevealed: boolean[][];
  editDirection: 'h' | 'v';
  pencilMode: boolean;
  showErrorsMode: boolean;
  startEpochMs: number;
}

const STATE_KEY = 'kakuro:state:v1';
const STATS_KEY = 'kakuro:stats:v1';

interface Stats {
  bestTimes: Partial<Record<Difficulty, number>>;
  totalWins: number;
}

export function loadState(): SavedState | null {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SavedState;
    if (!parsed.board || !Array.isArray(parsed.board)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function saveState(state: SavedState): void {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch {
    // localStorage may be full or disabled; silently ignore.
  }
}

export function clearState(): void {
  try {
    localStorage.removeItem(STATE_KEY);
  } catch {
    // ignore
  }
}

export function loadStats(): Stats {
  try {
    const raw = localStorage.getItem(STATS_KEY);
    if (!raw) return { bestTimes: {}, totalWins: 0 };
    const parsed = JSON.parse(raw) as Stats;
    return {
      bestTimes: parsed.bestTimes || {},
      totalWins: parsed.totalWins || 0,
    };
  } catch {
    return { bestTimes: {}, totalWins: 0 };
  }
}

export function saveStats(stats: Stats): void {
  try {
    localStorage.setItem(STATS_KEY, JSON.stringify(stats));
  } catch {
    // ignore
  }
}

export function recordWin(difficulty: Difficulty, timeSeconds: number, current: Stats): Stats {
  const best = current.bestTimes[difficulty];
  const next: Stats = {
    bestTimes: { ...current.bestTimes },
    totalWins: current.totalWins + 1,
  };
  if (best === undefined || timeSeconds < best) {
    next.bestTimes[difficulty] = timeSeconds;
  }
  return next;
}
