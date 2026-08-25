import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
    generateKakuroPuzzle,
    generateSeededPuzzle,
    checkWinCondition,
    getRunStatus,
    computeClueStatuses,
    getHint,
    getCandidatesForCell,
    serializePuzzle,
    deserializePuzzle,
    hashStringSeed,
    type PuzzleSnapshot,
} from './kakuroEngine';
import type { Board, WhiteCell } from './kakuroEngine';
import type { Difficulty } from './types';
import { useAudio } from './hooks/useAudio';
import { useRunStatus } from './hooks/useRunStatus';
import { getPartitionsCached } from './partitions';
import {
    loadState,
    saveState,
    patchSavedTimer,
    clearState,
    loadStats,
    saveStats,
    recordWin,
} from './storage';
import { Header } from './components/Header';
import { GameBoard } from './components/GameBoard';
import { GameControls } from './components/GameControls';
import { Keypad } from './components/Keypad';
import { Sidebar } from './components/Sidebar';
import { RulesModal } from './components/RulesModal';
import { VictoryModal } from './components/VictoryModal';
import { ConfirmDialog } from './components/ConfirmDialog';
import { ShareModal } from './components/ShareModal';
import { Toast } from './components/Toast';
import { useToast } from './components/toast-state';
import './App.css';

interface BoardStateSnapshot {
    values: (number | '')[][];
    notes: number[][][];
}

interface Confetti {
    id: number;
    left: string;
    color: string;
    delay: string;
    duration: string;
}

const UNDO_STACK_LIMIT = 100;

function formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function snapshotBoard(board: Board): BoardStateSnapshot {
    return {
        values: board.map(row => row.map(cell => (cell.type === 'white' ? cell.value : ''))),
        notes: board.map(row => row.map(cell => (cell.type === 'white' ? [...(cell.notes || [])] : []))),
    };
}

function applySnapshotToBoard(board: Board, snapshot: BoardStateSnapshot): Board {
    return board.map((row, r) =>
        row.map((cell, c) => {
            if (cell.type === 'white') {
                return {
                    ...cell,
                    value: snapshot.values[r][c],
                    notes: [...snapshot.notes[r][c]],
                } as WhiteCell;
            }
            return cell;
        })
    );
}

function generatePuzzleWithPreRevealed(diff: Difficulty): { board: Board; preRevealed: boolean[][] } {
    const { board, preRevealed } = generateKakuroPuzzle(diff);
    return { board, preRevealed };
}

/**
 * Returns a new board with the placed digit removed from the pencil marks of
 * every other cell in the placed cell's two runs. This keeps the player's
 * notes honest without making them manually delete every collision.
 *
 * Pure: returns a new board, does not mutate. The pencil set of the cell
 * itself is wiped because the digit replaces it.
 *
 * "Same run" is a maximal white sequence — two cells in the same grid row
 * can be in *different* runs if a black cell sits between them, so we walk
 * the row/column to confirm.
 */
function pruneNotesAfterPlacement(board: Board, r: number, c: number, val: number): Board {
  const w = board[0].length;
  const h = board.length;

  // Find the horizontal run containing (r, c).
  let hStart = c;
  while (hStart > 0 && board[r][hStart - 1].type === 'white') hStart--;
  let hEnd = c;
  while (hEnd < w - 1 && board[r][hEnd + 1].type === 'white') hEnd++;
  const inHRun = (rr: number, cc: number) =>
    rr === r && cc >= hStart && cc <= hEnd;

  // Find the vertical run containing (r, c).
  let vStart = r;
  while (vStart > 0 && board[vStart - 1][c].type === 'white') vStart--;
  let vEnd = r;
  while (vEnd < h - 1 && board[vEnd + 1][c].type === 'white') vEnd++;
  const inVRun = (rr: number, cc: number) =>
    cc === c && rr >= vStart && rr <= vEnd;

  return board.map((row, rr) =>
    row.map((cell, cc) => {
      if (cell.type !== 'white') return cell;
      if (rr === r && cc === c) {
        return { ...cell, notes: [] } as WhiteCell;
      }
      if (!inHRun(rr, cc) && !inVRun(rr, cc)) return cell;
      const notes = cell.notes || [];
      if (!notes.includes(val)) return cell;
      return { ...cell, notes: notes.filter(n => n !== val) } as WhiteCell;
    })
  );
}

function findFirstPlayableCell(board: Board, preRevealed: boolean[][]): { r: number; c: number } | null {
    for (let r = 0; r < board.length; r += 1) {
        for (let c = 0; c < board[r].length; c += 1) {
            if (board[r][c].type === 'white' && !preRevealed[r]?.[c]) return { r, c };
        }
    }
    return null;
}

function App() {
    const initial = useMemo(() => {
        // Priority 1: an in-progress saved game.
        const saved = loadState();
        if (saved) {
            return {
                difficulty: saved.difficulty,
                board: saved.board,
                preRevealed: saved.preRevealed,
                timer: saved.timer,
                hintsUsed: saved.hintsUsed,
                editDirection: saved.editDirection,
                pencilMode: saved.pencilMode,
                showErrorsMode: saved.showErrorsMode,
            };
        }
        // Priority 2: a shared puzzle in the URL hash.
        if (typeof window !== 'undefined' && window.location.hash.length > 1) {
            const code = window.location.hash.slice(1);
            const snap = deserializePuzzle(code);
            if (snap) {
                return {
                    difficulty: snap.difficulty,
                    board: snap.board,
                    preRevealed: snap.preRevealed,
                    timer: 0,
                    hintsUsed: 0,
                    editDirection: 'h' as 'h' | 'v',
                    pencilMode: false,
                    showErrorsMode: true,
                };
            }
        }
        // Priority 3: a fresh puzzle at medium difficulty.
        const { board, preRevealed } = generatePuzzleWithPreRevealed('medium');
        return {
            difficulty: 'medium' as Difficulty,
            board,
            preRevealed,
            timer: 0,
            hintsUsed: 0,
            editDirection: 'h' as 'h' | 'v',
            pencilMode: false,
            showErrorsMode: true,
        };
    }, []);

    // Seeded from the saved game so a restored hard puzzle does not report
    // itself as medium (and so the next "New Game" uses the right difficulty).
    const [difficulty, setDifficulty] = useState<Difficulty>(initial.difficulty);

    const [board, setBoard] = useState<Board>(initial.board);
    const [preRevealed, setPreRevealed] = useState<boolean[][]>(initial.preRevealed);
    const [selectedCell, setSelectedCell] = useState<{ r: number; c: number } | null>(() =>
        findFirstPlayableCell(initial.board, initial.preRevealed)
    );
    const [editDirection, setEditDirection] = useState<'h' | 'v'>(initial.editDirection);
    const [pencilMode, setPencilMode] = useState<boolean>(initial.pencilMode);
    const [isWon, setIsWon] = useState<boolean>(false);
    const [showVictoryModal, setShowVictoryModal] = useState<boolean>(false);
    const [errors, setErrors] = useState<{ r: number; c: number }[]>([]);
    const [showRulesModal, setShowRulesModal] = useState<boolean>(false);
    const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
    const [showErrorsMode, setShowErrorsMode] = useState<boolean>(initial.showErrorsMode);
    const [showSolveConfirm, setShowSolveConfirm] = useState<boolean>(false);
    const [hintMessage, setHintMessage] = useState<string | null>(null);
    const [showShareModal, setShowShareModal] = useState<boolean>(false);

    // Lightweight ephemeral feedback ("Copied!", "Daily challenge loaded", …)
    // shown as a transient toast. Independent of the modal stack.
    const { toast, showToast } = useToast();

    // Stats
    const [timer, setTimer] = useState<number>(initial.timer);
    const [timerActive, setTimerActive] = useState<boolean>(true);
    const [hintsUsed, setHintsUsed] = useState<number>(initial.hintsUsed);
    const [stats, setStats] = useState(() => loadStats());

    // Undo/Redo Stacks
    const [undoStack, setUndoStack] = useState<BoardStateSnapshot[]>([]);
    const [redoStack, setRedoStack] = useState<BoardStateSnapshot[]>([]);

    // Confetti particles
    const [confetti, setConfetti] = useState<Confetti[]>([]);

    const timerRef = useRef<number | null>(null);
    const playSound = useAudio(soundEnabled);

    // Latest elapsed seconds, readable from effects without making them
    // re-run every tick.
    const elapsedRef = useRef(timer);
    useEffect(() => {
        elapsedRef.current = timer;
    }, [timer]);

    // Persist the board and settings. The timer is deliberately NOT a
    // dependency: including it re-serialised the whole board to localStorage
    // once per second. The elapsed time is saved separately below.
    useEffect(() => {
        if (isWon) return;
        saveState({
            board,
            timer: elapsedRef.current,
            hintsUsed,
            difficulty,
            preRevealed,
            editDirection,
            pencilMode,
            showErrorsMode,
            startEpochMs: Date.now(),
        });
    }, [board, hintsUsed, difficulty, preRevealed, editDirection, pencilMode, showErrorsMode, isWon]);

    // Persist just the elapsed seconds on a coarse cadence, so a refresh does
    // not lose the clock but we also do not thrash localStorage.
    useEffect(() => {
        if (isWon) return;
        const id = window.setInterval(() => {
            patchSavedTimer(elapsedRef.current);
        }, 5000);
        return () => window.clearInterval(id);
    }, [isWon]);

    // Timer effect
    useEffect(() => {
        if (timerActive && !isWon) {
            timerRef.current = window.setInterval(() => {
                setTimer(t => t + 1);
            }, 1000);
        }
        return () => {
            if (timerRef.current !== null) {
                window.clearInterval(timerRef.current);
                timerRef.current = null;
            }
        };
    }, [timerActive, isWon]);

    const startNewGame = useCallback(
        (diff: Difficulty = difficulty, opts: { seed?: number; snapshot?: PuzzleSnapshot } = {}) => {
            let newBoard: Board;
            let newPre: boolean[][];
            if (opts.snapshot) {
                newBoard = opts.snapshot.board;
                newPre = opts.snapshot.preRevealed;
                setDifficulty(opts.snapshot.difficulty);
            } else if (opts.seed !== undefined) {
                const seeded = generateSeededPuzzle(opts.seed, diff);
                newBoard = seeded.board;
                newPre = seeded.preRevealed;
            } else {
                const fresh = generatePuzzleWithPreRevealed(diff);
                newBoard = fresh.board;
                newPre = fresh.preRevealed;
            }
            setBoard(newBoard);
            setPreRevealed(newPre);
            setSelectedCell(findFirstPlayableCell(newBoard, newPre));
            setTimer(0);
            setTimerActive(true);
            setHintsUsed(0);
            setUndoStack([]);
            setRedoStack([]);
            setIsWon(false);
            // Invalidate any in-flight victory modal that hasn't fired yet.
            winStillValidRef.current = false;
            setShowVictoryModal(false);
            setErrors([]);
            setConfetti([]);
            setHintMessage(null);
            clearState();
        },
        [difficulty]
    );

    const handleDifficultyChange = useCallback(
        (d: Difficulty) => {
            setDifficulty(d);
            startNewGame(d);
        },
        [startNewGame]
    );

    /**
     * Copy a shareable code for the current puzzle to the clipboard. The
     * code is generated from the snapshot, not the live board, so a player
     * halfway through can still hand the puzzle to a friend.
     */
    const handleShare = useCallback(() => {
        const solution: number[][] = board.map(row =>
            row.map(cell => (cell.type === 'white' ? cell.correctValue : 0))
        );
        const snapshot: PuzzleSnapshot = {
            difficulty,
            board: board.map(row =>
                row.map(cell =>
                    cell.type === 'white' ? { ...cell, value: '', notes: [] } : cell
                )
            ),
            solution,
            preRevealed,
        };
        const code = serializePuzzle(snapshot);
        const fullUrl = `${window.location.origin}${window.location.pathname}#${code}`;
        const copy = async () => {
            try {
                if (navigator.clipboard?.writeText) {
                    await navigator.clipboard.writeText(fullUrl);
                    showToast('Link copied to clipboard', 'success');
                } else {
                    // Fallback for older browsers: expose the code in the modal
                    setShowShareModal(true);
                }
            } catch {
                setShowShareModal(true);
            }
        };
        void copy();
    }, [board, difficulty, preRevealed, showToast]);

    /**
     * Load today's daily challenge. Two players opening the app on the same
     * calendar day see the same puzzle (UTC date — fine for a fun feature,
     * keeps the math simple).
     */
    const handleDailyChallenge = useCallback(() => {
        const today = new Date();
        const dayKey = `${today.getUTCFullYear()}-${today.getUTCMonth() + 1}-${today.getUTCDate()}`;
        const seed = hashStringSeed(`kakuro:daily:${dayKey}`);
        startNewGame(difficulty, { seed });
        showToast(`Daily challenge loaded (${dayKey})`, 'info');
    }, [difficulty, startNewGame, showToast]);

    const saveUndoState = useCallback((currentBoard: Board) => {
        setUndoStack(prev => {
            const next = [...prev, snapshotBoard(currentBoard)];
            if (next.length > UNDO_STACK_LIMIT) next.shift();
            return next;
        });
        setRedoStack([]);
    }, []);

    const handleUndo = useCallback(() => {
        if (undoStack.length === 0 || isWon) return;
        setRedoStack(prev => [...prev, snapshotBoard(board)]);
        setUndoStack(prev => prev.slice(0, -1));
        setBoard(prev => {
            const nextBoard = applySnapshotToBoard(prev, undoStack[undoStack.length - 1]);
            const winCheck = checkWinCondition(nextBoard);
            setErrors(winCheck.errors);
            return nextBoard;
        });
        playSound('clear');
    }, [undoStack, board, isWon, playSound]);

    const handleRedo = useCallback(() => {
        if (redoStack.length === 0 || isWon) return;
        setUndoStack(prev => {
            const next = [...prev, snapshotBoard(board)];
            if (next.length > UNDO_STACK_LIMIT) next.shift();
            return next;
        });
        setRedoStack(prev => prev.slice(0, -1));
        setBoard(prev => {
            const nextBoard = applySnapshotToBoard(prev, redoStack[redoStack.length - 1]);
            const winCheck = checkWinCondition(nextBoard);
            setErrors(winCheck.errors);
            return nextBoard;
        });
        playSound('clear');
    }, [redoStack, board, isWon, playSound]);

    // Tracks whether a win is "live" — false after the user starts a new game
    // mid-celebration, so the deferred victory modal doesn't pop up over a
    // fresh, unsolved board. Read inside the triggerWin setTimeout. Mutated
    // synchronously in handlers, not via an effect, so the lint rule for
    // setState-in-effect does not fire.
    const winStillValidRef = useRef(false);

    const triggerWin = useCallback(() => {
        setIsWon(true);
        // eslint-disable-next-line react-hooks/immutability -- imperative flag for the deferred modal
        winStillValidRef.current = true;
        setTimerActive(false);
        playSound('win');

        // Skip building particles at all when the user asked for reduced
        // motion; the CSS hides them, but there is no reason to create them.
        const prefersReducedMotion =
            typeof window !== 'undefined' &&
            window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

        if (!prefersReducedMotion) {
            const colors = ['#6366f1', '#a855f7', '#10b981', '#f59e0b', '#3b82f6', '#ec4899'];
            const particles = Array.from({ length: 80 }).map((_, i) => ({
                id: i,
                left: `${Math.random() * 100}%`,
                color: colors[Math.floor(Math.random() * colors.length)],
                delay: `${Math.random() * 2}s`,
                duration: `${2.5 + Math.random() * 2}s`,
            }));
            setConfetti(particles);
        }

        // Read the latest timer and difficulty via refs so the win path
        // stays stable and never fires twice.
        const t = elapsedRef.current;
        setStats(prev => {
            const next = recordWin(difficulty, t, prev);
            saveStats(next);
            return next;
        });
        clearState();

        setTimeout(() => {
            // If the user started a new game during the confetti animation,
            // the win is no longer current and we must not show the modal
            // over the new, unsolved board.
            if (winStillValidRef.current) {
                setShowVictoryModal(true);
            }
        }, 600);
    }, [playSound, difficulty]);

    const handleCellInput = useCallback(
        (val: number | '') => {
            if (!selectedCell || isWon) return;
            const { r, c } = selectedCell;
            const cell = board[r][c];
            if (cell.type !== 'white' || preRevealed[r]?.[c]) return;

            if (pencilMode && val !== '') {
                saveUndoState(board);
                setBoard(prev => {
                    const next = prev.map((row, currR) =>
                        row.map((cellObj, currC) => {
                            if (currR === r && currC === c && cellObj.type === 'white') {
                                const currentNotes = cellObj.notes || [];
                                const nextNotes = currentNotes.includes(val)
                                    ? currentNotes.filter(n => n !== val)
                                    : [...currentNotes, val].sort();
                                return { ...cellObj, value: '', notes: nextNotes } as WhiteCell;
                            }
                            return cellObj;
                        })
                    );
                    return next;
                });
                playSound('select');
                return;
            }

            if (cell.value === val) return;

            saveUndoState(board);
            playSound(val === '' ? 'clear' : 'input');

            setBoard(prev => {
                // Place the digit, then prune matching notes from the rest of
                // its two runs. The notes the player scribbled are stale
                // the moment another cell in the run takes a value.
                const placed = prev.map((row, currR) =>
                    row.map((cellObj, currC) => {
                        if (currR === r && currC === c && cellObj.type === 'white') {
                            return { ...cellObj, value: val, notes: [] } as WhiteCell;
                        }
                        return cellObj;
                    })
                );
                const next = val === '' ? placed : pruneNotesAfterPlacement(placed, r, c, val);
                const winCheck = checkWinCondition(next);
                setErrors(winCheck.errors);
                if (winCheck.isWin) {
                    // Defer the win until the next tick so React commits the
                    // board state first; the win handler reads from refs/state
                    // that need to be settled.
                    setTimeout(() => triggerWin(), 0);
                } else if (winCheck.errors.length > 0 && showErrorsMode) {
                    const isNewError = winCheck.errors.some(err => err.r === r && err.c === c);
                    if (isNewError) {
                        setTimeout(() => playSound('error'), 50);
                    }
                }
                return next;
            });
        },
        [selectedCell, isWon, pencilMode, board, preRevealed, saveUndoState, triggerWin, showErrorsMode, playSound]
    );

    const navigateGrid = useCallback(
        (dr: number, dc: number) => {
            if (!selectedCell) return;
            const { r, c } = selectedCell;
            const h = board.length;
            const w = board[0].length;
            let currR = r + dr;
            let currC = c + dc;
            while (currR >= 0 && currR < h && currC >= 0 && currC < w) {
                if (board[currR][currC].type === 'white') {
                    setSelectedCell({ r: currR, c: currC });
                    playSound('select');
                    return;
                }
                currR += dr;
                currC += dc;
            }
        },
        [selectedCell, board, playSound]
    );

    // Keyboard controls
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (isWon) return;
            if (showVictoryModal || showRulesModal || showSolveConfirm) return;
            if (e.key >= '1' && e.key <= '9') {
                handleCellInput(parseInt(e.key));
                e.preventDefault();
            } else if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') {
                handleCellInput('');
                e.preventDefault();
            } else if (e.key === ' ' || e.key === 'Spacebar') {
                setEditDirection(prev => (prev === 'h' ? 'v' : 'h'));
                playSound('select');
                e.preventDefault();
            } else if (e.key === 'ArrowUp') {
                navigateGrid(-1, 0);
                e.preventDefault();
            } else if (e.key === 'ArrowDown') {
                navigateGrid(1, 0);
                e.preventDefault();
            } else if (e.key === 'ArrowLeft') {
                navigateGrid(0, -1);
                e.preventDefault();
            } else if (e.key === 'ArrowRight') {
                navigateGrid(0, 1);
                e.preventDefault();
            } else if (e.key === 'z' && (e.ctrlKey || e.metaKey)) {
                handleUndo();
                e.preventDefault();
            } else if (e.key === 'y' && (e.ctrlKey || e.metaKey)) {
                handleRedo();
                e.preventDefault();
            } else if (e.key === 'n' || e.key === 'N') {
                setPencilMode(prev => !prev);
                playSound('select');
                e.preventDefault();
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [
        handleCellInput,
        navigateGrid,
        handleUndo,
        handleRedo,
        isWon,
        showVictoryModal,
        showRulesModal,
        showSolveConfirm,
        playSound,
    ]);

    const handleCellClick = useCallback(
        (r: number, c: number) => {
            if (isWon) return;
            const cell = board[r][c];
            if (cell.type === 'white') {
                if (selectedCell && selectedCell.r === r && selectedCell.c === c) {
                    setEditDirection(prev => (prev === 'h' ? 'v' : 'h'));
                } else {
                    setSelectedCell({ r, c });
                }
                playSound('select');
            }
        },
        [board, isWon, selectedCell, playSound]
    );

    const handleHint = useCallback(() => {
        if (isWon) return;
        const hint = getHint(board, selectedCell ?? undefined);
        setHintsUsed(h => h + 1);
        playSound('hint');
        setHintMessage(hint.message);

        if ((hint.kind === 'single' || hint.kind === 'reveal') && hint.cell && hint.value !== undefined) {
            const { r, c } = hint.cell;
            const cell = board[r][c];
            if (cell.type !== 'white' || preRevealed[r]?.[c] || cell.value === hint.value) return;

            saveUndoState(board);
            setSelectedCell({ r, c });
            setBoard(prev => {
                const next = prev.map((row, currR) =>
                    row.map((cellObj, currC) => {
                        if (currR === r && currC === c && cellObj.type === 'white') {
                            return { ...cellObj, value: hint.value, notes: [] } as WhiteCell;
                        }
                        return cellObj;
                    })
                );
                const winCheck = checkWinCondition(next);
                setErrors(winCheck.errors);
                if (winCheck.isWin) setTimeout(() => triggerWin(), 10);
                return next;
            });
        }
    }, [isWon, board, selectedCell, preRevealed, saveUndoState, playSound, triggerWin]);

    const handleSolvePuzzle = useCallback(() => {
        if (isWon) return;
        saveUndoState(board);
        playSound('win');
        setBoard(prev => {
            const next = prev.map(row =>
                row.map(cellObj => {
                    if (cellObj.type === 'white') {
                        return { ...cellObj, value: cellObj.correctValue, notes: [] } as WhiteCell;
                    }
                    return cellObj;
                })
            );
            setTimeout(() => triggerWin(), 0);
            return next;
        });
    }, [isWon, board, saveUndoState, triggerWin, playSound]);

    const runStatusByCell = useRunStatus(board, selectedCell);

    // Computed once per board change instead of per black cell per render.
    const clueStatuses = useMemo(() => computeClueStatuses(board), [board]);

    const errorSet = useMemo(
        () => new Set(errors.map(e => `${e.r},${e.c}`)),
        [errors]
    );

    const runsInfo = useMemo(() => {
        if (!selectedCell) return null;
        const { r, c } = selectedCell;
        if (r >= board.length || c >= board[0].length) return null;
        const hStatus = getRunStatus(board, r, c, 'h');
        const vStatus = getRunStatus(board, r, c, 'v');
        const candidates = getCandidatesForCell(board, r, c);
        return {
            h: { ...hStatus, combos: getPartitionsCached(hStatus.targetSum, hStatus.count) },
            v: { ...vStatus, combos: getPartitionsCached(vStatus.targetSum, vStatus.count) },
            candidates,
        };
    }, [board, selectedCell]);

    // Live-region announcement derived from current state. The aria-live
    // region re-renders whenever this string changes; identical content
    // produces no announcement, so transient states are not noisy.
    const announcement = useMemo(() => {
        if (hintMessage) return hintMessage;
        if (isWon) return 'Puzzle solved';
        if (errors.length > 0) return 'Conflict in this run';
        if (selectedCell) {
            const status = getRunStatus(board, selectedCell.r, selectedCell.c, 'h');
            if (status.isComplete) return 'Row complete';
        }
        return '';
    }, [hintMessage, isWon, errors, selectedCell, board]);

    return (
        <div className="app-container">
            {isWon && (
                <div className="confetti-container" aria-hidden="true">
                    {confetti.map(p => (
                        <div
                            key={p.id}
                            className="confetti-particle"
                            style={{
                                left: p.left,
                                backgroundColor: p.color,
                                animationDelay: p.delay,
                                animationDuration: p.duration,
                            }}
                        />
                    ))}
                </div>
            )}

            {/* Live region for screen-reader announcements of conflicts, run
                completion, and win. Polite because none of this is urgent. */}
            <div className="sr-only" role="status" aria-live="polite" aria-atomic="true">
                {announcement}
            </div>

            {showRulesModal && <RulesModal onClose={() => setShowRulesModal(false)} />}

            {showSolveConfirm && (
                <ConfirmDialog
                    title="Solve the entire puzzle?"
                    message="This will fill in every cell with the correct answer. The action is undoable but counts as a win for stats purposes."
                    confirmLabel="Solve Now"
                    cancelLabel="Keep Playing"
                    destructive
                    onConfirm={() => {
                        setShowSolveConfirm(false);
                        handleSolvePuzzle();
                    }}
                    onCancel={() => setShowSolveConfirm(false)}
                />
            )}

            {showShareModal && (
                <ShareModal
                    url={`${typeof window !== 'undefined' ? window.location.origin + window.location.pathname : ''}#${serializePuzzle({
                        difficulty,
                        board: board.map(row =>
                            row.map(cell =>
                                cell.type === 'white' ? { ...cell, value: '', notes: [] } : cell
                            )
                        ),
                        solution: board.map(row =>
                            row.map(cell => (cell.type === 'white' ? cell.correctValue : 0))
                        ),
                        preRevealed,
                    })}`}
                    onClose={() => setShowShareModal(false)}
                />
            )}

            {showVictoryModal && (
                <VictoryModal
                    difficulty={difficulty}
                    timer={timer}
                    hintsUsed={hintsUsed}
                    formatTime={formatTime}
                    bestTime={stats.bestTimes[difficulty] ?? null}
                    onClose={() => setShowVictoryModal(false)}
                    onNewPuzzle={() => startNewGame()}
                />
            )}

            <Header
                difficulty={difficulty}
                onDifficultyChange={handleDifficultyChange}
                soundEnabled={soundEnabled}
                onToggleSound={() => setSoundEnabled(s => !s)}
                onShowRules={() => setShowRulesModal(true)}
            />

            <div className="sr-only" role="status" aria-live="polite">
                {hintMessage ?? ''}
            </div>
            {hintMessage && (
                <div className="hint-banner" role="note">
                    <span>{hintMessage}</span>
                    <button
                        className="btn btn-icon"
                        aria-label="Dismiss hint"
                        onClick={() => setHintMessage(null)}
                    >
                        ×
                    </button>
                </div>
            )}

            <main className="main-content">
                <section className="game-panel">
                    <GameControls
                        timer={timer}
                        hintsUsed={hintsUsed}
                        formatTime={formatTime}
                        editDirection={editDirection}
                        onToggleDirection={() => {
                            setEditDirection(d => (d === 'h' ? 'v' : 'h'));
                            playSound('select');
                        }}
                        onUndo={handleUndo}
                        canUndo={undoStack.length > 0 && !isWon}
                        onRedo={handleRedo}
                        canRedo={redoStack.length > 0 && !isWon}
                        onReset={() => startNewGame()}
                        onToggleErrors={() => setShowErrorsMode(e => !e)}
                        showErrors={showErrorsMode}
                        onHint={handleHint}
                        hintDisabled={isWon}
                        onSolveRequest={() => setShowSolveConfirm(true)}
                        solveDisabled={isWon}
                        onShare={handleShare}
                        onDaily={handleDailyChallenge}
                    />

                    <GameBoard
                        board={board}
                        preRevealed={preRevealed}
                        selectedCell={selectedCell}
                        editDirection={editDirection}
                        errorSet={errorSet}
                        showErrors={showErrorsMode}
                        runStatusByCell={runStatusByCell}
                        clueStatuses={clueStatuses}
                        onCellClick={handleCellClick}
                    />
                </section>

                <aside className="side-panel">
                    <Keypad
                        pencilMode={pencilMode}
                        onTogglePencil={() => {
                            setPencilMode(p => !p);
                            playSound('select');
                        }}
                        onInput={handleCellInput}
                        disabled={isWon || !selectedCell || (selectedCell ? preRevealed[selectedCell.r]?.[selectedCell.c] : false)}
                    />
                    <Sidebar runsInfo={runsInfo} />
                </aside>
            </main>

            <footer className="app-footer">
                <p>
                    A Kakuro puzzle generator and player •{' '}
                    <a
                        href="#"
                        onClick={e => {
                            e.preventDefault();
                            setShowRulesModal(true);
                        }}
                    >
                        How to Play
                    </a>
                </p>
            </footer>

            <Toast toast={toast} />
        </div>
    );
}

export default App;
