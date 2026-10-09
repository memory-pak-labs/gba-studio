import type { GBAProjectData } from "./projectFile.js";
import { projectTarget } from "./engineProjectExport.js";
import { readProjectExportFolder } from "./engineRomPipeline.js";
import { deriveSettingsSectionsForScope, deriveSettingsWorkspacePresentation, updateSettingsFieldInProject, type SettingsSectionID, type SettingsWorkspacePresentation, type SettingsWorkspaceSection } from "./settingsWorkspace.js";

export const PROJECT_ROM_BUILD_FIELDS = new Set(["romFileName", "gameCode", "makerCode", "romVersion"]);

export function exportRomOutputPath(data: GBAProjectData | null): string {
  const project = data ?? {};
  const target = projectTarget(project);
  return `${readProjectExportFolder(project).replace(/[\\/]+$/, "")}/${target}/${target}.gba`;
}

// Pages organize the UI; the persisted general/build contract remains unchanged.
export function exportSettingsFieldSection(pageID: SettingsSectionID, fieldKey: string): SettingsSectionID {
  return pageID === "general" && PROJECT_ROM_BUILD_FIELDS.has(fieldKey) ? "build" : pageID;
}

export function deriveExportSettingsSections(presentation: SettingsWorkspacePresentation): SettingsWorkspaceSection[] {
  const buildFields = presentation.sections.find(section => section.id === "build")?.editableFields ?? [];
  return deriveSettingsSectionsForScope(presentation, "export").map(section => {
    if (section.id === "general") return { ...section, title: "Projeto e ROM", detail: "Prepare seu jogo para Game Boy Advance.", editableFields: [...section.editableFields, ...buildFields.filter(field => PROJECT_ROM_BUILD_FIELDS.has(field.key))] };
    if (section.id === "build") return { ...section, title: "Compilação", detail: "Engine Pack, cache e opções de compilação.", editableFields: buildFields.filter(field => !PROJECT_ROM_BUILD_FIELDS.has(field.key)) };
    if (section.id === "save") return { ...section, title: "Salvamento" };
    return section;
  });
}

export function resetExportSettingsPageInProject(data: GBAProjectData, pageID: "general" | "build"): GBAProjectData {
  const page = deriveExportSettingsSections(deriveSettingsWorkspacePresentation(data)).find(section => section.id === pageID);
  return page?.editableFields.filter(field => !field.readOnly).reduce((next, field) =>
    updateSettingsFieldInProject(next, exportSettingsFieldSection(pageID, field.key), field.key, field.defaultValue), data) ?? data;
}

export function exportStartReferenceOptions(data: GBAProjectData | null) {
  const records = (value: unknown): Record<string, unknown>[] => Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === "object") : [];
  const names = (value: unknown): string[] => [...new Set(records(value).map(item => item.name).filter((name): name is string => typeof name === "string" && Boolean(name.trim())))];
  const scenes = names(records(data?.scenas).length ? data?.scenas : data?.rooms);
  return {
    scenes: [{ value: "", label: "Primeira cena do projeto" }, ...scenes.map(name => ({ value: name, label: name }))],
    players: [{ value: "", label: "Padrão da cena (opcional)" }, ...names(data?.actors).map(name => ({ value: name, label: name }))]
  };
}
