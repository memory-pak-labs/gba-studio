/** @vitest-environment happy-dom */
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { DialoguesWorkspacePresentation } from "../shared/dialoguesWorkspace";
import { DEFAULT_HUD_PRESET } from "../shared/hudPresets";
import { DialogueAppearanceInspector } from "./DialogueAppearanceInspector";
import { DialoguesWorkspace } from "./dialoguesWorkspace";
import { StudioI18nProvider } from "./i18n";

const presentation: DialoguesWorkspacePresentation = {
  localization: { sourceLocale: "pt-BR", defaultLocale: "pt-BR", enabledLocales: ["pt-BR", "en", "es"] },
  dialogues: [
    {
      key: "intro_001",
      character: "Ana",
      portrait: "ana.png",
      portraitSlot: "",
      emote: "Smile",
      textSound: "text.wav",
      confirmSound: "confirm.wav",
      text: "Ola, viajante!",
      translation: "Hello, traveler!",
      translationLanguageCode: "en",
      translations: { en: "Hello, traveler!", es: "Hola, viajante!" },
      choices: [{ id: "choice-1", label: "Continuar", translation: "Continue", translations: { en: "Continue", es: "Continuar" } }],
      choiceTranslations: ["Continue"],
      choiceTranslationsByLocale: { en: ["Continue"], es: ["Continuar"] },
      choiceCount: 1,
      textLength: 15,
      referencedByEvents: ["room_boot"],
      usages: [{ eventID: "evt-1", eventName: "room_boot", command: "show_dialogue intro_001", stepIndex: null, verb: "show_dialogue" }],
      warnings: []
    }
  ],
  characters: [{ name: "Ana", dialogueCount: 1 }],
  selectedDialogue: null,
  summary: {
    dialogueCount: 1,
    characterCount: 1,
    choiceCount: 1,
    referencedDialogueCount: 1,
    missingPortraitCount: 0,
    translationCompletion: "100%"
  },
  fontPanel: { font: "GBA padrao", status: "GBA OK", textSpeed: "Normal" },
  boxPanel: { selectorImage: "selector.png", boxImage: "dialogue_box.png", boxPosition: "Inferior", boxSize: "224 x 48" },
  chromePanel: { showPortrait: true, portraitPosition: "Esquerda", portraitLayout: "inline", showCharacterName: true, nameLabelMode: "inline" },
  interfacePanel: {
    characterSound: "text_blip",
    fontColor: "#FFFFFF",
    choiceStyle: "Lista vertical",
    autoAdvance: false,
    advanceButton: "A",
    cancelButton: "B",
    startMenuTitle: "Menu",
    startMenuShowInventory: false,
    startMenuShowMap: false
  },
  hudPresets: {
    presets: [{ ...DEFAULT_HUD_PRESET, builtIn: true, ready: true, warning: null }],
    activePresetId: DEFAULT_HUD_PRESET.id,
    activePreset: { ...DEFAULT_HUD_PRESET, builtIn: true, ready: true, warning: null }
  },
  preview: { speaker: "Ana", portrait: "ana_portrait.png", portraitSlot: "", emote: "Smile", text: "Ola, viajante!", choices: ["Continuar"] }
};

function renderDialoguesWorkspace(locale: "en-US" | "es-ES" | "fr-FR"): void {
  window.localStorage.setItem("gbaStudio.locale", locale);
  render(
    <StudioI18nProvider>
      <DialoguesWorkspace
        presentation={presentation}
        projectData={{}}


        onExportDialogue={vi.fn()}

        onOpenDialogueEvent={vi.fn()}

        onUpdateDialogue={vi.fn()}

      />
    </StudioI18nProvider>
  );
}

describe("DialoguesWorkspace i18n", () => {
  beforeEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  it("renders dialogue review controls in English", async () => {
    renderDialoguesWorkspace("en-US");

    expect(screen.getByRole("region", { name: "Dialogues workspace" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Dialogue studio" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "+ New dialogue" })).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText("Key, character or text")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open event" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Interface" })).not.toBeInTheDocument();
  });

  it("renders dialogue review controls in Latin American Spanish", async () => {
    renderDialoguesWorkspace("es-ES");

    expect(screen.getByRole("region", { name: "Workspace Dialogos" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Estudio de dialogos" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "+ Nuevo dialogo" })).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText("Clave, personaje o texto")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Abrir en el evento" })).toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Interfaz" })).not.toBeInTheDocument();
  });

  it("keeps the extracted scene appearance controls translated in French", () => {
    window.localStorage.setItem("gbaStudio.locale", "fr-FR");
    render(<StudioI18nProvider><DialogueAppearanceInspector projectData={{}} onUpdateDialoguesUi={vi.fn()} /></StudioI18nProvider>);
    expect(screen.getByRole("combobox", { name: "Position" })).toBeInTheDocument();
  });

  it("does not expose source, portrait or appearance authoring in the review workspace", () => {
    renderDialoguesWorkspace("en-US");
    expect(screen.queryByRole("combobox", { name: "Portrait" })).not.toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Emote" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Aparência dos diálogos" })).not.toBeInTheDocument();
    expect(screen.getByRole("tab", { name: "Text" })).toBeInTheDocument();
  });
});
