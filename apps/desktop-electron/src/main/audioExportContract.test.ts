import { describe, expect, it } from "vitest";
import { prepareEngineProjectExport } from "./exportEngineProject.js";
const channel = (id: string) => ({ id, name: id, type: "wave", notes: ["C4"] });
describe("bloqueios de áudio no export", () => {
  it("não gera ROM com vozes sobrepostas ou perda silenciosa de canais", () => {
    const result = prepareEngineProjectExport({ audioItems: [{ id: "a", name: "Tema", kind: "Musica", patterns: [{ id: "p", channels: [channel("c1"), channel("c2")] }] }] });
    expect(result.error).toContain("mesma voz PSG"); expect(result.generated).toBeUndefined();
  });
  it("bloqueia importados cuja fonte não existe no projeto", () => {
    const result = prepareEngineProjectExport({ audioItems: [{ id: "a", name: "hit.wav", kind: "SFX", format: "WAV", sourceAssetID: "gone" }] });
    expect(result.error).toContain("Arquivo de áudio ausente");
  });
});
