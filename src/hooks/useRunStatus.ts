import { useCallback, useMemo } from 'react';
import type { Board } from '../kakuroEngine';

interface RunBoundaries {
  hMin: number;
  hMax: number;
  vMin: number;
  vMax: number;
}

/**
 * Pre-computes the horizontal and vertical run boundaries for a selected cell.
 * The run boundaries depend only on (board, selectedCell), so this hook
 * memoizes them. The per-cell highlight query then runs in O(1) by index
 * comparison instead of O(run length) per cell.
 */
export function useRunBoundaries(board: Board, selectedCell: { r: number; c: number } | null): RunBoundaries | null {
  return useMemo(() => {
    if (!selectedCell) return null;
    const { r, c } = selectedCell;
    if (r >= board.length || c >= board[0].length) return null;
    if (board[r][c].type !== 'white') return null;

    let minC = c;
    while (minC >= 0 && board[r][minC].type === 'white') minC--;
    minC++;

    let maxC = c;
    while (maxC < board[0].length && board[r][maxC].type === 'white') maxC++;
    maxC--;

    let minR = r;
    while (minR >= 0 && board[minR][c].type === 'white') minR--;
    minR++;

    let maxR = r;
    while (maxR < board.length && board[maxR][c].type === 'white') maxR++;
    maxR--;

    return { hMin: minC, hMax: maxC, vMin: minR, vMax: maxR };
  }, [board, selectedCell]);
}

/**
 * Returns a function that, given (r, c), reports whether the cell is in the
 * selected cell's horizontal/vertical run. Uses the memoized boundaries.
 */
export function useRunStatus(board: Board, selectedCell: { r: number; c: number } | null) {
  const boundaries = useRunBoundaries(board, selectedCell);
  return useCallback(
    (r: number, c: number) => {
      if (!boundaries || !selectedCell) return { inHRun: false, inVRun: false };
      const inHRun = r === selectedCell.r && c >= boundaries.hMin && c <= boundaries.hMax;
      const inVRun = c === selectedCell.c && r >= boundaries.vMin && r <= boundaries.vMax;
      return { inHRun, inVRun };
    },
    [boundaries, selectedCell]
  );
}
