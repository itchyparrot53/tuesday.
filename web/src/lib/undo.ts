export interface UndoEntry {
  label: string;
  undo: () => Promise<void>;
  redo?: () => Promise<void>;
}

const undoEntries: UndoEntry[] = [];
const redoEntries: UndoEntry[] = [];

export const undoStack = {
  push(entry: UndoEntry): void {
    undoEntries.push(entry);
    if (undoEntries.length > 50) undoEntries.shift();
    redoEntries.length = 0;
    window.dispatchEvent(new CustomEvent('tuesday:undo-available'));
  },
  async undo(): Promise<UndoEntry | null> {
    const entry = undoEntries.pop();
    if (!entry) return null;
    await entry.undo();
    redoEntries.push(entry);
    return entry;
  },
  async redo(): Promise<UndoEntry | null> {
    const entry = redoEntries.pop();
    if (!entry) return null;
    if (entry.redo) await entry.redo();
    undoEntries.push(entry);
    return entry;
  },
  canUndo(): boolean {
    return undoEntries.length > 0;
  },
};
