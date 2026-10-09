import { describe, expect, it } from "vitest";

import { createBlankProjectData } from "./newProject.js";
import {
  projectAssetReferenceOptions,
  projectAudioReferenceOptions,
  projectEventReferenceOptions,
  projectRoomReferenceOptions
} from "./projectReferenceOptions.js";

describe("projectReferenceOptions", () => {
  it("lista referencias autorais pelo nome e preserva o valor persistido", () => {
    const project = createBlankProjectData({ name: "Referencias" });
    project.events = [{ id: "event-door", name: "Abrir porta", command: "noop" }];
    project.audioItems = [{ id: "audio-forest", name: "Tema da floresta", kind: "Musica" }];
    project.assets = [
      ...(Array.isArray(project.assets) ? project.assets : []),
      { id: "asset-forest", name: "forest.png", kind: "Background", metadata: { source: "Assets/backgrounds/forest.png" } }
    ];

    expect(projectRoomReferenceOptions(project)).toContainEqual(expect.objectContaining({
      value: "cena_1",
      label: "cena_1"
    }));
    expect(projectEventReferenceOptions(project)).toEqual([
      expect.objectContaining({ value: "Abrir porta", label: "Abrir porta", detail: "Evento" })
    ]);
    expect(projectAudioReferenceOptions(project)).toEqual([
      expect.objectContaining({ value: "Tema da floresta", label: "Tema da floresta", detail: "Musica" })
    ]);
    expect(projectAssetReferenceOptions(project)).toContainEqual(expect.objectContaining({
      value: "forest.png",
      label: "forest.png",
      detail: "Background"
    }));
  });

  it("remove duplicatas e ordena nomes para busca previsivel", () => {
    const project = createBlankProjectData({ name: "Ordenacao" });
    project.events = [
      { id: "event-z", name: "Zerar" },
      { id: "event-a", name: "Abrir" },
      { id: "event-a-copy", name: "Abrir" }
    ];

    expect(projectEventReferenceOptions(project).map((option) => option.label)).toEqual(["Abrir", "Zerar"]);
  });

  it("mostra cenas do Exemplo GBA sem o prefixo legado e preserva o valor técnico", () => {
    const project = createBlankProjectData({ name: "O Último Farol" });
    project.scenas = [{ id: "scene-logo", name: "logo", sceneType: "cutscene" }];

    expect(projectRoomReferenceOptions(project)).toEqual([
      expect.objectContaining({ value: "logo", label: "logo", detail: "Cena · cutscene" })
    ]);
  });
});
