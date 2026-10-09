/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

import { deriveDialoguesWorkspacePresentation, updateDialogueInProject } from "../shared/dialoguesWorkspace.js";
import { desktopAssetURL } from "../shared/spriteAssetURL.js";
import { DialoguesWorkspace } from "./dialoguesWorkspace.js";
import { StudioI18nProvider } from "./i18n.js";

vi.mock("./offlineTranslator.js", () => ({
  translateGameText: vi.fn(async ({ text }: { text: string }) => `IA: ${text}`)
}));

describe("DialoguesWorkspace authoring modes", () => {
  afterEach(cleanup);

  it("preserves review filters and writes text into the selected translation locale", () => {
    let projectData = {
      localization: { sourceLocale: "en", defaultLocale: "pt-BR", enabledLocales: ["pt-BR", "en", "es"] },
      settings: { uiDialogs: { translationLocale: "es" } },
      dialogues: [{ key: "intro", text: "Original", translations: { "pt-BR": "Português" } }, { key: "other", text: "Other" }]
    };
    const onUpdateDialogue = vi.fn();
    const props = { focusedDialogueKey: "intro", focusRequestID: 1, onUpdateDialogue, onExportDialogue: vi.fn(), onOpenDialogueEvent: vi.fn() };
    const view = () => <StudioI18nProvider><DialoguesWorkspace {...props} projectData={projectData} presentation={deriveDialoguesWorkspacePresentation(projectData)} /></StudioI18nProvider>;
    const { rerender } = render(view());
    fireEvent.change(screen.getByRole("searchbox", { name: "Buscar diálogo" }), { target: { value: "intro" } });
    fireEvent.click(screen.getByRole("tab", { name: "Tradução" }));
    fireEvent.change(screen.getByLabelText("Tradução de intro"), { target: { value: "Español" } });
    expect(onUpdateDialogue).toHaveBeenCalledWith("intro", { translation: "Español", translationLanguageCode: "es" });
    projectData = updateDialogueInProject(projectData, "intro", onUpdateDialogue.mock.calls[0][1]) as typeof projectData;
    rerender(view());
    expect(screen.getByRole("searchbox", { name: "Buscar diálogo" })).toHaveValue("intro");
    expect(screen.getByLabelText("Tradução de intro")).toHaveValue("Español");
    expect(projectData.dialogues[0].text).toBe("Original");
    expect(projectData.dialogues[0].translations).toEqual({ "pt-BR": "Português", es: "Español" });
  });


  it("renders authored box and selector pixels in the read-only review preview", () => {
    const projectData = {
      assets: [
        {
          name: "dialogue-box-gba.png",
          kind: "UI",
          metadata: { source: "Assets/ui/dialogue-box-gba.png" }
        },
        {
          name: "dialogue-selector-gba.png",
          kind: "UI",
          metadata: { source: "Assets/ui/dialogue-selector-gba.png" }
        },
        {
          name: "lia-portrait-gba.png",
          kind: "Portrait",
          metadata: { source: "Assets/portraits/lia-portrait-gba.png", frameWidth: 32, frameHeight: 32 }
        },
        {
          name: "emote-idea-gba.png",
          kind: "Emote",
          metadata: { source: "Assets/emotes/emote-idea-gba.png" }
        }
      ],
      dialogues: [
        {
          key: "choice",
          character: "Lia",
          portrait: "lia-portrait-gba.png",
          emote: "emote-idea-gba.png",
          text: "Escolha.",
          choices: ["Continuar"]
        }
      ],
      settings: {
        uiDialogs: {
          boxImage: "dialogue-box-gba.png",
          selectorImage: "dialogue-selector-gba.png"
        }
      }
    };
    const presentation = deriveDialoguesWorkspacePresentation(projectData);
    const { container } = render(
      <StudioI18nProvider>
        <DialoguesWorkspace
          presentation={presentation}
          focusedDialogueKey="uiDialogs"
          projectData={projectData}
          projectPath="/tmp/exemplo-gba/exemplo-gba.gba-project"


          onExportDialogue={vi.fn()}

          onOpenDialogueEvent={vi.fn()}

          onUpdateDialogue={vi.fn()}

        />
      </StudioI18nProvider>
    );

    expect(screen.getByLabelText("Preview GBA")).toBeInTheDocument();
    expect(screen.queryByText("Texto e som")).not.toBeInTheDocument();
    expect(screen.queryByText("Caixa e seletor")).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Menu Start e controles" })).not.toBeInTheDocument();
    expect(screen.queryByText("Título do menu Start")).not.toBeInTheDocument();
    const expectedProjectAssetURL = desktopAssetURL("/tmp/exemplo-gba/Assets/ui/dialogue-box-gba.png");
    const expectedSelectorAssetURL = desktopAssetURL("/tmp/exemplo-gba/Assets/ui/dialogue-selector-gba.png");
    const expectedPortraitAssetURL = desktopAssetURL("/tmp/exemplo-gba/Assets/portraits/lia-portrait-gba.png");
    const expectedEmoteAssetURL = desktopAssetURL("/tmp/exemplo-gba/Assets/emotes/emote-idea-gba.png");
    const previewCanvas = container.querySelector(".dialogue-preview-snapshot-canvas");
    const previewBox = container.querySelector(".dialogue-preview-box");
    expect(previewCanvas).toHaveAttribute("width", "240");
    expect(previewCanvas).toHaveAttribute("height", "160");
    expect(container.querySelector(".dialogue-preview-snapshot")).toHaveAttribute(
      "data-dialogue-preview-renderer",
      "native-contract"
    );
    expect(screen.getByLabelText("Preview GBA")).toHaveClass("dialogues-review-preview");
    expect(previewBox).toHaveClass("with-authored-skin");
    expect(previewBox).toHaveAttribute(
      "data-dialogue-box-source",
      expectedProjectAssetURL
    );
    expect(container.querySelector(".dialogue-preview-selector")).toHaveAttribute(
      "src",
      expectedSelectorAssetURL
    );
    expect(container.querySelector('img[alt="Retrato"]')).toHaveAttribute(
      "src",
      expectedPortraitAssetURL
    );
    expect(container.querySelector(".dialogue-preview-portrait-frame")).toBeInTheDocument();
    expect(container.querySelector(".dialogue-preview-snapshot")).toHaveAttribute(
      "data-dialogue-preview-portrait-frame-size",
      "32x32"
    );
    expect(container.querySelector('img[alt="Emote"]')).toHaveAttribute(
      "src",
      expectedEmoteAssetURL
    );
    expect(previewBox).toHaveStyle({
      backgroundImage: `url("${expectedProjectAssetURL}")`
    });
  });

  it("keeps review read-only and edits only translations, opening source authoring in the scene", async () => {
    const user = userEvent.setup();
    const presentation = deriveDialoguesWorkspacePresentation({
      localization: { sourceLocale: "pt-BR", defaultLocale: "en", enabledLocales: ["pt-BR", "en", "es"] },
      assets: [
        { name: "ana.png", kind: "Portrait" },
        { name: "smile.png", kind: "Emote" },
        { name: "text.wav", kind: "SFX" },
        { name: "ok.wav", kind: "SFX" }
      ],
      dialogues: [
        { key: "intro", character: "Ana", portrait: "ana.png", emote: "smile.png", textSound: "text.wav", confirmSound: "ok.wav", text: "Olá", translation: "Hello", translationLanguageCode: "en", choices: ["Continuar"] },
        { key: "followup", character: "Ana", portrait: "ana.png", emote: "smile.png", textSound: "text.wav", confirmSound: "ok.wav", text: "Vamos", translation: "Let's go", translationLanguageCode: "en" }
      ],
      events: [
        { id: "choice", name: "intro_choice", steps: [{ command: "show_choice intro" }, { command: "choice_event intro 0 reward" }] },
        { id: "reward", name: "reward", command: "noop" }
      ],
      settings: { uiDialogs: { font: "GBA padrao", textSpeed: "Normal", boxImage: "box.png", selectorImage: "selector.png" } }
    });
    const onUpdateDialogue = vi.fn();
    const onUpdateDialoguesUi = vi.fn();
    const onOpenDialogueEvent = vi.fn();
    const onEditDialogue = vi.fn();
    const { container } = render(
      <StudioI18nProvider>
        <DialoguesWorkspace
          presentation={presentation}



          onExportDialogue={vi.fn()}

          onOpenDialogueEvent={onOpenDialogueEvent}
          onEditDialogue={onEditDialogue}

          onUpdateDialogue={onUpdateDialogue}

        />
      </StudioI18nProvider>
    );

    expect(screen.getByLabelText("Preview GBA")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Texto" })).not.toBeInTheDocument();
    expect(screen.queryByRole("tab", { name: "Roteiro" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Aparência dos diálogos" })).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Editar na cena" }));
    expect(onEditDialogue).toHaveBeenCalledWith("intro");
    expect(onUpdateDialogue).not.toHaveBeenCalled();

    await user.click(screen.getByRole("tab", { name: "Tradução" }));
    const languageSelectors = screen.getAllByRole("combobox", { name: /Idioma de intro|Idioma da tradução/ });
    expect(languageSelectors[0]).toHaveTextContent("English");
    expect(languageSelectors[0]).toHaveTextContent("Español");
    await user.selectOptions(languageSelectors[0]!, "es");
    expect(onUpdateDialogue).toHaveBeenCalledWith("intro", { translationLanguageCode: "es" });
    await user.click(screen.getByRole("button", { name: "Traduzir intro com IA offline" }));
    expect(onUpdateDialogue).toHaveBeenCalledWith("intro", expect.objectContaining({
      translation: "IA: Olá",
      choiceTranslations: ["IA: Continuar"],
      translationStatus: "draft-ai"
    }));
    fireEvent.change(screen.getByLabelText("Tradução de intro"), { target: { value: "Hi" } });
    expect(onUpdateDialogue).toHaveBeenCalledWith("intro", expect.objectContaining({ translation: "Hi", translationLanguageCode: "en" }));

    fireEvent.change(screen.getByLabelText("Tradução das escolhas de intro"), { target: { value: "Proceed" } });
    expect(onUpdateDialogue).toHaveBeenCalledWith("intro", expect.objectContaining({ choiceTranslations: ["Proceed"], translationLanguageCode: "en" }));
    await user.click(screen.getAllByRole("button", { name: "Marcar tradução como revisada" })[0]);
    expect(onUpdateDialogue).toHaveBeenCalledWith("intro", expect.objectContaining({ translationStatus: "approved", translationLanguageCode: "en" }));
    expect(onUpdateDialogue.mock.calls.every(([, fields]) => !Object.hasOwn(fields, "text"))).toBe(true);

  });

  it("renders the speaker as a label attached above the dialogue box", async () => {
    const user = userEvent.setup();
    const presentation = deriveDialoguesWorkspacePresentation({
      dialogues: [{ key: "intro", character: "Ana", text: "Olá" }],
      settings: { uiDialogs: { nameLabelMode: "above" } }
    });
    const { container } = render(
      <StudioI18nProvider>
        <DialoguesWorkspace
          presentation={presentation}
          focusedDialogueKey="uiDialogs"
          projectData={{}}


          onExportDialogue={vi.fn()}

          onOpenDialogueEvent={vi.fn()}

          onUpdateDialogue={vi.fn()}

        />
      </StudioI18nProvider>
    );

    expect(container.querySelector(".dialogue-preview-name-label")).toHaveTextContent("Ana");
    expect(container.querySelector(".dialogue-preview-box > strong:not(.dialogue-preview-name-label)")).not.toBeInTheDocument();
  });

  it("uses one portrait and name composition from the active dialogue side", async () => {
    const user = userEvent.setup();
    const presentation = deriveDialoguesWorkspacePresentation({
      dialogues: [{ key: "npc_reply", character: "NPC", portrait: "npc.png", portraitSlot: "Direita", text: "Resposta" }],
      settings: {
        uiDialogs: {
          portraitLayout: "fixed_slots",
          portraitPosition: "Esquerda",
          showPortrait: true,
          showCharacterName: true,
          nameLabelMode: "above"
        }
      }
    });
    const { container } = render(
      <StudioI18nProvider>
        <DialoguesWorkspace
          presentation={presentation}
          focusedDialogueKey="uiDialogs"
          projectData={{}}


          onExportDialogue={vi.fn()}

          onOpenDialogueEvent={vi.fn()}

          onUpdateDialogue={vi.fn()}

        />
      </StudioI18nProvider>
    );

    const preview = container.querySelector(".dialogue-preview");
    expect(preview).toBeInTheDocument();
    expect(preview).toHaveClass("portrait-slot-right");
    expect(preview).toHaveAttribute("data-dialogue-preview-portrait-slot", "Direita");
    expect(container.querySelector(".dialogue-preview-name-label")).toHaveTextContent("NPC");
  });
});
