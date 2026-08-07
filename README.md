# KAKURO.io

A browser-based Kakuro puzzle game built with **React 19 + TypeScript + Vite**. The
engine procedurally generates puzzles, validates solutions, and drives an
interactive playing experience with undo/redo, pencil marks, sound effects, run
highlighting, combination hints, and a victory celebration.

## Quick start

```bash
npm install
npm run dev        # start the dev server at http://localhost:5173
npm run build      # type-check and build for production
npm run test       # run the engine + storage + partition tests
npm run lint       # run ESLint
```

No backend, no analytics, no network calls. Everything runs in the browser.

## How to play

Kakuro is a math-logic crossword. Place digits 1 through 9 into the white
cells so that each horizontal run sums to the clue in the upper-right of its
adjacent dark cell, and each vertical run sums to the clue in the lower-left.
Digits cannot repeat within a single run.

### Controls

| Action                     | Mouse / Touch                | Keyboard                          |
| -------------------------- | ---------------------------- | --------------------------------- |
| Select a cell              | Click                        | Arrow keys                        |
| Toggle run focus direction | Click the cell again         | `Space`                           |
| Enter a digit              | Click a number on the keypad | `1`–`9`                           |
| Clear a cell               | "Clear Square" button        | `Backspace`, `Delete`, or `0`     |
| Toggle pencil / notes      | Pencil icon                  | `N`                               |
| Undo / Redo                | Toolbar buttons              | `Ctrl/Cmd+Z`, `Ctrl/Cmd+Y`        |
| New puzzle                 | Refresh icon                 | —                                 |
| Toggle sound               | Volume icon                  | —                                 |
| How to play                | Help icon                    | —                                 |

Pencil marks let you sketch candidate digits in a cell without committing
them. Pre-revealed starter cells (in easy and medium puzzles) are shown in a
distinct amber color.

## Project structure

```
src/
├── App.tsx              # Top-level component, game state, and event wiring
├── App.css              # All styles
├── main.tsx             # React entry point
├── types.ts             # Shared types (Difficulty)
├── storage.ts           # localStorage persistence (game state + stats)
├── kakuroEngine.ts      # Pure-TS engine: generation, validation, run queries
├── components/
│   ├── Header.tsx
│   ├── GameBoard.tsx    # Grid rendering (black + white cells)
│   ├── GameControls.tsx # Direction toggle, undo/redo, hints, solve
│   ├── Keypad.tsx       # Numeric input + pencil toggle
│   ├── Sidebar.tsx      # Run Inspector + Tactics Guide tabs
│   ├── RulesModal.tsx   # How-to-play dialog
│   ├── VictoryModal.tsx # Win screen with stats
│   └── ConfirmDialog.tsx
└── hooks/
    ├── useAudio.ts      # Single shared AudioContext
    ├── usePartitions.ts # Cached partition enumerator (for combination hints)
    └── useRunStatus.ts  # Memoized run boundaries
```

The engine in `kakuroEngine.ts` is pure TypeScript with no React or DOM
dependencies, which makes it straightforward to unit-test. It exports:

- `generateKakuroPuzzle(difficulty)` — produces a fresh board, solution, and
  pre-reveal map. Easy and medium puzzles pre-fill ~25% / ~10% of cells.
- `checkWinCondition(board)` — validates every horizontal and vertical run
  and reports both win state and the coordinates of any cells in conflict.
- `getRunStatus(board, r, c, direction)` — current sum, target sum, completion
  and overflow status for the run containing a given white cell.
- `countSolutions(board, ...)` — exported for users who want to verify that
  a generated puzzle has a unique solution. Note: the fixed layout templates
  are small enough that many generated puzzles admit multiple solutions; the
  engine intentionally does not enforce uniqueness as a hard gate because the
  check is expensive for these small boards. Call `countSolutions` directly
  if you need that property.

## Difficulty

The engine ships with three hand-tuned layout templates — a 6×6 easy, an 8×8
medium, and a 10×10 hard. Each is randomly rotated/mirrored before solving,
which yields structurally different boards on every generation.

## Persistence

The current game state (board, timer, hints used, difficulty) is written to
`localStorage` on every change and restored on the next page load. Best times
and total wins are tracked per difficulty in a separate `kakuro:stats:v1` key.

## Testing

```bash
npm run test
```

Tests live next to the code they cover:

- `kakuroEngine.test.ts` — generation invariants, win-condition edge cases
- `hooks/usePartitions.test.ts` — partition enumerator
- `storage.test.ts` — localStorage round-trip

The tests run in `jsdom` (via Vitest) and complete in well under a second.

## License

Private / unspecified. Add a license here if you plan to publish this.
