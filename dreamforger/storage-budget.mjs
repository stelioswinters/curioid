/**
 * Conservative localStorage budget guard.
 * Web Storage quota accounting is browser-dependent and strings are stored as
 * UTF-16 code units. Counting key + value code units at two bytes each and
 * keeping a 4 MiB ceiling leaves headroom below common per-origin quotas.
 * This is a guardrail, not a promise about a browser's actual quota.
 */
export const LOCAL_STORAGE_BUDGET_BYTES = 4 * 1024 * 1024;

export function estimateStorageUsage(storage, replaceKey = null, replaceValue = null) {
  if (!storage || !Number.isInteger(storage.length) || typeof storage.key !== 'function' || typeof storage.getItem !== 'function') {
    throw new TypeError('A Web Storage-compatible object is required.');
  }
  let codeUnits = 0;
  let replaced = false;
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (typeof key !== 'string') continue;
    const value = key === replaceKey ? String(replaceValue ?? '') : String(storage.getItem(key) ?? '');
    if (key === replaceKey) replaced = true;
    codeUnits += key.length + value.length;
  }
  if (replaceKey !== null && !replaced) codeUnits += String(replaceKey).length + String(replaceValue ?? '').length;
  return codeUnits * 2;
}

export function storageBudgetAllows(storage, key, value, budgetBytes = LOCAL_STORAGE_BUDGET_BYTES) {
  if (!Number.isFinite(budgetBytes) || budgetBytes <= 0) throw new RangeError('Storage budget must be positive.');
  return estimateStorageUsage(storage, key, value) <= budgetBytes;
}
