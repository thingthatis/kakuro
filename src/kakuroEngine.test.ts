import { describe, it, expect } from 'vitest';
import { generateKakuroPuzzle, checkWinCondition, getRunStatus, type Board, type WhiteCell, type BlackCell } from './kakuroEngine';

describe('generateKakuroPuzzle', () => {
  it('produces a board with the expected dimensions for each difficulty', () => {
    const cases: Array<['easy' | 'medium' | 'hard', number, number]> = [
      ['easy', 6, 6],
      ['medium', 8, 8],
      ['hard', 10, 10],
    ];
    for (const [d, h, w] of cases) {
      const { board } = generateKakuroPuzzle(d);
      expect(board.length).toBe(h);
      expect(board[0].length).toBe(w);
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

  it('every clue cell has a clueRight or clueDown when adjacent to a white run', () => {
    const { board } = generateKakuroPuzzle('medium');
    for (let r = 0; r < board.length; r++) {
      for (let c = 0; c < board[0].length; c++) {
        const cell = board[r][c] as BlackCell;
        if (cell.type !== 'black') continue;
        const rightHasWhite = c + 1 < board[0].length && board[r][c + 1].type === 'white';
        const downHasWhite = r + 1 < board.length && board[r + 1][c].type === 'white';
        if (rightHasWhite) expect(cell.clueRight).toBeDefined();
        if (downHasWhite) expect(cell.clueDown).toBeDefined();
        if (!rightHasWhite) expect(cell.clueRight).toBeUndefined();
        if (!downHasWhite) expect(cell.clueDown).toBeUndefined();
      }
    }
  });

  it('emits a preRevealed grid of the same dimensions, with at most one marker per white cell', () => {
    for (const d of ['easy', 'medium', 'hard'] as const) {
      const { board, preRevealed } = generateKakuroPuzzle(d);
      expect(preRevealed.length).toBe(board.length);
      expect(preRevealed[0].length).toBe(board[0].length);
      for (let r = 0; r < board.length; r++) {
        for (let c = 0; c < board[0].length; c++) {
          if (preRevealed[r][c]) {
            expect(board[r][c].type).toBe('white');
          }
        }
      }
    }
  });
});

describe('checkWinCondition', () => {
  it('reports a win when every white cell holds the correct solution value', () => {
    const { board } = generateKakuroPuzzle('easy');
    const solved: Board = board.map(row =>
      row.map(cell => {
        if (cell.type === 'white') {
          return { ...cell, value: cell.correctValue } as WhiteCell;
        }
        return cell;
      })
    );
    expect(checkWinCondition(solved).isWin).toBe(true);
  });

  it('reports not-won on an empty board', () => {
    const { board } = generateKakuroPuzzle('easy');
    expect(checkWinCondition(board).isWin).toBe(false);
  });

  it('flags a duplicate within a run', () => {
    // Construct a tiny board directly so the duplicate is deterministic.
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

  it('flags a wrong-sum run when the run is fully filled with digits that do not add up', () => {
    // 2-cell horizontal run, clue 5, filled with 1 and 2 (sum 3).
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
    let black: { r: number; c: number } | null = null;
    outer: for (let r = 0; r < board.length; r++) {
      for (let c = 0; c < board[0].length; c++) {
        if (board[r][c].type === 'black') {
          black = { r, c };
          break outer;
        }
      }
    }
    expect(black).not.toBeNull();
    if (black) {
      const status = getRunStatus(board, black.r, black.c, 'h');
      expect(status.count).toBe(0);
      expect(status.targetSum).toBe(0);
    }
  });

  it('reports the correct target sum for a run', () => {
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

  it('reports the current sum correctly', () => {
    const { board } = generateKakuroPuzzle('easy');
    const mutated: Board = board.map(row =>
      row.map(cell => {
        if (cell.type === 'white') return { ...cell, value: '' } as WhiteCell;
        return cell;
      })
    );
    for (let r = 0; r < board.length; r++) {
      for (let c = 0; c < board[0].length; c++) {
        if (mutated[r][c].type !== 'white') continue;
        (mutated[r][c] as WhiteCell).value = (mutated[r][c] as WhiteCell).correctValue;
        const hStatus = getRunStatus(mutated, r, c, 'h');
        expect(hStatus.currentSum).toBeGreaterThan(0);
        expect(hStatus.filledCount).toBeGreaterThanOrEqual(1);
        return;
      }
    }
  });
});
