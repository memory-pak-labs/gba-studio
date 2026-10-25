import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { createExternalReviewDirectory } from "./lib/external-review-directory.mjs";

const sampleRate = 31536;
const specs = [
  { id: "abrir", label: "Abrir o menu", duration: 0.48, gain: 0.12,
    notes: [["D5", 0, 0.27, 1], ["A5", 0.10, 0.22, 0.65], ["F#5", 0.20, 0.26, 0.80]] },
  { id: "navegar", label: "Trocar de opção", duration: 0.10, gain: 0.10,
    notes: [["A4", 0, 0.09, 1]] },
  { id: "confirmar", label: "Confirmar", duration: 0.40, gain: 0.13,
    notes: [["D5", 0, 0.15, 0.70], ["F#5", 0.065, 0.17, 0.80], ["A5", 0.13, 0.25, 1]] },
  { id: "voltar", label: "Voltar", duration: 0.25, gain: 0.11,
    notes: [["A4", 0, 0.13, 0.75], ["D4", 0.085, 0.15, 1]] },
  { id: "indisponivel", label: "Opção indisponível", duration: 0.24, gain: 0.10,
    notes: [["E4", 0, 0.13, 0.8], ["D4", 0.075, 0.15, 0.8]] }
];
function frequency(note) {
  const [, letter, sharp, octave] = note.match(/^([A-G])(#?)(\d)$/);
  const midi = 12 * (Number(octave) + 1) + { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[letter] + (sharp ? 1 : 0);
  return 440 * 2 ** ((midi - 69) / 12);
}
function synth(spec) {
  const samples = new Int16Array(Math.ceil(spec.duration * sampleRate));
  for (let i = 0; i < samples.length; i++) {
    const time = i / sampleRate;
    let signal = 0;
    for (const [note, start, length, velocity] of spec.notes) {
      const t = time - start;
      if (t < 0 || t >= length) continue;
      // Rounded attack, damped body and a smooth release prevent hard clicks.
      const attack = Math.sin(Math.min(1, t / 0.008) * Math.PI / 2) ** 2;
      const release = Math.sin(Math.min(1, (length - t) / 0.040) * Math.PI / 2) ** 2;
      const envelope = attack * release * Math.exp(-t * 11);
      const phase = 2 * Math.PI * frequency(note) * t;
      const mallet = (Math.sin(phase) + 0.12 * Math.sin(phase * 2) * Math.exp(-t * 25)
        + 0.025 * Math.sin(phase * 3) * Math.exp(-t * 45)) / 1.145;
      signal += mallet * envelope * velocity;
    }
    samples[i] = Math.round(signal * spec.gain * 32767);
  }
  return samples;
}
function wav(samples) {
  const bytes = Buffer.alloc(44 + samples.length * 2);
  bytes.write("RIFF"); bytes.writeUInt32LE(bytes.length - 8, 4); bytes.write("WAVEfmt ", 8);
  bytes.writeUInt32LE(16, 16); bytes.writeUInt16LE(1, 20); bytes.writeUInt16LE(1, 22);
  bytes.writeUInt32LE(sampleRate, 24); bytes.writeUInt32LE(sampleRate * 2, 28);
  bytes.writeUInt16LE(2, 32); bytes.writeUInt16LE(16, 34); bytes.write("data", 36);
  bytes.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((sample, i) => bytes.writeInt16LE(sample, 44 + i * 2));
  return bytes;
}
/** Reproduce the original sounds into a fresh candidate folder; never promote them. */
export function createInitialMenuAudioCandidates(directory) {
  const output = createExternalReviewDirectory(directory);
  const samplesByID = new Map();
  const manifest = {
    revision: "initial-menu-audio-v1-2026-10-25", approval: { approved: false, auditory: false },
    author: "Original deterministic synthesis by Codex under the project owner's direction",
    license: "MIT", source: "create-initial-menu-audio-candidates.mjs; no imported samples or melodies",
    direction: "Soft wooden/glass mallets in D major. Brief interaction cues; no continuous music or loop.",
    assets: [], audioItems: [], measurements: []
  };
  for (const spec of specs) {
    const name = `menu-${spec.id}-v1.wav`, id = `initial-menu-${spec.id}-v1`;
    const samples = synth(spec), bytes = wav(samples);
    samplesByID.set(spec.id, samples);
    fs.writeFileSync(path.join(output, name), bytes, { flag: "wx" });
    const peak = Math.max(...samples.map(Math.abs)) / 32768;
    const rms = Math.sqrt(samples.reduce((sum, sample) => sum + (sample / 32768) ** 2, 0) / samples.length);
    manifest.measurements.push({ id: spec.id, durationSeconds: samples.length / sampleRate, peakDbfs: 20 * Math.log10(peak), rmsDbfs: 20 * Math.log10(rms), clippedSamples: 0 });
    manifest.assets.push({ id, name, kind: "SFX", metadata: {
      source: `Assets/audio/${name}`, license: "MIT; original deterministic synthesis", generatedBy: "create-initial-menu-audio-candidates.mjs",
      reviewStatus: "candidate", approved: false, preparedSha256: createHash("sha256").update(bytes).digest("hex"),
      sampleRate, channels: 1, bitsPerSample: 16, durationSeconds: spec.duration
    } });
    manifest.audioItems.push({ id, name, kind: "SFX", format: "WAV", sourceAssetID: id, exportID: `menu_${spec.id}_v1`, loops: false, volume: 65 });
  }
  // A listening sequence with one second of space after each cue. No normalization.
  const demoLength = [...samplesByID.values()].reduce((sum, samples) => sum + samples.length + sampleRate, sampleRate / 2);
  const demo = new Int16Array(demoLength);
  let cursor = sampleRate / 2;
  for (const samples of samplesByID.values()) { demo.set(samples, cursor); cursor += samples.length + sampleRate; }
  fs.writeFileSync(path.join(output, "previa-cinco-efeitos.wav"), wav(demo), { flag: "wx" });
  fs.writeFileSync(path.join(output, "manifest.json"), JSON.stringify(manifest, null, 2) + "\n", { flag: "wx" });
  fs.writeFileSync(path.join(output, "README.md"), "# Menu inicial · efeitos candidatos V1\n\nOrdem da prévia: abrir, navegar, confirmar, voltar, indisponível.\n\nSons originais por síntese determinística, MIT, sem samples externos. WAV mono 31536 Hz/16 bits, sem loop, ataque e saída suaves, sem normalização automática. Os arquivos permanecem candidatos até aprovação auditiva.\n\nReprodução: `node scripts/create-initial-menu-audio-candidates.mjs /novo/diretorio/externo` em apps/desktop-electron.\n", { flag: "wx" });
  fs.writeFileSync(path.join(output, "index.html"), `<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Menu inicial · novos sons</title><style>body{max-width:800px;margin:48px auto;padding:0 24px;background:#101e27;color:#e7eceb;font:17px/1.6 system-ui}h1{line-height:1.15}article{border-top:1px solid #35434d;padding:20px 0}audio{width:100%}small{color:#adbac0}</style><h1>Um menu mais tranquilo.</h1><p>Cinco efeitos breves e suaves para O Último Farol. Sem música contínua.</p><p><small>Prévia candidata V1 · aguardando sua avaliação de timbre e volume.</small></p><article><h2>Ouvir os cinco em sequência</h2><audio controls src="previa-cinco-efeitos.wav"></audio><p>Abrir → navegar → confirmar → voltar → indisponível.</p></article>${specs.map(spec => `<article><h2>${spec.label}</h2><audio controls src="menu-${spec.id}-v1.wav"></audio><small>${Math.round(spec.duration * 1000)} ms · sem loop</small></article>`).join("")}<p><small>Origem: síntese original · licença MIT · nenhum sample de terceiros. Os sons não foram promovidos ao template.</small></p></html>`, { flag: "wx" });
  return { output, measurements: manifest.measurements };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.length !== 3) throw Error("Usage: create-initial-menu-audio-candidates.mjs NEW_EXTERNAL_DIRECTORY");
  console.log(JSON.stringify(createInitialMenuAudioCandidates(process.argv[2]), null, 2));
}
