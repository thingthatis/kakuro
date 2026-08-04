// Kakuro Puzzle Engine and Generator

export interface BlackCell {
  type: 'black';
  clueRight?: number; // Clue for horizontal run to the right
  clueDown?: number;  // Clue for vertical run down
}

export interface WhiteCell {
  type: 'white';
  value: number | ''; // Player's current input
  correctValue: number; // The correct digit from the generator
  notes?: number[];   // Pencil marks (1-9)
}

export type Cell = BlackCell | WhiteCell;

export type Board = Cell[][];

// Represent coordinates
interface Coord {
  r: number;
  c: number;
}

// Pre-defined symmetrical layouts
// 'B' = Black cell, 'W' = White cell
const LAYOUT_TEMPLATES: Record<string, string[]> = {
  easy: [
    'B B B B B B',
    'B W W B W W',
    'B W W W W W',
    'B B W W B B',
    'B W W W W W',
    'B W W B W W',
  ],
  medium: [
    'B B B B B B B B',
    'B W W W B W W W',
    'B W W W W W W W',
    'B B W W W W B B',
    'B B W W W W B B',
    'B W W W W W W W',
    'B W W W B W W W',
    'B B B B B B B B',
  ],
  hard: [
    'B B B B B B B B B B',
    'B W W W B B W W W B',
    'B W W W W B W W W W',
    'B W W W W W W B W W',
    'B B B W W W W B B B',
    'B B B W W W W B B B',
    'B W W B W W W W W W',
    'B W W W W B W W W W',
    'B W W W B B W W W B',
    'B B B B B B B B B B',
  ],
};

/**
 * Utility to shuffle an array in place (Fisher-Yates)
 */
function shuffle<T>(array: T[]): T[] {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Transforms a layout template by rotating or mirroring
 * to increase grid variation.
 */
function randomizeLayout(template: string[]): string[][] {
  const grid = template.map(row => row.split(' '));
  const h = grid.length;
  const w = grid[0].length;

  // Extract the inner playing grid coordinates (excluding Row 0 and Column 0)
  // Inner grid dimensions are (h - 1) x (w - 1)
  const innerH = h - 1;
  const innerW = w - 1;

  const transformations = [
    // Identity
    (r: number, c: number) => ({ r, c }),
    // Mirror horizontal
    (r: number, c: number) => ({ r, c: innerW - 1 - c }),
    // Mirror vertical
    (r: number, c: number) => ({ r: innerH - 1 - r, c }),
    // Diagonal flip (if inner grid is square, which it is since h === w in our templates)
    ...(innerH === innerW
      ? [
          (r: number, c: number) => ({ r: c, c: r }),
          (r: number, c: number) => ({ r: innerW - 1 - c, c: innerH - 1 - r }),
        ]
      : []),
  ];

  // Pick a random transformation
  const transform = transformations[Math.floor(Math.random() * transformations.length)];

  // Create new grid of same full size h x w, initialized with 'B'
  const newGrid: string[][] = Array.from({ length: h }, () => Array(w).fill('B'));

  // Transform and place the inner grid (from r=0..innerH-1 to full grid coordinates 1..h-1)
  for (let r = 0; r < innerH; r++) {
    for (let c = 0; c < innerW; c++) {
      const target = transform(r, c);
      newGrid[target.r + 1][target.c + 1] = grid[r + 1][c + 1];
    }
  }

  return newGrid;
}

/**
 * Generates and returns a valid solved Kakuro board structure
 * with randomized values and calculated clues.
 */
export function generateKakuroPuzzle(difficulty: 'easy' | 'medium' | 'hard'): {
  board: Board;
  solution: number[][];
} {
  const template = LAYOUT_TEMPLATES[difficulty] || LAYOUT_TEMPLATES.easy;
  const layout = randomizeLayout(template);
  const h = layout.length;
  const w = layout[0].length;

  // Initialize board with empty cells
  const tempBoard: ('B' | number)[][] = Array.from({ length: h }, (_, r) =>
    Array.from({ length: w }, (_, c) => (layout[r][c] === 'B' ? 'B' : 0))
  );

  // Find all horizontal and vertical runs
  const hRuns: Coord[][] = [];
  const vRuns: Coord[][] = [];

  // Parse horizontal runs
  for (let r = 0; r < h; r++) {
    let currentRun: Coord[] = [];
    for (let c = 0; c < w; c++) {
      if (layout[r][c] === 'W') {
        currentRun.push({ r, c });
      } else {
        if (currentRun.length > 0) {
          hRuns.push(currentRun);
          currentRun = [];
        }
      }
    }
    if (currentRun.length > 0) {
      hRuns.push(currentRun);
    }
  }

  // Parse vertical runs
  for (let c = 0; c < w; c++) {
    let currentRun: Coord[] = [];
    for (let r = 0; r < h; r++) {
      if (layout[r][c] === 'W') {
        currentRun.push({ r, c });
      } else {
        if (currentRun.length > 0) {
          vRuns.push(currentRun);
          currentRun = [];
        }
      }
    }
    if (currentRun.length > 0) {
      vRuns.push(currentRun);
    }
  }

  // Map each white cell to its runs
  const cellToHRun = new Map<string, Coord[]>();
  const cellToVRun = new Map<string, Coord[]>();

  hRuns.forEach(run => {
    run.forEach(coord => {
      cellToHRun.set(`${coord.r},${coord.c}`, run);
    });
  });

  vRuns.forEach(run => {
    run.forEach(coord => {
      cellToVRun.set(`${coord.r},${coord.c}`, run);
    });
  });

  // Collect all white cells to solve
  const whiteCells: Coord[] = [];
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      if (layout[r][c] === 'W') {
        whiteCells.push({ r, c });
      }
    }
  }

  // Backtracking solver to fill grid with valid digits (1-9)
  function solve(index: number): boolean {
    if (index === whiteCells.length) {
      return true;
    }

    const { r, c } = whiteCells[index];
    const hRun = cellToHRun.get(`${r},${c}`) || [];
    const vRun = cellToVRun.get(`${r},${c}`) || [];

    // Find used values in runs
    const usedValues = new Set<number>();
    hRun.forEach(coord => {
      const val = tempBoard[coord.r][coord.c];
      if (typeof val === 'number' && val > 0) usedValues.add(val);
    });
    vRun.forEach(coord => {
      const val = tempBoard[coord.r][coord.c];
      if (typeof val === 'number' && val > 0) usedValues.add(val);
    });

    // Try a randomized list of digits 1-9
    const digits = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    for (const d of digits) {
      if (!usedValues.has(d)) {
        tempBoard[r][c] = d;
        if (solve(index + 1)) {
          return true;
        }
        tempBoard[r][c] = 0; // backtrack
      }
    }

    return false;
  }

  // Run the solver. Since the templates are standard, this will succeed virtually instantly.
  const solved = solve(0);
  if (!solved) {
    // Fallback in case of absolute failure (should never happen for layout templates)
    console.error('Failed to generate Kakuro puzzle layout, retrying identity layout...');
    return generateKakuroPuzzle(difficulty);
  }

  // Create the final board with clues
  const finalBoard: Board = Array.from({ length: h }, () => []);
  const solution: number[][] = Array.from({ length: h }, () => Array(w).fill(0));

  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      if (layout[r][c] === 'W') {
        const correctVal = tempBoard[r][c] as number;
        solution[r][c] = correctVal;
        finalBoard[r][c] = {
          type: 'white',
          value: '',
          correctValue: correctVal,
          notes: [],
        };
      } else {
        // It's a black cell. Let's see if it has vertical or horizontal clues
        let clueRight: number | undefined;
        let clueDown: number | undefined;

        // Check if there is a horizontal run starting at (r, c+1)
        if (c + 1 < w && layout[r][c + 1] === 'W') {
          // Find length and sum
          let sum = 0;
          let tempC = c + 1;
          while (tempC < w && layout[r][tempC] === 'W') {
            sum += tempBoard[r][tempC] as number;
            tempC++;
          }
          clueRight = sum;
        }

        // Check if there is a vertical run starting at (r+1, c)
        if (r + 1 < h && layout[r + 1][c] === 'W') {
          // Find length and sum
          let sum = 0;
          let tempR = r + 1;
          while (tempR < h && layout[tempR][c] === 'W') {
            sum += tempBoard[tempR][c] as number;
            tempR++;
          }
          clueDown = sum;
        }

        finalBoard[r][c] = {
          type: 'black',
          clueRight,
          clueDown,
        };
      }
    }
  }

  // Optionally pre-reveal some cells based on difficulty
  // Easy: reveal 25% of white cells
  // Medium: reveal 10% of white cells
  // Hard: reveal 0% of white cells
  let revealChance = 0;
  if (difficulty === 'easy') revealChance = 0.25;
  if (difficulty === 'medium') revealChance = 0.10;

  if (revealChance > 0) {
    whiteCells.forEach(({ r, c }) => {
      if (Math.random() < revealChance) {
        const cell = finalBoard[r][c] as WhiteCell;
        cell.value = cell.correctValue;
      }
    });
  }

  return {
    board: finalBoard,
    solution,
  };
}

/**
 * Validates whether the board is completely and correctly solved.
 * A board is correctly solved if:
 * 1. All white cells are filled with digits 1-9.
 * 2. Every horizontal run sums to its clue and contains unique digits.
 * 3. Every vertical run sums to its clue and contains unique digits.
 */
export function checkWinCondition(board: Board): {
  isWin: boolean;
  errors: { r: number; c: number }[];
} {
  const h = board.length;
  const w = board[0].length;
  const errors: { r: number; c: number }[] = [];

  // Track white cells that have invalid entries
  const errorCells = new Set<string>();

  // 1. Check all horizontal runs
  for (let r = 0; r < h; r++) {
    let c = 0;
    while (c < w) {
      if (board[r][c].type === 'black') {
        const blackCell = board[r][c] as BlackCell;
        if (blackCell.clueRight !== undefined) {
          // Start of horizontal run
          const runCoords: Coord[] = [];
          let tempC = c + 1;
          while (tempC < w && board[r][tempC].type === 'white') {
            runCoords.push({ r, c: tempC });
            tempC++;
          }

          // Check run values
          const values: number[] = [];
          let hasEmpty = false;
          runCoords.forEach(coord => {
            const cell = board[coord.r][coord.c] as WhiteCell;
            if (cell.value === '') {
              hasEmpty = true;
            } else {
              values.push(cell.value);
            }
          });

          // Uniqueness and Sum check
          const uniqueValues = new Set(values);
          const hasDuplicates = uniqueValues.size !== values.length;
          const currentSum = values.reduce((sum, v) => sum + v, 0);
          const sumIsCorrect = currentSum === blackCell.clueRight;

          if (hasEmpty || hasDuplicates || !sumIsCorrect) {
            // Mark all duplicates or wrong cells as errors
            if (hasDuplicates) {
              // Find duplicates
              const seen = new Set<number>();
              const duplicates = new Set<number>();
              values.forEach(v => {
                if (seen.has(v)) duplicates.add(v);
                seen.add(v);
              });
              runCoords.forEach(coord => {
                const cell = board[coord.r][coord.c] as WhiteCell;
                if (cell.value !== '' && duplicates.has(cell.value)) {
                  errorCells.add(`${coord.r},${coord.c}`);
                }
              });
            }

            // If the run is fully filled but sum is incorrect, mark the entire run as error
            if (!hasEmpty && !sumIsCorrect) {
              runCoords.forEach(coord => {
                errorCells.add(`${coord.r},${coord.c}`);
              });
            }
          }
          c = tempC - 1; // skip run
        }
      }
      c++;
    }
  }

  // 2. Check all vertical runs
  for (let c = 0; c < w; c++) {
    let r = 0;
    while (r < h) {
      if (board[r][c].type === 'black') {
        const blackCell = board[r][c] as BlackCell;
        if (blackCell.clueDown !== undefined) {
          // Start of vertical run
          const runCoords: Coord[] = [];
          let tempR = r + 1;
          while (tempR < h && board[tempR][c].type === 'white') {
            runCoords.push({ r: tempR, c });
            tempR++;
          }

          // Check run values
          const values: number[] = [];
          let hasEmpty = false;
          runCoords.forEach(coord => {
            const cell = board[coord.r][coord.c] as WhiteCell;
            if (cell.value === '') {
              hasEmpty = true;
            } else {
              values.push(cell.value);
            }
          });

          // Uniqueness and Sum check
          const uniqueValues = new Set(values);
          const hasDuplicates = uniqueValues.size !== values.length;
          const currentSum = values.reduce((sum, v) => sum + v, 0);
          const sumIsCorrect = currentSum === blackCell.clueDown;

          if (hasEmpty || hasDuplicates || !sumIsCorrect) {
            // Mark duplicates
            if (hasDuplicates) {
              const seen = new Set<number>();
              const duplicates = new Set<number>();
              values.forEach(v => {
                if (seen.has(v)) duplicates.add(v);
                seen.add(v);
              });
              runCoords.forEach(coord => {
                const cell = board[coord.r][coord.c] as WhiteCell;
                if (cell.value !== '' && duplicates.has(cell.value)) {
                  errorCells.add(`${coord.r},${coord.c}`);
                }
              });
            }

            // Mark sum errors if fully filled
            if (!hasEmpty && !sumIsCorrect) {
              runCoords.forEach(coord => {
                errorCells.add(`${coord.r},${coord.c}`);
              });
            }
          }
          r = tempR - 1; // skip run
        }
      }
      r++;
    }
  }

  // Also check if any cell value is filled but doesn't match the correctValue (strict solution check)
  // Or, we can just allow any mathematically valid configuration.
  // Standard Kakuro games check mathematical validity. Let's return error coordinate array.
  errorCells.forEach(key => {
    const [r, c] = key.split(',').map(Number);
    errors.push({ r, c });
  });

  // Verify that all white cells are filled
  let allFilled = true;
  for (let r = 0; r < h; r++) {
    for (let c = 0; c < w; c++) {
      if (board[r][c].type === 'white') {
        const cell = board[r][c] as WhiteCell;
        if (cell.value === '') {
          allFilled = false;
        }
      }
    }
  }

  return {
    isWin: allFilled && errors.length === 0,
    errors,
  };
}

/**
 * Calculates current sum and status of a run for real-time player feedback
 */
export function getRunStatus(
  board: Board,
  r: number,
  c: number,
  direction: 'h' | 'v'
): { currentSum: number; targetSum: number; isOver: boolean; isComplete: boolean; count: number; filledCount: number } {
  const h = board.length;
  const w = board[0].length;

  let startR = r;
  let startC = c;

  // 1. Backtrack to find the black cell giving the clue
  if (direction === 'h') {
    while (startC >= 0 && board[r][startC].type === 'white') {
      startC--;
    }
    const clueCell = board[r][startC] as BlackCell;
    const targetSum = clueCell?.clueRight || 0;

    // Find all cells in this run
    let tempC = startC + 1;
    let currentSum = 0;
    let count = 0;
    let filledCount = 0;
    while (tempC < w && board[r][tempC].type === 'white') {
      count++;
      const cell = board[r][tempC] as WhiteCell;
      if (cell.value !== '') {
        currentSum += cell.value;
        filledCount++;
      }
      tempC++;
    }

    return {
      currentSum,
      targetSum,
      isOver: currentSum > targetSum,
      isComplete: filledCount === count && currentSum === targetSum,
      count,
      filledCount,
    };
  } else {
    while (startR >= 0 && board[startR][c].type === 'white') {
      startR--;
    }
    const clueCell = board[startR][c] as BlackCell;
    const targetSum = clueCell?.clueDown || 0;

    // Find all cells in this run
    let tempR = startR + 1;
    let currentSum = 0;
    let count = 0;
    let filledCount = 0;
    while (tempR < h && board[tempR][c].type === 'white') {
      count++;
      const cell = board[tempR][c] as WhiteCell;
      if (cell.value !== '') {
        currentSum += cell.value;
        filledCount++;
      }
      tempR++;
    }

    return {
      currentSum,
      targetSum,
      isOver: currentSum > targetSum,
      isComplete: filledCount === count && currentSum === targetSum,
      count,
      filledCount,
    };
  }
}
