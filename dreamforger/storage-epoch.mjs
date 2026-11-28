/**
 * A monotonically replaced storage generation prevents queued writes from an
 * older workspace session from resurrecting data after a deliberate clear.
 */
export const STORAGE_EPOCH_KEY = 'dreamforge.storage-epoch';

export function readStorageEpoch(storage = globalThis.localStorage) {
  try {
    return storage?.getItem(STORAGE_EPOCH_KEY) || '0';
  } catch {
    return 'unavailable';
  }
}
