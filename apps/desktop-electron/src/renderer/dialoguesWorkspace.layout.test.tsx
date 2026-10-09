/** @vitest-environment happy-dom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { deriveDialoguesWorkspacePresentation } from "../shared/dialoguesWorkspace";
import { DialoguesWorkspace } from "./dialoguesWorkspace";
import { StudioI18nProvider } from "./i18n";
import { deriveDialoguePreviewPages } from "./dialoguePreviewSnapshot";
import { dialoguePreviewLayoutForSettings, resolveDialogueUiSettings } from "../shared/sceneRuntimeExport";

afterEach(() => { cleanup(); window.localStorage.clear(); });
const settings = resolveDialogueUiSettings({ showPortrait: false, showCharacterName: false, boxHeight: 40 });
const callbacks = () => ({ onOpenDialogueEvent: vi.fn(), onExportDialogue: vi.fn(), onUpdateDialogue: vi.fn(), onEditDialogue: vi.fn() });
const project = {
 localization: { sourceLocale: "pt-BR", defaultLocale: "pt-BR", enabledLocales: ["pt-BR", "en"] },
 settings: { uiDialogs: { showCharacterName: false, boxHeight: 40 } },
 scenas: [{ id: "room", name: "porto", displayName: "Porto", backgroundAssetName: "port.png", runtime: { type: "cutscene", config: { steps: [{ dialogueKey: "intro", backgroundAssetName: "night.png" }] } } }],
 assets: [{ name: "port.png", metadata: { source: "Assets/backgrounds/port.png" } }, { name: "night.png", metadata: { source: "Assets/backgrounds/night.png" } }],
 dialogues: [{ key: "intro", character: "Ana", text: "Uma primeira linha.\nUma segunda linha.\nUma terceira linha.\nUma quarta linha.", translations: { en: "English translation" } }, { key: "unused", text: "Sem vínculo" }]
};
function show(data = project) { const actions = callbacks(); const view = render(<StudioI18nProvider><DialoguesWorkspace {...actions} projectData={data} projectPath="/tmp/game/game.gba-project" presentation={deriveDialoguesWorkspacePresentation(data)} /></StudioI18nProvider>); return { ...view, actions }; }

describe("dialogue review pagination", () => {
 it("keeps every wrapped line across pages without replacing text with ellipses", () => {
  const pages = deriveDialoguePreviewPages(settings, dialoguePreviewLayoutForSettings(settings), "", "First\nSecond\nThird\nFourth\nFifth\nSixth\nSeventh", []);
  expect(pages).toHaveLength(3);
  expect(pages.flatMap(page => page.lines)).toEqual(["First", "Second", "Third", "Fourth", "Fifth", "Sixth", "Seventh"]);
 });
 it("reserves portrait columns and keeps all choices available in separate preview pages", () => {
  const pages = deriveDialoguePreviewPages(settings, dialoguePreviewLayoutForSettings(settings), "", "Choose.", ["One", "Two", "Three", "Four", "Five"], 4);
  expect(pages).toHaveLength(3);
  expect(pages[0].columns).toBe(22);
  expect(pages[2].lines).toContain("! Five");
 });
});
describe("approved dialogue workspace", () => {
 it("shows a scene group, actual cutscene background, pages and a single edit action", () => {
  const { container, actions } = show();
  expect(screen.getByRole("heading", { name: "Porto" })).toBeInTheDocument();
  expect(container.querySelector('.dialogues-preview-background')).toHaveAttribute('src', expect.stringContaining('night.png'));
  expect(screen.getByRole("button", { name: "Próxima página" })).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "Próxima página" }));
  expect(screen.getByText("Página 2 de 2")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Editar na cena" }));
  expect(actions.onEditDialogue).toHaveBeenCalledWith("intro", "room");
  fireEvent.click(screen.getByRole("button", { name: "Abrir cena" }));
  expect(actions.onEditDialogue).toHaveBeenCalledWith("intro", "room");
  expect(actions.onOpenDialogueEvent).not.toHaveBeenCalled();
  expect(actions.onUpdateDialogue).not.toHaveBeenCalled();
 });
 it("shows an empty selection when a filter has no matches instead of the previous dialogue", () => {
  show();
  fireEvent.change(screen.getByRole("searchbox", { name: "Buscar diálogo" }), { target: { value: "no-such-dialogue" } });
  expect(screen.getAllByText("Nenhum diálogo corresponde ao filtro.").length).toBeGreaterThan(0);
  expect(screen.queryByRole("button", { name: "Próxima página" })).not.toBeInTheDocument();
 });
 it("labels a missing translation and supports keyboard tab navigation", () => {
  const { actions } = show({ ...project, localization: { ...project.localization, enabledLocales: ["pt-BR", "en", "es"] } });
  fireEvent.change(screen.getByRole("combobox", { name: "Idioma da prévia" }), { target: { value: "es" } });
  expect(screen.getByText("Tradução ausente: mostrando o texto de origem.")).toBeInTheDocument();
  fireEvent.keyDown(screen.getByRole("tablist"), { key: "ArrowRight" });
  expect(screen.getByRole("tab", { name: "Tradução" })).toHaveAttribute("aria-selected", "true");
  expect(screen.getByRole("tab", { name: "Tradução" })).toHaveFocus();
  expect(actions.onUpdateDialogue).not.toHaveBeenCalled();
 });
 it("changes the preview language without writing project data", () => {
  const { container, actions } = show();
  fireEvent.change(screen.getByRole("combobox", { name: "Idioma da prévia" }), { target: { value: "en" } });
  expect(container.querySelector('.dialogues-script-text')).toHaveTextContent('English translation');
  expect(actions.onUpdateDialogue).not.toHaveBeenCalled();
 });
});
