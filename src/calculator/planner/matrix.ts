const EPS = 1e-9;

/**
 * Solve a dense square linear system A·x = b by Gaussian elimination with
 * partial pivoting. Returns null when the matrix is singular (no unique
 * solution). A and b are not mutated.
 */
export function solveLinearSystem(a: number[][], b: number[]): number[] | null {
  const n = b.length;
  if (n === 0) return [];
  // Augmented matrix copy.
  const m = a.map((row, i) => [...row, b[i]!]);

  for (let col = 0; col < n; col++) {
    // Partial pivot: largest magnitude in this column at/below the diagonal.
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(m[r]![col]!) > Math.abs(m[pivot]![col]!)) pivot = r;
    }
    if (Math.abs(m[pivot]![col]!) < EPS) return null; // singular
    [m[col], m[pivot]] = [m[pivot]!, m[col]!];

    // Eliminate below.
    for (let r = col + 1; r < n; r++) {
      const factor = m[r]![col]! / m[col]![col]!;
      if (factor === 0) continue;
      for (let c = col; c <= n; c++) m[r]![c]! -= factor * m[col]![c]!;
    }
  }

  // Back-substitution.
  const x = new Array<number>(n).fill(0);
  for (let row = n - 1; row >= 0; row--) {
    let sum = m[row]![n]!;
    for (let c = row + 1; c < n; c++) sum -= m[row]![c]! * x[c]!;
    x[row] = sum / m[row]![row]!;
  }
  return x;
}
