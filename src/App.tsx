import { useState, useEffect, useCallback, useRef } from 'react';
import {
    RotateCcw,
    RotateCw,
    Trophy,
    HelpCircle,
    Lightbulb,
    Eye,
    Pencil,
    Sparkles,
    RefreshCw,
    Sliders,
    ChevronRight,
    BookOpen,
    Volume2,
    VolumeX,
} from 'lucide-react';
import {
    generateKakuroPuzzle,
    checkWinCondition,
    getRunStatus,
} from './kakuroEngine';
import type { Board, WhiteCell } from './kakuroEngine';
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

// Programmatic partition finder
function getPartitions(sum: number, length: number, maxDigit = 9, current: number[] = []): number[][] {
    if (sum === 0 && current.length === length) {
        return [current];
    }
    if (sum < 0 || current.length === length || maxDigit < 1) {
        return [];
    }
    const partitions: number[][] = [];
    if (sum >= maxDigit) {
        partitions.push(...getPartitions(sum - maxDigit, length, maxDigit - 1, [maxDigit, ...current]));
    }
    partitions.push(...getPartitions(sum, length, maxDigit - 1, current));
    return partitions;
}

function App() {
    const [difficulty, setDifficulty] = useState<'easy' | 'medium' | 'hard'>('medium');
    const [board, setBoard] = useState<Board>(() => generateKakuroPuzzle('medium').board);
    const [selectedCell, setSelectedCell] = useState<{ r: number; c: number } | null>(null);
    const [editDirection, setEditDirection] = useState<'h' | 'v'>('h');
    const [pencilMode, setPencilMode] = useState<boolean>(false);
    const [isWon, setIsWon] = useState<boolean>(false);
    const [showVictoryModal, setShowVictoryModal] = useState<boolean>(false);
    const [errors, setErrors] = useState<{ r: number; c: number }[]>([]);
    const [showRulesModal, setShowRulesModal] = useState<boolean>(false);
    const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
    const [showErrorsMode, setShowErrorsMode] = useState<boolean>(true);

    // Stats
    const [timer, setTimer] = useState<number>(0);
    const [timerActive, setTimerActive] = useState<boolean>(true);
    const [hintsUsed, setHintsUsed] = useState<number>(0);

    // Undo/Redo Stacks
    const [undoStack, setUndoStack] = useState<BoardStateSnapshot[]>([]);
    const [redoStack, setRedoStack] = useState<BoardStateSnapshot[]>([]);

    // Confetti particles
    const [confetti, setConfetti] = useState<Confetti[]>([]);

    // Tab for sidebar guide
    const [activeTab, setActiveTab] = useState<'runs' | 'guide'>('runs');

    const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

    // Play simple synth sounds if sound is enabled
    const playSound = useCallback((type: 'select' | 'input' | 'clear' | 'error' | 'win' | 'hint') => {
      if (!soundEnabled) return;
      try {
        const AudioContextClass = window.AudioContext || (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AudioContextClass) return;
        const ctx = new AudioContextClass();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);

            const now = ctx.currentTime;

            if (type === 'select') {
                osc.type = 'sine';
                osc.frequency.setValueAtTime(300, now);
                osc.frequency.exponentialRampToValueAtTime(320, now + 0.05);
                gain.gain.setValueAtTime(0.05, now);
                gain.gain.linearRampToValueAtTime(0, now + 0.05);
                osc.start(now);
                osc.stop(now + 0.05);
            } else if (type === 'input') {
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(440, now);
                osc.frequency.exponentialRampToValueAtTime(880, now + 0.1);
                gain.gain.setValueAtTime(0.08, now);
                gain.gain.linearRampToValueAtTime(0, now + 0.1);
                osc.start(now);
                osc.stop(now + 0.1);
            } else if (type === 'clear') {
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(200, now);
                osc.frequency.linearRampToValueAtTime(100, now + 0.15);
                gain.gain.setValueAtTime(0.05, now);
                gain.gain.linearRampToValueAtTime(0, now + 0.15);
                osc.start(now);
                osc.stop(now + 0.15);
            } else if (type === 'error') {
                osc.type = 'sawtooth';
                osc.frequency.setValueAtTime(150, now);
                osc.frequency.setValueAtTime(150, now + 0.1);
                osc.frequency.setValueAtTime(120, now + 0.11);
                gain.gain.setValueAtTime(0.1, now);
                gain.gain.linearRampToValueAtTime(0, now + 0.25);
                osc.start(now);
                osc.stop(now + 0.25);
            } else if (type === 'hint') {
                osc.type = 'sine';
                osc.frequency.setValueAtTime(523.25, now); // C5
                osc.frequency.setValueAtTime(659.25, now + 0.1); // E5
                osc.frequency.setValueAtTime(783.99, now + 0.2); // G5
                gain.gain.setValueAtTime(0.06, now);
                gain.gain.linearRampToValueAtTime(0, now + 0.4);
                osc.start(now);
                osc.stop(now + 0.4);
            } else if (type === 'win') {
                // Play a beautiful triumphant chord
                const freqs = [261.63, 329.63, 392.00, 523.25, 659.25]; // C major
                freqs.forEach((f, i) => {
                    const o = ctx.createOscillator();
                    const g = ctx.createGain();
                    o.connect(g);
                    g.connect(ctx.destination);
                    o.type = 'sine';
                    o.frequency.setValueAtTime(f, now + i * 0.08);
                    g.gain.setValueAtTime(0.08, now + i * 0.08);
                    g.gain.linearRampToValueAtTime(0, now + 1.2);
                    o.start(now + i * 0.08);
                    o.stop(now + 1.2);
                });
            }
        } catch (e) {
            console.warn('Web Audio API not supported or blocked:', e);
        }
    }, [soundEnabled]);

    // Initial and subsequent board setup
    const initGame = useCallback((diff: 'easy' | 'medium' | 'hard' = difficulty) => {
        const { board: newBoard } = generateKakuroPuzzle(diff);
        setBoard(newBoard);
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
    }, [difficulty]);



    // Timer effect
    useEffect(() => {
        if (timerActive && !isWon) {
            timerRef.current = setInterval(() => {
                setTimer(t => t + 1);
            }, 1000);
        } else {
            if (timerRef.current) clearInterval(timerRef.current);
        }

        return () => {
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, [timerActive, isWon]);

    // Save current board values to Undo stack
    const saveUndoState = useCallback((currentBoard: Board) => {
        const snapshot: BoardStateSnapshot = {
            values: currentBoard.map(row => row.map(cell => cell.type === 'white' ? cell.value : '')),
            notes: currentBoard.map(row => row.map(cell => cell.type === 'white' ? [...(cell.notes || [])] : [])),
        };
        setUndoStack(prev => [...prev, snapshot]);
        setRedoStack([]); // Clear redo
    }, []);

    // Helper to deep clone current board with a snapshot values applied
    const applySnapshot = useCallback((snapshot: BoardStateSnapshot) => {
        setBoard(prevBoard => {
            const nextBoard = prevBoard.map((row, r) =>
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

            // Perform real-time validation check on snapshot load
            const winCheck = checkWinCondition(nextBoard);
            setErrors(winCheck.errors);

            return nextBoard;
        });
    }, []);

    // Undo implementation
    const handleUndo = useCallback(() => {
        if (undoStack.length === 0 || isWon) return;

        // Save current state to Redo stack first
        const currentSnapshot: BoardStateSnapshot = {
            values: board.map(row => row.map(cell => cell.type === 'white' ? cell.value : '')),
            notes: board.map(row => row.map(cell => cell.type === 'white' ? [...(cell.notes || [])] : [])),
        };
        setRedoStack(prev => [...prev, currentSnapshot]);

        const previousState = undoStack[undoStack.length - 1];
        setUndoStack(prev => prev.slice(0, -1));
        applySnapshot(previousState);
        playSound('clear');
    }, [undoStack, board, applySnapshot, isWon, playSound]);

    // Redo implementation
    const handleRedo = useCallback(() => {
        if (redoStack.length === 0 || isWon) return;

        // Save current state to Undo stack first
        const currentSnapshot: BoardStateSnapshot = {
            values: board.map(row => row.map(cell => cell.type === 'white' ? cell.value : '')),
            notes: board.map(row => row.map(cell => cell.type === 'white' ? [...(cell.notes || [])] : [])),
        };
        setUndoStack(prev => [...prev, currentSnapshot]);

        const nextState = redoStack[redoStack.length - 1];
        setRedoStack(prev => prev.slice(0, -1));
        applySnapshot(nextState);
        playSound('clear');
    }, [redoStack, board, applySnapshot, isWon, playSound]);

    // Trigger win sequence
    const triggerWin = useCallback(() => {
        setIsWon(true);
        setTimerActive(false);
        playSound('win');

        // Generate Confetti
        const colors = ['#6366f1', '#a855f7', '#10b981', '#f59e0b', '#3b82f6', '#ec4899'];
        const particles = Array.from({ length: 80 }).map((_, i) => ({
            id: i,
            left: `${Math.random() * 100}%`,
            color: colors[Math.floor(Math.random() * colors.length)],
            delay: `${Math.random() * 2}s`,
            duration: `${2.5 + Math.random() * 2}s`,
        }));
        setConfetti(particles);

        // Open victory modal slightly delayed for suspense
        setTimeout(() => {
            setShowVictoryModal(true);
        }, 600);
    }, [playSound]);

    // Handle cell input (1-9 or delete)
    const handleCellInput = useCallback((val: number | '') => {
        if (!selectedCell || isWon) return;
        const { r, c } = selectedCell;

        const cell = board[r][c];
        if (cell.type !== 'white') return;

        // If typing notes
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
                            return {
                                ...cellObj,
                                value: '', // clear value if we use pencil
                                notes: nextNotes,
                            } as WhiteCell;
                        }
                        return cellObj;
                    })
                );
                return next;
            });
            playSound('select');
            return;
        }

        // Normal value assignment
        if (cell.value === val) return; // no change

        saveUndoState(board);
        playSound(val === '' ? 'clear' : 'input');

        setBoard(prev => {
            const next = prev.map((row, currR) =>
                row.map((cellObj, currC) => {
                    if (currR === r && currC === c && cellObj.type === 'white') {
                        return {
                            ...cellObj,
                            value: val,
                            notes: [], // Clear pencil marks once a real value is set
                        } as WhiteCell;
                    }
                    return cellObj;
                })
            );

            // Validate board and check win condition
            const winCheck = checkWinCondition(next);
            setErrors(winCheck.errors);

            if (winCheck.isWin) {
                setTimeout(() => triggerWin(), 10);
            } else if (winCheck.errors.length > 0 && showErrorsMode) {
                // play subtle error sound if conflict is introduced
                const isNewError = winCheck.errors.some(err => err.r === r && err.c === c);
                if (isNewError) {
                    setTimeout(() => playSound('error'), 50);
                }
            }

            return next;
        });
    }, [selectedCell, isWon, pencilMode, board, saveUndoState, triggerWin, showErrorsMode, playSound]);

    // Navigate white cells based on arrow keys
    const navigateGrid = useCallback((dr: number, dc: number) => {
        if (!selectedCell) return;
        const { r, c } = selectedCell;
        const h = board.length;
        const w = board[0].length;

        let currR = r + dr;
        let currC = c + dc;

        // Find the next white cell in that direction (skipping black cells)
        while (currR >= 0 && currR < h && currC >= 0 && currC < w) {
            if (board[currR][currC].type === 'white') {
                setSelectedCell({ r: currR, c: currC });
                playSound('select');
                return;
            }
            currR += dr;
            currC += dc;
        }
    }, [selectedCell, board, playSound]);

    // Keyboard controls
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (isWon) return;

            // Ignore if inside text box or modal is open
            if (showVictoryModal || showRulesModal) return;

            if (e.key >= '1' && e.key <= '9') {
                handleCellInput(parseInt(e.key));
                e.preventDefault();
            } else if (e.key === 'Backspace' || e.key === 'Delete' || e.key === '0') {
                handleCellInput('');
                e.preventDefault();
            } else if (e.key === 'Spacebar' || e.key === ' ') {
                // Toggle direction
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
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [handleCellInput, navigateGrid, handleUndo, handleRedo, isWon, showVictoryModal, showRulesModal, playSound]);

    // Cell click handler
    const handleCellClick = (r: number, c: number) => {
        if (isWon) return;
        const cell = board[r][c];
        if (cell.type === 'white') {
            if (selectedCell && selectedCell.r === r && selectedCell.c === c) {
                // Clicked again - toggle active run direction!
                setEditDirection(prev => (prev === 'h' ? 'v' : 'h'));
            } else {
                setSelectedCell({ r, c });
            }
            playSound('select');
        }
    };

    // Pre-reveal one correct number as a Hint
    const handleHint = () => {
        if (!selectedCell || isWon) return;
        const { r, c } = selectedCell;
        const cell = board[r][c];
        if (cell.type !== 'white') return;

        if (cell.value === cell.correctValue) return; // already solved correctly

        saveUndoState(board);
        setHintsUsed(h => h + 1);
        playSound('hint');

        setBoard(prev => {
            const next = prev.map((row, currR) =>
                row.map((cellObj, currC) => {
                    if (currR === r && currC === c && cellObj.type === 'white') {
                        return {
                            ...cellObj,
                            value: cellObj.correctValue,
                            notes: [],
                        } as WhiteCell;
                    }
                    return cellObj;
                })
            );

            const winCheck = checkWinCondition(next);
            setErrors(winCheck.errors);
            if (winCheck.isWin) {
                setTimeout(() => triggerWin(), 10);
            }
            return next;
        });
    };

    // Solve the entire puzzle programmatically (for debugging, or lazy players!)
    const handleSolvePuzzle = () => {
        if (isWon) return;
        saveUndoState(board);
        playSound('win');

        setBoard(prev => {
            const next = prev.map((row) =>
                row.map((cellObj) => {
                    if (cellObj.type === 'white') {
                        return {
                            ...cellObj,
                            value: cellObj.correctValue,
                            notes: [],
                        } as WhiteCell;
                    }
                    return cellObj;
                })
            );
            setTimeout(() => triggerWin(), 50);
            return next;
        });
    };

    // Format elapsed seconds to MM:SS
    const formatTime = (seconds: number): string => {
        const mins = Math.floor(seconds / 60);
        const secs = seconds % 60;
        return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    };

    // Check if a cell is in the currently focused run
    const isCellInActiveRun = useCallback((r: number, c: number) => {
        if (!selectedCell) return { inHRun: false, inVRun: false };
        const { r: selR, c: selC } = selectedCell;

        // CRITICAL BOUNDS CHECK: Prevent crashes during board size transitions
        if (selR >= board.length || selC >= board[0].length) {
            return { inHRun: false, inVRun: false };
        }

        if (board[r][c].type !== 'white') return { inHRun: false, inVRun: false };

        // Find boundaries for current selected cell's horizontal run
        let minC = selC;
        while (minC >= 0 && board[selR][minC].type === 'white') minC--;
        minC++; // inclusive

        let maxC = selC;
        while (maxC < board[0].length && board[selR][maxC].type === 'white') maxC++;
        maxC--; // inclusive

        // Find boundaries for current selected cell's vertical run
        let minR = selR;
        while (minR >= 0 && board[minR][selC].type === 'white') minR--;
        minR++; // inclusive

        let maxR = selR;
        while (maxR < board.length && board[maxR][selC].type === 'white') maxR++;
        maxR--; // inclusive

        const inHRun = r === selR && c >= minC && c <= maxC;
        const inVRun = c === selC && r >= minR && r <= maxR;

        return { inHRun, inVRun };
    }, [selectedCell, board]);

    // Magic combination list computation for current cell
    const getSelectedCellRunsInfo = useCallback(() => {
        if (!selectedCell) return null;
        const { r, c } = selectedCell;

        // CRITICAL BOUNDS CHECK: Prevent crashes during board size transitions
        if (r >= board.length || c >= board[0].length) {
            return null;
        }

        const hStatus = getRunStatus(board, r, c, 'h');
        const vStatus = getRunStatus(board, r, c, 'v');

        const hCombos = getPartitions(hStatus.targetSum, hStatus.count);
        const vCombos = getPartitions(vStatus.targetSum, vStatus.count);

        return {
            h: { ...hStatus, combos: hCombos },
            v: { ...vStatus, combos: vCombos },
        };
    }, [selectedCell, board]);

    const runsInfo = getSelectedCellRunsInfo();

    return (
        <div className="app-container">
            {/* Falling Confetti Layer */}
            {isWon && (
                <div className="confetti-container">
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

            {/* Rules & Tutorial Modal */}
            {showRulesModal && (
                <div className="modal-overlay" onClick={() => setShowRulesModal(false)}>
                    <div className="modal" onClick={e => e.stopPropagation()}>
                        <button className="modal-close" onClick={() => setShowRulesModal(false)}>
                            ✕
                        </button>
                        <h2 style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem' }}>
                            <BookOpen className="text-indigo-400" />
                            How to Play Kakuro
                        </h2>
                        <div className="tutorial-content" style={{ maxHeight: '400px', overflowY: 'auto', paddingRight: '0.5rem' }}>
                            <p>
                                <strong>Kakuro</strong> (also known as Cross Sums) is a math-logic puzzle. It is very similar to crosswords, but with numbers instead of letters!
                            </p>
                            <h3 style={{ color: 'var(--color-primary-light)', fontSize: '1rem', margin: '1rem 0 0.5rem 0' }}>Core Rules:</h3>
                            <ul>
                                <li>Place digits <strong>1 through 9</strong> into the white cells. (No zeros!).</li>
                                <li>The sum of digits in each consecutive run (row or column) must equal the clue in the adjacent dark triangle cell.</li>
                                <li><strong>Across clues:</strong> Upper-right number applies to the row of cells to its right.</li>
                                <li><strong>Down clues:</strong> Lower-left number applies to the column of cells below.</li>
                                <li><strong>NO DUPLICATES:</strong> A digit <i>cannot</i> repeat within a single run. For example, a sum of 4 in 2 cells must be 1+3 (2+2 is invalid because of duplicates).</li>
                            </ul>
                            <h3 style={{ color: 'var(--color-primary-light)', fontSize: '1rem', margin: '1rem 0 0.5rem 0' }}>Pro Controls:</h3>
                            <ul>
                                <li><strong>Select cell:</strong> Click any empty white cell.</li>
                                <li><strong>Change Direction:</strong> Click the selected cell again, click the direction toggle, or press <strong>Spacebar</strong> to toggle horizontal/vertical run focus.</li>
                                <li><strong>Keyboard Play:</strong> Use numbers 1-9 to input. Backspace/Delete/0 clears a cell.</li>
                                <li><strong>Navigate:</strong> Use <strong>Arrow Keys</strong> to easily jump between white squares.</li>
                                <li><strong>Pencil/Notes:</strong> Press <strong>N</strong> or toggle the Pencil icon to write temporary notes/pencil marks in a cell.</li>
                            </ul>
                        </div>
                        <button
                            className="btn btn-primary"
                            style={{ margin: '1.5rem auto 0', display: 'block' }}
                            onClick={() => setShowRulesModal(false)}
                        >
                            Let's Play!
                        </button>
                    </div>
                </div>
            )}

            {/* Victory Modal */}
            {showVictoryModal && (
                <div className="modal-overlay">
                    <div className="modal">
                        <Trophy className="victory-icon" />
                        <h2 className="victory-title">Puzzle Complete!</h2>
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

                        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
                            <button className="btn" onClick={() => setShowVictoryModal(false)}>
                                Close
                            </button>
                            <button
                                className="btn btn-primary"
                                onClick={() => {
                                    setShowVictoryModal(false);
                                    initGame();
                                }}
                            >
                                Next Puzzle
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Top Header */}
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
                            onChange={e => {
                                const diff = e.target.value as 'easy' | 'medium' | 'hard';
                                setDifficulty(diff);
                                initGame(diff);
                            }}
                        >
                            <option value="easy">Easy</option>
                            <option value="medium">Medium</option>
                            <option value="hard">Hard</option>
                        </select>
                    </label>

                    <button className="btn btn-icon" onClick={() => setSoundEnabled(s => !s)} title="Toggle Sounds">
                        {soundEnabled ? <Volume2 size={18} /> : <VolumeX size={18} />}
                    </button>

                    <button className="btn btn-icon" onClick={() => setShowRulesModal(true)} title="How to Play">
                        <HelpCircle size={18} />
                    </button>
                </div>
            </header>

            {/* Main Grid & Side Panels */}
            <main className="main-content">
                {/* Game panel (contains board, timer, quick controls) */}
                <section className="game-panel">
                    <div className="game-controls">
                        <div className="game-stats">
                            <div className="stat-item">
                                <span className="value">{formatTime(timer)}</span>
                            </div>
                            <div className="stat-item">
                                <span style={{ fontSize: '0.75rem', textTransform: 'uppercase' }}>Hints:</span>
                                <span className="value">{hintsUsed}</span>
                            </div>
                        </div>

                        <div className="game-actions">
                            {/* Direction selector */}
                            <div className="direction-indicator">
                                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>Run focus:</span>
                                <div
                                    className="direction-toggle"
                                    onClick={() => {
                                        setEditDirection(d => (d === 'h' ? 'v' : 'h'));
                                        playSound('select');
                                    }}
                                >
                                    <span className={`direction-option ${editDirection === 'h' ? 'active' : ''}`}>
                                        Row
                                    </span>
                                    <span className={`direction-option ${editDirection === 'v' ? 'active' : ''}`}>
                                        Col
                                    </span>
                                </div>
                            </div>

                            <button className="btn btn-icon" onClick={handleUndo} disabled={undoStack.length === 0 || isWon} title="Undo (Ctrl+Z)">
                                <RotateCcw size={18} />
                            </button>
                            <button className="btn btn-icon" onClick={handleRedo} disabled={redoStack.length === 0 || isWon} title="Redo (Ctrl+Y)">
                                <RotateCw size={18} />
                            </button>
                            <button className="btn btn-icon" onClick={() => initGame()} title="Reset Game">
                                <RefreshCw size={18} />
                            </button>
                        </div>
                    </div>

                    {/* Grid structure rendering */}
                    <div className="grid-container">
                        {board.map((row, rIdx) => (
                            <div key={rIdx} className="grid-row">
                                {row.map((cell, cIdx) => {
                                    if (cell.type === 'black') {
                                        const isRightComplete =
                                            cell.clueRight !== undefined &&
                                            rIdx < board.length &&
                                            getRunStatus(board, rIdx, cIdx + 1, 'h').isComplete;
                                        const isRightOver =
                                            cell.clueRight !== undefined &&
                                            rIdx < board.length &&
                                            getRunStatus(board, rIdx, cIdx + 1, 'h').isOver;

                                        const isDownComplete =
                                            cell.clueDown !== undefined &&
                                            cIdx < board[0].length &&
                                            getRunStatus(board, rIdx + 1, cIdx, 'v').isComplete;
                                        const isDownOver =
                                            cell.clueDown !== undefined &&
                                            cIdx < board[0].length &&
                                            getRunStatus(board, rIdx + 1, cIdx, 'v').isOver;

                                        const hasClues = cell.clueRight !== undefined || cell.clueDown !== undefined;

                                        return (
                                            <div key={cIdx} className={`cell cell-black ${hasClues ? 'has-clues' : ''}`}>
                                                <div className="clue-container">
                                                    {cell.clueRight !== undefined && (
                                                        <span
                                                            className={`clue-val clue-right ${isRightComplete ? 'complete' : ''} ${isRightOver ? 'over' : ''
                                                                }`}
                                                        >
                                                            {cell.clueRight}
                                                        </span>
                                                    )}
                                                    {cell.clueDown !== undefined && (
                                                        <span
                                                            className={`clue-val clue-down ${isDownComplete ? 'complete' : ''} ${isDownOver ? 'over' : ''
                                                                }`}
                                                        >
                                                            {cell.clueDown}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        );
                                    } else {
                                        const { inHRun, inVRun } = isCellInActiveRun(rIdx, cIdx);
                                        const isSelected = selectedCell?.r === rIdx && selectedCell?.c === cIdx;
                                        const hasError = errors.some(err => err.r === rIdx && err.c === cIdx);

                                        let highlightClass = '';
                                        if (isSelected) {
                                            highlightClass = 'selected';
                                        } else if (inHRun && inVRun) {
                                            highlightClass = 'intersected';
                                        } else if (inHRun) {
                                            highlightClass = editDirection === 'h' ? 'highlight-row-active' : 'highlight-row-dim';
                                        } else if (inVRun) {
                                            highlightClass = editDirection === 'v' ? 'highlight-col-active' : 'highlight-col-dim';
                                        }

                                        // Check if it's pre-revealed (if initial generation filled it)
                                        // (we didn't explicitly store pre-revealed boolean, but we can verify if it started with a value.
                                        // To keep it simple, we don't style pre-reveals differently, or we can just render normal values).

                                        return (
                                            <div
                                                key={cIdx}
                                                className={`cell cell-white ${highlightClass} ${hasError && showErrorsMode ? 'error' : ''}`}
                                                onClick={() => handleCellClick(rIdx, cIdx)}
                                            >
                                                {cell.value !== '' ? (
                                                    <span className="cell-value">{cell.value}</span>
                                                ) : (
                                                    // Render pencil marks / notes
                                                    <div className="notes-container">
                                                        {[1, 2, 3, 4, 5, 6, 7, 8, 9].map(num => (
                                                            <div key={num} className="note-mark">
                                                                {cell.notes?.includes(num) ? num : ''}
                                                            </div>
                                                        ))}
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    }
                                })}
                            </div>
                        ))}
                    </div>

                    <div style={{ display: 'flex', gap: '0.75rem', width: '100%', justifyContent: 'space-between' }}>
                        <button
                            className="btn"
                            onClick={() => setShowErrorsMode(e => !e)}
                            title="Show conflicts in red"
                        >
                            <Eye size={16} />
                            {showErrorsMode ? 'Hide Conflicts' : 'Show Conflicts'}
                        </button>

                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button
                                className="btn"
                                onClick={handleHint}
                                disabled={!selectedCell || isWon}
                                title="Fill selected square with correct answer"
                            >
                                <Lightbulb size={16} style={{ color: 'var(--color-warning)' }} />
                                Get Hint
                            </button>
                            <button className="btn" onClick={handleSolvePuzzle} disabled={isWon} title="Instantly complete board">
                                Solve Puzzle
                            </button>
                        </div>
                    </div>
                </section>

                {/* Side panels (keyboard, current clues, formulas) */}
                <aside className="side-panel">
                    {/* Keypad Panel */}
                    <div className="panel-card">
                        <h2 style={{ justifyContent: 'space-between' }}>
                            <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                <Sliders size={18} className="text-purple-400" />
                                Keypad
                            </span>
                            <button
                                className={`btn btn-icon ${pencilMode ? 'pencil-active' : ''}`}
                                onClick={() => {
                                    setPencilMode(!pencilMode);
                                    playSound('select');
                                }}
                                style={{ padding: '0.25rem 0.5rem', width: 'auto', fontSize: '0.75rem' }}
                                title="Toggle Pencil Notes (N)"
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
                                    onClick={() => handleCellInput(num)}
                                    disabled={isWon || !selectedCell}
                                >
                                    {num}
                                </button>
                            ))}
                            <button
                                className="keypad-btn keypad-btn-wide"
                                onClick={() => handleCellInput('')}
                                disabled={isWon || !selectedCell}
                            >
                                Clear Square
                            </button>
                        </div>
                    </div>

                    {/* Runs, Status and Combinations Panel */}
                    <div className="panel-card" style={{ flexGrow: 1 }}>
                        <div className="tab-headers">
                            <button
                                className={`tab-btn ${activeTab === 'runs' ? 'active' : ''}`}
                                onClick={() => setActiveTab('runs')}
                            >
                                Run Inspector
                            </button>
                            <button
                                className={`tab-btn ${activeTab === 'guide' ? 'active' : ''}`}
                                onClick={() => setActiveTab('guide')}
                            >
                                Tactics Guide
                            </button>
                        </div>

                        {activeTab === 'runs' && (
                            <div className="inspector-detail">
                                {runsInfo ? (
                                    <>
                                        {/* Horizontal Run Status */}
                                        <div className="inspector-row">
                                            <div className="inspector-label">
                                                <ChevronRight size={14} className="text-purple-400" />
                                                <span>Horizontal Row (Across)</span>
                                            </div>
                                            <div className="inspector-values">
                                                <span
                                                    className={`inspector-sum ${runsInfo.h.isOver ? 'over' : runsInfo.h.isComplete ? 'complete' : 'normal'
                                                        }`}
                                                >
                                                    {runsInfo.h.currentSum}
                                                </span>
                                                <span className="inspector-target">/ {runsInfo.h.targetSum}</span>
                                                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                                    ({runsInfo.h.count} squares)
                                                </span>
                                            </div>
                                        </div>

                                        {runsInfo.h.combos.length > 0 && (
                                            <div style={{ marginTop: '-0.25rem', marginBottom: '0.5rem' }}>
                                                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                                    Valid combinations for {runsInfo.h.targetSum}-in-{runsInfo.h.count}:
                                                </span>
                                                <div className="combos-list" style={{ marginTop: '0.25rem', maxHeight: '80px' }}>
                                                    {runsInfo.h.combos.map((combo, idx) => (
                                                        <div key={idx} className="combo-item" style={{ padding: '0.2rem 0.4rem' }}>
                                                            <span className="combo-vals" style={{ fontSize: '0.75rem' }}>
                                                                {combo.join(', ')}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}

                                        {/* Vertical Run Status */}
                                        <div className="inspector-row">
                                            <div className="inspector-label">
                                                <ChevronRight size={14} className="text-blue-400" rotate={90} style={{ transform: 'rotate(90deg)' }} />
                                                <span>Vertical Column (Down)</span>
                                            </div>
                                            <div className="inspector-values">
                                                <span
                                                    className={`inspector-sum ${runsInfo.v.isOver ? 'over' : runsInfo.v.isComplete ? 'complete' : 'normal'
                                                        }`}
                                                >
                                                    {runsInfo.v.currentSum}
                                                </span>
                                                <span className="inspector-target">/ {runsInfo.v.targetSum}</span>
                                                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                                    ({runsInfo.v.count} squares)
                                                </span>
                                            </div>
                                        </div>

                                        {runsInfo.v.combos.length > 0 && (
                                            <div style={{ marginTop: '-0.25rem' }}>
                                                <span style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
                                                    Valid combinations for {runsInfo.v.targetSum}-in-{runsInfo.v.count}:
                                                </span>
                                                <div className="combos-list" style={{ marginTop: '0.25rem', maxHeight: '80px' }}>
                                                    {runsInfo.v.combos.map((combo, idx) => (
                                                        <div key={idx} className="combo-item" style={{ padding: '0.2rem 0.4rem' }}>
                                                            <span className="combo-vals" style={{ fontSize: '0.75rem' }}>
                                                                {combo.join(', ')}
                                                            </span>
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </>
                                ) : (
                                    <p style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: '0.85rem', margin: '2rem 0' }}>
                                        Click on any white square to inspect its current vertical & horizontal run constraints!
                                    </p>
                                )}
                            </div>
                        )}

                        {activeTab === 'guide' && (
                            <div className="tutorial-content" style={{ maxHeight: '280px', overflowY: 'auto' }}>
                                <p>Learn these crucial <strong>unique partitions</strong> to solve puzzles faster:</p>
                                <div className="combos-list">
                                    <div className="combo-item">
                                        <span className="combo-clue">Sum 3 (in 2)</span>
                                        <span className="combo-vals">1, 2</span>
                                    </div>
                                    <div className="combo-item">
                                        <span className="combo-clue">Sum 4 (in 2)</span>
                                        <span className="combo-vals">1, 3</span>
                                    </div>
                                    <div className="combo-item">
                                        <span className="combo-clue">Sum 16 (in 2)</span>
                                        <span className="combo-vals">7, 9</span>
                                    </div>
                                    <div className="combo-item">
                                        <span className="combo-clue">Sum 17 (in 2)</span>
                                        <span className="combo-vals">8, 9</span>
                                    </div>
                                    <div className="combo-item">
                                        <span className="combo-clue">Sum 6 (in 3)</span>
                                        <span className="combo-vals">1, 2, 3</span>
                                    </div>
                                    <div className="combo-item">
                                        <span className="combo-clue">Sum 7 (in 3)</span>
                                        <span className="combo-vals">1, 2, 4</span>
                                    </div>
                                    <div className="combo-item">
                                        <span className="combo-clue">Sum 23 (in 3)</span>
                                        <span className="combo-vals">6, 8, 9</span>
                                    </div>
                                    <div className="combo-item">
                                        <span className="combo-clue">Sum 24 (in 3)</span>
                                        <span className="combo-vals">7, 8, 9</span>
                                    </div>
                                    <div className="combo-item">
                                        <span className="combo-clue">Sum 10 (in 4)</span>
                                        <span className="combo-vals">1, 2, 3, 4</span>
                                    </div>
                                    <div className="combo-item">
                                        <span className="combo-clue">Sum 30 (in 4)</span>
                                        <span className="combo-vals">6, 7, 8, 9</span>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </aside>
            </main>

            {/* Footer */}
            <footer className="app-footer">
                <p>
                    Crafted with ♥ by Gemini CLI • <a href="#" onClick={(e) => { e.preventDefault(); setShowRulesModal(true); }}>How to Play</a> • <a href="https://github.com/vitejs/vite" target="_blank" rel="noreferrer">Powered by Vite</a>
                </p>
            </footer>
        </div>
    );
}

export default App;
