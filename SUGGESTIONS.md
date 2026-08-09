# Kakuro — Review Findings & Outstanding Work

Status of the structural review. Items marked ✅ are implemented and covered by
tests; items under "Outstanding" are genuine remaining work.

---

## Resolved

### 🔴 Generator emitted clues that contradicted its own solution

The old generator picked one of three fixed layout templates and randomly
rotated/mirrored it. The templates only had a black border on the **top and
left** edges — the edges that host clues — so rotation moved white cells onto
row 0 / column 0, leaving runs with nowhere to print a clue. Compounding this,
the edge-case fixup computed the sum of a run starting at `(r, 0)` but wrote
`clueRight` onto `(r-1, 0)`, whose right-hand neighbour is in a *different row*.

Measured over 200 boards per difficulty, before the fix:

| Difficulty | Boards w/ white on outer border | Clue↔solution mismatches | Runs with no clue host |
| ---------- | ------------------------------- | ------------------------ | ---------------------- |
| easy       | 200/200                         | 191                      | 700                    |
| medium     | 200/200                         | 170                      | 360                    |
| hard       | 200/200                         | 84                       | 344                    |

Two user-visible defects followed:

- **Orphan clues** — clue numbers printed on black cells pointing at no run
  (134/200 easy boards affected).
- **Unconstrained runs** — runs with no clue at all, which `checkWinCondition`
  never validated. On easy, **44/300 boards accepted a provably wrong answer as
  a win**: taking the correct solution and swapping two digits inside an unclued
  run still triggered victory.

The intended solution was never *rejected*, which is why this went unnoticed —
the puzzles were too lax rather than unsolvable.

✅ Fixed by generating layouts procedurally under two enforced invariants (row 0
and column 0 black; every run length in [2, maxRun]). Clue placement is now a
single pass with no edge-case fixups, because the invariant guarantees a host
cell exists. Verified: 0 orphans, 0 mismatches, 0 unclued runs, 0 false wins.

### 🔴 `npm run test` failed on `main`

The failing assertion (`expected 20 to be undefined`) was the orphan-clue bug
being correctly caught. ✅ Fixed with the above; the suite is green.

### 🔴 No CI

Nothing ran the suite, so a red `main` went unnoticed. ✅ Added
`.github/workflows/ci.yml` (lint + test + build, Node 20 and 22).

### 🟠 Saved difficulty was silently discarded

`App.tsx` hardcoded `useState<Difficulty>('medium')` and never read the
computed `initial.difficulty`. Restoring a saved hard game showed "medium" in
the UI and generated a medium puzzle on the next "New Game". ✅ Fixed and
covered by a regression test in `App.test.tsx`.

### 🟠 Uniqueness machinery was dead code

`countSolutions` was fully implemented and exported but called from nowhere;
`INTERNAL_RETRIES = 1` made the surrounding retry loop a no-op, and a comment
conceded uniqueness was not enforced.

✅ Now a real gate. The naive approach (reveal cells until unique) was measured
too slow because `countSolutions` is expensive on a near-empty board (~1s for an
empty 11×11) and cheap once filled (<1ms at 40% givens). Inverting it — start
solved, dig holes, keep a removal only if one solution survives — keeps every
check in the cheap regime. `countSolutions` is also now node-bounded and **fails
closed**, reporting "not unique" rather than claiming uniqueness it did not
prove. Hard-puzzle generation: 933ms → 287ms.

### 🟡 Render-time recomputation

`GameBoard` called `getRunStatus` for every black cell on every render, and no
component was memoized — so every keystroke re-walked every run in the grid.
✅ Added `computeClueStatuses(board)` (one pass, memoized on `board`), wrapped
both cell views in `React.memo`, and hoisted the error lookup into a `Set`
built once per error change instead of per render.

### 🟡 Persistence wrote on every timer tick

The `saveState` effect listed `timer` as a dependency, so it re-serialised the
entire board to `localStorage` once per second. ✅ The timer is now excluded from
that effect and patched separately every 5s via `patchSavedTimer`.

### 🟡 Accessibility gaps

✅ Grid now uses a roving tabindex — only the selected cell is tabbable and it
takes DOM focus, so Tab order and screen-reader position track the game's own
selection. ✅ Modals (`RulesModal`, `VictoryModal`, `ConfirmDialog`) share a
`useFocusTrap` hook: `aria-modal`, Tab cycling within the dialog, `Escape` to
close, and focus restored on unmount. ✅ Pre-filled cells announce as
"given, read-only" (previously "pre-filled").

### 🟡 Reduced motion ignored

80 animated confetti particles, a bouncing trophy, and an error shake ran
regardless of user preference. ✅ Added a `prefers-reduced-motion` block; the
particles are also no longer created at all in that case.

### 🟡 Miscellaneous

- ✅ `shuffle` no longer mutates its argument (copies first).
- ✅ Tactics Guide is derived from `getPartitions` instead of a hardcoded list of
  ten, so it is complete and cannot drift.
- ✅ Footer no longer credits "Gemini CLI" or links to the Vite repo as if it
  were this project.
- ✅ `vitest.config.ts` merged into `vite.config.ts`, so tests share the app's
  pipeline (React plugin included) — this is what enables component tests.
- ✅ Upgraded vitest 2 → 4. Vitest 2 bundled its own nested Vite, which conflicted
  with the project's Vite 8 types and blocked the config merge.
- ✅ Removed committed `vite.log`; untracked `graphify-out/`.
- ✅ README rewritten to describe the real generation algorithm, invariants,
  measured timings, and accessibility behaviour.

---

## Outstanding

### 🟡 No mobile / touch optimisation

Interaction is keyboard-and-mouse first. There is no touch-specific affordance
(number pad on tap, swipe to navigate), and the grid does not adapt well to
narrow viewports beyond the existing `max-width: 500px` rules. Likely the
largest remaining UX gap.

### 🟢 Hard-puzzle generation cost

~290ms on the main thread for an 11×11. Acceptable but perceptible. Options:
move generation into a Web Worker, or pre-generate a small pool in idle time so
"New Game" is instant.

### 🟢 Difficulty is structural, not logical

Difficulty currently varies grid size, max run length, and how aggressively
cells are dug out. It does not reason about the *solving techniques* required
(forced singles vs. cross-run elimination), so a "hard" board can occasionally
solve more easily than a "medium" one. Grading by required technique would make
the labels meaningful.

### 🟢 `App.tsx` still holds ~20 state variables

Much better than the original ~1,300-line monolith, but the state would read
more clearly as a `useReducer` with a single game-state object, which would also
make the undo/redo stacks less error-prone.

### 🟢 Stats are minimal

Best time and total wins per difficulty. No streaks, no daily puzzle, no
history. Low effort, decent engagement return.

### 🟢 No `aria-live` announcements

Conflicts and completion are conveyed only visually (colour) and audibly. A
polite live region announcing "row complete" or "conflict in this run" would
help screen-reader users.

### 🟢 No license

`package.json` is `private: true` with no license file. Worth settling before
publishing.
