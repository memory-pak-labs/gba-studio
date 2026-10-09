export interface ProjectHistoryState<T> {
  present: T;
  redoStack: T[];
  undoStack: T[];
}

export function pushProjectHistory<T>(state: ProjectHistoryState<T>, nextPresent: T): ProjectHistoryState<T> {
  if (nextPresent === state.present) return state;
  return {
    present: nextPresent,
    redoStack: [],
    undoStack: [...state.undoStack, state.present]
  };
}

/**
 * Updates the current history entry without adding another undo checkpoint.
 * Canvas gestures use this for intermediate pointer updates and commit the
 * initial state only once when the gesture first changes project data.
 */
export function updateProjectHistoryPresent<T>(state: ProjectHistoryState<T>, nextPresent: T): ProjectHistoryState<T> {
  if (nextPresent === state.present) return state;
  return {
    present: nextPresent,
    redoStack: [],
    undoStack: state.undoStack
  };
}

export function undoProjectHistory<T>(state: ProjectHistoryState<T>): ProjectHistoryState<T> {
  const previous = state.undoStack.at(-1);
  if (previous === undefined) return state;
  return {
    present: previous,
    redoStack: [state.present, ...state.redoStack],
    undoStack: state.undoStack.slice(0, -1)
  };
}

export function redoProjectHistory<T>(state: ProjectHistoryState<T>): ProjectHistoryState<T> {
  const next = state.redoStack[0];
  if (next === undefined) return state;
  return {
    present: next,
    redoStack: state.redoStack.slice(1),
    undoStack: [...state.undoStack, state.present]
  };
}
