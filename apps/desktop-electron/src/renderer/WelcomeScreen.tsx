import React, { useEffect, useRef, useState } from "react";
import type { RecentProjectEntry } from "../shared/ipc";
import { projectTemplateDefinitions, type ProjectTemplateID } from "../shared/projectTemplates";
import { welcomeIconURL } from "./brandingAssets";
import { StudioLanguageSwitcher, useStudioI18n, type StudioTranslationKey } from "./i18n";
import { StudioThemeToggle } from "./StudioThemeToggle";
import { WelcomeCreditsModal } from "./WelcomeCreditsModal";

interface WelcomeScreenProps {
  status: string;
  onCreateProject: (name: string, templateID?: ProjectTemplateID) => void | Promise<void>;
  onOpenProject: () => void;
  onOpenRecentProject: (path: string) => void;
}

const welcomeProjectTemplates = projectTemplateDefinitions;

const templatePreviewURLs: Partial<Record<ProjectTemplateID, string>> = {
  "exemplo-gba": new URL(
    "../../default-assets/templates/exemplo-gba/Assets/backgrounds/title-day-centered-240x160-4bpp.png",
    import.meta.url
  ).href
};

export function WelcomeScreen({
  status,
  onCreateProject,
  onOpenProject,
  onOpenRecentProject
}: WelcomeScreenProps): React.ReactElement {
  const { t } = useStudioI18n();
  const defaultProjectName = t("welcome.defaultProjectName");
  const [projectName, setProjectName] = useState(defaultProjectName);
  const [creatingProject, setCreatingProject] = useState(false);
  const [creditsOpen, setCreditsOpen] = useState(false);
  const [recentProject, setRecentProject] = useState<RecentProjectEntry | null>(null);
  const projectNameEdited = useRef(false);

  useEffect(() => {
    let active = true;

    void window.gbaStudio.getRecentProjects().then((projects) => {
      if (!active) return;
      setRecentProject(projects[0] ?? null);
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!projectNameEdited.current) setProjectName(defaultProjectName);
  }, [defaultProjectName]);

  async function requestProjectCreation(templateID: ProjectTemplateID): Promise<void> {
    if (creatingProject) return;
    setCreatingProject(true);
    try {
      await onCreateProject(projectName, templateID);
    } finally {
      setCreatingProject(false);
    }
  }

  function submitProject(event: React.FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    void requestProjectCreation("exemplo-gba");
  }

  function createFromTemplate(templateID: ProjectTemplateID): void {
    void requestProjectCreation(templateID);
  }

  function openRecentProject(): void {
    if (recentProject) {
      onOpenRecentProject(recentProject.path);
      return;
    }

    onOpenProject();
  }

  return (
    <main className={`welcome-shell${window.gbaStudio.platform === "darwin" ? " native-macos-titlebar" : ""}`}>
      <StudioThemeToggle className="welcome-theme-toggle icon-button" />
      <aside className="welcome-sidebar">
        <section className="welcome-brand" aria-label="GBA Studio">
          <svg aria-hidden="true" className="welcome-logo-image" viewBox="0 0 1024 1024">
            <defs>
              <clipPath id="welcome-logo-silhouette">
                <path d="M382 0C276 0 190 22 119 70 40 124 0 203 0 302v418c0 111 36 190 119 244 67 44 162 60 277 60h255c126 0 220-24 282-88 63-65 91-145 91-258V306c0-108-43-187-129-244C825 16 742 0 642 0H382Z" />
              </clipPath>
            </defs>
            <image clipPath="url(#welcome-logo-silhouette)" height="1024" href={welcomeIconURL} width="1024" />
          </svg>
          <h1>GBA Studio</h1>
          <p>{t("welcome.ideTagline")}</p>
        </section>

        <StudioLanguageSwitcher className="welcome-language" />

        <button
          aria-label={recentProject ? `${t("welcome.continue")} ${recentProject.name}` : t("welcome.openRecentProject")}
          className={recentProject ? "welcome-recent has-recent" : "welcome-recent"}
          onClick={openRecentProject}
          type="button"
        >
          <span className="welcome-play" aria-hidden="true">&gt;</span>
          <div>
            <span>{t("welcome.continue")}</span>
            <strong>{recentProject?.name ?? t("welcome.noRecent")}</strong>
            <small>
              {recentProject
                ? recentProject.path
                : t("welcome.openExistingProject")}
            </small>
          </div>
        </button>

        <form className="welcome-create" onSubmit={submitProject}>
          <h2>{t("welcome.createProject")}</h2>
          <label htmlFor="welcome-project-name">
            <span>{t("welcome.projectName")}</span>
            <input
              autoComplete="off"
              id="welcome-project-name"
              value={projectName}
              onChange={(event) => {
                projectNameEdited.current = true;
                setProjectName(event.target.value);
              }}
            />
          </label>
          <label htmlFor="welcome-project-folder">
            <span>{t("welcome.folder")}</span>
            <input id="welcome-project-folder" readOnly value={t("welcome.chooseDestinationOnCreate")} />
          </label>
          <small>{t("welcome.destinationCreateHint")}</small>
          <button className="welcome-primary" disabled={creatingProject} type="submit">
            {creatingProject ? t("welcome.creatingProject") : t("welcome.startExample")}
          </button>
        </form>

        <button className="welcome-secondary" type="button" onClick={onOpenProject}>{t("shell.openProject")}</button>
        <button className="welcome-secondary" type="button" onClick={() => setCreditsOpen(true)}>{t("welcome.credits")}</button>
        <p className="welcome-status-bar" role="status" aria-live="polite">
          <span aria-hidden="true" className="welcome-status-bar-dot" />
          {status}
        </p>
      </aside>

      <section className="welcome-main">
        <div className="welcome-template-area">
          <h2>{t("welcome.templates")}</h2>
          {welcomeProjectTemplates.map((template) => {
            const title = t(`template.${template.id}.title` as StudioTranslationKey);
            const previewURL = templatePreviewURLs[template.id];
            return (
              <button
                key={template.id}
                className={previewURL ? "welcome-template-card has-preview" : "welcome-template-card"}
                disabled={creatingProject}
                type="button"
                onClick={() => createFromTemplate(template.id)}
              >
                {previewURL ? (
                  <img
                    alt={t(`template.${template.id}.previewAlt` as StudioTranslationKey)}
                    className="welcome-template-preview"
                    src={previewURL}
                  />
                ) : (
                  <span className="welcome-template-icon" aria-hidden="true">{template.icon}</span>
                )}
                <strong>{title}</strong>
                <small>{t(`template.${template.id}.detail` as StudioTranslationKey)}</small>
              </button>
            );
          })}
        </div>
        <p className="welcome-footer">
          {t("welcome.footer")}
        </p>
      </section>
      {creditsOpen ? <WelcomeCreditsModal onClose={() => setCreditsOpen(false)} /> : null}
    </main>
  );
}
