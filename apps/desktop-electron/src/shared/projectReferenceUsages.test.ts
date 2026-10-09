import { describe, expect, it } from "vitest";

import {
  projectReferenceDeletionGuard,
  listProjectReferenceUsages
} from "./projectReferenceUsages.js";

const project = {
  assets: [
    { id: "asset-hero", name: "hero.png", kind: "Sprite" },
    { id: "asset-unused", name: "unused.png", kind: "Imagem" }
  ],
  audioItems: [
    { id: "audio-theme", name: "theme.mod", kind: "Musica", assignedScene: "village" },
    { id: "audio-unused", name: "unused.wav", kind: "SFX", assignedScene: "Global" }
  ],
  rooms: [
    {
      id: "room-village",
      name: "village",
      backgroundAssetName: "hero.png",
      music: "theme.mod",
      eventName: "room_boot",
      eventBindings: { onInit: "room_boot" }
    },
    { id: "room-forest", name: "forest" }
  ],
  actors: [{ id: "actor-player", name: "Player", spriteSheet: "hero.png", eventName: "room_boot" }],
  animations: [
    { id: "anim-idle", name: "idle_down", spriteSheet: "hero.png", frameEvents: [[{ type: "event", value: "room_boot" }]] },
    { id: "anim-unused", name: "unused", spriteSheet: "unused.png" }
  ],
  animationStates: [{ id: "state-idle", name: "idle", animationIDs: ["anim-idle"] }],
  dialogues: [{ key: "intro", portrait: "hero.png", text: "Oi" }, { key: "unused", text: "Sem uso" }],
  events: [
    {
      id: "event-boot",
      name: "room_boot",
      steps: [
        { command: "play_music theme.mod" },
        { command: "show_dialogue intro" },
        { command: "change_scene forest" }
      ]
    },
    { id: "event-caller", name: "caller", command: "call_event room_boot" },
    { id: "event-unused", name: "unused_event", command: "noop" }
  ],
  editorState: {
    activeRoomID: "room-village",
    activeRoomName: "village",
    scenaConnections: [{ from: "village", to: "forest", eventName: "room_boot" }]
  },
  settings: { general: { startScene: "village" } }
};

describe("projectReferenceUsages", () => {
  it("lists navigable cross-workspace usages for every authored reference kind", () => {
    expect(listProjectReferenceUsages(project, { kind: "asset", id: "asset-hero", name: "hero.png" }))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ label: "Cena: village", workspace: "Editor" }),
        expect.objectContaining({ label: "Ator: Player", workspace: "Sprites" }),
        expect.objectContaining({ label: "Dialogo intro: retrato", workspace: "Dialogos" })
      ]));
    expect(listProjectReferenceUsages(project, { kind: "audio", id: "audio-theme", name: "theme.mod" }))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ label: "Room: village", workspace: "Editor" }),
        expect.objectContaining({ label: "Evento: room_boot", workspace: "Eventos" })
      ]));
    expect(listProjectReferenceUsages(project, { kind: "room", id: "room-forest", name: "forest" }))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ label: "Conexao: village -> forest", workspace: "Editor" }),
        expect.objectContaining({ label: "Evento room_boot: change_scene", workspace: "Eventos" })
      ]));
    expect(listProjectReferenceUsages(project, { kind: "event", id: "event-boot", name: "room_boot" }))
      .toEqual(expect.arrayContaining([
        expect.objectContaining({ label: "Ator: Player", workspace: "Editor" }),
        expect.objectContaining({ label: "Evento: caller", workspace: "Eventos" }),
        expect.objectContaining({ label: "Animacao idle_down: frame 1", workspace: "Sprites" })
      ]));
    expect(listProjectReferenceUsages(project, { kind: "spriteAnimation", id: "anim-idle", name: "idle_down" }))
      .toEqual([expect.objectContaining({ label: "Estado de animacao: idle", workspace: "Sprites" })]);
    expect(listProjectReferenceUsages(project, { kind: "dialogue", name: "intro" }))
      .toEqual([expect.objectContaining({ label: "Evento: room_boot, passo 2", workspace: "Eventos" })]);
  });

  it("blocks referenced deletion with exact usages and allows unused resources", () => {
    const blocked = projectReferenceDeletionGuard(project, {
      kind: "event",
      id: "event-boot",
      name: "room_boot"
    });
    expect(blocked.canDelete).toBe(false);
    expect(blocked.message).toContain("Nao foi possivel remover room_boot");
    expect(blocked.message).toContain("Ator: Player");
    expect(blocked.usages.length).toBeGreaterThan(0);

    expect(projectReferenceDeletionGuard(project, {
      kind: "audio",
      id: "audio-unused",
      name: "unused.wav"
    })).toEqual({ canDelete: true, message: null, usages: [] });
  });
});
