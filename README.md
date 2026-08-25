# KAKURO.io

A browser-based Kakuro puzzle game built with **React 19 + TypeScript + Vite**. The
engine procedurally generates puzzles, validates solutions, and drives an
interactive playing experience with undo/redo, pencil marks, sound effects, run
highlighting, smart hints that explain their reasoning, and a victory
celebration.

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
    ├── useFocusTrap.ts  # Modal focus trap + Escape-to-close
    ├── usePartitions.ts # Cached partition enumerator (for combination hints)
    └── useRunStatus.ts  # Memoized run boundaries
```

The engine in `kakuroEngine.ts` is pure TypeScript with no React or DOM
dependencies, which makes it straightforward to unit-test. It exports:

- `generateKakuroPuzzle(difficulty)` — produces a fresh board, solution, and
  pre-reveal map. Every returned puzzle is guaranteed to have **exactly one
  solution** (see below).
- `checkWinCondition(board)` — validates every horizontal and vertical run
  and reports both win state and the coordinates of any cells in conflict.
- `getRunStatus(board, r, c, direction)` — current sum, target sum, completion
  and overflow status for the run containing a given white cell.
- `computeClueStatuses(board)` — per-run completion state for every clue cell
  in a single pass, so the UI does not re-walk each run on every render.
- `countSolutions(board, ...)` — counts solutions up to a cap of 2. Bounded by
  a node budget; if the budget is exhausted it reports "not unique" rather
  than claiming a uniqueness it did not prove.
- `generateLayout(spec)` / `validateLayout(layout, maxRun)` — layout
  construction and its invariant check.
- `buildRunIndex(board)` — rebuilds the run lookup maps for a board that came
  from storage rather than fresh generation.
- `getHint(board, preferred?)` — returns the most instructive next step
  (see "Smart hints" below).

## Smart hints

The **Get Hint** button does not simply reveal an answer. It calls
`getHint(board, preferred?)`, which scans the board and returns the most
instructive step available, in preference order:

1. **Forced cell** — an empty cell whose row and column partitions, computed
   exactly from the clue and current fills, intersect to a single legal
   digit. The hint fills it (undoable) and explains why: *"The cell at row 3,
   column 4 has only one possible digit: 7."*
2. **Unique run combination** — a run whose clue admits only one digit set
   given the current fills. The deduction is explained without filling:
   *"Row 2 (sum 16) can only be filled with {7 + 9}."*
3. **Reveal fallback** — when no cheap deduction exists, the correct digit of
   the selected (or first empty) cell is revealed instead.

Candidate legality comes from enumerating valid partitions per run
(`partitionsContaining`), so a hint never suggests a digit that contradicts
any valid completion. Each hint increments the hints counter and is announced
in a visible banner plus a polite `role="status"` live region for screen
readers.

## Puzzle generation

Layouts are generated procedurally rather than from fixed templates. Two
invariants make the rest of the engine sound:

1. **Row 0 and column 0 are always black.** Every run therefore begins at
   index ≥ 1 and is guaranteed a black host cell immediately above or to the
   left of its first white cell — which is where its clue is printed. Without
   this, a run can exist with nowhere to put its clue, and an unclued run is
   never validated, so a wrong answer can be accepted as a win.
2. **Every run has length between 2 and `maxRun`** (never more than 9, since a
   run holds distinct digits 1–9). Length-1 runs are trivially forced by their
   own clue and are considered poor construction.

The layout is solved as a constraint satisfaction problem — assign black/white
in row-major order and backtrack on conflict. Rejection sampling was measured
at 0 valid grids in 2000 attempts for an 11×11, so random scatter is not
viable; greedy repair deadlocks because splitting a long run can strand a
length-1 run perpendicular to it.

Uniqueness is enforced by **digging holes**, not by adding givens: the grid
starts fully solved and cells are removed one at a time, keeping a removal only
if exactly one solution survives. This ordering matters for speed —
`countSolutions` costs ~1s on an empty 11×11 but under a millisecond once the
board is ~40% filled, so every check stays in the cheap regime.

| Difficulty | Grid | Max run | Typical generation |
| ---------- | ---- | ------- | ------------------ |
| easy       | 7×7  | 4       | ~1 ms              |
| medium     | 9×9  | 5       | ~35 ms             |
| hard       | 11×11| 6       | ~290 ms            |

## Persistence

The board, settings, hints used, and difficulty are written to `localStorage`
whenever they change. The elapsed timer is patched separately on a 5-second
cadence via `patchSavedTimer`, so the clock survives a refresh without
re-serialising the whole board once per second. Best times and total wins are
tracked per difficulty under `kakuro:stats:v1`.

## Accessibility

- Grid cells use `role="gridcell"` with labels describing position, value, and
  whether a cell is a read-only given or in conflict.
- The grid uses a **roving tabindex**: only the selected cell is tabbable and
  it holds DOM focus, keeping Tab navigation and screen-reader position in sync
  with the game's own selection.
- Modals set `aria-modal`, trap Tab focus, close on `Escape`, and restore focus
  to the previously focused element on unmount.
- Hints are announced through a polite `role="status"` live region, mirroring
  the visible hint banner.
- All animation is disabled under `prefers-reduced-motion: reduce`, and the
  confetti particles are not even created.

## Testing

```bash
npm run test
```

Tests live next to the code they cover:

- `kakuroEngine.test.ts` — layout invariants, generation guarantees (no orphan
  clues, every run clued, clues match the solution, exactly one solution), and
  win-condition edge cases
- `App.test.tsx` — mounts the whole app: play, undo, difficulty persistence,
  modal behaviour
- `components/GameBoard.test.tsx` — cell labelling, roving tabindex, focus trap
- `hooks/usePartitions.test.ts` — partition enumerator
- `storage.test.ts` — localStorage round-trip

Test config lives in `vite.config.ts` (not a separate `vitest.config.ts`) so
tests run through the same pipeline as the app, which is what makes the
component tests possible.

## Continuous integration

`.github/workflows/ci.yml` runs lint, test, and build on Node 20 and 22 for
every push and pull request to `main`.

## License

Private / unspecified. Add a license here if you plan to publish this.
