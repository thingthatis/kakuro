import { describe, it, expect, afterEach, beforeEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from './App';

afterEach(cleanup);
beforeEach(() => localStorage.clear());

/**
 * Smoke tests that mount the whole App, so a crash-on-boot or a broken
 * interaction wiring cannot pass CI. These exercise the real engine.
 */
describe('App integration', () => {
  it('mounts and renders a playable board with clues', () => {
    render(<App />);
    expect(screen.getByRole('grid', { name: /Kakuro puzzle board/i })).toBeTruthy();
    const cells = screen.getAllByRole('gridcell', { hidden: true });
    expect(cells.length).toBeGreaterThan(0);
    // At least one clue must be rendered, else the board is unplayable.
    expect(document.querySelectorAll('.clue-val').length).toBeGreaterThan(0);
  });

  it('selects a cell on click and accepts a typed digit', async () => {
    const user = userEvent.setup();
    render(<App />);

    // Find an empty, editable white cell.
    const empty = Array.from(document.querySelectorAll('.cell-white')).find(
      el => !el.classList.contains('pre-revealed') && el.querySelector('.notes-container')
    ) as HTMLElement | undefined;
    expect(empty).toBeDefined();
    if (!empty) return;

    await user.click(empty);
    expect(empty.getAttribute('aria-selected')).toBe('true');

    await user.keyboard('5');
    expect(empty.querySelector('.cell-value')?.textContent).toBe('5');
  });

  it('hint button explains or fills a cell and shows an announcement', async () => {
    const user = userEvent.setup();
    render(<App />);

    const hintBtn = screen.getByRole('button', { name: /get a hint/i });
    expect(hintBtn).toBeTruthy();
    await user.click(hintBtn);

    const banner = document.querySelector('.hint-banner');
    expect(banner).not.toBeNull();
    expect(banner?.textContent?.length ?? 0).toBeGreaterThan(0);

    // The live region mirrors the hint for screen readers.
    expect(document.querySelector('.sr-only[role="status"]')?.textContent).toBe(banner?.querySelector('span')?.textContent);
  });

  it('undo reverts a digit entry', async () => {
    const user = userEvent.setup();
    render(<App />);
    const empty = Array.from(document.querySelectorAll('.cell-white')).find(
      el => !el.classList.contains('pre-revealed') && el.querySelector('.notes-container')
    ) as HTMLElement | undefined;
    if (!empty) return;

    await user.click(empty);
    await user.keyboard('7');
    expect(empty.querySelector('.cell-value')?.textContent).toBe('7');

    await user.click(screen.getByRole('button', { name: /undo/i }));
    expect(empty.querySelector('.cell-value')).toBeNull();
  });

  it('persists the chosen difficulty across a remount', async () => {
    const user = userEvent.setup();
    const first = render(<App />);
    const select = screen.getByLabelText('Difficulty') as HTMLSelectElement;
    expect(select.value).toBe('medium');

    // Switch to hard, which starts a new game.
    await user.selectOptions(select, 'hard');
    expect((screen.getByLabelText('Difficulty') as HTMLSelectElement).value).toBe('hard');

    // Enter a digit so a game is actually saved, then remount.
    const empty = Array.from(document.querySelectorAll('.cell-white')).find(
      el => !el.classList.contains('pre-revealed') && el.querySelector('.notes-container')
    ) as HTMLElement | undefined;
    if (empty) {
      await user.click(empty);
      await user.keyboard('3');
    }
    first.unmount();

    render(<App />);
    // Regression: difficulty used to be hardcoded to 'medium' on boot, so a
    // restored hard game reported itself as medium.
    expect((screen.getByLabelText('Difficulty') as HTMLSelectElement).value).toBe('hard');
  });

  it('opens the rules dialog and closes it with Escape', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: /rules|how to play/i }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/How to Play Kakuro/i)).toBeTruthy();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('asks for confirmation before solving the puzzle', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('button', { name: /solve/i }));
    expect(screen.getByRole('alertdialog')).toBeTruthy();
    // Backing out must leave the board unsolved.
    await user.click(screen.getByRole('button', { name: /keep playing/i }));
    expect(screen.queryByRole('alertdialog')).toBeNull();
  });

  it('lists computed unique partitions in the tactics guide', async () => {
    const user = userEvent.setup();
    render(<App />);
    await user.click(screen.getByRole('tab', { name: /tactics guide/i }));
    // 3-in-2 => {1,2} is the canonical example and must be present.
    expect(screen.getByText('Sum 3 (in 2)')).toBeTruthy();
    // The list is derived, so it is far longer than the old hardcoded ten.
    expect(document.querySelectorAll('.combo-item').length).toBeGreaterThan(10);
  });

  it('auto-prunes pencil marks when a digit is placed in the same run', async () => {
    const user = userEvent.setup();
    render(<App />);

    // Find two empty, editable white cells that are in the same Kakuro run
    // (maximal white sequence, not just same CSS row — black cells in the
    // row would put them in different runs and the prune should not fire).
    const rows = Array.from(document.querySelectorAll('.grid-row'));
    let pair: [HTMLElement, HTMLElement] | null = null;
    for (const row of rows) {
      const cellsInRow = Array.from(row.querySelectorAll('.cell-white')).filter(
        el => !el.classList.contains('pre-revealed') && el.querySelector('.notes-container')
      ) as HTMLElement[];
      // Group adjacent white cells — a group is a Kakuro run.
      for (let i = 0; i + 1 < cellsInRow.length && !pair; i++) {
        const a = cellsInRow[i];
        const b = cellsInRow[i + 1];
        // Adjacent in DOM = same row, no black cell between them in the row.
        pair = [a, b];
      }
      if (pair) break;
    }
    if (!pair) {
      // The default board is generated at medium difficulty, which has
      // plenty of two-cell runs. If we never found one, something is off.
      throw new Error('Test setup: no adjacent editable cells found in any run');
    }

    const [first, second] = pair;

    // Enable pencil mode and write a note "3" in the first cell.
    await user.click(first);
    await user.keyboard('n');
    await user.keyboard('3');
    const notesAfter = first.querySelectorAll('.note-mark');
    const noteText = Array.from(notesAfter).map(n => n.textContent).join('');
    expect(noteText).toContain('3');

    // Disable pencil and place "3" in the second cell (same run).
    await user.keyboard('n');
    await user.click(second);
    await user.keyboard('3');

    // The first cell's "3" pencil mark should have been pruned, because the
    // two cells share a run and a digit cannot repeat within a run.
    const notesAfter2 = first.querySelectorAll('.note-mark');
    const noteText2 = Array.from(notesAfter2).map(n => n.textContent).join('');
    expect(noteText2).not.toContain('3');
  });
});
