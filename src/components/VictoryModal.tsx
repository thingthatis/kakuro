import { Trophy } from 'lucide-react';
import type { Difficulty } from '../types';

interface VictoryModalProps {
  difficulty: Difficulty;
  timer: number;
  hintsUsed: number;
  formatTime: (s: number) => string;
  onClose: () => void;
  onNewPuzzle: () => void;
  bestTime: number | null;
}

export function VictoryModal({
  difficulty,
  timer,
  hintsUsed,
  formatTime,
  onClose,
  onNewPuzzle,
  bestTime,
}: VictoryModalProps) {
  return (
    <div className="modal-overlay">
      <div className="modal" role="dialog" aria-labelledby="victory-title">
        <Trophy className="victory-icon" />
        <h2 id="victory-title" className="victory-title">
          Puzzle Complete!
        </h2>
        <p style={{ color: 'var(--text-secondary)' }}>
          Outstanding! You successfully solved the Kakuro puzzle using logic and math.
        </p>

        <div className="victory-stats">
          <div className="v-stat">
            <span className="label">Difficulty</span>
            <span className="val" style={{ textTransform: 'capitalize' }}>
              {difficulty}
            </span>
          </div>
          <div className="v-stat">
            <span className="label">Time</span>
            <span className="val">{formatTime(timer)}</span>
          </div>
          <div className="v-stat">
            <span className="label">Hints</span>
            <span className="val">{hintsUsed}</span>
          </div>
        </div>

        {bestTime !== null && (
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>
            Best {difficulty} time: <strong>{formatTime(bestTime)}</strong>
          </p>
        )}

        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
          <button className="btn" onClick={onClose}>
            Close
          </button>
          <button
            className="btn btn-primary"
            onClick={() => {
              onClose();
              onNewPuzzle();
            }}
          >
            Next Puzzle
          </button>
        </div>
      </div>
    </div>
  );
}
