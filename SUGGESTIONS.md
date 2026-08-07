# Kakuro Project — Analysis & Improvement Suggestions

This document summarises the findings from a structural review of the codebase and lists concrete, prioritised suggestions for improvement.

---

## 1. Project Overview

A browser-based Kakuro puzzle game built with **React 19 + TypeScript + Vite**. The game generates puzzles procedurally and provides a complete interactive playing experience including undo/redo, pencil marks, sound effects, run highlighting, combination hints, and a victory celebration.

**Key source files:**

| File | Lines | Role |
|---|---|---|
| `src/kakuroEngine.ts` | 576 | All puzzle logic: types, generation, validation, run-status queries |
| `src/App.tsx` | ~1,300 | Entire UI, game state, all interaction handlers |
| `src/App.css` | ~600 | Styling (CSS variables + utility classes) |

---

## 2. Code Quality & Maintainability

### 2.1 Monolithic component
`App.tsx` is ~1,300 lines and manages 15+ state variables in a single component. Extracting the following sub-components would improve readability, testability, and reuse:
- `<GameBoard>` — grid rendering
- `<BlackCell>` / `<WhiteCell>` — individual cell rendering
- `<Sidebar>` — keypad, run info, combination guide
- `<VictoryModal>` / `<RulesModal>` — modal dialogs
- `<Keypad>` — numeric input panel

### 2.2 Duplicated engine logic
`checkWinCondition` (`kakuroEngine.ts:343–469`) contains two near-identical ~60-line blocks for checking horizontal and vertical runs. Extracting a shared `validateRun(runCoords, targetSum, board)` helper would halve this code.

`getRunStatus` (`kakuroEngine.ts:513–574`) has the same duplication between its `'h'` and `'v'` branches.

### 2.3 No tests
There are zero tests and no test framework is installed. The engine (`kakuroEngine.ts`) is pure TypeScript with no side effects — it is ideal for unit testing. Recommended coverage:
- `generateKakuroPuzzle`: verify board dimensions, all white cells have a `correctValue` in 1–9, clues match the solution.
- `checkWinCondition`: test a solved board (win), an incomplete board, a board with duplicates, and a board with wrong sums.
- `getPartitions`: verify known sums/lengths (e.g. sum=3, length=2 → `[[1,2]]`).

Suggested tooling: **Vitest** (integrates with the existing Vite config) + **@testing-library/react** for component tests.

### 2.4 README not updated
`README.md` is the default Vite scaffold template and contains no project-specific information. It should describe what the game is, how to run it locally, and how to contribute.

---

## 3. Performance

### 3.1 New `AudioContext` per sound
`App.tsx:89` creates a fresh `AudioContext` on every call to `playSound`. Browsers warn about excessive audio context creation and this causes small latency spikes. A single `AudioContext` instance should be created once (e.g. lazily on first interaction) and reused for all subsequent sounds.

### 3.2 `getRunStatus` called inside render
`App.tsx:771–786` calls `getRunStatus` for every black cell on every render to compute clue-completion styling. This is O(runs × cells-per-run) repeated work each frame. These values should be derived once after board state changes — either computed in a `useMemo` keyed on `board`, or stored alongside the board in state.

### 3.3 `isCellInActiveRun` scans on every render
`App.tsx:513–546` re-scans run boundaries for every white cell on every render. Run boundary information is deterministic from the board layout and the selected cell, and should be memoized.

### 3.4 `getPartitions` uncached
`App.tsx:561–562` recomputes all digit combinations on every call to `getSelectedCellRunsInfo`. Since the set of valid partitions for a given (sum, length) pair is fixed and finite, results can be memoized with a simple `Map<string, number[][]>` cache, or precomputed for all possible (sum, length) combinations at startup.

### 3.5 Unbounded undo stack
`App.tsx:201` appends a full board snapshot to `undoStack` on every cell change with no size cap. Over a long session this accumulates O(moves × board_size) memory. A reasonable cap (e.g. 100 entries) should be enforced.

---

## 4. Correctness & Puzzle Quality

### 4.1 Puzzles may have multiple solutions
The backtracking solver in `kakuroEngine.ts:205–238` fills digits with uniqueness-per-run but no sum constraint during solving — sums are derived from the filled values afterwards. Because of this, the uniqueness of the puzzle solution is not verified. A second solver pass (or a modified solver that checks uniqueness) should confirm that only one solution exists before the puzzle is presented to the player.

### 4.2 Limited layout variety
Only three hardcoded layout templates exist (`kakuroEngine.ts:28–58`), one per difficulty. The `randomizeLayout` function applies at most 5 symmetry transformations, giving very limited structural variety. Adding more templates per difficulty level or implementing a procedural layout generator would greatly increase replay value.

### 4.3 Infinite recursion on solver failure
If `generateKakuroPuzzle`'s internal solver fails, the function calls itself recursively (`kakuroEngine.ts:245`) without a retry limit. While this path should never be triggered by the current templates, it is an unguarded risk. A maximum retry count (e.g. 5) with a hard error fallback should be added.

---

## 5. Features & User Experience

### 5.1 Pre-revealed cells are not visually distinguished
Easy and medium puzzles pre-reveal some cells (`kakuroEngine.ts:305–316`), but these cells look identical to player-filled cells (`App.tsx:828–831` acknowledges this). Starter cells should be styled differently (e.g. a different text colour or a subtle background) so players can tell them apart from their own entries.

### 5.2 No progress persistence
Refreshing the page loses all game progress. Saving the board state to `localStorage` on every change and restoring it on load would be a meaningful UX improvement.

### 5.3 No mobile / touch optimisation
Interaction is keyboard-first (arrow keys, number keys, spacebar). There is no touch-specific handling such as a number pad appearing on cell tap or swipe-to-navigate. Given that many players would use a phone, mobile support is a significant gap.

### 5.4 "Solve Puzzle" button is too accessible
The solve button (`App.tsx:878`) is always visible with no confirmation prompt, making it easy to accidentally complete a puzzle. It should require a confirmation step or be hidden behind an expandable "Advanced" menu.

### 5.5 No persistence of scores or stats
There is no high-score list, best-time tracking, daily puzzle concept, or streak counter. Adding even basic `localStorage`-backed stats would increase engagement.

### 5.6 No accessibility (a11y) considerations
White cells are plain `<div>` elements with click handlers (`App.tsx:836`) but no `role`, `aria-label`, or keyboard focus management beyond the global `keydown` listener. Screen-reader users would find the board unnavigable. At minimum, cells should have `role="gridcell"`, `aria-selected`, and `aria-label` attributes describing their current value and run context.

---

## 6. Prioritised Action List

| Priority | Area | Action |
|---|---|---|
| 🔴 High | Testing | Add Vitest + unit tests for `kakuroEngine.ts` |
| 🔴 High | Code quality | Split `App.tsx` into sub-components |
| 🔴 High | Correctness | Verify puzzle uniqueness after generation |
| 🟡 Medium | Code quality | Extract shared `validateRun` helper in `kakuroEngine.ts` |
| 🟡 Medium | Performance | Memoize `getRunStatus` results and run-boundary data |
| 🟡 Medium | Performance | Reuse a single `AudioContext` instance |
| 🟡 Medium | UX | Distinguish pre-revealed cells visually |
| 🟡 Medium | UX | Persist game state to `localStorage` |
| 🟢 Low | UX | Add mobile/touch support |
| 🟢 Low | UX | Add `localStorage`-backed stats and best times |
| 🟢 Low | UX | Add confirmation for "Solve Puzzle" |
| 🟢 Low | Variety | Add more layout templates per difficulty |
| 🟢 Low | Accessibility | Add ARIA roles and labels to grid cells |
| 🟢 Low | Documentation | Replace default README with project-specific content |
