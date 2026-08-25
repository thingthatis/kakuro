import { describe, it, expect } from 'vitest';
import {
  generateKakuroPuzzle,
  generateLayout,
  validateLayout,
  buildRunIndex,
  countSolutions,
  checkWinCondition,
  getRunStatus,
  computeClueStatuses,
  getHint,
  type Board,
  type WhiteCell,
  type BlackCell,
} from './kakuroEngine';
import type { Difficulty } from './types';

/**
 * Builds a board from a layout spec: each entry is `B`, or a digit string
 * `d` (given), `-` (empty). Clues are supplied separately as
 * `{ r, c, right?, down? }`.
 */
function makeBoard(
  rows: string[],
  clues: { r: number; c: number; right?: number; down?: number }[]
): Board {
  const solution = rows.map(row =>
    [...row].map(ch => (ch === 'B' ? 0 : ch === '-' ? -1 : parseInt(ch, 10)))
  );
  return rows.map((row, r) =>
    [...row].map((ch, c): BlackCell | WhiteCell => {
      if (ch === 'B') {
        const clue = clues.find(k => k.r === r && k.c === c);
        return { type: 'black', clueRight: clue?.right, clueDown: clue?.down };
      }
      const correct =
        solution[r][c] > 0 ? solution[r][c] : ((r + c) % 9) + 1;
      return {
        type: 'white',
        value: ch === '-' ? '' : correct,
        correctValue: correct,
        notes: [],
      };
    })
  );
}

const DIFFICULTIES: Difficulty[] = ['easy', 'medium', 'hard'];

/** Enumerates maximal white runs in both directions. */
function runsOf(board: Board) {
  const h = board.length;
  const w = board[0].length;
  const runs: { cells: { r: number; c: number }[]; dir: 'h' | 'v' }[] = [];
  for (let r = 0; r < h; r++) {
    let c = 0;
    while (c < w) {
      if (board[r][c].type !== 'white') { c++; continue; }
      const start = c;
      const cells: { r: number; c: number }[] = [];
      while (c < w && board[r][c].type === 'white') { cells.push({ r, c }); c++; }
      void start;
      runs.push({ cells, dir: 'h' });
    }
  }
  for (let c = 0; c < w; c++) {
    let r = 0;
    while (r < h) {
      if (board[r][c].type !== 'white') { r++; continue; }
      const cells: { r: number; c: number }[] = [];
      while (r < h && board[r][c].type === 'white') { cells.push({ r, c }); r++; }
      runs.push({ cells, dir: 'v' });
    }
  }
  return runs;
}

function solvedCopy(board: Board): Board {
  return board.map(row =>
    row.map(cell => (cell.type === 'white' ? ({ ...cell, value: cell.correctValue } as WhiteCell) : cell))
  );
}

describe('generateLayout / validateLayout', () => {
  it('produces layouts satisfying every structural invariant', () => {
    const specs = [
      { size: 7, blackRatio: 0.2, maxRun: 4 },
      { size: 9, blackRatio: 0.26, maxRun: 5 },
      { size: 11, blackRatio: 0.3, maxRun: 6 },
    ];
    for (const spec of specs) {
      const layout = generateLayout(spec);
      expect(layout).not.toBeNull();
      if (!layout) continue;
      expect(validateLayout(layout, spec.maxRun)).toBe(true);
      expect(layout.length).toBe(spec.size);
      expect(layout[0].length).toBe(spec.size);
    }
  });

  it('rejects a layout with a white cell in row 0 or column 0', () => {
    // Row 0 / column 0 must be black because they host every clue.
    const bad = [
      ['B', 'W', 'B'],
      ['B', 'W', 'W'],
      ['B', 'W', 'W'],
    ];
    expect(validateLayout(bad, 4)).toBe(false);

    const bad2 = [
      ['B', 'B', 'B'],
      ['W', 'W', 'W'],
      ['B', 'W', 'W'],
    ];
    expect(validateLayout(bad2, 4)).toBe(false);
  });

  it('rejects a layout containing a length-1 run', () => {
    const bad = [
      ['B', 'B', 'B'],
      ['B', 'W', 'B'],
      ['B', 'B', 'B'],
    ];
    expect(validateLayout(bad, 4)).toBe(false);
  });

  it('rejects a layout containing a run longer than the cap', () => {
    const grid = [
      ['B', 'B', 'B', 'B', 'B'],
      ['B', 'W', 'W', 'W', 'W'],
      ['B', 'W', 'W', 'W', 'W'],
      ['B', 'W', 'W', 'W', 'W'],
      ['B', 'W', 'W', 'W', 'W'],
    ];
    expect(validateLayout(grid, 4)).toBe(true);
    expect(validateLayout(grid, 3)).toBe(false);
  });
});

describe('generateKakuroPuzzle', () => {
  it('produces a square board for each difficulty', () => {
    for (const d of DIFFICULTIES) {
      const { board } = generateKakuroPuzzle(d);
      expect(board.length).toBeGreaterThan(0);
      expect(board[0].length).toBe(board.length);
    }
  });

  it('places digits 1-9 in every white cell and the clues match the solution', () => {
    const { board, solution } = generateKakuroPuzzle('easy');
    for (let r = 0; r < board.length; r++) {
      for (let c = 0; c < board[0].length; c++) {
        const cell = board[r][c];
        if (cell.type === 'white') {
          expect(cell.correctValue).toBeGreaterThanOrEqual(1);
          expect(cell.correctValue).toBeLessThanOrEqual(9);
          expect(solution[r][c]).toBe(cell.correctValue);
        }
      }
    }
  });

  it('never emits an orphan clue (a clue pointing at no run)', () => {
    for (const d of DIFFICULTIES) {
      for (let i = 0; i < 5; i++) {
        const { board } = generateKakuroPuzzle(d);
        const h = board.length;
        const w = board[0].length;
        for (let r = 0; r < h; r++) {
          for (let c = 0; c < w; c++) {
            const cell = board[r][c] as BlackCell;
            if (cell.type !== 'black') continue;
            const rightWhite = c + 1 < w && board[r][c + 1].type === 'white';
            const downWhite = r + 1 < h && board[r + 1][c].type === 'white';
            if (cell.clueRight !== undefined) expect(rightWhite).toBe(true);
            if (cell.clueDown !== undefined) expect(downWhite).toBe(true);
          }
        }
      }
    }
  });

  it('gives every run a clue host, so no run goes unvalidated', () => {
    for (const d of DIFFICULTIES) {
      for (let i = 0; i < 5; i++) {
        const { board } = generateKakuroPuzzle(d);
        for (const { cells, dir } of runsOf(board)) {
          const first = cells[0];
          if (dir === 'h') {
            expect(first.c).toBeGreaterThan(0);
            const host = board[first.r][first.c - 1] as BlackCell;
            expect(host.type).toBe('black');
            expect(host.clueRight).toBeDefined();
          } else {
            expect(first.r).toBeGreaterThan(0);
            const host = board[first.r - 1][first.c] as BlackCell;
            expect(host.type).toBe('black');
            expect(host.clueDown).toBeDefined();
          }
        }
      }
    }
  });

  it('every clue equals the sum of its run in the intended solution', () => {
    for (const d of DIFFICULTIES) {
      for (let i = 0; i < 5; i++) {
        const { board } = generateKakuroPuzzle(d);
        for (const { cells, dir } of runsOf(board)) {
          const first = cells[0];
          const expected = cells.reduce(
            (sum, { r, c }) => sum + (board[r][c] as WhiteCell).correctValue,
            0
          );
          const host =
            dir === 'h'
              ? (board[first.r][first.c - 1] as BlackCell)
              : (board[first.r - 1][first.c] as BlackCell);
          const clue = dir === 'h' ? host.clueRight : host.clueDown;
          expect(clue).toBe(expected);
        }
      }
    }
  });

  it('never emits a run shorter than 2 or longer than 9', () => {
    for (const d of DIFFICULTIES) {
      const { board } = generateKakuroPuzzle(d);
      for (const { cells } of runsOf(board)) {
        expect(cells.length).toBeGreaterThanOrEqual(2);
        expect(cells.length).toBeLessThanOrEqual(9);
      }
    }
  });

  it('produces a puzzle with exactly one solution', () => {
    for (const d of DIFFICULTIES) {
      for (let i = 0; i < 3; i++) {
        const { board } = generateKakuroPuzzle(d);
        const { cellToHRun, cellToVRun, runTargetSum } = buildRunIndex(board);
        expect(countSolutions(board, cellToHRun, cellToVRun, runTargetSum)).toBe(1);
      }
    }
  });

  it('leaves cells for the player to fill in', () => {
    for (const d of DIFFICULTIES) {
      const { board, preRevealed } = generateKakuroPuzzle(d);
      let white = 0;
      let empty = 0;
      for (let r = 0; r < board.length; r++) {
        for (let c = 0; c < board[0].length; c++) {
          if (board[r][c].type !== 'white') continue;
          white++;
          if ((board[r][c] as WhiteCell).value === '') empty++;
          // preRevealed must agree with a non-empty value
          expect(preRevealed[r][c]).toBe((board[r][c] as WhiteCell).value !== '');
        }
      }
      expect(empty).toBeGreaterThan(white * 0.3);
    }
  });

  it('marks pre-revealed cells only on white cells, in a same-size grid', () => {
    for (const d of DIFFICULTIES) {
      const { board, preRevealed } = generateKakuroPuzzle(d);
      expect(preRevealed.length).toBe(board.length);
      expect(preRevealed[0].length).toBe(board[0].length);
      for (let r = 0; r < board.length; r++) {
        for (let c = 0; c < board[0].length; c++) {
          if (preRevealed[r][c]) expect(board[r][c].type).toBe('white');
        }
      }
    }
  });

  it('accepts the intended solution as a win', () => {
    for (const d of DIFFICULTIES) {
      const { board } = generateKakuroPuzzle(d);
      expect(checkWinCondition(solvedCopy(board)).isWin).toBe(true);
    }
  });

  it('rejects a wrong fill that merely permutes digits within a run', () => {
    // Regression: unclued runs used to go unvalidated, so swapping two digits
    // inside one still registered a win.
    for (const d of DIFFICULTIES) {
      for (let i = 0; i < 5; i++) {
        const { board } = generateKakuroPuzzle(d);
        const solved = solvedCopy(board);
        const run = runsOf(board).find(({ cells }) => {
          if (cells.length < 2) return false;
          const a = board[cells[0].r][cells[0].c] as WhiteCell;
          const b = board[cells[1].r][cells[1].c] as WhiteCell;
          return a.correctValue !== b.correctValue;
        });
        expect(run).toBeDefined();
        if (!run) continue;
        const a = solved[run.cells[0].r][run.cells[0].c] as WhiteCell;
        const b = solved[run.cells[1].r][run.cells[1].c] as WhiteCell;
        const tmp = a.value;
        a.value = b.value;
        b.value = tmp;
        expect(checkWinCondition(solved).isWin).toBe(false);
      }
    }
  });
});

describe('countSolutions', () => {
  it('returns 1 for a fully solved board', () => {
    const { board } = generateKakuroPuzzle('easy');
    const solved = solvedCopy(board);
    const idx = buildRunIndex(solved);
    expect(countSolutions(solved, idx.cellToHRun, idx.cellToVRun, idx.runTargetSum)).toBe(1);
  });

  it('fails closed (reports non-unique) when the node budget is exhausted', () => {
    const { board } = generateKakuroPuzzle('hard');
    const idx = buildRunIndex(board);
    // A budget of 1 node cannot prove anything, so it must not claim uniqueness.
    expect(countSolutions(board, idx.cellToHRun, idx.cellToVRun, idx.runTargetSum, 1)).not.toBe(1);
  });
});

describe('checkWinCondition', () => {
  it('reports not-won on a freshly generated board', () => {
    const { board } = generateKakuroPuzzle('easy');
    expect(checkWinCondition(board).isWin).toBe(false);
  });

  it('flags a duplicate within a run', () => {
    const board: Board = [
      [
        { type: 'black', clueRight: 5 },
        { type: 'white', value: 1, correctValue: 1, notes: [] },
        { type: 'white', value: 1, correctValue: 1, notes: [] },
        { type: 'black' },
      ],
    ];
    const result = checkWinCondition(board);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.isWin).toBe(false);
  });

  it('flags a fully filled run whose digits do not add up', () => {
    const board: Board = [
      [
        { type: 'black', clueRight: 5 },
        { type: 'white', value: 1, correctValue: 1, notes: [] },
        { type: 'white', value: 2, correctValue: 2, notes: [] },
        { type: 'black' },
      ],
    ];
    const result = checkWinCondition(board);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.isWin).toBe(false);
  });
});

describe('getRunStatus', () => {
  it('returns zero sum and zero target for a non-white cell', () => {
    const { board } = generateKakuroPuzzle('easy');
    const status = getRunStatus(board, 0, 0, 'h');
    expect(status.count).toBe(0);
    expect(status.targetSum).toBe(0);
  });

  it('reports the target sum from the hosting clue', () => {
    const { board } = generateKakuroPuzzle('easy');
    for (let r = 0; r < board.length; r++) {
      for (let c = 0; c < board[0].length; c++) {
        if (board[r][c].type !== 'white') continue;
        const status = getRunStatus(board, r, c, 'h');
        if (status.targetSum > 0) {
          let b = c - 1;
          while (b >= 0 && board[r][b].type === 'white') b--;
          const clue = board[r][b] as BlackCell;
          expect(clue.clueRight).toBe(status.targetSum);
          return;
        }
      }
    }
  });

  it('marks a run complete exactly when it is full and sums correctly', () => {
    const { board } = generateKakuroPuzzle('easy');
    const solved = solvedCopy(board);
    for (const { cells, dir } of runsOf(solved)) {
      const { r, c } = cells[0];
      const status = getRunStatus(solved, r, c, dir);
      expect(status.isComplete).toBe(true);
      expect(status.isOver).toBe(false);
      expect(status.filledCount).toBe(cells.length);
    }
  });
});

describe('computeClueStatuses', () => {
  it('agrees with getRunStatus for every clue-bearing cell', () => {
    const { board } = generateKakuroPuzzle('medium');
    const solved = solvedCopy(board);
    const statuses = computeClueStatuses(solved);
    const h = solved.length;
    const w = solved[0].length;
    for (let r = 0; r < h; r++) {
      for (let c = 0; c < w; c++) {
        const cell = solved[r][c];
        if (cell.type !== 'black') continue;
        if (cell.clueRight === undefined && cell.clueDown === undefined) continue;
        const entry = statuses.get(`${r},${c}`);
        expect(entry).toBeDefined();
        if (!entry) continue;
        if (cell.clueRight !== undefined) {
          expect(entry.rightComplete).toBe(getRunStatus(solved, r, c + 1, 'h').isComplete);
        }
        if (cell.clueDown !== undefined) {
          expect(entry.downComplete).toBe(getRunStatus(solved, r + 1, c, 'v').isComplete);
        }
      }
    }
  });

  it('omits black cells that carry no clue', () => {
    const { board } = generateKakuroPuzzle('easy');
    const statuses = computeClueStatuses(board);
    // (0,0) is always a black corner with no clue.
    expect(statuses.has('0,0')).toBe(false);
  });
});

describe('getHint', () => {
  it('finds a cell with exactly one legal digit and reports its value', () => {
    // Row run (1,0)->: cells (1,1),(1,2), sum 4, with (1,2) given as 3.
    // Column run (0,1)|: cells (1,1),(2,1), sum 3.
    // Cell (1,1): row forces 1; column allows {1,2}; intersection = {1}.
    const board = makeBoard(
      ['BBB', 'B-3', 'B--'],
      [
        { r: 1, c: 0, right: 4 },
        { r: 0, c: 1, down: 3 },
        { r: 0, c: 2, down: 17 },
      ]
    );
    const hint = getHint(board);
    expect(hint.kind).toBe('single');
    expect(hint.cell).toEqual({ r: 1, c: 1 });
    expect(hint.value).toBe(1);
  });

  it('explains a run whose clue admits only one combination', () => {
    // Row run of 2 cells summing to 16 => only {7,9}. Columns stay loose
    // enough that no single cell is forced yet.
    const board = makeBoard(
      ['BBB', 'B--', 'B--'],
      [
        { r: 1, c: 0, right: 16 },
        { r: 0, c: 1, down: 15 },
        { r: 0, c: 2, down: 15 },
      ]
    );
    const hint = getHint(board);
    expect(hint.kind).toBe('run-unique');
    expect(hint.message).toContain('{7 + 9}');
  });

  it('falls back to revealing the preferred cell', () => {
    const board = makeBoard(
      ['BBB', 'B--', 'B--'],
      [
        { r: 1, c: 0, right: 8 },
        { r: 0, c: 1, down: 8 },
        { r: 0, c: 2, down: 8 },
      ]
    );
    (board[1][1] as WhiteCell).correctValue = 6;
    const hint = getHint(board, { r: 1, c: 1 });
    expect(hint.kind).toBe('reveal');
    expect(hint.value).toBe(6);
    expect(hint.cell).toEqual({ r: 1, c: 1 });
  });

  it('never suggests a digit already present in either run', () => {
    const board = makeBoard(
      ['BBB', 'B5-', 'B--'],
      [
        { r: 1, c: 0, right: 12 },
        { r: 0, c: 1, down: 13 },
        { r: 0, c: 2, down: 9 },
      ]
    );
    const hint = getHint(board);
    if (hint.kind === 'single') {
      expect(hint.value).not.toBe(5);
    }
  });
});
