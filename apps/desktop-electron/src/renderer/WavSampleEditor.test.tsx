/** @vitest-environment happy-dom */
import { webcrypto, createHash } from "node:crypto";
import { useState } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { encodeWav, type WavEditorSource } from "../shared/wavEditing.js";
import { WavSampleEditor } from "./WavSampleEditor.js";

const bytes = encodeWav({ sampleRate: 8000, channels: [Float32Array.from({ length: 800 }, (_, i) => Math.sin(i / 9) * .25)], loop: null });
const source: WavEditorSource = { id: "wav", name: "Bell.wav", source: "Assets/Bell.wav" };
const hash = createHash("sha256").update(bytes).digest("hex");
function setup() {
  const update = vi.fn(), editing = vi.fn();
  function Harness() {
    const [sample, setSample] = useState(source);
    return <WavSampleEditor projectPath="/QA/test.gba-project" source={sample} onEditing={editing} onChange={(id, edit) => { update(id, edit); setSample({ ...sample, edit: edit ?? undefined }); }} />;
  }
  render(<Harness />); return { update, editing };
}
beforeEach(() => { vi.stubGlobal("crypto", webcrypto); vi.stubGlobal("fetch", vi.fn().mockImplementation(async () => new Response(Uint8Array.from(bytes).buffer))); });
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function field(name: string, value: string) { const input = screen.getByRole("spinbutton", { name }); fireEvent.change(input, { target: { value } }); fireEvent.blur(input); }

describe("visual WAV editing", () => {
  it("draws real amplitudes and stores exact selection, loop, fades and crop without rewriting the source", async () => {
    const { update, editing } = setup();
    await screen.findByRole("group", { name: "Forma de onda WAV e seleção" });
    expect(document.querySelector(".wav-editor-samples")?.getAttribute("d")).toContain("V");
    field("Início da seleção", "25"); field("Fim da seleção", "75");
    expect(update).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Normalizar seleção" }));
    expect(update).toHaveBeenLastCalledWith("wav", expect.objectContaining({ sourceSha256: hash, operations: [{ type: "normalize", start: 200, end: 600 }] }));
    fireEvent.click(screen.getByRole("button", { name: "Fade-in" }));
    fireEvent.click(screen.getByRole("button", { name: "Fade-out" }));
    fireEvent.click(screen.getByRole("button", { name: "Definir loop pela seleção" }));
    expect(update).toHaveBeenLastCalledWith("wav", expect.objectContaining({ loop: { start: 200, end: 600 } }));
    fireEvent.click(screen.getByRole("button", { name: "Recortar à seleção" }));
    expect(update).toHaveBeenLastCalledWith("wav", expect.objectContaining({ trimStart: 200, trimEnd: 600 }));
    expect(screen.getByRole("slider", { name: "Início do loop" })).toHaveAttribute("aria-valuenow", "0");
    expect(editing).toHaveBeenCalledTimes(5); expect(update).toHaveBeenCalledTimes(5);
    fireEvent.click(screen.getByRole("button", { name: "Remover edições do WAV" })); expect(update).toHaveBeenLastCalledWith("wav", null);
  });
  it("supports keyboard loop handles and numeric endpoints with one commit per interaction", async () => {
    const { update } = setup(); await screen.findByRole("group", { name: "Forma de onda WAV e seleção" });
    fireEvent.click(screen.getByRole("button", { name: "Definir loop pela seleção" }));
    fireEvent.keyDown(screen.getByRole("slider", { name: "Início do loop" }), { key: "ArrowRight", shiftKey: true });
    expect(update).toHaveBeenLastCalledWith("wav", expect.objectContaining({ loop: { start: 100, end: 800 } }));
    field("Fim do loop", "90"); expect(update).toHaveBeenLastCalledWith("wav", expect.objectContaining({ loop: { start: 100, end: 720 } }));
    fireEvent.click(screen.getByRole("button", { name: "Remover região de loop" })); expect(update).toHaveBeenLastCalledWith("wav", expect.objectContaining({ loop: null }));
  });
  it("keeps dragging local until an operation, supports zoom and rejects invalid sources", async () => {
    const { update } = setup(); const svg = await screen.findByRole("group", { name: "Forma de onda WAV e seleção" });
    svg.setPointerCapture = vi.fn(); vi.spyOn(svg, "getBoundingClientRect").mockReturnValue({ left: 0, width: 1000 } as DOMRect);
    fireEvent.pointerDown(svg, { button: 0, pointerId: 1, clientX: 250 }); fireEvent.pointerMove(svg, { pointerId: 1, clientX: 750 }); fireEvent.pointerUp(svg, { pointerId: 1, clientX: 750 });
    expect(update).not.toHaveBeenCalled(); fireEvent.click(screen.getByRole("button", { name: "Definir loop pela seleção" }));
    expect(update).toHaveBeenLastCalledWith("wav", expect.objectContaining({ loop: { start: 200, end: 600 } }));
    fireEvent.click(screen.getByRole("button", { name: "Ampliar forma de onda" })); expect(screen.getByRole("slider", { name: "Posição da visualização" })).toBeInTheDocument();
    cleanup(); vi.mocked(fetch).mockResolvedValue(new Response("bad")); setup();
    expect(await screen.findByRole("alert")).toHaveTextContent(/WAV/); expect(screen.queryByRole("button", { name: "Normalizar seleção" })).not.toBeInTheDocument();
  });
  it("offers recovery when persisted edits belong to a different source", async () => {
    const update = vi.fn();
    render(<WavSampleEditor projectPath="/QA/test.gba-project" source={{ ...source, edit: { version: 1, sourceSha256: "a".repeat(64), sourceFrames: 800, sampleRate: 8000, trimStart: 0, trimEnd: 800, operations: [], loop: null } }} onChange={update} onEditing={() => {}} />);
    expect(await screen.findByRole("alert")).toHaveTextContent(/alterada fora/);
    fireEvent.click(screen.getByRole("button", { name: "Remover edições do WAV" })); expect(update).toHaveBeenCalledWith("wav", null);
    await waitFor(() => expect(screen.queryByRole("button", { name: "Normalizar seleção" })).not.toBeInTheDocument());
  });
});
