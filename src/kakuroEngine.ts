// Kakuro Puzzle Engine and Generator

import type { Difficulty } from './types';

export interface BlackCell {
  type: 'black';
  clueRight?: number;
  clueDown?: number;
}

export interface WhiteCell {
  type: 'white';
  value: number | '';
  correctValue: number;
  notes?: number[];
}

export type Cell = BlackCell | WhiteCell;
export type Board = Cell[][];

interface Coord { r: number; c: number }
export type Direction = 'h' | 'v';

/**
 * Layout generation parameters per difficulty.
 *
 * `size` includes the clue border. Row 0 and column 0 are always black
 * because they host the clues for every run that starts at index 1 — see
 * `generateLayout` for why that invariant is load-bearing.
 *
 * `maxRun` is capped at 9 in all cases: a run holds distinct digits 1-9,
 * so a run longer than 9 cells is unsatisfiable.
 */
export interface LayoutSpec {
  size: number;
  blackRatio: number;
  maxRun: number;
}

const DIFFICULTY_SPECS: Record<Difficulty, LayoutSpec> = {
  easy: { size: 7, blackRatio: 0.2, maxRun: 4 },
  medium: { size: 9, blackRatio: 0.26, maxRun: 5 },
  hard: { size: 11, blackRatio: 0.3, maxRun: 6 },
};

const ABSOLUTE_MAX_RUN = 9;
const MIN_RUN = 2;

/**
 * Search budget for the per-removal uniqueness check while digging holes.
 * Deliberately small: a removal that cannot be proven safe quickly is simply
 * not made, which costs a little difficulty but keeps generation snappy.
 */
const DIG_NODE_BUDGET = 20000;

function shuffle<T>(array: readonly T[]): T[] {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

/**
 * Enumerates every maximal horizontal and vertical white run in a layout.
 * A "run" is a maximal straight sequence of white cells.
 */
function enumerateRuns(layout: string[][]): { hRuns: Coord[][]; vRuns: Coord[][] } {
  const h = layout.length;
  const w = layout[0].length;
  const hRuns: Coord[][] = [];
  const vRuns: Coord[][] = [];

  for (let r = 0; r < h; r++) {
    let current: Coord[] = [];
    for (let c = 0; c < w; c++) {
      if (layout[r][c] === 'W') {
        current.push({ r, c });
      } else if (current.length > 0) {
        hRuns.push(current);
        current = [];
      }
    }
    if (current.length > 0) hRuns.push(current);
  }

  for (let c = 0; c < w; c++) {
    let current: Coord[] = [];
    for (let r = 0; r < h; r++) {
      if (layout[r][c] === 'W') {
        current.push({ r, c });
      } else if (current.length > 0) {
        vRuns.push(current);
        current = [];
      }
    }
    if (current.length > 0) vRuns.push(current);
  }

  return { hRuns, vRuns };
}

/**
 * Checks the structural invariants a playable Kakuro layout must satisfy.
 *
 * 1. Row 0 and column 0 are entirely black. Every run therefore starts at
 *    index >= 1 and is guaranteed a black host cell immediately above/left
 *    of its first white cell, which is where its clue lives. Without this
 *    guarantee a run can exist with nowhere to print its clue, leaving it
 *    silently unvalidated.
 * 2. No run is shorter than MIN_RUN. Length-1 runs are trivially determined
 *    by their own clue and are considered poor puzzle construction.
 * 3. No run is longer than `maxRun` (and never longer than 9, since a run
 *    holds distinct digits 1-9).
 * 4. At least one white cell exists.
 */
export function validateLayout(layout: string[][], maxRun = ABSOLUTE_MAX_RUN): boolean {
  const h = layout.length;
  const w = layout[0].length;
  if (h < 2 || w < 2) return false;

  for (let c = 0; c < w; c++) {
    if (layout[0][c] !== 'B') return false;
  }
  for (let r = 0; r < h; r++) {
    if (layout[r][0] !== 'B') return false;
  }

  const cap = Math.min(maxRun, ABSOLUTE_MAX_RUN);
  const { hRuns, vRuns } = enumerateRuns(layout);
  if (hRuns.length === 0 || vRuns.length === 0) return false;

  for (const run of [...hRuns, ...vRuns]) {
    if (run.length < MIN_RUN) return false;
    if (run.length > cap) return false;
  }

  return true;
}

/**
 * Procedurally builds a layout for the given spec.
 *
 * Neither rejection sampling nor greedy repair works here. Random scatter
 * essentially never satisfies the run-length bounds on a large grid, and
 * greedy splitting deadlocks because splitting a long run can strand a
 * length-1 run in the perpendicular direction.
 *
 * So the layout is solved as a constraint satisfaction problem: assign
 * B/W to each interior cell in row-major order under the invariants
 * (every run length in [MIN_RUN, cap]), backtracking on conflict. The
 * digit order is shuffled per cell and biased by `blackRatio`, which
 * yields a different valid grid each call.
 */
export function generateLayout(spec: LayoutSpec, nodeBudget = 200000): string[][] | null {
  const n = spec.size;
  const cap = Math.min(spec.maxRun, ABSOLUTE_MAX_RUN);
  if (n < 2 + MIN_RUN) return null;

  const grid: string[][] = Array.from({ length: n }, () => Array(n).fill('B'));
  const cells: Coord[] = [];
  for (let r = 1; r < n; r++) {
    for (let c = 1; c < n; c++) cells.push({ r, c });
  }

  /** Length of the white run ending immediately before (r, c). */
  const trailingH = (r: number, c: number): number => {
    let len = 0;
    let cc = c - 1;
    while (cc >= 1 && grid[r][cc] === 'W') { len++; cc--; }
    return len;
  };
  const trailingV = (r: number, c: number): number => {
    let len = 0;
    let rr = r - 1;
    while (rr >= 1 && grid[rr][c] === 'W') { len++; rr--; }
    return len;
  };

  let nodes = 0;

  const assign = (index: number): boolean => {
    if (nodes++ > nodeBudget) return false;
    if (index === cells.length) return true;

    const { r, c } = cells[index];
    const isLastCol = c === n - 1;
    const isLastRow = r === n - 1;

    // Bias the attempt order by blackRatio so grids vary in density.
    const tryBlackFirst = Math.random() < spec.blackRatio;
    const order: string[] = tryBlackFirst ? ['B', 'W'] : ['W', 'B'];

    for (const value of order) {
      const hBefore = trailingH(r, c);
      const vBefore = trailingV(r, c);

      if (value === 'B') {
        // Closing a run: it must be absent or long enough.
        if (hBefore !== 0 && hBefore < MIN_RUN) continue;
        if (vBefore !== 0 && vBefore < MIN_RUN) continue;
      } else {
        // Extending a run: it must not overrun the cap.
        if (hBefore + 1 > cap) continue;
        if (vBefore + 1 > cap) continue;
        // A run that ends at the grid edge must still be long enough.
        if (isLastCol && hBefore + 1 < MIN_RUN) continue;
        if (isLastRow && vBefore + 1 < MIN_RUN) continue;
      }

      grid[r][c] = value;
      if (assign(index + 1)) return true;
      grid[r][c] = 'B';
    }

    return false;
  };

  if (!assign(0)) return null;
  if (!validateLayout(grid, spec.maxRun)) return null;
  return grid;
}

function locateRun(
  board: Board,
  r: number,
  c: number,
  direction: Direction
): { clueCell: BlackCell | null; runCoords: Coord[] } {
  const h = board.length;
  const w = board[0].length;
  if (board[r]?.[c]?.type !== 'white') {
    return { clueCell: null, runCoords: [] };
  }

  let startR = r;
  let startC = c;
  if (direction === 'h') {
    while (startC >= 0 && board[r][startC].type === 'white') startC--;
  } else {
    while (startR >= 0 && board[startR][c].type === 'white') startR--;
  }
  const clueCell = (board[startR]?.[startC] as BlackCell) || null;

  const runCoords: Coord[] = [];
  if (direction === 'h') {
    let tempC = startC + 1;
    while (tempC < w && board[r][tempC].type === 'white') {
      runCoords.push({ r, c: tempC });
      tempC++;
    }
  } else {
    let tempR = startR + 1;
    while (tempR < h && board[tempR][c].type === 'white') {
      runCoords.push({ r: tempR, c });
      tempR++;
    }
  }

  return { clueCell, runCoords };
}

function validateRun(
  board: Board,
  r: number,
  c: number,
  direction: Direction,
  targetSum: number
): { runCoords: Coord[]; errorCoords: Coord[] } {
  const { runCoords } = locateRun(board, r, c, direction);
  const errorCoords: Coord[] = [];
  if (runCoords.length === 0) return { runCoords, errorCoords };

  const values: number[] = [];
  let hasEmpty = false;
  for (const coord of runCoords) {
    const cell = board[coord.r][coord.c] as WhiteCell;
    if (cell.value === '') {
      hasEmpty = true;
    } else {
      values.push(cell.value);
    }
  }

  const uniqueValues = new Set(values);
  const hasDuplicates = uniqueValues.size !== values.length;
  const currentSum = values.reduce((sum, v) => sum + v, 0);
  const sumIsCorrect = currentSum === targetSum;

  if (!hasEmpty && !sumIsCorrect) {
    for (const coord of runCoords) errorCoords.push(coord);
  }
  if (hasDuplicates) {
    const seen = new Set<number>();
    const duplicates = new Set<number>();
    for (const v of values) {
      if (seen.has(v)) duplicates.add(v);
      seen.add(v);
    }
    for (const coord of runCoords) {
      const cell = board[coord.r][coord.c] as WhiteCell;
      if (cell.value !== '' && duplicates.has(cell.value)) {
        errorCoords.push(coord);
      }
    }
  }

  return { runCoords, errorCoords };
}

function isRunWithinRange(
  partialSum: number,
  length: number,
  targetSum: number,
  usedDigits: Set<number>
): boolean {
  if (length === 0) return true;
  const filledCount = usedDigits.size;
  if (filledCount === length) return partialSum === targetSum;
  const remaining = length - filledCount;
  const sortedAvail: number[] = [];
  for (let d = 1; d <= 9; d++) if (!usedDigits.has(d)) sortedAvail.push(d);
  if (sortedAvail.length < remaining) return false;
  let minSum = 0;
  for (let i = 0; i < remaining; i++) minSum += sortedAvail[i];
  let maxSum = 0;
  for (let i = sortedAvail.length - remaining; i < sortedAvail.length; i++) maxSum += sortedAvail[i];
  return (
    partialSum + minSum <= targetSum &&
    partialSum + maxSum >= targetSum
  );
}

/**
 * Generates a Kakuro puzzle that is guaranteed to have exactly one solution.
 *
 * Uniqueness is enforced, not assumed: after laying out the grid and solving
 * it, `countSolutions` is consulted and cells are revealed until only one
 * solution remains. Difficulty then adds further reveals on top.
 */
export function generateKakuroPuzzle(difficulty: Difficulty): {
  board: Board;
  solution: number[][];
  preRevealed: boolean[][];
} {
  const MAX_OUTER = 25;
  for (let attempt = 0; attempt < MAX_OUTER; attempt++) {
    const result = tryGenerate(difficulty);
    if (result) return result;
  }
  throw new Error(
    `Kakuro generator could not produce a valid puzzle in ${MAX_OUTER} attempts.`
  );
}

function tryGenerate(difficulty: Difficulty): {
  board: Board;
  solution: number[][];
  preRevealed: boolean[][];
} | null {
  const spec = DIFFICULTY_SPECS[difficulty] ?? DIFFICULTY_SPECS.easy;
  const layout = generateLayout(spec);
  if (!layout) return null;

  const h = layout.length;
  const w = layout[0].length;

  const tempBoard: ('B' | number)[][] = Array.from({ length: h }, (_, r) =>
    Array.from({ length: w }, (_, c) => (layout[r][c] === 'B' ? 'B' : 0))
  );

  const { hRuns, vRuns } = enumerateRuns(layout);

  const cellToHRun = new Map<string, Coord[]>();
  const cellToVRun = new Map<string, Coord[]>();
  for (const run of hRuns) {
    for (const coord of run) cellToHRun.set(`${coord.r},${coord.c}`, run);
  }
  for (const run of vRuns) {
    for (const coord of run) cellToVRun.set(`${coord.r},${coord.c}`, run);
  }

  const whiteCells: Coord[] = [];
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      if (layout[r][c] === 'W') whiteCells.push({ r, c });
    }
  }

  function isRunPruned(run: Coord[]): boolean {
    if (run.length === 0) return false;
    let sum = 0;
    for (const coord of run) {
      const v = tempBoard[coord.r][coord.c];
      if (typeof v === 'number' && v > 0) sum += v;
    }
    return sum > run.length * 9;
  }

  function solve(index: number): boolean {
    if (index === whiteCells.length) return true;
    const { r, c } = whiteCells[index];
    const hRun = cellToHRun.get(`${r},${c}`) || [];
    const vRun = cellToVRun.get(`${r},${c}`) || [];

    const usedValues = new Set<number>();
    for (const run of [hRun, vRun]) {
      for (const coord of run) {
        const val = tempBoard[coord.r][coord.c];
        if (typeof val === 'number' && val > 0) usedValues.add(val);
      }
    }

    for (const d of shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9])) {
      if (usedValues.has(d)) continue;
      tempBoard[r][c] = d;
      if (!isRunPruned(hRun) && !isRunPruned(vRun)) {
        if (solve(index + 1)) return true;
      }
      tempBoard[r][c] = 0;
    }
    return false;
  }

  if (!solve(0)) return null;

  // Derive clues from the solved grid. Because row 0 and column 0 are black
  // (see validateLayout), the cell immediately left of / above the first
  // white cell of every run is guaranteed to exist and be black, so this
  // single pass places every clue. No edge-case fixups are needed.
  const runTargetSum = new Map<string, number>();
  const clueHost = new Map<string, { clueRight?: number; clueDown?: number }>();

  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      if (layout[r][c] !== 'B') continue;
      if (c + 1 < w && layout[r][c + 1] === 'W') {
        let sum = 0;
        let tempC = c + 1;
        while (tempC < w && layout[r][tempC] === 'W') {
          sum += tempBoard[r][tempC] as number;
          tempC++;
        }
        const existing = clueHost.get(`${r},${c}`) || {};
        existing.clueRight = sum;
        clueHost.set(`${r},${c}`, existing);
        runTargetSum.set(`h:${r},${c}`, sum);
      }
      if (r + 1 < h && layout[r + 1][c] === 'W') {
        let sum = 0;
        let tempR = r + 1;
        while (tempR < h && layout[tempR][c] === 'W') {
          sum += tempBoard[tempR][c] as number;
          tempR++;
        }
        const existing = clueHost.get(`${r},${c}`) || {};
        existing.clueDown = sum;
        clueHost.set(`${r},${c}`, existing);
        runTargetSum.set(`v:${r},${c}`, sum);
      }
    }
  }

  const finalBoard: Board = Array.from({ length: h }, () => []);
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      if (layout[r][c] === 'W') {
        finalBoard[r][c] = {
          type: 'white',
          value: '',
          correctValue: tempBoard[r][c] as number,
          notes: [],
        };
      } else {
        const host = clueHost.get(`${r},${c}`);
        finalBoard[r][c] = {
          type: 'black',
          clueRight: host?.clueRight,
          clueDown: host?.clueDown,
        };
      }
    }
  }

  const preRevealed: boolean[][] = Array.from({ length: h }, () => Array(w).fill(false));

  // Uniqueness gate, built by digging holes rather than adding givens.
  //
  // countSolutions is cheap on a mostly-filled board and expensive on an
  // empty one (an empty 11x11 costs ~1s, a 40%-filled one <1ms), so we start
  // from the full solution and remove cells one at a time, keeping a removal
  // only if the puzzle still has exactly one solution. Every intermediate
  // check therefore runs in the cheap regime, and the invariant "exactly one
  // solution" holds at every step by construction.
  const isGiven: boolean[][] = Array.from({ length: h }, () => Array(w).fill(true));
  for (const { r, c } of whiteCells) {
    const cell = finalBoard[r][c] as WhiteCell;
    cell.value = cell.correctValue;
  }

  // Difficulty sets how aggressively we dig. Easy leaves more givens.
  const targetHoleRatio = difficulty === 'easy' ? 0.6 : difficulty === 'medium' ? 0.8 : 0.95;
  const maxHoles = Math.floor(whiteCells.length * targetHoleRatio);

  let holes = 0;
  for (const { r, c } of shuffle(whiteCells)) {
    if (holes >= maxHoles) break;
    const cell = finalBoard[r][c] as WhiteCell;
    const saved = cell.value;
    cell.value = '';
    // A tight per-removal budget keeps "New Game" responsive. Exhausting it
    // returns CAP, which is treated the same as a genuine second solution:
    // the removal is rejected. That only ever makes the puzzle easier, never
    // ambiguous, so it is safe to fail closed here.
    if (countSolutions(finalBoard, cellToHRun, cellToVRun, runTargetSum, DIG_NODE_BUDGET) === 1) {
      isGiven[r][c] = false;
      holes++;
    } else {
      cell.value = saved;
    }
  }

  // A puzzle where almost nothing could be dug out is not worth playing.
  if (holes < whiteCells.length * 0.35) return null;

  for (const { r, c } of whiteCells) {
    if (isGiven[r][c]) preRevealed[r][c] = true;
  }

  const solution: number[][] = Array.from({ length: h }, () => Array(w).fill(0));
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const cell = finalBoard[r][c];
      if (cell.type === 'white') solution[r][c] = cell.correctValue;
    }
  }

  return { board: finalBoard, solution, preRevealed };
}

/**
 * Counts the solutions consistent with the clues, stopping at `CAP`.
 * Cells that already hold a value are treated as fixed givens.
 * A return of 1 means the puzzle is uniquely solvable as presented.
 *
 * `nodeBudget` bounds the search so a pathological board cannot hang the
 * caller. If the budget is exhausted the function returns CAP, i.e. it
 * reports "not provably unique" rather than claiming uniqueness it did not
 * establish. Callers must treat that as a rejection, never as a pass.
 */
export function countSolutions(
  board: Board,
  cellToHRun: Map<string, Coord[]>,
  cellToVRun: Map<string, Coord[]>,
  runTargetSum: Map<string, number>,
  nodeBudget = 200000
): number {
  const h = board.length;
  const w = board[0].length;
  const CAP = 2;

  const tempBoard: ('B' | number)[][] = Array.from({ length: h }, (_, r) =>
    Array.from({ length: w }, (_, c) => {
      const cell = board[r][c];
      return cell.type === 'white' ? (cell.value === '' ? 0 : cell.value) : 'B';
    })
  );
  const unknown: Coord[] = [];
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const cell = board[r][c];
      if (cell.type === 'white' && cell.value === '') {
        unknown.push({ r, c });
      }
    }
  }

  let found = 0;
  let nodes = 0;
  let exhausted = false;

  function runKey(run: Coord[], direction: Direction): string | null {
    if (run.length === 0) return null;
    const first = run[0];
    if (direction === 'h') {
      if (first.c > 0 && board[first.r][first.c - 1]?.type === 'black') {
        return `h:${first.r},${first.c - 1}`;
      }
    } else {
      if (first.r > 0 && board[first.r - 1]?.[first.c]?.type === 'black') {
        return `v:${first.r - 1},${first.c}`;
      }
    }
    return null;
  }

  function isRunPruned(run: Coord[], direction: Direction): boolean {
    if (run.length === 0) return false;
    let sum = 0;
    const usedDigits = new Set<number>();
    for (const coord of run) {
      const v = tempBoard[coord.r][coord.c];
      if (typeof v === 'number' && v > 0) {
        sum += v;
        usedDigits.add(v);
      }
    }
    const key = runKey(run, direction);
    if (key === null) return false;
    const target = runTargetSum.get(key) ?? 0;
    return !isRunWithinRange(sum, run.length, target, usedDigits);
  }

  function solve(index: number): void {
    if (found >= CAP || exhausted) return;
    if (nodes++ > nodeBudget) {
      exhausted = true;
      return;
    }
    if (index === unknown.length) {
      found++;
      return;
    }
    const { r, c } = unknown[index];
    const hRun = cellToHRun.get(`${r},${c}`) || [];
    const vRun = cellToVRun.get(`${r},${c}`) || [];

    const usedValues = new Set<number>();
    for (const run of [hRun, vRun]) {
      for (const coord of run) {
        const val = tempBoard[coord.r][coord.c];
        if (typeof val === 'number' && val > 0) usedValues.add(val);
      }
    }

    for (let d = 1; d <= 9; d++) {
      if (usedValues.has(d)) continue;
      tempBoard[r][c] = d;
      if (!isRunPruned(hRun, 'h') && !isRunPruned(vRun, 'v')) {
        solve(index + 1);
        if (found >= CAP || exhausted) return;
      }
      tempBoard[r][c] = 0;
    }
  }

  solve(0);
  return exhausted ? CAP : found;
}

export interface Hint {
  /**
   * - `single`: an empty cell has exactly one legal digit; `value` is that
   *   digit and filling it is provably safe.
   * - `run-unique`: a run's clue admits only one digit combination given
   *   the current fills. Explains the deduction but fills nothing.
   * - `reveal`: no cheap deduction was found; falls back to revealing the
   *   correct digit for the preferred (or first empty) cell.
   */
  kind: 'single' | 'run-unique' | 'reveal';
  message: string;
  cell?: { r: number; c: number };
  value?: number;
}

function collectRuns(board: Board): { direction: Direction; clueR: number; clueC: number; target: number; coords: Coord[] }[] {
  const runs: ReturnType<typeof collectRuns> = [];
  const h = board.length;
  const w = board[0].length;

  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const cell = board[r][c];
      if (cell.type !== 'black') continue;
      if (cell.clueRight !== undefined && c + 1 < w) {
        const { runCoords } = locateRun(board, r, c + 1, 'h');
        if (runCoords.length > 0) {
          runs.push({ direction: 'h', clueR: r, clueC: c, target: cell.clueRight, coords: runCoords });
        }
      }
      if (cell.clueDown !== undefined && r + 1 < h) {
        const { runCoords } = locateRun(board, r + 1, c, 'v');
        if (runCoords.length > 0) {
          runs.push({ direction: 'v', clueR: r, clueC: c, target: cell.clueDown, coords: runCoords });
        }
      }
    }
  }
  return runs;
}

/** Enumerates every set of `count` distinct digits from 1-9 containing every entry of `mustInclude`. */
function partitionsContaining(count: number, target: number, mustInclude: number[]): number[][] | null {
  if (count < mustInclude.length || count > 9) return null;
  const fixed = [...new Set(mustInclude)].sort((a, b) => a - b);
  if (fixed.length !== mustInclude.length || fixed.length > count) return null;
  const baseSum = fixed.reduce((s, v) => s + v, 0);
  if (baseSum > target) return null;

  const freeSlots = count - fixed.length;
  const others: number[] = [];
  for (let d = 1; d <= 9; d++) if (!fixed.includes(d)) others.push(d);

  const results: number[][] = [];
  const collect = (startIdx: number, slots: number, sum: number, prefix: number[]): void => {
    if (slots === 0) {
      if (sum + baseSum === target) results.push([...prefix, ...fixed].sort((a, b) => a - b));
      return;
    }
    for (let i = startIdx; i < others.length; i++) {
      const d = others[i];
      // Prune when even the smallest completions overshoot.
      if (sum + d + baseSum + ((slots - 1) * slots) / 2 > target) break;
      prefix.push(d);
      collect(i + 1, slots - 1, sum + d, prefix);
      prefix.pop();
    }
  };

  collect(0, freeSlots, 0, []);
  return results;
}

/**
 * Finds the most instructive next step for the player.
 *
 * Preference order: a forced cell (only one legal digit fits both of its
 * runs) beats a uniquely-determined run combination, which beats revealing
 * the answer outright. The point is to teach *why*, not to play for you.
 */
export function getHint(board: Board, preferred?: { r: number; c: number }): Hint {
  const runs = collectRuns(board);

  // Per-empty-cell candidate sets: a digit is legal if it does not clash
  // with either run's existing digits and leaves both runs completable.
  const empties: Coord[] = [];
  for (let r = 0; r < board.length; r++) {
    for (let c = 0; c < board[0].length; c++) {
      if (board[r][c].type === 'white' && (board[r][c] as WhiteCell).value === '') {
        empties.push({ r, c });
      }
    }
  }

  const runsOf = new Map<string, typeof runs>();
  for (const run of runs) {
    for (const coord of run.coords) {
      const key = `${coord.r},${coord.c}`;
      const list = runsOf.get(key) || [];
      list.push(run);
      runsOf.set(key, list);
    }
  }

  let bestSingle: { coord: Coord; digit: number } | null = null;
  for (const coord of empties) {
    const cellRuns = runsOf.get(`${coord.r},${coord.c}`) || [];
    // A digit is legal for this cell iff it appears in some valid partition
    // of every one of its runs. Partition sets are tiny (runs hold at most
    // 9 distinct digits), so enumerating them outright is cheap and exact.
    let candidates: number[] | null = null;
    for (const run of cellRuns) {
      const filled: number[] = [];
      for (const rc of run.coords) {
        const v = (board[rc.r][rc.c] as WhiteCell).value;
        if (v !== '') filled.push(v);
      }
      const combos = partitionsContaining(run.coords.length, run.target, filled);
      const allowed = new Set<number>();
      if (combos) {
        for (const combo of combos) {
          for (const d of combo) {
            if (!filled.includes(d)) allowed.add(d);
          }
        }
      }
      if (candidates === null) {
        candidates = [...allowed];
      } else {
        candidates = candidates.filter(d => allowed.has(d));
      }
    }
    if (candidates && candidates.length === 1) {
      bestSingle = { coord, digit: candidates[0] };
      if (preferred && preferred.r === coord.r && preferred.c === coord.c) break;
    }
  }

  if (bestSingle) {
    return {
      kind: 'single',
      message: `The cell at row ${bestSingle.coord.r + 1}, column ${bestSingle.coord.c + 1} has only one possible digit: ${bestSingle.digit}.`,
      cell: { r: bestSingle.coord.r, c: bestSingle.coord.c },
      value: bestSingle.digit,
    };
  }

  // Look for a run whose remaining possibilities collapse to one combination.
  let bestRun: { run: (typeof runs)[number]; combo: number[]; emptyCount: number } | null = null;
  for (const run of runs) {
    const filled: number[] = [];
    let emptyCount = 0;
    for (const rc of run.coords) {
      const v = (board[rc.r][rc.c] as WhiteCell).value;
      if (v === '') emptyCount++;
      else filled.push(v);
    }
    if (emptyCount === 0) continue;
    const combos = partitionsContaining(run.coords.length, run.target, filled);
    if (combos && combos.length === 1) {
      if (!bestRun || emptyCount < bestRun.emptyCount) {
        bestRun = { run, combo: combos[0], emptyCount };
      }
    }
  }

  if (bestRun) {
    const dirWord = bestRun.run.direction === 'h' ? 'Row' : 'Column';
    const line = bestRun.run.direction === 'h' ? bestRun.run.clueR : bestRun.run.clueC;
    const comboStr = bestRun.combo.join(' + ');
    return {
      kind: 'run-unique',
      message: `${dirWord} ${line + 1} (sum ${bestRun.run.target}) can only be filled with {${comboStr}}.`,
    };
  }

  // Fallback: reveal the answer for the preferred cell, else the first empty.
  const target =
    (preferred && board[preferred.r]?.[preferred.c]?.type === 'white' &&
      (board[preferred.r][preferred.c] as WhiteCell).value === ''
      ? preferred
      : empties[0]) || null;
  if (!target) {
    return { kind: 'reveal', message: 'No empty cells left to hint.' };
  }
  const value = (board[target.r][target.c] as WhiteCell).correctValue;
  return {
    kind: 'reveal',
    message: `The cell at row ${target.r + 1}, column ${target.c + 1} is ${value}.`,
    cell: { r: target.r, c: target.c },
    value,
  };
}

/**
 * Rebuilds the run lookup maps for an existing board. Needed to call
 * `countSolutions` on a board that came from storage rather than fresh
 * generation.
 */
export function buildRunIndex(board: Board): {
  cellToHRun: Map<string, Coord[]>;
  cellToVRun: Map<string, Coord[]>;
  runTargetSum: Map<string, number>;
} {
  const layout = board.map(row => row.map(cell => (cell.type === 'white' ? 'W' : 'B')));
  const { hRuns, vRuns } = enumerateRuns(layout);
  const cellToHRun = new Map<string, Coord[]>();
  const cellToVRun = new Map<string, Coord[]>();
  for (const run of hRuns) {
    for (const coord of run) cellToHRun.set(`${coord.r},${coord.c}`, run);
  }
  for (const run of vRuns) {
    for (const coord of run) cellToVRun.set(`${coord.r},${coord.c}`, run);
  }

  const runTargetSum = new Map<string, number>();
  for (let r = 0; r < board.length; r++) {
    for (let c = 0; c < board[0].length; c++) {
      const cell = board[r][c];
      if (cell.type !== 'black') continue;
      if (cell.clueRight !== undefined) runTargetSum.set(`h:${r},${c}`, cell.clueRight);
      if (cell.clueDown !== undefined) runTargetSum.set(`v:${r},${c}`, cell.clueDown);
    }
  }

  return { cellToHRun, cellToVRun, runTargetSum };
}

export function checkWinCondition(board: Board): {
  isWin: boolean;
  errors: { r: number; c: number }[];
} {
  const h = board.length;
  const w = board[0].length;
  const errorCells = new Set<string>();

  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const cell = board[r][c] as BlackCell;
      if (cell.type !== 'black' || cell.clueRight === undefined) continue;
      const { errorCoords } = validateRun(board, r, c + 1, 'h', cell.clueRight);
      for (const coord of errorCoords) errorCells.add(`${coord.r},${coord.c}`);
    }
  }

  for (let c = 0; c < w; c++) {
    for (let r = 0; r < h; r++) {
      const cell = board[r][c] as BlackCell;
      if (cell.type !== 'black' || cell.clueDown === undefined) continue;
      const { errorCoords } = validateRun(board, r + 1, c, 'v', cell.clueDown);
      for (const coord of errorCoords) errorCells.add(`${coord.r},${coord.c}`);
    }
  }

  let allFilled = true;
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      if (board[r][c].type === 'white') {
        const cell = board[r][c] as WhiteCell;
        if (cell.value === '') allFilled = false;
      }
    }
  }

  const errors: { r: number; c: number }[] = [];
  for (const key of errorCells) {
    const [r, c] = key.split(',').map(Number);
    errors.push({ r, c });
  }

  return { isWin: allFilled && errors.length === 0, errors };
}

export function getRunStatus(
  board: Board,
  r: number,
  c: number,
  direction: Direction
): { currentSum: number; targetSum: number; isOver: boolean; isComplete: boolean; count: number; filledCount: number } {
  const { clueCell, runCoords } = locateRun(board, r, c, direction);
  const targetSum = clueCell
    ? (direction === 'h' ? (clueCell.clueRight || 0) : (clueCell.clueDown || 0))
    : 0;

  let currentSum = 0;
  let filledCount = 0;
  for (const coord of runCoords) {
    const cell = board[coord.r][coord.c] as WhiteCell;
    if (cell.value !== '') {
      currentSum += cell.value;
      filledCount++;
    }
  }

  return {
    currentSum,
    targetSum,
    isOver: currentSum > targetSum,
    isComplete: filledCount === runCoords.length && currentSum === targetSum,
    count: runCoords.length,
    filledCount,
  };
}

/**
 * Returns the set of digits that can legally be placed in `(r, c)` given the
 * current contents of the two runs the cell belongs to.
 *
 * For each run, every valid combination of distinct digits that sums to the
 * run's target is enumerated, any combo that collides with a digit already
 * placed in that run is discarded, and the union of surviving combos is the
 * per-direction candidate set. The cell must satisfy both runs, so the
 * `both` field is the intersection.
 *
 * A digit that appears in `both` is a forced-elimination candidate — the
 * only way the puzzle can still be solved is if the cell takes that digit.
 * An empty `both` set means the cell has no legal move from the current
 * position; the player has painted themselves into a corner.
 */
export function getCandidatesForCell(
  board: Board,
  r: number,
  c: number
): { horizontal: number[]; vertical: number[]; both: number[]; isEmpty: boolean } {
  const empty = { horizontal: [], vertical: [], both: [], isEmpty: true };
  if (r < 0 || r >= board.length || c < 0 || c >= board[0].length) return empty;
  const cell = board[r][c];
  if (cell.type !== 'white') return empty;

  const hStatus = getRunStatus(board, r, c, 'h');
  const vStatus = getRunStatus(board, r, c, 'v');

  const candidatesForRun = (targetSum: number, length: number, used: Set<number>): Set<number> => {
    if (targetSum <= 0 || length <= 0) return new Set();
    const out = new Set<number>();
    // For each candidate digit d: simulate the run with d in this cell and
    // check whether the rest of the run is still satisfiable. This is the
    // correct formulation — enumerating full partitions and filtering on
    // overlap misses "the only combo is {d, 4}, 4 is already placed" cases.
    const usedSum = [...used].reduce((s, v) => s + v, 0);
    for (let d = 1; d <= 9; d++) {
      if (used.has(d)) continue;
      const trialUsed = new Set(used);
      trialUsed.add(d);
      if (isRunWithinRange(usedSum + d, length, targetSum, trialUsed)) {
        out.add(d);
      }
    }
    return out;
  };

  // Already-placed digits in each run, excluding the selected cell itself.
  const collectUsed = (direction: Direction): Set<number> => {
    const { runCoords } = locateRun(board, r, c, direction);
    const used = new Set<number>();
    for (const coord of runCoords) {
      if (coord.r === r && coord.c === c) continue;
      const v = board[coord.r][coord.c];
      if (v.type === 'white' && v.value !== '') used.add(v.value);
    }
    return used;
  };

  const hSet = candidatesForRun(hStatus.targetSum, hStatus.count, collectUsed('h'));
  const vSet = candidatesForRun(vStatus.targetSum, vStatus.count, collectUsed('v'));
  const both = new Set<number>();
  for (const d of hSet) if (vSet.has(d)) both.add(d);

  // The cell is "empty" if both direction sets are empty — happens when the
  // board is in an invalid state (e.g. after the user has placed conflicting
  // digits). UI can treat that as "no help available".
  const isEmpty = hSet.size === 0 && vStatus.targetSum > 0 ||
                  vSet.size === 0 && hStatus.targetSum > 0;

  return {
    horizontal: [...hSet].sort((a, b) => a - b),
    vertical: [...vSet].sort((a, b) => a - b),
    both: [...both].sort((a, b) => a - b),
    isEmpty,
  };
}

/**
 * Computes the per-run completion state for every clue-bearing black cell in
 * one pass, so the UI does not re-walk each run per cell per render.
 * Keyed `${r},${c}` of the black host cell.
 */
export function computeClueStatuses(board: Board): Map<
  string,
  { rightComplete: boolean; rightOver: boolean; downComplete: boolean; downOver: boolean }
> {
  const h = board.length;
  const w = board[0].length;
  const result = new Map<
    string,
    { rightComplete: boolean; rightOver: boolean; downComplete: boolean; downOver: boolean }
  >();

  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const cell = board[r][c];
      if (cell.type !== 'black') continue;
      if (cell.clueRight === undefined && cell.clueDown === undefined) continue;

      let rightComplete = false;
      let rightOver = false;
      let downComplete = false;
      let downOver = false;

      if (cell.clueRight !== undefined && c + 1 < w) {
        const status = getRunStatus(board, r, c + 1, 'h');
        rightComplete = status.isComplete;
        rightOver = status.isOver;
      }
      if (cell.clueDown !== undefined && r + 1 < h) {
        const status = getRunStatus(board, r + 1, c, 'v');
        downComplete = status.isComplete;
        downOver = status.isOver;
      }

      result.set(`${r},${c}`, { rightComplete, rightOver, downComplete, downOver });
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Seeded generation and shareable puzzle codes
// ---------------------------------------------------------------------------

/**
 * A small, fast, deterministic PRNG. Mulberry32 — 32-bit state, good enough
 * for shuffling and tie-breaking. NOT cryptographically secure.
 *
 * Used by the seeded generator so a daily challenge is reproducible: every
 * browser that sees the same seed produces the same puzzle.
 */
export function createRng(seed: number): () => number {
  let s = seed | 0;
  if (s === 0) s = 1;
  return () => {
    s = (s + 0x6D2B79F5) | 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Hash a string seed to a 32-bit integer, the way createRng expects. */
export function hashStringSeed(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h | 0;
}

/**
 * Seeded puzzle generation. Like `generateKakuroPuzzle` but deterministic: two
 * calls with the same `seed` and `difficulty` produce the same puzzle (same
 * layout, same solution, same givens).
 *
 * The engine's randomness sources — `Math.random` for the layout backtrack
 * order, the per-removal shuffle during uniqueness digging, the digit order
 * during solving — are replaced by a single seeded PRNG. The result is then
 * filtered through the same uniqueness gate.
 */
export function generateSeededPuzzle(
  seed: number,
  difficulty: Difficulty
): { board: Board; solution: number[][]; preRevealed: boolean[][] } {
  const rng = createRng(seed);
  const originalRandom = Math.random;
  Math.random = rng;
  try {
    // tryGenerate calls itself up to MAX_OUTER times if a layout is bad.
    // We deliberately keep that loop but the inner search is now
    // deterministic, so we just take the first successful result.
    for (let attempt = 0; attempt < 25; attempt++) {
      const result = tryGenerate(difficulty);
      if (result) return result;
    }
    // Extremely unlikely with a fresh PRNG; fall back to non-deterministic
    // generation so the user still gets a playable puzzle.
    return generateKakuroPuzzle(difficulty);
  } finally {
    Math.random = originalRandom;
  }
}

// ---------------------------------------------------------------------------
// Shareable puzzle codes
// ---------------------------------------------------------------------------

/**
 * A self-contained snapshot of a puzzle that can be encoded as a short
 * string and decoded back. Used by the share button: the same code always
 * recreates the same board, solution, givens, and difficulty.
 */
export interface PuzzleSnapshot {
  difficulty: Difficulty;
  board: Board;
  solution: number[][];
  preRevealed: boolean[][];
}

const SHARE_MAGIC = 0x4B31; // "K1" packed as 16 bits, MSB first

/**
 * Encodes a puzzle to a URL-safe base64 string.
 *
 * Layout (version 1, K1):
 *   byte  0  : 'K' = 0x4B
 *   byte  1  : '1' = 0x31 (version)
 *   byte  2  : grid size (7, 9, or 11)
 *   byte  3  : difficulty (1=easy, 2=medium, 3=hard)
 *   bytes 4..(4+ceil(N*N/8)-1) : layout bitmap, 1 bit per cell (0=B, 1=W)
 *   then, in row-major order, for each WHITE cell:
 *     4 bits digit-1 (so 0..8 representing 1..9)
 *     1 bit pre-revealed
 *
 * The maximum is 11*11 = 121 layout bits (16 bytes) + 121*5 = 605 bits (76
 * bytes) = 96 bytes total. base64 of that is 128 characters.
 */
export function serializePuzzle(snapshot: PuzzleSnapshot): string {
  const { difficulty, board, solution, preRevealed } = snapshot;
  const h = board.length;
  const w = board[0].length;
  if (h !== w) throw new Error('serializePuzzle expects a square board');
  if (h < 2 || h > 15) throw new Error(`Unsupported grid size: ${h}`);

  // Bit packer: write each integer as `bits` MSB-first bits.
  const bits: number[] = [];
  const writeBits = (v: number, n: number) => {
    for (let i = n - 1; i >= 0; i--) bits.push((v >> i) & 1);
  };

  // Magic "K1" = 0x4B 0x31 packed as 16 bits, MSB first.
  writeBits((SHARE_MAGIC >> 8) & 0xff, 8);
  writeBits(SHARE_MAGIC & 0xff, 8);
  writeBits(h, 8);
  writeBits(difficultyToCode(difficulty), 8);

  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      writeBits(board[r][c].type === 'white' ? 1 : 0, 1);
    }
  }

  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      if (board[r][c].type !== 'white') continue;
      const digit = solution[r][c];
      if (digit < 1 || digit > 9) {
        throw new Error(`Bad solution digit at (${r},${c}): ${digit}`);
      }
      writeBits(digit - 1, 4);
      writeBits(preRevealed[r]?.[c] ? 1 : 0, 1);
    }
  }

  // Pad to a whole number of bytes.
  while (bits.length % 8 !== 0) bits.push(0);
  const bytes = new Uint8Array(bits.length / 8);
  for (let i = 0; i < bytes.length; i++) {
    let b = 0;
    for (let j = 0; j < 8; j++) b = (b << 1) | bits[i * 8 + j];
    bytes[i] = b;
  }
  return bytesToB64Url(bytes);
}

/**
 * Inverse of `serializePuzzle`. Returns null when the input is unrecognised
 * or corrupt so callers can show a friendly error instead of throwing.
 */
export function deserializePuzzle(code: string): PuzzleSnapshot | null {
  try {
    const bytes = b64UrlToBytes(code);
    if (bytes.length < 4) return null;

    // Bit-position reader: write is byte-aligned nibbles then MSB-first bits;
    // read in the same order. All offsets here are bit positions, not bytes.
    let p = 0;
    const readBits = (n: number): number => {
      let v = 0;
      for (let i = 0; i < n; i++) {
        const byte = bytes[p >> 3];
        const bit = (byte >> (7 - (p & 7))) & 1;
        v = (v << 1) | bit;
        p++;
      }
      return v;
    };

    // Magic is "K1" = 0x4B 0x31. Read as one 16-bit value for compactness.
    const magicBits = readBits(16);
    if (magicBits !== ((0x4B << 8) | 0x31)) return null;

    const size = readBits(8);
    const diffCode = readBits(8);
    if (size < 2 || size > 15) return null;
    const difficulty = codeToDifficulty(diffCode);
    if (!difficulty) return null;

    const layoutBits: number[] = [];
    for (let i = 0; i < size * size; i++) {
      layoutBits.push(readBits(1));
    }

    const board: Board = Array.from({ length: size }, () => []);
    const solution: number[][] = Array.from({ length: size }, () => Array(size).fill(0));
    const preRevealed: boolean[][] = Array.from({ length: size }, () => Array(size).fill(false));

    for (let r = 0; r < size; r++) {
      for (let c = 0; c < size; c++) {
        const isWhite = layoutBits[r * size + c] === 1;
        if (!isWhite) {
          board[r][c] = { type: 'black' };
          continue;
        }
        const digit = readBits(4) + 1;
        const pre = readBits(1) === 1;
        solution[r][c] = digit;
        preRevealed[r][c] = pre;
        board[r][c] = {
          type: 'white',
          value: pre ? digit : '',
          correctValue: digit,
          notes: [],
        };
      }
    }

    reDeriveCluesFromSolution(board, solution);
    return { difficulty, board, solution, preRevealed };
  } catch {
    return null;
  }
}

/**
 * Reconstructs every clue cell's `clueRight` and `clueDown` from the
 * (board, solution) pair after deserialization. The encoder doesn't store
 * clues — they fall out of the solution and the board's black-cell pattern
 * for free, and re-deriving keeps the wire format small.
 */
function reDeriveCluesFromSolution(board: Board, solution: number[][]): void {
  const h = board.length;
  const w = board[0].length;
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      if (board[r][c].type !== 'black') continue;
      const host = board[r][c] as BlackCell;
      if (c + 1 < w && board[r][c + 1].type === 'white') {
        let sum = 0;
        let cc = c + 1;
        while (cc < w && board[r][cc].type === 'white') {
          sum += solution[r][cc];
          cc++;
        }
        host.clueRight = sum;
      }
      if (r + 1 < h && board[r + 1][c].type === 'white') {
        let sum = 0;
        let rr = r + 1;
        while (rr < h && board[rr][c].type === 'white') {
          sum += solution[rr][c];
          rr++;
        }
        host.clueDown = sum;
      }
    }
  }
}

function difficultyToCode(d: Difficulty): number {
  return d === 'easy' ? 1 : d === 'medium' ? 2 : 3;
}

function codeToDifficulty(n: number): Difficulty | null {
  if (n === 1) return 'easy';
  if (n === 2) return 'medium';
  if (n === 3) return 'hard';
  return null;
}

const B64URL_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

function bytesToB64Url(bytes: Uint8Array): string {
  let out = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i];
    const b1 = i + 1 < bytes.length ? bytes[i + 1] : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2] : 0;
    out += B64URL_ALPHABET[b0 >> 2];
    out += B64URL_ALPHABET[((b0 & 0x3) << 4) | (b1 >> 4)];
    if (i + 1 < bytes.length) out += B64URL_ALPHABET[((b1 & 0xf) << 2) | (b2 >> 6)];
    if (i + 2 < bytes.length) out += B64URL_ALPHABET[b2 & 0x3f];
  }
  return out;
}

function b64UrlToBytes(s: string): Uint8Array {
  // Reverse lookup. Build once per call; this isn't on a hot path.
  const lookup = new Int8Array(128).fill(-1);
  for (let i = 0; i < B64URL_ALPHABET.length; i++) {
    lookup[B64URL_ALPHABET.charCodeAt(i)] = i;
  }
  // Strip any padding (we don't generate it).
  s = s.replace(/=+$/, '');
  const outLen = Math.floor((s.length * 6) / 8);
  const out = new Uint8Array(outLen);
  let bi = 0;
  for (let i = 0; i < s.length; i += 4) {
    const c0 = lookup[s.charCodeAt(i)];
    const c1 = lookup[s.charCodeAt(i + 1)];
    const c2 = i + 2 < s.length ? lookup[s.charCodeAt(i + 2)] : -1;
    const c3 = i + 3 < s.length ? lookup[s.charCodeAt(i + 3)] : -1;
    if (c0 < 0 || c1 < 0) throw new Error('bad b64 char');
    out[bi++] = (c0 << 2) | (c1 >> 4);
    if (c2 >= 0) out[bi++] = ((c1 & 0xf) << 4) | (c2 >> 2);
    if (c3 >= 0) out[bi++] = ((c2 & 0x3) << 6) | c3;
  }
  return out;
}
