import { CheckCircle2, Plus, Wrench } from "lucide-react";

import type {
  AdvancedToolCard,
  AdvancedToolID,
  AdvancedToolsPresentation
} from "../shared/advancedTools";
import type { GBAProjectData } from "../shared/projectFile";
import {
  AdvancedToolEditors,
  type AdvancedToolEditorID
} from "./advancedToolEditors";
import {
  advancedToolsForSurface,
  type AdvancedToolsSurface
} from "./advancedToolsPlacement";
import { useStudioI18n, type StudioTranslationKey } from "./i18n";

type WorkspaceSurface = Exclude<AdvancedToolsSurface, "Diagnosticos">;

const surfaceCopy: Record<WorkspaceSurface, { title: StudioTranslationKey; detail: StudioTranslationKey }> = {
  Editor: {
    title: "advancedTools.surface.editor.title",
    detail: "advancedTools.surface.editor.detail"
  },
  Eventos: {
    title: "advancedTools.surface.events.title",
    detail: "advancedTools.surface.events.detail"
  },
  Dialogos: {
    title: "advancedTools.surface.dialogues.title",
    detail: "advancedTools.surface.dialogues.detail"
  },
  Arquivos: {
    title: "advancedTools.surface.files.title",
    detail: "advancedTools.surface.files.detail"
  },
  Ajustes: {
    title: "advancedTools.surface.settings.title",
    detail: "advancedTools.surface.settings.detail"
  }
};

const toolCopy: Record<AdvancedToolID, { title: StudioTranslationKey; detail: StudioTranslationKey }> = {
  inputReplay: {
    title: "advancedTools.inputReplay.title",
    detail: "advancedTools.inputReplay.detail"
  },
  autotile: {
    title: "advancedTools.autotile.title",
    detail: "advancedTools.autotile.detail"
  },
  asepriteTsx: {
    title: "advancedTools.asepriteTsx.title",
    detail: "advancedTools.asepriteTsx.detail"
  },
  particles: {
    title: "advancedTools.particles.title",
    detail: "advancedTools.particles.detail"
  },
  stateMachines: {
    title: "advancedTools.stateMachines.title",
    detail: "advancedTools.stateMachines.detail"
  },
  cinematicTimeline: {
    title: "advancedTools.cinematicTimeline.title",
    detail: "advancedTools.cinematicTimeline.detail"
  },
  effectsSequencer: {
    title: "advancedTools.effectsSequencer.title",
    detail: "advancedTools.effectsSequencer.detail"
  },
  fontEditor: {
    title: "advancedTools.fontEditor.title",
    detail: "advancedTools.fontEditor.detail"
  },
  localization: {
    title: "advancedTools.localization.title",
    detail: "advancedTools.localization.detail"
  },
  saveLab: {
    title: "advancedTools.saveLab.title",
    detail: "advancedTools.saveLab.detail"
  },
  linkCable: {
    title: "advancedTools.linkCable.title",
    detail: "advancedTools.linkCable.detail"
  },
  pluginDev: {
    title: "advancedTools.pluginDev.title",
    detail: "advancedTools.pluginDev.detail"
  },
  gameplayComponents: {
    title: "advancedTools.gameplayComponents.title",
    detail: "advancedTools.gameplayComponents.detail"
  }
};

const editorByTool: Partial<Record<AdvancedToolID, AdvancedToolEditorID>> = {
  autotile: "autotile",
  stateMachines: "stateMachines",
  particles: "particles",
  cinematicTimeline: "cinematicTimeline",
  effectsSequencer: "effectsSequencer",
  fontEditor: "fontLocalization",
  localization: "fontLocalization",
  gameplayComponents: "gameplayComponents"
};

export function advancedToolEditorIDs(toolIDs: readonly AdvancedToolID[]): AdvancedToolEditorID[] {
  return [...new Set(toolIDs
    .map((toolID) => editorByTool[toolID])
    .filter((editor): editor is AdvancedToolEditorID => Boolean(editor)))];
}

function ToolCard({
  onEnable,
  t,
  tool
}: {
  onEnable(toolID: AdvancedToolID): void;
  t: ReturnType<typeof useStudioI18n>["t"];
  tool: AdvancedToolCard;
}): React.ReactElement {
  const copy = toolCopy[tool.id];

  return (
    <article className={`advanced-tool-card${tool.enabled ? " enabled" : ""}`}>
      <div className="advanced-tool-card-title">
        {tool.enabled ? <CheckCircle2 aria-hidden="true" /> : <Wrench aria-hidden="true" />}
        <strong>{t(copy.title)}</strong>
      </div>
      <p>{t(copy.detail)}</p>
      {tool.enabled ? (
        <span className="advanced-tool-status">{t("advancedTools.status.resources", { count: tool.resourceCount })}</span>
      ) : (
        <button onClick={() => onEnable(tool.id)} type="button">
          <Plus aria-hidden="true" /> {t("advancedTools.action.add")}
        </button>
      )}
    </article>
  );
}

interface WorkspaceAdvancedToolsProps {
  onChangeProjectData(data: GBAProjectData): void;
  onEnableTool(toolID: AdvancedToolID): void;
  presentation: AdvancedToolsPresentation;
  projectData: GBAProjectData;
  sceneType?: string | null;
  surface: WorkspaceSurface;
  toolIDs?: readonly AdvancedToolID[];
  title?: string;
  detail?: string;
}

export function WorkspaceAdvancedTools({
  onChangeProjectData,
  onEnableTool,
  presentation,
  projectData,
  sceneType,
  surface,
  toolIDs,
  title,
  detail
}: WorkspaceAdvancedToolsProps): React.ReactElement | null {
  const { t } = useStudioI18n();
  const placement = toolIDs ?? advancedToolsForSurface(surface, sceneType);
  const tools = placement
    .map((toolID) => presentation.tools.find((tool) => tool.id === toolID))
    .filter((tool): tool is AdvancedToolCard => Boolean(tool));
  if (tools.length === 0) return null;

  const visibleEditors = advancedToolEditorIDs(placement);
  const editorIDs = new Set(visibleEditors);
  const toolsNeedingAction = tools.filter((tool) => {
    const editorID = editorByTool[tool.id];
    return !tool.enabled || !editorID || !editorIDs.has(editorID);
  });
  const enabledCount = tools.filter((tool) => tool.enabled).length;
  const copy = surfaceCopy[surface];
  const sectionID = `workspace-advanced-tools-${surface.toLowerCase()}${title ? `-${title.toLowerCase().replaceAll(/[^a-z0-9]+/g, "-")}` : ""}`;

  return (
    <section aria-labelledby={sectionID} className="workspace-advanced-tools">
      <header className="workspace-advanced-tools-header">
        <div>
          <h4 id={sectionID}>{title ?? t(copy.title)}</h4>
          <p>{detail ?? t(copy.detail)}</p>
        </div>
        <span>{t("advancedTools.status.active", { enabled: enabledCount, total: tools.length })}</span>
      </header>
      {toolsNeedingAction.length > 0 ? (
        <div className="advanced-tools-grid workspace-advanced-tools-actions">
          {toolsNeedingAction.map((tool) => (
            <ToolCard key={tool.id} onEnable={onEnableTool} t={t} tool={tool} />
          ))}
        </div>
      ) : null}
      {visibleEditors.length > 0 ? (
        <AdvancedToolEditors
          onChangeProjectData={onChangeProjectData}
          projectData={projectData}
          visibleEditors={visibleEditors}
        />
      ) : null}
    </section>
  );
}
