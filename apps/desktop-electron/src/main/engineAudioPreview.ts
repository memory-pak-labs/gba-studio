import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { audioContractIssues, audioRecords } from "../shared/audioContract.js";
import { isPcmAudio } from "../shared/audioPcm.js";
import { buildAssetcAudioPackGeneration } from "../shared/engineProjectExport.js";
import type { PrepareAudioPreviewRequest, EngineAudioPreviewResult } from "../shared/audioPreview.js";
import type { GBAProjectData } from "../shared/projectFile.js";
import { writeEngineProjectExport } from "./engineProjectExport.js";
import { resolveEngineToolInvocation } from "./engineToolInvocation.js";
import { runGbsbuild } from "./enginePack.js";
import { createRomPlayerServer, type RomPlayerServer } from "./romPlayerWindow.js";

export function selectAudioPreviewData(request: PrepareAudioPreviewRequest): GBAProjectData {
  const source = audioRecords(request.data.audioItems).find(item => item.id === request.audioID);
  if (!source) throw new Error("Áudio selecionado não encontrado no projeto.");
  const audio = structuredClone(source);
  const patterns = audioRecords(audio.patterns);
  if (request.scope === "pattern" && patterns.length) {
    const pattern = patterns.find(item => item.id === (request.patternID ?? audio.activePatternID));
    if (!pattern) throw new Error("Padrão selecionado não encontrado na música.");
    audio.patterns = [pattern]; audio.patternOrder = [pattern.id];
  }
  for (const group of [audio, ...audioRecords(audio.patterns)]) {
    const channels = audioRecords(group.channels);
    const hasSolo = channels.some(channel => channel.solo);
    for (const channel of channels) if (hasSolo && !channel.solo) channel.muted = true;
  }
  return { ...request.data, audioItems: [audio] };
}

export interface AudioPreviewBuildOptions {
  enginePackPath: string;
  assetcPath: string;
  gbsbuildPath: string;
  webPlayerRoot: string;
  tempRoot?: string;
}
export interface AudioPreviewBuild {
  directory: string;
  romPath: string;
  romBytes: number;
  fingerprint?: string;
  rowFrames?: number;
  stepCount?: number;
}
const exec = promisify(execFile);
const remove = (directory: string) => rm(directory, { recursive: true, force: true });
export async function buildAudioPreviewRom(request: PrepareAudioPreviewRequest, options: AudioPreviewBuildOptions, previous?: AudioPreviewBuild): Promise<AudioPreviewBuild> {
  const data = selectAudioPreviewData(request);
  const audio = audioRecords(data.audioItems)[0];
  const errors = audioContractIssues(audio, data).filter(issue => issue.level === "error");
  if (errors.length) throw new Error(errors.map(issue => issue.message).join("\n"));
  const pack = buildAssetcAudioPackGeneration(data);
  if (!pack) throw new Error("Esse áudio não possui uma fonte reproduzível pela engine.");
  const music = pack.document.tracker.length > 0;
  const settings = request.data.settings as Record<string, unknown> | undefined;
  const audioSettings = settings?.audio as Record<string, unknown> | undefined;
  const gain = (key: string) => {
    const value = audioSettings?.[key];
    return Math.round(Math.max(0, Math.min(100, typeof value === "number" && Number.isFinite(value) ? value : 100)) * 15 / 100);
  };
  const cpp = `#include "gbs/engine.hpp"
#include "audio.hpp"
extern "C" { volatile uint32_t audio_preview[8] __attribute__((section(".ewram_bss"))) = {}; }
extern "C" int gbs_main() {
 gbs::init();
 gbs::set_audio_channel_volume(gbs::AudioChannel::Music,${gain("musicVolume")});
 gbs::set_audio_channel_volume(gbs::AudioChannel::PcmMusic,${gain("musicVolume")});
 gbs::set_audio_channel_volume(gbs::AudioChannel::Sfx,${gain("sfxVolume")});
 gbs::set_audio_channel_volume(gbs::AudioChannel::PcmSfx,${gain("sfxVolume")});
 audio_preview[0]=0x41555043;audio_preview[1]=0x50434d31;
 audio_preview[6]=${music ? "gbs::play_tracker_music(preview_tracker_assets[0])" : "gbs::play_sfx(preview_sfx_assets[0])"};
 unsigned tail=0;
 for(;;) {
  audio_preview[2]++;
  audio_preview[3]=${music ? "gbs::audio_is_tracker_music_playing()" : "(gbs::audio_is_sfx_playing() || gbs::audio_is_pcm_sfx_playing())"};
  const auto usage=gbs::audio_runtime_usage();audio_preview[4]=usage.active_voice_count;audio_preview[5]=usage.pcm_underrun_count;
  if(!audio_preview[3] && ++tail>=8)audio_preview[7]=1;
  gbs::wait_vblank();
 }
}
`;
  const fingerprint = createHash("sha256").update(cpp).update(JSON.stringify(pack.document));
  for (const file of [options.assetcPath, path.join(options.enginePackPath, "enginepack.json"), path.join(options.enginePackPath, "lib/libgbastudio_engine.a")]) fingerprint.update(await readFile(file));
  for (const source of pack.sourceCopies) {
    if (!request.projectPath) throw new Error("Salve o projeto para ouvir os samples WAV.");
    const root = path.dirname(request.projectPath); const file = path.resolve(root, source.source);
    const relative = path.relative(root, file);
    if (path.isAbsolute(source.source) || relative.startsWith("..") || path.isAbsolute(relative)) throw new Error("Sample fora da pasta do projeto.");
    fingerprint.update(await readFile(file));
  }
  const key = fingerprint.digest("hex");
  if (previous?.fingerprint === key && await stat(previous.romPath).then(() => true, () => false)) return previous;
  const directory = await mkdtemp(path.join(options.tempRoot ?? tmpdir(), "gba-studio-audio-preview-"));
  try {
    const features = isPcmAudio(audio) ? ["audio.pcm_composer", "audio.tracker_pcm_16_channels", "audio.pcm_prepared_gain"] : [];
    const manifest = { schema: 1, backend: "gbastudio_engine", kind: "topdown", entry: "main.cpp", build: { target: "audio_preview", make_target: "all" }, requires: { engine_pack: ">=2.27.0", features } };
    await writeEngineProjectExport({ destination: directory, projectPath: request.projectPath,
      generated: { target: "audio_preview", assets: pack.sourceCopies, files: [
        { path: "main.cpp", contents: cpp }, { path: "gbastudio_project.json", contents: JSON.stringify(manifest) },
        { path: "assets/audio/project_audio.json", contents: JSON.stringify(pack.document) }
      ] } });
    const invocation = resolveEngineToolInvocation(options.assetcPath, [path.join(directory, "assets/audio/project_audio.json"), "--audio-json", "-o", path.join(directory, "audio.hpp"), "--name", "preview"]);
    await exec(invocation.executable, invocation.args, { env: invocation.env, windowsVerbatimArguments: invocation.windowsVerbatimArguments, timeout: 120000, maxBuffer: 4 * 1024 * 1024 });
    const built = await runGbsbuild({ enginePackPath: options.enginePackPath, gbsbuildPath: options.gbsbuildPath, projectDir: directory });
    if (built.exitCode !== 0) throw new Error(built.error || built.stderr || "A engine não conseguiu compilar a prévia de áudio.");
    const romPath = path.join(directory, "build/audio_preview.gba");
    return { directory, romPath, romBytes: (await stat(romPath)).size, fingerprint: key,
      rowFrames: pack.document.tracker[0]?.row_duration_frames ?? 1,
      stepCount: Number(audioRecords(audio.patterns)[0]?.steps ?? 64) };
  } catch (error) { await remove(directory); throw error; }
}

interface PreviewDependencies {
  build(request: PrepareAudioPreviewRequest, options: AudioPreviewBuildOptions, previous?: AudioPreviewBuild): Promise<AudioPreviewBuild>;
  serve(options: Parameters<typeof createRomPlayerServer>[0]): Promise<RomPlayerServer>;
  remove(directory: string): Promise<unknown> | unknown;
}
export class AudioPreviewSession {
  private generation = 0;
  private currentID: string | null = null;
  private server: RomPlayerServer | null = null;
  private cached?: AudioPreviewBuild;
  constructor(private dependencies: PreviewDependencies = { build: buildAudioPreviewRom, serve: createRomPlayerServer, remove }) {}
  async prepare(request: PrepareAudioPreviewRequest, options: AudioPreviewBuildOptions): Promise<EngineAudioPreviewResult> {
    const mine = ++this.generation; this.currentID = request.requestID;
    const previousServer = this.server; this.server = null;
    if (previousServer) await previousServer.close();
    if (mine !== this.generation) return { requestID: request.requestID, canceled: true };
    const built = await this.dependencies.build(request, options, this.cached);
    if (mine !== this.generation) {
      if (built.directory !== this.cached?.directory) await this.dependencies.remove(built.directory);
      return { requestID: request.requestID, canceled: true };
    }
    const previous = this.cached; this.cached = built;
    if (previous && previous.directory !== built.directory) await this.dependencies.remove(previous.directory);
    if (mine !== this.generation) return { requestID: request.requestID, canceled: true };
    const server = await this.dependencies.serve({ romPath: built.romPath, title: "Audio", webPlayerRoot: options.webPlayerRoot });
    if (mine !== this.generation) { await server.close(); return { requestID: request.requestID, canceled: true }; }
    this.server = server;
    const url = new URL("/player/audio-preview.html", server.url);
    url.searchParams.set("rom", `/roms/${path.basename(built.romPath)}`); url.searchParams.set("id", request.requestID);
    return { requestID: request.requestID, ok: true, url: url.href, romBytes: built.romBytes, rowFrames: built.rowFrames, stepCount: built.stepCount };
  }
  async stop(id: string): Promise<void> {
    if (id !== this.currentID) return;
    ++this.generation; this.currentID = null;
    const server = this.server; this.server = null; await server?.close();
  }
  async dispose(): Promise<void> {
    ++this.generation; this.currentID = null;
    const server = this.server; this.server = null; await server?.close();
    const cached = this.cached; this.cached = undefined;
    if (cached) await this.dependencies.remove(cached.directory);
  }
}
