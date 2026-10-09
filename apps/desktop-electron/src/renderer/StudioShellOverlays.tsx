import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ArrowLeft, Command, Search, X } from "lucide-react";

import type { ProjectProblem, ProjectProblemWorkspace } from "../shared/projectProblems";
import { useStudioI18n, workspaceLabelKey } from "./i18n";

export interface StudioCommandAction {
  id: string;
  label: string;
  detail?: string;
  keywords?: string[];
  run(): void | Promise<void>;
}

interface StudioCommandPaletteProps {
  actions: StudioCommandAction[];
  isOpen: boolean;
  onClose(): void;
}

function normalizedSearch(value: string, locale: string): string {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLocaleLowerCase(locale).trim();
}

export function StudioCommandPalette({ actions, isOpen, onClose }: StudioCommandPaletteProps): React.ReactElement | null {
  const { locale, t } = useStudioI18n();
  const [query, setQuery] = useState("");
  useEffect(() => {
    if (isOpen) setQuery("");
  }, [isOpen]);

  const visibleActions = useMemo(() => {
    const normalizedQuery = normalizedSearch(query, locale);
    if (!normalizedQuery) return actions;
    return actions.filter((action) => normalizedSearch([
      action.label,
      action.detail ?? "",
      ...(action.keywords ?? [])
    ].join(" "), locale).includes(normalizedQuery));
  }, [actions, locale, query]);

  if (!isOpen) return null;

  const execute = async (action: StudioCommandAction): Promise<void> => {
    await action.run();
    onClose();
  };

  return (
    <div className="studio-overlay-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.currentTarget === event.target) onClose();
    }}>
      <section aria-label={t("shell.commandPaletteTitle")} aria-modal="true" className="studio-command-palette" role="dialog">
        <header>
          <Command aria-hidden="true" size={18} />
          <strong>{t("shell.commandPaletteTitle")}</strong>
          <kbd>⌘ K</kbd>
          <button aria-label={t("shell.closeCommandPalette")} onClick={onClose} type="button"><X aria-hidden="true" size={16} /></button>
        </header>
        <label className="studio-command-search">
          <Search aria-hidden="true" size={16} />
          <input
            aria-label={t("shell.commandSearch")}
            autoFocus
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder={t("shell.commandPlaceholder")}
            type="search"
            value={query}
          />
        </label>
        <div className="studio-command-results">
          {visibleActions.map((action) => (
            <button aria-label={action.label} key={action.id} onClick={() => void execute(action)} type="button">
              <span>{action.label}</span>
              {action.detail ? <small>{action.detail}</small> : null}
            </button>
          ))}
          {visibleActions.length === 0 ? <p>{t("shell.noCommandFound")}</p> : null}
        </div>
      </section>
    </div>
  );
}

interface ProjectProblemsDrawerProps {
  isOpen: boolean;
  onClose(): void;
  onOpenProblem(problem: ProjectProblem): void;
  problems: ProjectProblem[];
}

const problemWorkspaceOrder: ProjectProblemWorkspace[] = ["Arquivos", "Editor", "Sprites", "Dialogos", "Audio", "Exportar", "Ajustes"];

export function ProjectProblemsDrawer({ isOpen, onClose, onOpenProblem, problems }: ProjectProblemsDrawerProps): React.ReactElement | null {
  const { t } = useStudioI18n();
  if (!isOpen) return null;
  const errorCount = problems.filter((problem) => problem.severity === "error").length;

  return (
    <aside aria-label={t("shell.problemsAria")} className="project-problems-drawer">
      <header>
        <div>
          <strong>{t("shell.problemsTitle")}</strong>
          <span>{t("shell.problemCounts", { errors: errorCount, warnings: problems.length - errorCount })}</span>
        </div>
        <button aria-label={t("shell.closeProblems")} onClick={onClose} type="button"><X aria-hidden="true" size={16} /></button>
      </header>
      <div className="project-problems-list">
        {problemWorkspaceOrder.map((workspace) => {
          const workspaceProblems = problems.filter((problem) => problem.workspace === workspace);
          if (workspaceProblems.length === 0) return null;
          return (
            <section aria-label={t("shell.workspaceProblems", { workspace: t(workspaceLabelKey(workspace)) })} key={workspace}>
              <h3>{t(workspaceLabelKey(workspace))}<span>{workspaceProblems.length}</span></h3>
              {workspaceProblems.map((problem) => (
                <button
                  aria-label={t("shell.openProblem", { message: problem.message })}
                  className={problem.severity}
                  key={problem.id}
                  onClick={() => onOpenProblem(problem)}
                  type="button"
                >
                  <AlertTriangle aria-hidden="true" size={15} />
                  <span>{problem.message}</span>
                </button>
              ))}
            </section>
          );
        })}
        {problems.length === 0 ? <p>{t("shell.noProblems")}</p> : null}
      </div>
    </aside>
  );
}

interface WorkspaceNavigationTrailProps {
  currentLabel: string;
  onReturn(): void;
  sourceLabel: string;
}

export function WorkspaceNavigationTrail({ currentLabel, onReturn, sourceLabel }: WorkspaceNavigationTrailProps): React.ReactElement {
  const { t } = useStudioI18n();

  return (
    <nav aria-label={t("shell.navigationTrailAria")} className="workspace-navigation-trail">
      <button aria-label={t("shell.returnTo", { workspace: sourceLabel })} onClick={onReturn} type="button">
        <ArrowLeft aria-hidden="true" size={14} />
        {sourceLabel}
      </button>
      <span aria-hidden="true">/</span>
      <strong>{currentLabel}</strong>
    </nav>
  );
}
