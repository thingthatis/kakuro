import { memo, useEffect, useRef } from 'react';
import type { Board, WhiteCell as WhiteCellT, BlackCell as BlackCellT } from '../kakuroEngine';

export interface ClueStatus {
  rightComplete: boolean;
  rightOver: boolean;
  downComplete: boolean;
  downOver: boolean;
}

interface GameBoardProps {
  board: Board;
  preRevealed: boolean[][];
  selectedCell: { r: number; c: number } | null;
  editDirection: 'h' | 'v';
  errorSet: Set<string>;
  showErrors: boolean;
  runStatusByCell: (r: number, c: number) => { inHRun: boolean; inVRun: boolean };
  clueStatuses: Map<string, ClueStatus>;
  onCellClick: (r: number, c: number) => void;
}

const EMPTY_STATUS: ClueStatus = {
  rightComplete: false,
  rightOver: false,
  downComplete: false,
  downOver: false,
};

const NOTE_DIGITS = [1, 2, 3, 4, 5, 6, 7, 8, 9];

export function GameBoard({
  board,
  preRevealed,
  selectedCell,
  editDirection,
  errorSet,
  showErrors,
  runStatusByCell,
  clueStatuses,
  onCellClick,
}: GameBoardProps) {
  return (
    <div className="grid-container" role="grid" aria-label="Kakuro puzzle board">
      {board.map((row, rIdx) => (
        <div key={rIdx} className="grid-row" role="row">
          {row.map((cell, cIdx) => {
            if (cell.type === 'black') {
              return (
                <BlackCellView
                  key={cIdx}
                  cell={cell}
                  status={clueStatuses.get(`${rIdx},${cIdx}`) ?? EMPTY_STATUS}
                />
              );
            }
            const { inHRun, inVRun } = runStatusByCell(rIdx, cIdx);
            const isSelected = selectedCell?.r === rIdx && selectedCell?.c === cIdx;
            return (
              <WhiteCellView
                key={cIdx}
                cell={cell}
                rIdx={rIdx}
                cIdx={cIdx}
                isSelected={isSelected}
                inHRun={inHRun}
                inVRun={inVRun}
                editDirection={editDirection}
                hasError={showErrors && errorSet.has(`${rIdx},${cIdx}`)}
                isPreRevealed={preRevealed[rIdx]?.[cIdx] === true}
                onClick={onCellClick}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

const BlackCellView = memo(function BlackCellView({
  cell,
  status,
}: {
  cell: BlackCellT;
  status: ClueStatus;
}) {
  const hasClues = cell.clueRight !== undefined || cell.clueDown !== undefined;
  return (
    <div className={`cell cell-black ${hasClues ? 'has-clues' : ''}`} role="gridcell" aria-hidden="true">
      <div className="clue-container">
        {cell.clueRight !== undefined && (
          <span
            className={`clue-val clue-right ${status.rightComplete ? 'complete' : ''} ${
              status.rightOver ? 'over' : ''
            }`}
          >
            {cell.clueRight}
          </span>
        )}
        {cell.clueDown !== undefined && (
          <span
            className={`clue-val clue-down ${status.downComplete ? 'complete' : ''} ${
              status.downOver ? 'over' : ''
            }`}
          >
            {cell.clueDown}
          </span>
        )}
      </div>
    </div>
  );
});

const WhiteCellView = memo(function WhiteCellView({
  cell,
  rIdx,
  cIdx,
  isSelected,
  inHRun,
  inVRun,
  editDirection,
  hasError,
  isPreRevealed,
  onClick,
}: {
  cell: WhiteCellT;
  rIdx: number;
  cIdx: number;
  isSelected: boolean;
  inHRun: boolean;
  inVRun: boolean;
  editDirection: 'h' | 'v';
  hasError: boolean;
  isPreRevealed: boolean;
  onClick: (r: number, c: number) => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  // Roving tabindex: only the selected cell is tabbable, and it takes DOM
  // focus so that screen readers and Tab-based navigation stay in sync with
  // the game's own notion of the selected cell.
  useEffect(() => {
    if (isSelected && ref.current && document.activeElement !== ref.current) {
      ref.current.focus({ preventScroll: true });
    }
  }, [isSelected]);

  let highlightClass = '';
  if (isSelected) {
    highlightClass = 'selected';
  } else if (inHRun && inVRun) {
    highlightClass = 'intersected';
  } else if (inHRun) {
    highlightClass = editDirection === 'h' ? 'highlight-row-active' : 'highlight-row-dim';
  } else if (inVRun) {
    highlightClass = editDirection === 'v' ? 'highlight-col-active' : 'highlight-col-dim';
  }

  const classes = [
    'cell',
    'cell-white',
    highlightClass,
    hasError ? 'error' : '',
    isPreRevealed ? 'pre-revealed' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const valueText = cell.value !== '' ? String(cell.value) : 'empty';
  const ariaLabel = `Row ${rIdx + 1}, column ${cIdx + 1}, ${valueText}${
    isPreRevealed ? ', given, read-only' : ''
  }${hasError ? ', conflict' : ''}`;

  return (
    <div
      ref={ref}
      className={classes}
      role="gridcell"
      tabIndex={isSelected ? 0 : -1}
      aria-selected={isSelected}
      aria-readonly={isPreRevealed || undefined}
      aria-label={ariaLabel}
      onClick={() => onClick(rIdx, cIdx)}
    >
      {cell.value !== '' ? (
        <span className="cell-value">{cell.value}</span>
      ) : (
        <div className="notes-container">
          {NOTE_DIGITS.map(num => (
            <div key={num} className="note-mark">
              {cell.notes?.includes(num) ? num : ''}
            </div>
          ))}
        </div>
      )}
    </div>
  );
});
