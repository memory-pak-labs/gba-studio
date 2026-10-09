export interface WindowDocumentSession {
  dirty: boolean;
  path?: string;
  projectName: string;
}

export interface WindowDocumentState {
  dirty: boolean;
  representedFilename: string;
  title: string;
}

export function deriveWindowDocumentState(session: WindowDocumentSession | null): WindowDocumentState {
  if (!session) {
    return {
      dirty: false,
      representedFilename: "",
      title: "GBA Studio"
    };
  }

  return {
    dirty: session.dirty,
    representedFilename: session.path ?? "",
    title: `${session.projectName}${session.dirty ? " *" : ""} - GBA Studio`
  };
}
