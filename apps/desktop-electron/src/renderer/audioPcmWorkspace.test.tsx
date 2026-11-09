/** @vitest-environment happy-dom */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ComponentProps } from "react";
import { createBlankProjectData } from "../shared/newProject.js";
import { createAudioItemInProject, deriveAudioWorkspacePresentation } from "../shared/audioWorkspace.js";
import { AudioWorkspace } from "./audioWorkspace.js";

const native = vi.hoisted(() => ({ stop: vi.fn() }));
vi.mock("./engineAudioPreview.js", () => ({ startEngineAudioPreview: vi.fn(options => {
  void options.prepare("native-ui-test");
  return { id: "native-ui-test", ready: Promise.resolve(true), stop: native.stop };
}) }));
function handlers(overrides: Record<string, unknown> = {}) {
  return { ...Object.fromEntries([
    "onCreateAudio", "onCreateAudioInstrument", "onUpdateAudioInstrument", "onRemoveAudioInstrument", "onUpdateAudioFields", "onUpdateAudioChannelFields",
    "onRenameAudioChannel", "onUpdateAudioChannelType", "onCreateAudioChannel", "onRemoveAudioChannel", "onSetAudioChannelNote", "onApplyAudioPatternPreset",
    "onMoveAudioChannelNote", "onTransposeAudioChannel", "onTransposeAudioChannelNote", "onUpdateAudioChannelNote", "onUpdateAudioPatternOrderSlot", "onCreateAudioPattern",
    "onRenameAudioPattern", "onRemoveAudioPattern", "onSetActivePattern", "onDuplicatePattern", "onClearPatternSequence", "onMovePatternOrderSlot", "onNormalizeAudio",
    "onRenameAudio", "onDuplicateAudio", "onExportAudio", "onImportAudio", "onRemoveAudio", "onUpdatePcmSfx", "onStopEnginePreview"
  ].map(name => [name, vi.fn()])), ...overrides } as Omit<ComponentProps<typeof AudioWorkspace>, "presentation">;
}
const blank = () => createBlankProjectData({ name: "Compositor", includeStarterContent: false });
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe("visual PCM composer", () => {
  it("offers PCM music and effects as explicit creation choices", async () => {
    const create = vi.fn();
    render(<AudioWorkspace presentation={deriveAudioWorkspacePresentation(blank())} {...handlers({ onCreateAudio: create })} />);
    await userEvent.click(screen.getByRole("button", { name: "Criar música" }));
    await userEvent.click(screen.getByRole("button", { name: "Música PCM" }));
    expect(create).toHaveBeenCalledWith("Musica", "PCM");
  });
  it("keeps sixteen lanes reachable while editing one full piano at a time", async () => {
    const data = createAudioItemInProject(blank(), { id: "song", name: "Tema", kind: "Musica", synthesis: "PCM" });
    const audio = (data.audioItems as any[])[0];
    audio.patterns[0].channels = Array.from({ length: 16 }, (_, i) => ({ id: `v${i}`, name: `Faixa ${i + 1}`, type: "pcm", instrument: "PCM Triangle", notes: ["C4"] }));
    const update = vi.fn();
    render(<AudioWorkspace presentation={deriveAudioWorkspacePresentation(data)} {...handlers({ onUpdateAudioChannelFields: update })} />);
    expect(screen.getByRole("button", { name: "Adicionar faixa" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Selecionar canal Faixa 16" }));
    expect(screen.getByRole("region", { name: "Faixa Faixa 16" })).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Faixa Faixa 1" })).not.toBeInTheDocument();
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Instrumento do canal" }), "PCM Saw");
    expect(update).toHaveBeenCalledWith("song", "v15", { instrumentID: null, instrument: "PCM Saw", sampleAssetID: null });
  });
  it("commits an SFX duration gesture once and offers a WAV source", () => {
    const data = createAudioItemInProject(blank(), { id: "fx", name: "Impacto", kind: "SFX", synthesis: "PCM" });
    data.assets = [...data.assets as any[], { id: "wav", name: "Sino.wav", kind: "Audio", metadata: { source: "Assets/Sino.wav" } }];
    const update = vi.fn();
    render(<AudioWorkspace presentation={deriveAudioWorkspacePresentation(data)} {...handlers({ onUpdatePcmSfx: update })} />);
    const duration = screen.getByRole("slider", { name: "Duração do efeito" });
    fireEvent.change(duration, { target: { value: "400" } }); fireEvent.change(duration, { target: { value: "500" } });
    expect(update).not.toHaveBeenCalled();
    fireEvent.pointerUp(duration);
    expect(update).toHaveBeenCalledOnce(); expect(update).toHaveBeenCalledWith("fx", expect.objectContaining({ durationMs: 500 }));
    fireEvent.change(screen.getByRole("combobox", { name: "Fonte do efeito" }), { target: { value: "sample" } });
    expect(update).toHaveBeenLastCalledWith("fx", expect.objectContaining({ source: "sample", sampleAssetID: "wav" }));
  });
  it("routes transport to the engine and stops it when the user stops playback", async () => {
    const data = createAudioItemInProject(blank(), { id: "song", name: "Tema", kind: "Musica", synthesis: "PCM" });
    const prepare = vi.fn().mockResolvedValue({ ok: true });
    render(<AudioWorkspace presentation={deriveAudioWorkspacePresentation(data)} {...handlers({ onPrepareEnginePreview: prepare })} />);
    await userEvent.click(screen.getByRole("button", { name: "Tocar áudio" }));
    await waitFor(() => expect(prepare).toHaveBeenCalledWith(expect.objectContaining({ audioID: "song", requestID: "native-ui-test", scope: "pattern" })));
    await waitFor(() => expect(screen.getByText("Tocando Tema (loop)")).toHaveTextContent("Tocando Tema"));
    await userEvent.click(screen.getByRole("button", { name: "Parar áudio" })); expect(native.stop).toHaveBeenCalled();
  });
});
