import { describe, it, expect } from 'vitest';
import { solveLinearSystem } from './matrix.js';

describe('solveLinearSystem', () => {
  it('solves a 2x2 system', () => {
    // x + y = 3 ; x - y = 1  → x=2, y=1
    const x = solveLinearSystem([[1, 1], [1, -1]], [3, 1]);
    expect(x).not.toBeNull();
    expect(x![0]).toBeCloseTo(2, 9);
    expect(x![1]).toBeCloseTo(1, 9);
  });

  it('handles a system needing pivoting (leading zero)', () => {
    // 0x + 1y = 2 ; 1x + 1y = 3  → x=1, y=2
    const x = solveLinearSystem([[0, 1], [1, 1]], [2, 3]);
    expect(x![0]).toBeCloseTo(1, 9);
    expect(x![1]).toBeCloseTo(2, 9);
  });

  it('returns null for a singular matrix', () => {
    expect(solveLinearSystem([[1, 1], [2, 2]], [1, 2])).toBeNull();
  });

  it('solves the trivial 1x1 system', () => {
    expect(solveLinearSystem([[4]], [8])![0]).toBeCloseTo(2, 9);
  });
});
