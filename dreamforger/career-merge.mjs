const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const clone = value => value === undefined ? undefined : JSON.parse(JSON.stringify(value));
const same = (left, right) => JSON.stringify(left) === JSON.stringify(right);

/**
 * Three-way field merge for one project's Career Suite draft.
 * Disjoint scalar/object edits merge; overlapping leaf edits are rejected.
 * Arrays are atomic to avoid guessing how reordered matrix data should merge.
 */
export function reconcileCareerDraft(base, local, remote) {
  const conflicts = [];
  const merge = (before, ours, theirs, path) => {
    const localChanged = !same(ours, before);
    const remoteChanged = !same(theirs, before);
    if (!localChanged) return clone(theirs);
    if (!remoteChanged || same(ours, theirs)) return clone(ours);
    if (isRecord(before) && isRecord(ours) && isRecord(theirs)) {
      const output = {};
      const keys = new Set([...Object.keys(before), ...Object.keys(ours), ...Object.keys(theirs)]);
      for (const key of keys) {
        output[key] = merge(before[key], ours[key], theirs[key], path ? `${path}.${key}` : key);
      }
      return output;
    }
    conflicts.push(path || '(root)');
    return clone(ours);
  };
  const result = merge(base, local, remote, '');
  if (conflicts.length) {
    return { ok: false, code: 'same-field-conflict', conflicts: conflicts.slice(0, 30), reason: `Both tabs changed the same Career Suite field(s): ${conflicts.slice(0, 5).join(', ')}` };
  }
  return { ok: true, data: result };
}
