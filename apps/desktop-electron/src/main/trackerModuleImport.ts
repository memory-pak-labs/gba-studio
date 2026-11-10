import { open, realpath } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { audioRecords, audioSourceAsset, audioSourceFormat } from "../shared/audioContract.js";
import { parseTrackerModule, type TrackerModuleFormat } from "../shared/trackerModule.js";
import type { ReadTrackerModuleRequest, ReadTrackerModuleResult } from "../shared/trackerModuleEditing.js";

export async function readTrackerModuleForEditing(request: ReadTrackerModuleRequest): Promise<ReadTrackerModuleResult> {
  try {
    if (!request.projectPath) throw new Error("Salve o projeto antes de criar a cópia editável.");
    const audio = audioRecords(request.data.audioItems).find(item => item.id === request.audioID);
    const asset = audio && audioSourceAsset(request.data, audio);
    const source = (asset?.metadata as Record<string, unknown> | undefined)?.source;
    const format = audio && audioSourceFormat(request.data, audio);
    if (!audio || audio.kind !== "Musica" || !["MOD", "S3M", "XM", "IT"].includes(format ?? "") || typeof source !== "string") throw new Error("Selecione uma música MOD, S3M, XM ou IT importada.");
    const root = await realpath(path.dirname(request.projectPath));
    const candidate = path.resolve(root, source); const relative = path.relative(root, candidate);
    if (path.isAbsolute(source) || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("A fonte precisa estar dentro da pasta do projeto.");
    const resolved = await realpath(candidate); const resolvedRelative = path.relative(root, resolved);
    if (resolvedRelative.startsWith("..") || path.isAbsolute(resolvedRelative)) throw new Error("O vínculo da fonte aponta para fora da pasta do projeto.");
    const handle = await open(resolved, "r");
    try {
      const stat = await handle.stat();
      if (!stat.isFile() || stat.size > 8 * 1024 * 1024) throw new Error("Módulo excede o limite de 8 MiB para edição.");
      const bytes = Buffer.alloc(stat.size); let position = 0;
      while (position < bytes.length) { const read = await handle.read(bytes, position, bytes.length - position, position); if (!read.bytesRead) break; position += read.bytesRead; }
      const extra = await handle.read(Buffer.alloc(1), 0, 1, bytes.length);
      if (position !== bytes.length || extra.bytesRead) throw new Error("A fonte mudou durante a leitura. Tente novamente.");
      return { song: parseTrackerModule(bytes, format as TrackerModuleFormat, createHash("sha256").update(bytes).digest("hex")) };
    } finally { await handle.close(); }
  } catch (cause) { return { error: cause instanceof Error ? cause.message : String(cause) }; }
}
