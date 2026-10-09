import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resizePngNearest } from "./lib/png-icons.mjs";

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const appRoot = resolve(projectRoot, "apps/desktop-electron");
const buildDir = resolve(appRoot, "build");

const icons = [
  {
    source: resolve(projectRoot, "icon_gbastudio.png"),
    baseName: "icon"
  },
  {
    source: resolve(projectRoot, "icon_arquivo_gbastudio.png"),
    baseName: "file-gbastudio"
  }
];

const iconsetSizes = [
  { name: "icon_16x16.png", size: 16 },
  { name: "icon_16x16@2x.png", size: 32 },
  { name: "icon_32x32.png", size: 32 },
  { name: "icon_32x32@2x.png", size: 64 },
  { name: "icon_128x128.png", size: 128 },
  { name: "icon_128x128@2x.png", size: 256 },
  { name: "icon_256x256.png", size: 256 },
  { name: "icon_256x256@2x.png", size: 512 },
  { name: "icon_512x512.png", size: 512 },
  { name: "icon_512x512@2x.png", size: 1024 }
];

function run(command, args) {
  const result = spawnSync(command, args, {
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(" ")}\n${result.stderr || result.stdout}`);
  }
}

async function resizePng(source, destination, size) {
  if (process.platform === "darwin") {
    run("sips", ["-z", String(size), String(size), source, "--out", destination]);
    return;
  }

  const png = await readFile(source);
  await writeFile(destination, resizePngNearest(png, size));
}

async function writeIcoFromPng(pngPath, icoPath) {
  const png = await readFile(pngPath);
  const header = Buffer.alloc(22);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(1, 4);
  header.writeUInt8(0, 6);
  header.writeUInt8(0, 7);
  header.writeUInt8(0, 8);
  header.writeUInt8(0, 9);
  header.writeUInt16LE(1, 10);
  header.writeUInt16LE(32, 12);
  header.writeUInt32LE(png.length, 14);
  header.writeUInt32LE(header.length, 18);
  await writeFile(icoPath, Buffer.concat([header, png]));
}

async function generateIcon({ source, baseName }) {
  if (!existsSync(source)) {
    throw new Error(`Icon source not found: ${source}`);
  }

  await mkdir(buildDir, { recursive: true });

  const pngPath = resolve(buildDir, `${baseName}.png`);
  const icoPngPath = resolve(buildDir, `${baseName}-ico.png`);
  const iconsetPath = resolve(buildDir, `${baseName}.iconset`);
  const icnsPath = resolve(buildDir, `${baseName}.icns`);
  const icoPath = resolve(buildDir, `${baseName}.ico`);

  await resizePng(source, pngPath, 1024);
  await resizePng(source, icoPngPath, 256);
  await rm(iconsetPath, { recursive: true, force: true });
  await mkdir(iconsetPath, { recursive: true });

  for (const icon of iconsetSizes) {
    await resizePng(source, resolve(iconsetPath, icon.name), icon.size);
  }

  if (process.platform === "darwin") {
    run("iconutil", ["-c", "icns", iconsetPath, "-o", icnsPath]);
  }
  await writeIcoFromPng(icoPngPath, icoPath);
  await rm(iconsetPath, { recursive: true, force: true });
  await rm(icoPngPath, { force: true });

  return { pngPath, icnsPath: process.platform === "darwin" ? icnsPath : null, icoPath };
}

for (const icon of icons) {
  const output = await generateIcon(icon);
  console.log(`[icons] ${icon.baseName}`, output);
}
