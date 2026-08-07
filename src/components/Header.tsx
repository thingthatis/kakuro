import { Sparkles, Volume2, VolumeX, HelpCircle } from 'lucide-react';
import type { Difficulty } from '../types';

interface HeaderProps {
  difficulty: Difficulty;
  onDifficultyChange: (d: Difficulty) => void;
  soundEnabled: boolean;
  onToggleSound: () => void;
  onShowRules: () => void;
}

export function Header({ difficulty, onDifficultyChange, soundEnabled, onToggleSound, onShowRules }: HeaderProps) {
  return (
    <header className="app-header">
      <div className="logo-section">
        <h1>
          <Sparkles style={{ color: 'var(--color-secondary)' }} />
          KAKURO.io
        </h1>
        <p>The premium algebraic logic crossword</p>
      </div>
      <div className="header-controls">
        <label className="difficulty-control">
          <span>Difficulty</span>
          <select
            aria-label="Difficulty"
            value={difficulty}
            onChange={e => onDifficultyChange(e.target.value as Difficulty)}
          >
            <option value="easy">Easy</option>
            <option value="medium">Medium</option>
            <option value="hard">Hard</option>
          </select>
        </label>
        <button className="btn btn-icon" onClick={onToggleSound} title="Toggle Sounds" aria-label="Toggle sound effects">
          {soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
        </button>
        <button className="btn btn-icon" onClick={onShowRules} title="How to Play" aria-label="How to play">
          <HelpCircle size={18} />
        </button>
      </div>
    </header>
  );
}
