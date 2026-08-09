import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { GameBoard } from './GameBoard';
import type { ClueStatus } from './GameBoard';
import { ConfirmDialog } from './ConfirmDialog';
import { generateKakuroPuzzle, computeClueStatuses } from '../kakuroEngine';
import type { Board } from '../kakuroEngine';

afterEach(cleanup);

const noRuns = () => ({ inHRun: false, inVRun: false });

function renderBoard(overrides: Partial<Parameters<typeof GameBoard>[0]> = {}) {
  const { board, preRevealed } = generateKakuroPuzzle('easy');
  const props = {
    board,
    preRevealed,
    selectedCell: null,
    editDirection: 'h' as const,
    errorSet: new Set<string>(),
    showErrors: true,
    runStatusByCell: noRuns,
    clueStatuses: computeClueStatuses(board) as Map<string, ClueStatus>,
    onCellClick: () => {},
    ...overrides,
  };
  return { ...render(<GameBoard {...props} />), board, preRevealed };
}

describe('GameBoard', () => {
  it('renders a grid with one gridcell per board cell', () => {
    const { board } = renderBoard();
    const cells = screen.getAllByRole('gridcell', { hidden: true });
    expect(cells.length).toBe(board.length * board[0].length);
  });

  it('labels a white cell with its position and value', () => {
    const board: Board = [
      [{ type: 'black' }, { type: 'black', clueDown: 5 }, { type: 'black' }],
      [{ type: 'black', clueRight: 5 }, { type: 'white', value: 2, correctValue: 2, notes: [] }, { type: 'white', value: 3, correctValue: 3, notes: [] }],
    ];
    render(
      <GameBoard
        board={board}
        preRevealed={[[false, false, false], [false, false, false]]}
        selectedCell={null}
        editDirection="h"
        errorSet={new Set()}
        showErrors
        runStatusByCell={noRuns}
        clueStatuses={computeClueStatuses(board)}
        onCellClick={() => {}}
      />
    );
    expect(screen.getByLabelText(/Row 2, column 2, 2/)).toBeTruthy();
  });

  it('announces a pre-filled cell as a read-only given', () => {
    const board: Board = [
      [{ type: 'black' }, { type: 'black', clueDown: 4 }],
      [{ type: 'black', clueRight: 4 }, { type: 'white', value: 4, correctValue: 4, notes: [] }],
    ];
    render(
      <GameBoard
        board={board}
        preRevealed={[[false, false], [false, true]]}
        selectedCell={null}
        editDirection="h"
        errorSet={new Set()}
        showErrors
        runStatusByCell={noRuns}
        clueStatuses={computeClueStatuses(board)}
        onCellClick={() => {}}
      />
    );
    expect(screen.getByLabelText(/given, read-only/)).toBeTruthy();
  });

  it('makes only the selected cell tabbable and gives it DOM focus', () => {
    const board: Board = [
      [{ type: 'black' }, { type: 'black', clueDown: 5 }, { type: 'black' }],
      [{ type: 'black', clueRight: 5 }, { type: 'white', value: '', correctValue: 2, notes: [] }, { type: 'white', value: '', correctValue: 3, notes: [] }],
    ];
    render(
      <GameBoard
        board={board}
        preRevealed={[[false, false, false], [false, false, false]]}
        selectedCell={{ r: 1, c: 2 }}
        editDirection="h"
        errorSet={new Set()}
        showErrors
        runStatusByCell={noRuns}
        clueStatuses={computeClueStatuses(board)}
        onCellClick={() => {}}
      />
    );
    const selected = screen.getByLabelText(/Row 2, column 3/);
    const other = screen.getByLabelText(/Row 2, column 2/);
    expect(selected.getAttribute('tabindex')).toBe('0');
    expect(other.getAttribute('tabindex')).toBe('-1');
    expect(document.activeElement).toBe(selected);
  });

  it('marks a conflicting cell only when showErrors is on', () => {
    const board: Board = [
      [{ type: 'black' }, { type: 'black', clueDown: 5 }],
      [{ type: 'black', clueRight: 5 }, { type: 'white', value: 9, correctValue: 2, notes: [] }],
    ];
    const common = {
      board,
      preRevealed: [[false, false], [false, false]],
      selectedCell: null,
      editDirection: 'h' as const,
      errorSet: new Set(['1,1']),
      runStatusByCell: noRuns,
      clueStatuses: computeClueStatuses(board),
      onCellClick: () => {},
    };
    const { unmount } = render(<GameBoard {...common} showErrors />);
    expect(screen.getByLabelText(/conflict/)).toBeTruthy();
    unmount();

    render(<GameBoard {...common} showErrors={false} />);
    expect(screen.queryByLabelText(/conflict/)).toBeNull();
  });

  it('reports the clicked coordinates', async () => {
    const onCellClick = vi.fn();
    const board: Board = [
      [{ type: 'black' }, { type: 'black', clueDown: 5 }],
      [{ type: 'black', clueRight: 5 }, { type: 'white', value: '', correctValue: 5, notes: [] }],
    ];
    render(
      <GameBoard
        board={board}
        preRevealed={[[false, false], [false, false]]}
        selectedCell={null}
        editDirection="h"
        errorSet={new Set()}
        showErrors
        runStatusByCell={noRuns}
        clueStatuses={computeClueStatuses(board)}
        onCellClick={onCellClick}
      />
    );
    await userEvent.click(screen.getByLabelText(/Row 2, column 2/));
    expect(onCellClick).toHaveBeenCalledWith(1, 1);
  });
});

describe('ConfirmDialog', () => {
  it('closes on Escape', async () => {
    const onCancel = vi.fn();
    render(
      <ConfirmDialog
        title="Solve the puzzle?"
        message="This fills every cell."
        onConfirm={() => {}}
        onCancel={onCancel}
      />
    );
    await userEvent.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalled();
  });

  it('moves focus into the dialog on open', () => {
    render(
      <ConfirmDialog
        title="Solve the puzzle?"
        message="This fills every cell."
        confirmLabel="Solve Now"
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Solve Now' }));
  });

  it('keeps Tab focus inside the dialog', async () => {
    render(
      <ConfirmDialog
        title="Solve the puzzle?"
        message="This fills every cell."
        confirmLabel="Solve Now"
        cancelLabel="Keep Playing"
        onConfirm={() => {}}
        onCancel={() => {}}
      />
    );
    const dialog = screen.getByRole('alertdialog');
    // Tab repeatedly; focus must never leave the dialog subtree.
    for (let i = 0; i < 5; i++) {
      await userEvent.tab();
      expect(dialog.contains(document.activeElement)).toBe(true);
    }
  });
});
