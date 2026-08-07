import { Sliders, Pencil } from 'lucide-react';

interface KeypadProps {
  pencilMode: boolean;
  onTogglePencil: () => void;
  onInput: (val: number | '') => void;
  disabled: boolean;
}

export function Keypad({ pencilMode, onTogglePencil, onInput, disabled }: KeypadProps) {
  return (
    <div className="panel-card">
      <h2 style={{ justifyContent: 'space-between' }}>
        <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <Sliders size={18} className="text-purple-400" />
          Keypad
        </span>
        <button
          className={`btn btn-icon ${pencilMode ? 'pencil-active' : ''}`}
          onClick={onTogglePencil}
          style={{ padding: '0.25rem 0.5rem', width: 'auto', fontSize: '0.75rem' }}
          title="Toggle Pencil Notes (N)"
          aria-label="Toggle pencil notes"
          aria-pressed={pencilMode}
        >
          <Pencil size={12} />
          {pencilMode ? 'Notes ON' : 'Notes OFF'}
        </button>
      </h2>
      <div className="keypad-grid">
        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
          <button
            key={num}
            className="keypad-btn"
            onClick={() => onInput(num)}
            disabled={disabled}
            aria-label={`Enter ${num}`}
          >
            {num}
          </button>
        ))}
        <button
          className="keypad-btn keypad-btn-wide"
          onClick={() => onInput('')}
          disabled={disabled}
          aria-label="Clear selected cell"
        >
          Clear Square
        </button>
      </div>
    </div>
  );
}
