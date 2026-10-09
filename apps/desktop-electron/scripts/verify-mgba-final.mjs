#!/usr/bin/env node
import { createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

import { buildMgbaAvEvidence } from "./mgba-av-evidence.mjs";

const execFileAsync = promisify(execFile);
const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const artifactDir = path.join(appRoot, "artifacts", "mgba-final");
const videoPath = process.env.GBA_STUDIO_MGBA_VIDEO ?? path.join(artifactDir, "runtime_canary_playtest.mp4");
const evidencePath = path.join(artifactDir, "mgba_av_evidence.json");

async function sha256(filePath) {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

async function extractFrame(video, second, destination) {
  await execFileAsync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-ss", String(second), "-i", video, "-frames:v", "1", destination]);
  const { stderr } = await execFileAsync("ffmpeg", ["-hide_banner", "-i", destination, "-vf", "blackframe=amount=0:threshold=32", "-frames:v", "1", "-f", "null", "-"]);
  const percentBlack = Number(stderr.match(/pblack:(\d+)/)?.[1] ?? 100);
  return { path: destination, percentBlack, sha256: await sha256(destination) };
}

async function main() {
  if (!existsSync(videoPath)) throw new Error(`Gravacao do mGBA nao encontrada: ${videoPath}`);
  await mkdir(artifactDir, { recursive: true });
  const { stdout: probeText } = await execFileAsync("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration:stream=codec_type,codec_name,sample_rate,channels,width,height",
    "-of", "json",
    videoPath
  ]);
  const probe = JSON.parse(probeText);
  const durationSeconds = Number(probe.format?.duration ?? 0);
  const audioStream = probe.streams?.find((stream) => stream.codec_type === "audio");
  const videoStream = probe.streams?.find((stream) => stream.codec_type === "video");
  const { stderr: volumeText } = await execFileAsync("ffmpeg", ["-hide_banner", "-i", videoPath, "-map", "0:a:0", "-af", "volumedetect", "-f", "null", "-"]);
  const audio = {
    channels: Number(audioStream?.channels ?? 0),
    codec: String(audioStream?.codec_name ?? ""),
    maxVolumeDb: Number(volumeText.match(/max_volume:\s*(-?[\d.]+) dB/)?.[1] ?? -100),
    meanVolumeDb: Number(volumeText.match(/mean_volume:\s*(-?[\d.]+) dB/)?.[1] ?? -100),
    sampleRate: Number(audioStream?.sample_rate ?? 0)
  };
  const video = {
    codec: String(videoStream?.codec_name ?? ""),
    height: Number(videoStream?.height ?? 0),
    width: Number(videoStream?.width ?? 0)
  };
  const visualFrames = await Promise.all([
    extractFrame(videoPath, 5, path.join(artifactDir, "verified_t05.png")),
    extractFrame(videoPath, Math.max(6, durationSeconds - 5), path.join(artifactDir, "verified_final.png"))
  ]);
  const evidence = {
    ...buildMgbaAvEvidence({ audio, durationSeconds, video, visualFrames }),
    generatedAt: new Date().toISOString(),
    videoPath,
    videoSha256: await sha256(videoPath)
  };
  await writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
  console.log(evidencePath);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
