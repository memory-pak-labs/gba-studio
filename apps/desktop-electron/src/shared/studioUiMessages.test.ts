import { describe, expect, it } from "vitest";
import { studioUiMessages, translateStudioMessage } from "./studioUiMessages.js";

describe("studio UI messages", () => {
  it("localizes the occupied project destination warning", () => {
    const message = "A pasta de destino já contém arquivos. Escolha um novo nome ou uma pasta vazia.";
    expect(translateStudioMessage("en-US", message)).toBe("The destination folder already contains files. Choose a new name or an empty folder.");
    expect(translateStudioMessage("es-ES", message)).toBe("La carpeta de destino ya contiene archivos. Elige un nombre nuevo o una carpeta vacía.");
  });
  it("translates editor, export, audio, menus and diagnostics in the three primary locales", () => {
    expect(translateStudioMessage("pt-BR", "Colisao")).toBe("Colisão");
    expect(translateStudioMessage("en-US", "Buscar cenas")).toBe("Search scenes");
    expect(translateStudioMessage("es-ES", "Buscar cenas")).toBe("Buscar escenas");
    expect(translateStudioMessage("en-US", "Projeto e ROM")).toBe("Project and ROM");
    expect(translateStudioMessage("es-ES", "Compositor de Áudio")).toBe("Compositor de audio");
    expect(translateStudioMessage("en-US", "TIPOS DE CENA")).toBe("SCENE TYPES");
    expect(translateStudioMessage("es-ES", "TIPOS DE CENA")).toBe("TIPOS DE ESCENA");
  });
  it("preserves names, paths and placeholder contents while translating message structure", () => {
    expect(translateStudioMessage("en-US", "Cena: {0}", { 0: "Cenas {1} <Nara>" })).toBe("Scene: Cenas {1} <Nara>");
    expect(translateStudioMessage("es-ES", "Cena: porto_lumen")).toBe("Escena: porto_lumen");
    expect(translateStudioMessage("en-US", "/project/Assets/Cenas.png")).toBe("/project/Assets/Cenas.png");
    expect(translateStudioMessage("en-US", "Nara e o último farol")).toBe("Nara e o último farol");
    expect(translateStudioMessage("es-ES", "Nara e o último farol")).toBe("Nara e o último farol");
    expect(translateStudioMessage("es-ES", "Sin uso")).toBe("Sin uso");
    expect(translateStudioMessage("en-US", "No project open")).toBe("No project open");
    expect(translateStudioMessage("en-US", "CENA: {0}", { 0: "Porto Lumen {1}" })).toBe("SCENE: Porto Lumen {1}");
  });
  it("keeps boundary whitespace and does not interpret regex metacharacters as a pattern", () => {
    expect(translateStudioMessage("en-US", " Buscar cenas ")).toBe(" Search scenes ");
    expect(translateStudioMessage("en-US", "[not a message].*")).toBe("[not a message].*");
    expect(translateStudioMessage("en-US", "constructor")).toBe("constructor");
    expect(translateStudioMessage("es-ES", "toString")).toBe("toString");
    expect(translateStudioMessage("es-ES", "  ")).toBe("  ");
    expect(translateStudioMessage("es-ES", "  ")).toBe("  ");
  });
  it("has explicit copy with matching placeholders for all three locales", () => {
    const placeholders = (text: string) => [...text.matchAll(/\{[^}]+\}/g)].map(x => x[0]).sort();
    expect(Object.keys(studioUiMessages).length).toBeGreaterThan(2000);
    for (const [source, messages] of Object.entries(studioUiMessages)) {
      for (const message of messages) {
        expect(message.trim(), source).not.toBe("");
        expect(placeholders(message), source).toEqual(placeholders(source));
        const identifiers = source.match(/\b(?:[a-zA-Z][a-zA-Z0-9]*_[a-zA-Z0-9_]+|[a-z]+[A-Z][a-zA-Z0-9]*)\b/g) ?? [];
        for (const identifier of identifiers) expect(message, source).toContain(identifier);
      }
    }
  });
});
