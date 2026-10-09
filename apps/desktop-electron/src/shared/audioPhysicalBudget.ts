import {
  compileComposedMusicaToTracker,
  compileComposedSfxToAssetc,
  physicalBytesForCompiledSfx,
  physicalBytesForCompiledTracker
} from "./engineProjectExport.js";
export { GBA_AUDIO_ROM_LAYOUT } from "./engineProjectExport.js";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function recordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isRecord) : [];
}

function hasNoteContent(channel: Record<string, unknown>): boolean {
  const notes = Array.isArray(channel.notes) ? channel.notes : [];
  return notes.some((note) => typeof note === "string" && note.trim().length > 0 && note.trim() !== "---");
}

function hasComposedAudioContent(audio: Record<string, unknown>): boolean {
  const patterns = recordArray(audio.patterns);
  if (patterns.length > 0) return true;
  return recordArray(audio.channels).some(hasNoteContent);
}

function exportIDForAudio(audio: Record<string, unknown>): string {
  const exportID = typeof audio.exportID === "string" ? audio.exportID.trim() : "";
  if (exportID) return exportID;
  const name = typeof audio.name === "string" ? audio.name.trim() : "";
  return name || "composed_audio";
}

/**
 * Estimates the physical ROM bytes of a composed audio item from the exact
 * native structures produced by the Electron exporter.
 *
 * Imported audio remains governed by its declared/source-derived byte size;
 * this helper only handles composed Musica and SFX items.
 */
export function estimateComposedAudioPhysicalBytes(audio: Record<string, unknown>): number | null {
  if (!hasComposedAudioContent(audio)) return null;
  // Sample bytes depend on conversion of the actual WAV, measured by assetc.
  if (recordArray(audio.patterns).some(pattern => recordArray(pattern.channels).some(channel => channel.sampleAssetID))) return null;

  const kind = typeof audio.kind === "string" ? audio.kind.trim() : "";
  const exportID = exportIDForAudio(audio);
  if (kind === "Musica") {
    const tracker = compileComposedMusicaToTracker(audio, exportID);
    return tracker ? physicalBytesForCompiledTracker(tracker) : null;
  }
  if (kind === "SFX") {
    const sfx = compileComposedSfxToAssetc(audio, exportID);
    return sfx ? physicalBytesForCompiledSfx(sfx) : null;
  }
  return null;
}
