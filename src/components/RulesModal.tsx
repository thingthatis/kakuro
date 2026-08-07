import { BookOpen } from 'lucide-react';

interface RulesModalProps {
  onClose: () => void;
}

export function RulesModal({ onClose }: RulesModalProps) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()} role="dialog" aria-labelledby="rules-title">
        <button className="modal-close" onClick={onClose} aria-label="Close rules">
          ✕
        </button>
        <h2
          id="rules-title"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}
        >
          <BookOpen className="text-indigo-400" />
          How to Play Kakuro
        </h2>
        <div
          className="tutorial-content"
          style={{ maxHeight: '400px', overflowY: 'auto', paddingRight: '0.5rem' }}
        >
          <p>
            <strong>Kakuro</strong> (also known as Cross Sums) is a math-logic puzzle. It is very
            similar to crosswords, but with numbers instead of letters!
          </p>
          <h3 style={{ color: 'var(--color-primary-light)', fontSize: '1rem', margin: '1rem 0 0.5rem 0' }}>
            Core Rules:
          </h3>
          <ul>
            <li>Place digits <strong>1 through 9</strong> into the white cells. (No zeros!).</li>
            <li>
              The sum of digits in each consecutive run (row or column) must equal the clue in the
              adjacent dark triangle cell.
            </li>
            <li>
              <strong>Across clues:</strong> Upper-right number applies to the row of cells to its
              right.
            </li>
            <li>
              <strong>Down clues:</strong> Lower-left number applies to the column of cells below.
            </li>
            <li>
              <strong>NO DUPLICATES:</strong> A digit <i>cannot</i> repeat within a single run. For
              example, a sum of 4 in 2 cells must be 1+3 (2+2 is invalid because of duplicates).
            </li>
          </ul>
          <h3 style={{ color: 'var(--color-primary-light)', fontSize: '1rem', margin: '1rem 0 0.5rem 0' }}>
            Pro Controls:
          </h3>
          <ul>
            <li><strong>Select cell:</strong> Click any empty white cell.</li>
            <li>
              <strong>Change Direction:</strong> Click the selected cell again, click the direction
              toggle, or press <strong>Spacebar</strong> to toggle horizontal/vertical run focus.
            </li>
            <li>
              <strong>Keyboard Play:</strong> Use numbers 1-9 to input. Backspace/Delete/0 clears a
              cell.
            </li>
            <li>
              <strong>Navigate:</strong> Use <strong>Arrow Keys</strong> to easily jump between white
              squares.
            </li>
            <li>
              <strong>Pencil/Notes:</strong> Press <strong>N</strong> or toggle the Pencil icon to
              write temporary notes/pencil marks in a cell.
            </li>
          </ul>
        </div>
        <button
          className="btn btn-primary"
          style={{ margin: '1.5rem auto 0', display: 'block' }}
          onClick={onClose}
        >
          Let's Play!
        </button>
      </div>
    </div>
  );
}
