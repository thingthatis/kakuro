// Re-export from the canonical module. This shim is kept so existing imports
// (`from '../hooks/usePartitions'`) keep working.
export { getPartitions, getPartitionsCached } from '../partitions';
