import { getRunStatus } from '../kakuroEngine';
import type { Board, WhiteCell as WhiteCellT, BlackCell as BlackCellT } from '../kakuroEngine';

interface GameBoardProps {
  board: Board;
  preRevealed: boolean[][];
  selectedCell: { r: number; c: number } | null;
  editDirection: 'h' | 'v';
  errors: { r: number; c: number }[];
  showErrors: boolean;
  runStatusByCell: (r: number, c: number) => { inHRun: boolean; inVRun: boolean };
  onCellClick: (r: number, c: number) => void;
}

export function GameBoard({
  board,
  preRevealed,
  selectedCell,
  editDirection,
  errors,
  showErrors,
  runStatusByCell,
  onCellClick,
}: GameBoardProps) {
  const errorSet = new Set(errors.map(e => `${e.r},${e.c}`));
  return (
    <div className="grid-container" role="grid" aria-label="Kakuro puzzle board">
      {board.map((row, rIdx) => (
        <div key={rIdx} className="grid-row" role="row">
          {row.map((cell, cIdx) => {
            if (cell.type === 'black') {
              return <BlackCellView key={cIdx} cell={cell} board={board} rIdx={rIdx} cIdx={cIdx} />;
            }
            const { inHRun, inVRun } = runStatusByCell(rIdx, cIdx);
            const isSelected = selectedCell?.r === rIdx && selectedCell?.c === cIdx;
            const hasError = errorSet.has(`${rIdx},${cIdx}`);
            const isPre = preRevealed[rIdx]?.[cIdx] === true;
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
                hasError={hasError && showErrors}
                isPreRevealed={isPre}
                onClick={onCellClick}
              />
            );
          })}
        </div>
      ))}
    </div>
  );
}

function BlackCellView({
  cell,
  board,
  rIdx,
  cIdx,
}: {
  cell: BlackCellT;
  board: Board;
  rIdx: number;
  cIdx: number;
}) {
  const h = board.length;
  const w = board[0].length;
  let isRightComplete = false;
  let isRightOver = false;
  let isDownComplete = false;
  let isDownOver = false;

  if (cell.clueRight !== undefined && rIdx < h && cIdx + 1 < w) {
    const status = getRunStatus(board, rIdx, cIdx + 1, 'h');
    isRightComplete = status.isComplete;
    isRightOver = status.isOver;
  }
  if (cell.clueDown !== undefined && cIdx < w && rIdx + 1 < h) {
    const status = getRunStatus(board, rIdx + 1, cIdx, 'v');
    isDownComplete = status.isComplete;
    isDownOver = status.isOver;
  }

  const hasClues = cell.clueRight !== undefined || cell.clueDown !== undefined;
  return (
    <div className={`cell cell-black ${hasClues ? 'has-clues' : ''}`} role="gridcell" aria-hidden="true">
      <div className="clue-container">
        {cell.clueRight !== undefined && (
          <span
            className={`clue-val clue-right ${isRightComplete ? 'complete' : ''} ${isRightOver ? 'over' : ''}`}
          >
            {cell.clueRight}
          </span>
        )}
        {cell.clueDown !== undefined && (
          <span
            className={`clue-val clue-down ${isDownComplete ? 'complete' : ''} ${isDownOver ? 'over' : ''}`}
          >
            {cell.clueDown}
          </span>
        )}
      </div>
    </div>
  );
}

function WhiteCellView({
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
  const ariaLabel = `Row ${rIdx + 1}, column ${cIdx + 1}, ${valueText}${hasError ? ', conflict' : ''}`;

  return (
    <div
      className={classes}
      role="gridcell"
      tabIndex={0}
      aria-selected={isSelected}
      aria-label={ariaLabel}
      onClick={() => onClick(rIdx, cIdx)}
    >
      {cell.value !== '' ? (
        <span className="cell-value">{cell.value}</span>
      ) : (
        <div className="notes-container">
          {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
            <div key={num} className="note-mark">
              {cell.notes?.includes(num) ? num : ''}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
