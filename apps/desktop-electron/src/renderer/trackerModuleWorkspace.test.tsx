/** @vitest-environment happy-dom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within, waitFor } from "@testing-library/react";
import { createHash } from "node:crypto";
import type { ComponentProps } from "react";
import { AudioWorkspace } from "./audioWorkspace.js";
import { deriveAudioWorkspacePresentation } from "../shared/audioWorkspace.js";
import { parseTrackerModule } from "../shared/trackerModule.js";
import { makeEditableModFixture, makeEditableS3mFixture } from "../shared/trackerModuleFixtures.js";
import { prepareTrackerModuleForEditingInProject, createEditableTrackerCopyInProject } from "../shared/trackerModuleEditing.js";

afterEach(cleanup);
const handlers = (overrides = {}) => ({ ...Object.fromEntries([
  "onCreateAudio", "onUpdateAudioFields", "onUpdateAudioChannelFields", "onRenameAudioChannel", "onUpdateAudioChannelType", "onCreateAudioChannel", "onRemoveAudioChannel",
  "onSetAudioChannelNote", "onApplyAudioPatternPreset", "onMoveAudioChannelNote", "onTransposeAudioChannel", "onTransposeAudioChannelNote", "onUpdateAudioChannelNote",
  "onUpdateAudioPatternOrderSlot", "onCreateAudioPattern", "onRenameAudioPattern", "onRemoveAudioPattern", "onSetActivePattern", "onDuplicatePattern", "onClearPatternSequence",
  "onMovePatternOrderSlot", "onNormalizeAudio", "onRenameAudio", "onDuplicateAudio", "onExportAudio", "onImportAudio", "onRemoveAudio"
].map(name => [name, vi.fn()])), ...overrides } as Omit<ComponentProps<typeof AudioWorkspace>, "presentation">);
function setup(format: "MOD" | "S3M" = "MOD", editable = true) {
  const bytes = format === "MOD" ? makeEditableModFixture(16) : makeEditableS3mFixture();
  const data = { audioItems: [{ id: "original", name: "Tema", kind: "Musica", sourceAssetID: "source" }],
    assets: [{ id: "source", name: `source.${format.toLowerCase()}`, kind: "Audio", metadata: { source: `Assets/source.${format.toLowerCase()}` } }] };
  const song = parseTrackerModule(bytes, format, createHash("sha256").update(bytes).digest("hex"));
  const copy = editable ? createEditableTrackerCopyInProject(data, "original", song, "edit") : data;
  return { data: copy, song, presentation: deriveAudioWorkspacePresentation(copy) };
}
function selectEditable() { fireEvent.click(screen.getByRole("button", { name: "Selecionar áudio Tema (editável)" })); }
describe("native MOD/S3M workspace", () => {
  it("offers editing of the selected item while retaining the imported source file", () => {
    const create = vi.fn(); render(<AudioWorkspace presentation={setup("MOD", false).presentation} projectPath="/project/p.gba-project" {...handlers({ onCreateEditableTracker: create })} />);
    fireEvent.click(screen.getByRole("button", { name: "Editar música" }));
    expect(create).toHaveBeenCalledWith("original");
    expect(screen.getByText("As alterações são salvas no projeto e atualizam os usos desta música. O arquivo importado é preservado." )).toBeInTheDocument();
  });
  it("retains the imported selection and search and moves focus to the editor after preparation", async () => {
    const { data, song, presentation } = setup("MOD", false);
    const prepare = vi.fn(); const props = handlers({ onCreateEditableTracker: prepare });
    const view = render(<AudioWorkspace presentation={presentation} projectPath="/project/p.gba-project" {...props} />);
    fireEvent.change(screen.getByRole("searchbox", { name: "Buscar áudio" }), { target: { value: "Tema" } });
    fireEvent.click(screen.getByRole("button", { name: "Editar música" }));
    await waitFor(() => expect(prepare).toHaveBeenCalledTimes(1));
    const next = prepareTrackerModuleForEditingInProject(data, "original", song);
    view.rerender(<AudioWorkspace presentation={deriveAudioWorkspacePresentation(next)} projectPath="/project/p.gba-project" {...props} />);
    expect(screen.getByRole("searchbox", { name: "Buscar áudio" })).toHaveValue("Tema");
    expect(screen.getByRole("button", { name: "Selecionar áudio Tema" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("heading", { name: "Tema" })).toHaveFocus();
    expect(screen.getByRole("button", { name: "Selecionar canal Canal 16" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Editar música" })).not.toBeInTheDocument();
  });
  it("edits a module note in the Piano Roll with all sixteen source channels reachable", () => {
    const update = vi.fn(); const { presentation, song } = setup();
    render(<AudioWorkspace presentation={presentation} {...handlers({ onUpdateTrackerModule: update })} />); selectEditable();
    expect(screen.getByRole("button", { name: "Selecionar canal Canal 16" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Adicionar D4 no passo 2 de Canal 1/ }));
    expect(update).toHaveBeenCalledWith("edit", { type: "cell", patternID: song.patterns[0].id, channelID: song.patterns[0].channels[0].id, row: 1, fields: { note: "D4" } });
  });
  it("shows instruments and native effects in Tracker cells and commits the parameter once", () => {
    const update = vi.fn(); const { presentation, song } = setup();
    render(<AudioWorkspace presentation={presentation} {...handlers({ onUpdateTrackerModule: update })} />); selectEditable();
    fireEvent.click(screen.getByRole("button", { name: "Tracker" }));
    fireEvent.click(screen.getByRole("button", { name: "Linha 1, Canal 1: C4, instrumento 01, efeito F06" }));
    const parameter = screen.getByRole("textbox", { name: "Parâmetro (hex)" });
    fireEvent.change(parameter, { target: { value: "0A" } }); expect(update).not.toHaveBeenCalled(); fireEvent.blur(parameter);
    expect(update).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith("edit", { type: "cell", patternID: song.patterns[0].id, channelID: song.patterns[0].channels[0].id, row: 0, fields: { parameter: 10 } });
    expect(within(screen.getByRole("combobox", { name: "Instrumento do passo" })).getByRole("option", { name: /01.*Fixture PCM/ })).toBeInTheDocument();
  });
  it("exposes the S3M volume column and note cuts without converting commands", () => {
    const update = vi.fn(); render(<AudioWorkspace presentation={setup("S3M").presentation} {...handlers({ onUpdateTrackerModule: update })} />); selectEditable();
    fireEvent.click(screen.getByRole("button", { name: "Tracker" }));
    expect(screen.getByRole("button", { name: /Linha 3, Canal 3: OFF/ })).toBeInTheDocument();
    expect(screen.getByRole("spinbutton", { name: "Volume do passo" })).toBeInTheDocument();
  });
});
