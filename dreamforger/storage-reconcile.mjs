/**
 * Conservative same-origin multi-tab reconciliation for the local workspace.
 * It merges disjoint record changes and refuses conflicting edits to the same
 * record, rather than silently overwriting one tab with another tab's stale copy.
 */
function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function indexRecords(records, label) {
  if (!Array.isArray(records)) return { ok: false, reason: `${label} is not a list` };
  const map = new Map();
  for (const record of records) {
    if (!isRecord(record) || typeof record.id !== 'string' || !record.id) {
      return { ok: false, reason: `${label} contains a record without a valid id` };
    }
    if (map.has(record.id)) return { ok: false, reason: `${label} contains duplicate id: ${record.id}` };
    map.set(record.id, record);
  }
  return { ok: true, map };
}

function comparable(record, ignoreUpdatedAt) {
  if (!record) return null;
  if (!ignoreUpdatedAt) return JSON.stringify(record);
  const { updatedAt, ...content } = record;
  return JSON.stringify(content);
}

function same(a, b, ignoreUpdatedAt) {
  return comparable(a, ignoreUpdatedAt) === comparable(b, ignoreUpdatedAt);
}

function reconcileRecordLists(base, local, remote, limit, ignoreUpdatedAt) {
  const baseIndex = indexRecords(base, 'Baseline');
  const localIndex = indexRecords(local, 'Local workspace');
  const remoteIndex = indexRecords(remote, 'Stored workspace');
  for (const result of [baseIndex, localIndex, remoteIndex]) {
    if (!result.ok) return { ok: false, code: 'invalid-records', reason: result.reason };
  }

  const ids = new Set([
    ...baseIndex.map.keys(),
    ...localIndex.map.keys(),
    ...remoteIndex.map.keys()
  ]);
  const selected = new Map();
  const conflicts = [];

  for (const id of ids) {
    const before = baseIndex.map.get(id) ?? null;
    const ours = localIndex.map.get(id) ?? null;
    const theirs = remoteIndex.map.get(id) ?? null;
    const localChanged = !same(ours, before, ignoreUpdatedAt);
    const remoteChanged = !same(theirs, before, ignoreUpdatedAt);

    if (localChanged && remoteChanged && !same(ours, theirs, ignoreUpdatedAt)) {
      conflicts.push(id);
      continue;
    }

    const chosen = localChanged ? ours : theirs;
    if (chosen) selected.set(id, chosen);
  }

  if (conflicts.length) {
    return {
      ok: false,
      code: 'same-record-conflict',
      conflicts: conflicts.slice(0, 20),
      reason: `Both tabs changed the same record(s): ${conflicts.slice(0, 5).join(', ')}`
    };
  }

  if (selected.size > limit) {
    return {
      ok: false,
      code: 'capacity',
      count: selected.size,
      limit,
      reason: `Merged data would contain ${selected.size} records; the limit is ${limit}. Nothing was overwritten.`
    };
  }

  // Keep the local order for locally created/recently touched records, then
  // append remote-only records. The record selection itself is conflict-aware.
  const ordered = [];
  const placed = new Set();
  for (const record of [...local, ...remote, ...base]) {
    if (selected.has(record.id) && !placed.has(record.id)) {
      ordered.push(selected.get(record.id));
      placed.add(record.id);
    }
  }
  return { ok: true, records: ordered };
}

export function reconcileArchiveRecords(base, local, remote, limit = 300) {
  return reconcileRecordLists(base, local, remote, limit, false);
}

export function reconcileStudioProjects(base, local, remote, limit = 8) {
  return reconcileRecordLists(base, local, remote, limit, true);
}
