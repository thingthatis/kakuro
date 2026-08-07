import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
    generateKakuroPuzzle,
    checkWinCondition,
    getRunStatus,
} from './kakuroEngine';
import type { Board, WhiteCell } from './kakuroEngine';
import type { Difficulty } from './types';
import { useAudio } from './hooks/useAudio';
import { useRunStatus } from './hooks/useRunStatus';
import { getPartitionsCached } from './hooks/usePartitions';
import {
    loadState,
    saveState,
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

function App() {
    const [difficulty, setDifficulty] = useState<Difficulty>('medium');
    const initial = useMemo(() => {
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

    const [board, setBoard] = useState<Board>(initial.board);
    const [preRevealed, setPreRevealed] = useState<boolean[][]>(initial.preRevealed);
    const [selectedCell, setSelectedCell] = useState<{ r: number; c: number } | null>(null);
    const [editDirection, setEditDirection] = useState<'h' | 'v'>(initial.editDirection);
    const [pencilMode, setPencilMode] = useState<boolean>(initial.pencilMode);
    const [isWon, setIsWon] = useState<boolean>(false);
    const [showVictoryModal, setShowVictoryModal] = useState<boolean>(false);
    const [errors, setErrors] = useState<{ r: number; c: number }[]>([]);
    const [showRulesModal, setShowRulesModal] = useState<boolean>(false);
    const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
    const [showErrorsMode, setShowErrorsMode] = useState<boolean>(initial.showErrorsMode);
    const [showSolveConfirm, setShowSolveConfirm] = useState<boolean>(false);

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

    // Persist state to localStorage on changes.
    useEffect(() => {
        if (isWon) return;
        saveState({
            board,
            timer,
            hintsUsed,
            difficulty,
            preRevealed,
            editDirection,
            pencilMode,
            showErrorsMode,
            startEpochMs: Date.now(),
        });
    }, [board, timer, hintsUsed, difficulty, preRevealed, editDirection, pencilMode, showErrorsMode, isWon]);

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
        (diff: Difficulty = difficulty) => {
            const { board: newBoard, preRevealed: newPre } = generatePuzzleWithPreRevealed(diff);
            setBoard(newBoard);
            setPreRevealed(newPre);
            setSelectedCell(null);
            setTimer(0);
            setTimerActive(true);
            setHintsUsed(0);
            setUndoStack([]);
            setRedoStack([]);
            setIsWon(false);
            setShowVictoryModal(false);
            setErrors([]);
            setConfetti([]);
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

    const triggerWin = useCallback(() => {
        setIsWon(true);
        setTimerActive(false);
        playSound('win');

        const colors = ['#6366f1', '#a855f7', '#10b981', '#f59e0b', '#3b82f6', '#ec4899'];
        const particles = Array.from({ length: 80 }).map((_, i) => ({
            id: i,
            left: `${Math.random() * 100}%`,
            color: colors[Math.floor(Math.random() * colors.length)],
            delay: `${Math.random() * 2}s`,
            duration: `${2.5 + Math.random() * 2}s`,
        }));
        setConfetti(particles);

        // Update best time + win count
        setStats(prev => {
            const next = recordWin(difficulty, timer, prev);
            saveStats(next);
            return next;
        });
        clearState();

        setTimeout(() => setShowVictoryModal(true), 600);
    }, [playSound, difficulty, timer]);

    const handleCellInput = useCallback(
        (val: number | '') => {
            if (!selectedCell || isWon) return;
            const { r, c } = selectedCell;
            const cell = board[r][c];
            if (cell.type !== 'white') return;

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
                const next = prev.map((row, currR) =>
                    row.map((cellObj, currC) => {
                        if (currR === r && currC === c && cellObj.type === 'white') {
                            return { ...cellObj, value: val, notes: [] } as WhiteCell;
                        }
                        return cellObj;
                    })
                );
                const winCheck = checkWinCondition(next);
                setErrors(winCheck.errors);
                if (winCheck.isWin) {
                    setTimeout(() => triggerWin(), 10);
                } else if (winCheck.errors.length > 0 && showErrorsMode) {
                    const isNewError = winCheck.errors.some(err => err.r === r && err.c === c);
                    if (isNewError) {
                        setTimeout(() => playSound('error'), 50);
                    }
                }
                return next;
            });
        },
        [selectedCell, isWon, pencilMode, board, saveUndoState, triggerWin, showErrorsMode, playSound]
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
        if (!selectedCell || isWon) return;
        const { r, c } = selectedCell;
        const cell = board[r][c];
        if (cell.type !== 'white') return;
        if (cell.value === cell.correctValue) return;

        saveUndoState(board);
        setHintsUsed(h => h + 1);
        playSound('hint');

        setBoard(prev => {
            const next = prev.map((row, currR) =>
                row.map((cellObj, currC) => {
                    if (currR === r && currC === c && cellObj.type === 'white') {
                        return { ...cellObj, value: cellObj.correctValue, notes: [] } as WhiteCell;
                    }
                    return cellObj;
                })
            );
            const winCheck = checkWinCondition(next);
            setErrors(winCheck.errors);
            if (winCheck.isWin) setTimeout(() => triggerWin(), 10);
            return next;
        });
    }, [selectedCell, isWon, board, saveUndoState, playSound, triggerWin]);

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
            setTimeout(() => triggerWin(), 50);
            return next;
        });
    }, [isWon, board, saveUndoState, playSound, triggerWin]);

    const runStatusByCell = useRunStatus(board, selectedCell);

    const runsInfo = useMemo(() => {
        if (!selectedCell) return null;
        const { r, c } = selectedCell;
        if (r >= board.length || c >= board[0].length) return null;
        const hStatus = getRunStatus(board, r, c, 'h');
        const vStatus = getRunStatus(board, r, c, 'v');
        return {
            h: { ...hStatus, combos: getPartitionsCached(hStatus.targetSum, hStatus.count) },
            v: { ...vStatus, combos: getPartitionsCached(vStatus.targetSum, vStatus.count) },
        };
    }, [board, selectedCell]);

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
                        hintDisabled={!selectedCell || isWon}
                        onSolveRequest={() => setShowSolveConfirm(true)}
                        solveDisabled={isWon}
                    />

                    <GameBoard
                        board={board}
                        preRevealed={preRevealed}
                        selectedCell={selectedCell}
                        editDirection={editDirection}
                        errors={errors}
                        showErrors={showErrorsMode}
                        runStatusByCell={runStatusByCell}
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
                        disabled={isWon || !selectedCell}
                    />
                    <Sidebar runsInfo={runsInfo} />
                </aside>
            </main>

            <footer className="app-footer">
                <p>
                    Crafted with ♥ by Gemini CLI •{' '}
                    <a
                        href="#"
                        onClick={e => {
                            e.preventDefault();
                            setShowRulesModal(true);
                        }}
                    >
                        How to Play
                    </a>{' '}
                    • <a href="https://github.com/vitejs/vite" target="_blank" rel="noreferrer">Powered by Vite</a>
                </p>
            </footer>
        </div>
    );
}

export default App;
