import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import { parseGBAProjectFile } from "../../../../packages/project-contract/src/index.js";
import { deriveAudioWorkspacePresentation } from "./audioWorkspace.js";
import { buildAssetcAudioPackGeneration } from "./engineProjectExport.js";

type AudioProject = Record<string, unknown>;

function loadTemplate() {
  return parseGBAProjectFile(readFileSync(
    new URL("../../default-assets/templates/exemplo-gba/exemplo-gba.gba-project", import.meta.url),
    "utf8"
  )).data as AudioProject;
}

function projectArray<T extends Record<string, unknown>>(project: AudioProject, key: string): T[] {
  const value = project[key];
  return Array.isArray(value) ? value as T[] : [];
}

describe("gate acústico do projeto completo", () => {
  it("mantém músicas e efeitos autorados no Exemplo GBA completo", () => {
    const project = loadTemplate();
    const presentation = deriveAudioWorkspacePresentation(project);
    const audioPack = buildAssetcAudioPackGeneration(project);
    const rooms = projectArray(project, "rooms");
    const scenes = projectArray(project, "scenas");
    const events = projectArray(project, "events");
    const dialogues = projectArray(project, "dialogues");

    const audioItems = projectArray(project, "audioItems");
    const tracker = Array.isArray(audioPack?.document.tracker) ? audioPack.document.tracker : [];
    const sfx = Array.isArray(audioPack?.document.sfx) ? audioPack.document.sfx : [];
    expect(audioItems.length).toBeGreaterThan(0);
    expect(presentation.items).toHaveLength(audioItems.length);
    expect(tracker.length + sfx.length).toBe(audioItems.length);
    expect(rooms).toHaveLength(scenes.length);
    expect(rooms.filter((room) => typeof room.music === "string" && room.music.length > 0))
      .toHaveLength(scenes.length);

    const eventCommands = events.flatMap((event) => (
      Array.isArray(event.steps)
        ? event.steps.flatMap((step) => (
          typeof step === "object" && step !== null && typeof (step as { command?: unknown }).command === "string"
            ? [(step as { command: string }).command]
            : []
        ))
        : []
    ));
    expect(eventCommands.some((command) => /^(play_music|play_sfx|set_text_sfx)\b/.test(command))).toBe(true);
    expect(dialogues.every((dialogue) => dialogue.textSound === "farol_sfx_texto" && dialogue.confirmSound === "farol_sfx_dialogo")).toBe(true);
  });

  it("mantém todas as referências de áudio resolvidas no contrato", () => {
    const project = loadTemplate();
    const rooms = projectArray(project, "rooms");
    const dialogues = projectArray(project, "dialogues");
    const events = projectArray(project, "events");
    const audioItems = projectArray(project, "audioItems");
    const scenes = projectArray(project, "scenas");
    const referencedAudio = [
      ...rooms.flatMap((room) => typeof room.music === "string" && room.music.length > 0 ? [room.music] : []),
      ...dialogues.flatMap((dialogue) => [dialogue.textSound, dialogue.confirmSound]
        .filter((name): name is string => typeof name === "string" && name.length > 0)),
      ...events.flatMap((event) => Array.isArray(event.steps)
        ? event.steps.flatMap((step) => {
          const command = typeof step === "object" && step !== null && typeof (step as Record<string, unknown>).command === "string"
            ? String((step as Record<string, unknown>).command)
            : "";
          const match = command.match(/^(?:play_music|play_sfx)\s+(\S+)/);
          return match ? [match[1]] : [];
        })
        : []),
      ...scenes.flatMap((scene) => {
        const runtime = scene.runtime as Record<string, unknown> | undefined;
        const config = runtime?.config as Record<string, unknown> | undefined;
        const presentation = config?.tacticalPresentation as Record<string, unknown> | undefined;
        const audio = presentation?.audio as Record<string, unknown> | undefined;
        if (!audio) return [];
        return [
          audio.music,
          ...Object.values((audio.cues as Record<string, unknown> | undefined) ?? {})
        ].filter((name): name is string => typeof name === "string" && name.length > 0);
      })
    ];

    expect(referencedAudio.length).toBeGreaterThan(0);
    expect(new Set(referencedAudio)).toEqual(new Set(audioItems.map((audio) => String(audio.name))));
  });
});
