import type { AppUpdateResult } from "../shared/appUpdates.js";
import type { SaveProjectRequest, SaveProjectResult } from "../shared/ipc.js";
import type { ProjectSession } from "./projectSession.js";

interface Options {
  currentSession(): ProjectSession | null;
  confirm(needsSave: boolean): Promise<boolean>;
  save(request: SaveProjectRequest): Promise<SaveProjectResult>;
  saved(snapshot: ProjectSession, path: string): void;
  install(): Promise<AppUpdateResult>;
}

export async function restartForUpdate(options: Options): Promise<AppUpdateResult> {
  const snapshot = options.currentSession();
  const needsSave = Boolean(snapshot && (snapshot.dirty || !snapshot.path));
  if (!await options.confirm(needsSave)) return { ok: false };
  const unchanged = () => {
    const current = options.currentSession();
    return current?.project.data === snapshot?.project.data && current?.path === snapshot?.path && current?.dirty === snapshot?.dirty;
  };
  const edited = { ok: false, error: "O projeto mudou durante a preparação. Salve as alterações e tente atualizar novamente." };
  if (!unchanged()) return edited;
  if (snapshot && needsSave) {
    const result = await options.save({ path: snapshot.path, project: snapshot.project });
    if (result.error) return { ok: false, error: `Não foi possível salvar o projeto: ${result.error}` };
    if (result.canceled || !result.path) return { ok: false };
    if (!unchanged()) return edited;
    options.saved(snapshot, result.path);
  }
  return options.install();
}
