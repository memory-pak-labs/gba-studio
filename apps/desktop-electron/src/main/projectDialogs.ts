import { defaultProjectSaveRelativePath } from "../shared/projectPaths.js";

export interface ProjectDialogFilter {
  name: string;
  extensions: string[];
}

export interface ProjectOpenDialogOptions {
  title: string;
  properties: ["openFile"];
  filters: ProjectDialogFilter[];
}

export interface ProjectSaveDialogOptions {
  title: string;
  defaultPath: string;
  filters: ProjectDialogFilter[];
}

const projectOpenFileFilter: ProjectDialogFilter = {
  name: "GBA Studio Project",
  extensions: ["gba-project", "gbastudio", "gbsproj"]
};

const projectSaveFileFilter: ProjectDialogFilter = {
  name: "GBA Studio Project",
  extensions: ["gba-project", "gbastudio"]
};

export function projectOpenDialogOptions(): ProjectOpenDialogOptions {
  return {
    title: "Abrir projeto GBA Studio",
    properties: ["openFile"],
    filters: [projectOpenFileFilter]
  };
}

export function projectSaveDialogOptions(projectName: string): ProjectSaveDialogOptions {
  return {
    title: "Salvar projeto GBA Studio",
    defaultPath: defaultProjectSaveRelativePath(projectName),
    filters: [projectSaveFileFilter]
  };
}
