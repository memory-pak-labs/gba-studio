import { describe, expect, it } from "vitest";

import {
  normalizeRoomInspectorTab,
  roomInspectorTabs,
  roomInspectorUsesFullHeight
} from "./roomInspectorTabs.js";

describe("roomInspectorTabs", () => {
  it("derives the approved tabs for every contextual inspector", () => {
    expect(roomInspectorTabs("room").map((tab) => tab.label)).toEqual(["Cena", "Eventos", "Fundo", "Câmera", "Conexões", "Diálogos", "Orçamento"]);
    expect(roomInspectorTabs("actor").map((tab) => tab.label)).toEqual(["Objeto", "Eventos", "Sprite e animação", "Movimento", "Diálogos"]);
    expect(roomInspectorTabs("trigger").map((tab) => tab.label)).toEqual(["Objeto", "Eventos", "Diálogos"]);
    expect(roomInspectorTabs("connection").map((tab) => tab.label)).toEqual(["Conexão", "Transição", "Saída", "Entrada", "Eventos"]);
    expect(roomInspectorTabs("collision").map((tab) => tab.label)).toEqual(["Colisão"]);
    expect(roomInspectorTabs("height").map((tab) => tab.label)).toEqual(["Altura"]);
    expect(roomInspectorTabs("paint")).toEqual([]);
  });

  it("falls back to the first valid tab when the context changes", () => {
    expect(normalizeRoomInspectorTab("room", "camera")).toBe("camera");
    expect(normalizeRoomInspectorTab("actor", "camera")).toBe("actor");
    expect(normalizeRoomInspectorTab("trigger", null)).toBe("trigger");
    expect(normalizeRoomInspectorTab("height", "collision")).toBe("height");
    expect(normalizeRoomInspectorTab("paint", "scene")).toBeNull();
  });

  it("reserves the complete inspector height for painting", () => {
    expect(roomInspectorUsesFullHeight("paint")).toBe(true);
    expect(roomInspectorUsesFullHeight("collision")).toBe(false);
    expect(roomInspectorUsesFullHeight("room")).toBe(false);
  });
});
