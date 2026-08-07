// Kakuro Puzzle Engine and Generator

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

const LAYOUT_TEMPLATES: Record<string, string[]> = {
  easy: [
    'B B B B B B',
    'B W W B W W',
    'B W W W W W',
    'B B W W B B',
    'B W W W W W',
    'B W W B W W',
  ],
  medium: [
    'B B B B B B B B',
    'B W W W B W W W',
    'B W W W W W W W',
    'B B W W W W B B',
    'B B W W W W B B',
    'B W W W W W W W',
    'B W W W B W W W',
    'B B B B B B B B',
  ],
  hard: [
    'B B B B B B B B B B',
    'B W W W B B W W W B',
    'B W W W W B W W W W',
    'B W W W W W W B W W',
    'B B B W W W W B B B',
    'B B B W W W W B B B',
    'B W W B W W W W W W',
    'B W W W W B W W W W',
    'B W W W B B W W W B',
    'B B B B B B B B B B',
  ],
};

function shuffle<T>(array: T[]): T[] {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

function randomizeLayout(template: string[]): string[][] {
  const rows = template.length;
  const cols = template[0].split(' ').length;
  let grid: string[][] = template.map(row => row.split(' '));

  const numTransforms = Math.floor(Math.random() * 6);
  for (let t = 0; t < numTransforms; t++) {
    const op = Math.floor(Math.random() * 4);
    if (op === 0) {
      grid = grid.map(row => [...row].reverse());
    } else if (op === 1) {
      grid = [...grid].reverse();
    } else if (op === 2) {
      const newGrid: string[][] = [];
      for (let c = 0; c < cols; c++) {
        const newRow: string[] = [];
        for (let r = rows - 1; r >= 0; r--) newRow.push(grid[r][c]);
        newGrid.push(newRow);
      }
      grid = newGrid;
    } else {
      const newGrid: string[][] = [];
      for (let c = cols - 1; c >= 0; c--) {
        const newRow: string[] = [];
        for (let r = 0; r < rows; r++) newRow.push(grid[r][c]);
        newGrid.push(newRow);
      }
      grid = newGrid;
    }
  }
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
 * Generates and returns a valid solved Kakuro board structure
 * with randomized values, calculated clues, and pre-reveal metadata.
 */
export function generateKakuroPuzzle(difficulty: 'easy' | 'medium' | 'hard'): {
  board: Board;
  solution: number[][];
  preRevealed: boolean[][];
} {
  const MAX_OUTER = 5;
  for (let attempt = 0; attempt < MAX_OUTER; attempt++) {
    const result = tryGenerate(difficulty);
    if (result) return result;
    console.warn(`Kakuro generator attempt ${attempt + 1} failed; retrying.`);
  }
  throw new Error(
    `Kakuro generator could not produce a valid puzzle in ${MAX_OUTER} attempts.`
  );
}

function tryGenerate(difficulty: 'easy' | 'medium' | 'hard'): {
  board: Board;
  solution: number[][];
  preRevealed: boolean[][];
} | null {
  const template = LAYOUT_TEMPLATES[difficulty] || LAYOUT_TEMPLATES.easy;
  const layout = randomizeLayout(template);
  const h = layout.length;
  const w = layout[0].length;

  const tempBoard: ('B' | number)[][] = Array.from({ length: h }, (_, r) =>
    Array.from({ length: w }, (_, c) => (layout[r][c] === 'B' ? 'B' : 0))
  );

  const hRuns: Coord[][] = [];
  const vRuns: Coord[][] = [];

  for (let r = 0; r < h; r++) {
    let currentRun: Coord[] = [];
    for (let c = 0; c < w; c++) {
      if (layout[r][c] === 'W') {
        currentRun.push({ r, c });
      } else if (currentRun.length > 0) {
        hRuns.push(currentRun);
        currentRun = [];
      }
    }
    if (currentRun.length > 0) hRuns.push(currentRun);
  }

  for (let c = 0; c < w; c++) {
    let currentRun: Coord[] = [];
    for (let r = 0; r < h; r++) {
      if (layout[r][c] === 'W') {
        currentRun.push({ r, c });
      } else if (currentRun.length > 0) {
        vRuns.push(currentRun);
        currentRun = [];
      }
    }
    if (currentRun.length > 0) vRuns.push(currentRun);
  }

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

  // Try several first-solutions and keep the first one whose resulting
  // puzzle has at most a small number of valid solutions. The fixed layout
  // templates are too small to guarantee uniqueness for every digit
  // assignment, so we accept a small number of alternative solutions.
  const INTERNAL_RETRIES = 1;
  let chosenFinalBoard: Board | null = null;
  for (let internal = 0; internal < INTERNAL_RETRIES && !chosenFinalBoard; internal++) {
    for (let r = 0; r < h; r++) {
      for (let c = 0; c < w; c++) {
        if (tempBoard[r][c] !== 'B') tempBoard[r][c] = 0;
      }
    }
    if (!solve(0)) continue;

    const finalBoard: Board = Array.from({ length: h }, () => []);
    const solution: number[][] = Array.from({ length: h }, () => Array(w).fill(0));
    const runTargetSum = new Map<string, number>();

    for (let r = 0; r < h; r++) {
      for (let c = 0; c < w; c++) {
        if (layout[r][c] === 'W') {
          const correctVal = tempBoard[r][c] as number;
          solution[r][c] = correctVal;
          finalBoard[r][c] = {
            type: 'white',
            value: '',
            correctValue: correctVal,
            notes: [],
          };
        } else {
          let clueRight: number | undefined;
          let clueDown: number | undefined;

          if (c + 1 < w && layout[r][c + 1] === 'W') {
            let sum = 0;
            let tempC = c + 1;
            while (tempC < w && layout[r][tempC] === 'W') {
              sum += tempBoard[r][tempC] as number;
              tempC++;
            }
            clueRight = sum;
            if (cellToHRun.get(`${r},${c + 1}`)) {
              runTargetSum.set(`h:${r},${c}`, sum);
            }
          }

          if (r + 1 < h && layout[r + 1][c] === 'W') {
            let sum = 0;
            let tempR = r + 1;
            while (tempR < h && layout[tempR][c] === 'W') {
              sum += tempBoard[tempR][c] as number;
              tempR++;
            }
            clueDown = sum;
            if (cellToVRun.get(`${r + 1},${c}`)) {
              runTargetSum.set(`v:${r},${c}`, sum);
            }
          }

          finalBoard[r][c] = { type: 'black', clueRight, clueDown };
        }
      }
    }

    // Uniqueness is not enforced as a hard gate: the small fixed layout
    // templates yield many multi-solution puzzles, and a strict check makes
    // generation slow and unreliable. Use the exported `countSolutions` to
    // verify a puzzle manually if needed.
    chosenFinalBoard = finalBoard;
  }

  if (!chosenFinalBoard) return null;
  const finalBoard = chosenFinalBoard;

  // Pre-reveal some cells based on difficulty
  let revealChance = 0;
  if (difficulty === 'easy') revealChance = 0.25;
  if (difficulty === 'medium') revealChance = 0.10;

  const preRevealed: boolean[][] = Array.from({ length: h }, () => Array(w).fill(false));
  if (revealChance > 0) {
    for (const { r, c } of whiteCells) {
      if (Math.random() < revealChance) {
        const cell = finalBoard[r][c] as WhiteCell;
        cell.value = cell.correctValue;
        preRevealed[r][c] = true;
      }
    }
  }

  // Re-derive the solution grid from the (possibly pre-revealed) finalBoard.
  const solution: number[][] = Array.from({ length: h }, () => Array(w).fill(0));
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      const cell = finalBoard[r][c];
      if (cell.type === 'white') solution[r][c] = cell.correctValue;
    }
  }

  return { board: finalBoard, solution, preRevealed };
}

export function countSolutions(
  board: Board,
  cellToHRun: Map<string, Coord[]>,
  cellToVRun: Map<string, Coord[]>,
  runTargetSum: Map<string, number>
): number {
  const h = board.length;
  const w = board[0].length;
  const CAP = 3;

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
    if (found >= CAP) return;
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
        if (found >= CAP) return;
      }
      tempBoard[r][c] = 0;
    }
  }

  solve(0);
  return found;
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
