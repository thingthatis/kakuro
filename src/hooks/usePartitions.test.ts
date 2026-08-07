import { describe, it, expect } from 'vitest';
import { getPartitions, getPartitionsCached } from './usePartitions';

describe('getPartitions', () => {
  it('returns the single partition for sum 3 length 2', () => {
    const result = getPartitions(3, 2);
    expect(result).toEqual([[1, 2]]);
  });

  it('returns the expected partition for sum 4 length 2', () => {
    const result = getPartitions(4, 2);
    expect(result).toContainEqual([1, 3]);
  });

  it('returns the expected partition for sum 16 length 2', () => {
    const result = getPartitions(16, 2);
    expect(result).toEqual([[7, 9]]);
  });

  it('handles sum 10 length 4', () => {
    const result = getPartitions(10, 4);
    expect(result).toEqual([[1, 2, 3, 4]]);
  });

  it('returns empty for impossible cases', () => {
    expect(getPartitions(100, 2)).toEqual([]);
    expect(getPartitions(3, 10)).toEqual([]);
  });
});

describe('getPartitionsCached', () => {
  it('returns the same result as getPartitions', () => {
    expect(getPartitionsCached(3, 2)).toEqual(getPartitions(3, 2));
    expect(getPartitionsCached(17, 2)).toEqual(getPartitions(17, 2));
  });
});
