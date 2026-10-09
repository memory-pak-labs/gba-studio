import { describe, expect, it } from "vitest";
import { createAudioItemInProject, createAudioPatternInProject, updateAudioChannelFieldsInProject, createAudioChannelInProject, deriveAudioPreviewPlaybackPlan, deriveAudioWorkspacePresentation, duplicateAudioItemInProject, prepareAudioExport, removeAudioItemFromProject, renameAudioItemInProject, updateAudioItemFieldsInProject } from "./audioWorkspace.js";
import { buildAssetcAudioPackGeneration, compileComposedMusicaToTracker, compileComposedSfxToAssetc } from "./engineProjectExport.js";

const voice = (id: string, type: string, note = "C4") => ({ id, name: id, type, volume: 80, notes: [note, "---"] });
const music = () => ({ id: "a", name: "Tema", kind: "Musica", format: "COMPOSED", volume: 100, bpm: 120, loops: true, activePatternID: "p2", patternOrder: ["p1", "p2"], patterns: [
  { id: "p1", name: "Entrada", steps: 2, channels: [voice("c1", "pulse1")] },
  { id: "p2", name: "Fim", steps: 2, channels: [voice("c2", "pulse2", "E4")] }
] });
const imported = () => ({ assets: [{ id: "source", name: "hit.wav", kind: "SFX", metadata: { source: "Assets/sfx/hit.wav" } }], audioItems: [{ id: "a", name: "hit.wav", kind: "SFX", format: "WAV", loops: false }] });

describe("regressões do contrato de áudio", () => {
  it("preserva a fonte ao renomear e duplicar um importado", () => {
    const renamed = renameAudioItemInProject(imported(), "a", "Impacto");
    expect(deriveAudioWorkspacePresentation(renamed).items[0]).toMatchObject({ source: "Assets/sfx/hit.wav", origin: "Importado" });
    expect(buildAssetcAudioPackGeneration(renamed)?.document.pcm[0]).toMatchObject({ wav: "hit.wav" });
    const duplicated = duplicateAudioItemInProject(renamed, { sourceAudioID: "a", newAudioID: "b", newName: "Impacto 2" });
    expect(deriveAudioWorkspacePresentation(duplicated).items.every(item => item.source === "Assets/sfx/hit.wav")).toBe(true);
    expect(buildAssetcAudioPackGeneration(duplicated)?.document.pcm).toHaveLength(2);
  });
  it("atualiza referências táticas e de diálogo ao renomear/remover", () => {
    const data = { audioItems: [music()], scenas: [{ name: "Sala", music: "Tema", runtime: { config: { tacticalPresentation: { audio: { music: "Tema", cues: { cursor: "Tema" } } } } } }], dialogues: [{ id: "d", textSound: "Tema", confirmSound: "Tema" }] };
    const renamed = renameAudioItemInProject(data, "a", "Trilha");
    expect(renamed.scenas).toMatchObject([{ music: "Trilha", runtime: { config: { tacticalPresentation: { audio: { music: "Trilha", cues: { cursor: "Trilha" } } } } } }]);
    expect(renamed.dialogues).toMatchObject([{ textSound: "Trilha", confirmSound: "Trilha" }]);
    const removed = removeAudioItemFromProject(renamed, "a");
    expect(JSON.stringify(removed)).not.toContain('"Trilha"');
  });
  it("rejeita colisões de nomes sem alterar dados", () => {
    const data = { audioItems: [music(), { id: "b", name: "Outro", kind: "Musica" }] };
    expect(renameAudioItemInProject(data, "a", "Outro")).toBe(data);
  });
  it("não cria um canal que duplica a voz física", () => {
    const data = { audioItems: [music()] };
    expect(createAudioChannelInProject(data, "a", { id: "extra", name: "Extra", type: "pulse2", patternID: "p2" })).toBe(data);
  });
  it("mostra canais existentes inválidos em vez de escondê-los e informa o bloqueio", () => {
    const audio = music();
    audio.patterns[1].channels = [voice("a", "pulse1"), voice("b", "pulse2"), voice("c", "wave"), voice("d", "noise", "K"), voice("e", "wave")];
    const item = deriveAudioWorkspacePresentation({ audioItems: [audio] }).items[0];
    expect(item.previewRows).toHaveLength(5);
    expect(item.status).toBe("Bloqueado");
  });
  it("aplica ganho geral a canais com volume explícito", () => {
    const audio = music();
    const compiled = compileComposedMusicaToTracker({ ...audio, volume: 0 }, "a");
    expect(compiled?.patterns?.flatMap(p => p.steps).every(s => s.volume === 0)).toBe(true);
    expect(compileComposedMusicaToTracker({ ...audio, volume: 50 }, "a")?.patterns?.[0].steps[0].volume).toBe(6);
  });
  it("limita a escala de volume geral a 100", () => {
    const changed = updateAudioItemFieldsInProject({ audioItems: [music()] }, "a", { volume: 127 });
    expect((changed.audioItems as Record<string, unknown>[])[0].volume).toBe(100);
  });
  it("Solo filtra somente a audição, sem mudar a compilação da ROM", () => {
    const audio = music();
    audio.patterns[1].channels.push({ ...voice("c3", "wave"), solo: true } as ReturnType<typeof voice>);
    const item = deriveAudioWorkspacePresentation({ audioItems: [audio] }).items[0];
    expect(deriveAudioPreviewPlaybackPlan(item).steps.flatMap(s => s.notes).every(n => n.channel === 3)).toBe(true);
    expect(compileComposedMusicaToTracker(audio, "a")?.patterns?.[1].steps.filter(s => s.volume > 0)).toHaveLength(2);
  });
  it("exporta toda a composição, incluindo canais de patterns não selecionados", () => {
    const audio = music();
    const exported = JSON.parse(prepareAudioExport({ audioItems: [audio] }, "a")!.contents);
    expect(exported.audio.patterns).toEqual(audio.patterns);
    expect(exported.audio.patternOrder).toEqual(["p1", "p2"]);
  });
  it("preserva a ordem de patterns do SFX monofônico", () => {
    const audio = { ...music(), kind: "SFX", loops: false, patternOrder: ["p2", "p1"] };
    const compiled = compileComposedSfxToAssetc(audio, "a");
    expect(compiled?.tones).toHaveLength(4);
    expect(compiled?.tones[0].frequency_hz).toBe(330);
  });
});

 describe("edição coerente com a ROM", () => {
  it("cria SFX e seus novos patterns com uma voz editável", () => {
    let data = createAudioItemInProject({}, { id: "s", name: "Efeito", kind: "SFX" });
    expect(deriveAudioWorkspacePresentation(data).items[0].previewRows).toHaveLength(1);
    data = createAudioPatternInProject(data, "s", { id: "p", name: "Novo" });
    expect((data.audioItems as any[])[0].patterns.at(-1).channels).toHaveLength(1);
  });
  it("rejeita a troca de tipo que colide com outra voz", () => {
    const audio = music(); audio.patterns[1].channels.push(voice("wave", "wave"));
    const data = { audioItems: [audio] };
    expect(updateAudioChannelFieldsInProject(data, "a", { channelID: "wave", type: "pulse2" })).toBe(data);
  });
  it("a prévia de pattern toca o pattern selecionado, mesmo fora da ordem", () => {
    const audio = music(); audio.patternOrder = ["p1"];
    const item = deriveAudioWorkspacePresentation({ audioItems: [audio] }).items[0];
    const plan = deriveAudioPreviewPlaybackPlan(item, { scope: "pattern" });
    expect(plan.stepCount).toBe(2);
    expect(plan.steps[0].notes[0].frequency).toBe(330);
  });
 });

it("cria explicitamente um item importado sem encobrir o WAV com um pattern vazio", () => {
  const original = imported(); original.audioItems = [];
  const result = createAudioItemInProject(original, { id: "new", name: "Impacto", kind: "SFX", sourceAssetID: "source" });
  const item = deriveAudioWorkspacePresentation(result).items[0];
  expect(item).toMatchObject({ source: "Assets/sfx/hit.wav", patternCount: 0, format: "WAV", origin: "Importado" });
  expect(buildAssetcAudioPackGeneration(result)?.document.pcm).toHaveLength(1);
});

it("avisa sobre Wave legado em SFX e conserva a execução em Pulse 1", () => {
  const item = deriveAudioWorkspacePresentation({ audioItems: [{ id: "s", name: "Sfx", kind: "SFX", channels: [voice("c", "wave")] }] }).items[0];
  expect(item.errors).toEqual([]);
  expect(item.warnings.some(message => message.includes("Pulse 1 ou Noise"))).toBe(true);
  expect(deriveAudioPreviewPlaybackPlan(item).steps[0].notes[0].channel).toBe(1);
});
it("usa o formato real do arquivo importado em vez de um campo textual desatualizado", () => {
  const data = imported(); data.audioItems[0].format = "MP3";
  expect(deriveAudioWorkspacePresentation(data).items[0].format).toBe("WAV");
  expect(buildAssetcAudioPackGeneration(data)?.document.pcm).toHaveLength(1);
});

it("não permite criar uma voz de SFX que a engine não executa", () => {
  const data = { audioItems: [{ id: "a", name: "SFX", kind: "SFX", channels: [] }] };
  expect(createAudioChannelInProject(data, "a", { id: "wave", name: "Wave", type: "wave" })).toBe(data);
});
it("o JSON conserva o mesmo áudio compilado de toda a composição", () => {
  const audio = music();
  const exported = JSON.parse(prepareAudioExport({ audioItems: [audio] }, "a")!.contents);
  expect(compileComposedMusicaToTracker(exported.audio, "theme")).toEqual(compileComposedMusicaToTracker(audio, "theme"));
});

it("não dá diagnóstico de exportação OK a um formato importado não suportado", () => {
  const data = { assets: [{ id: "xm", name: "tema.xm", kind: "Musica", metadata: { source: "Assets/music/tema.xm" } }], audioItems: [{ id: "a", name: "tema.xm", kind: "Musica", format: "XM" }] };
  const result = deriveAudioWorkspacePresentation(data);
  expect(result.items[0].status).toBe("Bloqueado");
  expect(result.exportDiagnostics.some(diagnostic => diagnostic.level === "ok")).toBe(false);
  expect(result.exportDiagnostics.some(diagnostic => diagnostic.message.includes("bloqueada"))).toBe(true);
});

it("não anuncia exportação pronta se a fonte do importado está ausente", () => {
  const result = deriveAudioWorkspacePresentation({ audioItems: [{ id: "a", name: "Ausente", kind: "SFX", format: "WAV" }] });
  expect(result.exportDiagnostics.some(diagnostic => diagnostic.level === "ok")).toBe(false);
});

it("o diagnóstico de exportação usa a extensão da fonte preservada", () => {
  const data = imported(); data.audioItems[0].format = "MP3";
  const result = deriveAudioWorkspacePresentation(data);
  expect(result.exportDiagnostics).toContainEqual(expect.objectContaining({ audioID: "a", level: "ok", message: expect.stringContaining("WAV") }));
});
