const clone = value => JSON.parse(JSON.stringify(value));

/** Bounded, project-scoped undo/redo for reversible Studio workflow edits. */
export class ProjectHistory {
  constructor(limit = 30) {
    this.limit = Math.max(1, Math.min(100, Math.trunc(Number(limit) || 30)));
    this.undoStack = [];
    this.redoStack = [];
    this.pending = null;
  }

  begin(state, label = 'Edit') {
    if (!this.pending) this.pending = { state: clone(state), label: String(label).slice(0, 60) };
  }

  commit(state) {
    if (!this.pending) return false;
    const pending = this.pending;
    this.pending = null;
    if (JSON.stringify(pending.state) === JSON.stringify(state)) return false;
    this.#push(this.undoStack, pending);
    this.redoStack = [];
    return true;
  }

  record(state, label = 'Change') {
    this.pending = null;
    this.#push(this.undoStack, { state: clone(state), label: String(label).slice(0, 60) });
    this.redoStack = [];
  }

  undo(currentState) {
    this.commit(currentState);
    const entry = this.undoStack.pop();
    if (!entry) return null;
    this.#push(this.redoStack, { state: clone(currentState), label: entry.label });
    return { state: clone(entry.state), label: entry.label };
  }

  redo(currentState) {
    this.commit(currentState);
    const entry = this.redoStack.pop();
    if (!entry) return null;
    this.#push(this.undoStack, { state: clone(currentState), label: entry.label });
    return { state: clone(entry.state), label: entry.label };
  }

  clear() { this.undoStack = []; this.redoStack = []; this.pending = null; }
  get canUndo() { return this.undoStack.length > 0 || Boolean(this.pending); }
  get canRedo() { return this.redoStack.length > 0; }
  #push(stack, entry) { stack.push(entry); if (stack.length > this.limit) stack.splice(0, stack.length - this.limit); }
}

export function snapshotWorkflowState(project) {
  return clone({
    canvasNodes: Array.isArray(project?.canvasNodes) ? project.canvasNodes : [],
    groups: Array.isArray(project?.groups) ? project.groups : [],
    assets: Array.isArray(project?.assets) ? project.assets : [],
    tasks: Array.isArray(project?.tasks) ? project.tasks : []
  });
}
