import { RotateCcw, RotateCw, RefreshCw, Eye, Lightbulb, Sparkles } from 'lucide-react';

interface GameControlsProps {
  timer: number;
  hintsUsed: number;
  formatTime: (s: number) => string;
  editDirection: 'h' | 'v';
  onToggleDirection: () => void;
  onUndo: () => void;
  canUndo: boolean;
  onRedo: () => void;
  canRedo: boolean;
  onReset: () => void;
  onToggleErrors: () => void;
  showErrors: boolean;
  onHint: () => void;
  hintDisabled: boolean;
  onSolveRequest: () => void;
  solveDisabled: boolean;
}

export function GameControls(props: GameControlsProps) {
  return (
    <div className="game-controls">
      <div className="game-stats">
        <div className="stat-item">
          <span className="value">{props.formatTime(props.timer)}</span>
        </div>
        <div className="stat-item">
          <span style={{ fontSize: '0.75rem', textTransform: 'uppercase' }}>Hints:</span>
          <span className="value">{props.hintsUsed}</span>
        </div>
      </div>
      <div className="game-actions">
        <div className="direction-indicator">
          <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Run focus:</span>
          <div
            className="direction-toggle"
            onClick={props.onToggleDirection}
            role="button"
            tabIndex={0}
            aria-label="Toggle run focus direction"
            onKeyDown={e => {
              if (e.key === ' ' || e.key === 'Enter') {
                e.preventDefault();
                props.onToggleDirection();
              }
            }}
          >
            <span className={`direction-option ${props.editDirection === 'h' ? 'active' : ''}`}>Row</span>
            <span className={`direction-option ${props.editDirection === 'v' ? 'active' : ''}`}>Col</span>
          </div>
        </div>
        <button
          className="btn btn-icon"
          onClick={props.onUndo}
          disabled={!props.canUndo}
          title="Undo (Ctrl+Z)"
          aria-label="Undo"
        >
          <RotateCcw size={18} />
        </button>
        <button
          className="btn btn-icon"
          onClick={props.onRedo}
          disabled={!props.canRedo}
          title="Redo (Ctrl+Y)"
          aria-label="Redo"
        >
          <RotateCw size={18} />
        </button>
        <button className="btn btn-icon" onClick={props.onReset} title="Reset Game" aria-label="Reset game">
          <RefreshCw size={18} />
        </button>
      </div>
      <div style={{ display: 'flex', gap: '0.75rem', width: '100%', justifyContent: 'space-between' }}>
        <button
          className="btn"
          onClick={props.onToggleErrors}
          title="Show conflicts in red"
          aria-label={props.showErrors ? 'Hide conflicts' : 'Show conflicts'}
        >
          <Eye size={16} />
          {props.showErrors ? 'Hide Conflicts' : 'Show Conflicts'}
        </button>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            className="btn"
            onClick={props.onHint}
            disabled={props.hintDisabled}
            title="Fill selected square with correct answer"
            aria-label="Get hint for selected cell"
          >
            <Lightbulb size={16} style={{ color: 'var(--color-warning)' }} />
            Get Hint
          </button>
          <button
            className="btn"
            onClick={props.onSolveRequest}
            disabled={props.solveDisabled}
            title="Instantly complete board"
            aria-label="Solve puzzle"
          >
            <Sparkles size={16} />
            Solve Puzzle
          </button>
        </div>
      </div>
    </div>
  );
}
