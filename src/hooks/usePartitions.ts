/**
 * Programmatic partition finder. Returns the set of unique combinations of
 * distinct digits 1-9 that sum to `sum` and have exactly `length` elements.
 *
 * Results are memoized per (sum, length) pair — the set of valid partitions
 * for a (sum, length) is fixed and finite, so this is safe to cache globally.
 */
const partitionCache = new Map<string, number[][]>();

export function getPartitions(sum: number, length: number, maxDigit = 9, current: number[] = []): number[][] {
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

export function getPartitionsCached(sum: number, length: number): number[][] {
  const key = `${sum}:${length}`;
  const cached = partitionCache.get(key);
  if (cached) return cached;
  const result = getPartitions(sum, length);
  partitionCache.set(key, result);
  return result;
}
