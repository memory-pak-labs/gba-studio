/** @vitest-environment happy-dom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { createHash } from "node:crypto";
import type { ComponentProps } from "react";
import { AudioWorkspace } from "./audioWorkspace.js";
import { deriveAudioWorkspacePresentation } from "../shared/audioWorkspace.js";
import { parseTrackerModule } from "../shared/trackerModule.js";
import { makeEditableModFixture, makeEditableS3mFixture } from "../shared/trackerModuleFixtures.js";
import { createEditableTrackerCopyInProject } from "../shared/trackerModuleEditing.js";

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
  it("offers an explicit editable copy while retaining the imported source", () => {
    const create = vi.fn(); render(<AudioWorkspace presentation={setup("MOD", false).presentation} projectPath="/project/p.gba-project" {...handlers({ onCreateEditableTracker: create })} />);
    fireEvent.click(screen.getByRole("button", { name: "Criar cópia editável" }));
    expect(create).toHaveBeenCalledWith("original");
    expect(screen.getByText("O arquivo original permanece intacto." )).toBeInTheDocument();
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
