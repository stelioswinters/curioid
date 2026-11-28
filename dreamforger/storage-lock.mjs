/**
 * Cross-tab write serialization using the browser Web Locks API.
 * The lock is held for the complete read/merge/write transaction.
 * We fail closed when unavailable because localStorage has no compare-and-swap.
 */
export async function withExclusiveStorageLock(name, operation, lockManager = globalThis.navigator?.locks) {
  if (typeof name !== 'string' || !name || typeof operation !== 'function') {
    throw new TypeError('A lock name and operation are required.');
  }
  if (!lockManager || typeof lockManager.request !== 'function') {
    throw new Error('Cross-tab safe storage is unavailable in this browser. Export your work and use a browser with Web Locks support.');
  }
  return lockManager.request(name, { mode: 'exclusive' }, () => operation());
}
