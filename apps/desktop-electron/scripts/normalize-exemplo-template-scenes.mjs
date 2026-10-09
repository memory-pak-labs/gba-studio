import { readFile, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { deflateSync, inflateSync } from "node:zlib";

const appRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const templateRoot = join(appRoot, "default-assets", "templates", "exemplo-gba");
const projectPath = join(templateRoot, "exemplo-gba.gba-project");
const backgroundsRoot = join(templateRoot, "Assets", "backgrounds");
const repositoryRoot = dirname(dirname(appRoot));
const minimumWidthTiles = 30;
const minimumHeightTiles = 20;
const tileSize = 8;

const crcTable = Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) {
    value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
  }
  return value >>> 0;
});

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = crcTable[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data = Buffer.alloc(0)) {
  const typeBuffer = Buffer.from(type, "ascii");
  const chunk = Buffer.alloc(12 + data.length);
  chunk.writeUInt32BE(data.length, 0);
  typeBuffer.copy(chunk, 4);
  data.copy(chunk, 8);
  chunk.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 8 + data.length);
  return chunk;
}

function paeth(left, up, upperLeft) {
  const prediction = left + up - upperLeft;
  const leftDistance = Math.abs(prediction - left);
  const upDistance = Math.abs(prediction - up);
  const upperLeftDistance = Math.abs(prediction - upperLeft);
  if (leftDistance <= upDistance && leftDistance <= upperLeftDistance) return left;
  if (upDistance <= upperLeftDistance) return up;
  return upperLeft;
}

function decodePng(buffer) {
  const signature = buffer.subarray(0, 8);
  if (!signature.equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    throw new Error("Arquivo PNG invalido");
  }

  const chunks = [];
  for (let offset = 8; offset < buffer.length;) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.subarray(offset + 4, offset + 8).toString("ascii");
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    chunks.push({ type, data });
    offset += 12 + length;
    if (type === "IEND") break;
  }

  const header = chunks.find((chunk) => chunk.type === "IHDR")?.data;
  if (!header) throw new Error("PNG sem IHDR");
  const width = header.readUInt32BE(0);
  const height = header.readUInt32BE(4);
  const bitDepth = header[8];
  const colorType = header[9];
  const channels = new Map([[0, 1], [2, 3], [3, 1], [4, 2], [6, 4]]).get(colorType);
  if (bitDepth !== 8 || !channels || header[12] !== 0) {
    throw new Error(`PNG nao suportado: bitDepth=${bitDepth}, colorType=${colorType}, interlace=${header[12]}`);
  }

  const compressed = Buffer.concat(chunks.filter((chunk) => chunk.type === "IDAT").map((chunk) => chunk.data));
  const filtered = inflateSync(compressed);
  const stride = width * channels;
  const pixels = Buffer.alloc(stride * height);
  let inputOffset = 0;
  for (let y = 0; y < height; y += 1) {
    const filter = filtered[inputOffset];
    inputOffset += 1;
    for (let x = 0; x < stride; x += 1) {
      const raw = filtered[inputOffset + x];
      const left = x >= channels ? pixels[(y * stride) + x - channels] : 0;
      const up = y > 0 ? pixels[((y - 1) * stride) + x] : 0;
      const upperLeft = y > 0 && x >= channels ? pixels[((y - 1) * stride) + x - channels] : 0;
      let value;
      if (filter === 0) value = raw;
      else if (filter === 1) value = raw + left;
      else if (filter === 2) value = raw + up;
      else if (filter === 3) value = raw + Math.floor((left + up) / 2);
      else if (filter === 4) value = raw + paeth(left, up, upperLeft);
      else throw new Error(`Filtro PNG nao suportado: ${filter}`);
      pixels[(y * stride) + x] = value & 0xff;
    }
    inputOffset += stride;
  }

  return { channels, chunks, colorType, header, height, pixels, width };
}

function encodePng(decoded, width, height, pixels) {
  const header = Buffer.from(decoded.header);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  const stride = width * decoded.channels;
  const scanlines = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y += 1) {
    const rowOffset = y * (stride + 1);
    scanlines[rowOffset] = 0;
    pixels.copy(scanlines, rowOffset + 1, y * stride, (y + 1) * stride);
  }

  const ancillaryBeforeData = [];
  const ancillaryAfterData = [];
  let sawImageData = false;
  for (const chunk of decoded.chunks) {
    if (chunk.type === "IDAT") {
      sawImageData = true;
      continue;
    }
    if (chunk.type === "IHDR" || chunk.type === "IEND") continue;
    (sawImageData ? ancillaryAfterData : ancillaryBeforeData).push(makeChunk(chunk.type, chunk.data));
  }

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    makeChunk("IHDR", header),
    ...ancillaryBeforeData,
    makeChunk("IDAT", deflateSync(scanlines, { level: 9 })),
    ...ancillaryAfterData,
    makeChunk("IEND")
  ]);
}

function repeatedEdgeCoordinate(coordinate, offset, sourceSize) {
  if (coordinate < offset) return coordinate % tileSize;
  if (coordinate >= offset + sourceSize) {
    return sourceSize - tileSize + ((coordinate - offset - sourceSize) % tileSize);
  }
  return coordinate - offset;
}

function trackedBaseline(path) {
  const relativePath = path.slice(repositoryRoot.length + 1);
  try {
    return execFileSync("git", ["-C", repositoryRoot, "show", `HEAD:${relativePath}`], {
      encoding: "buffer",
      maxBuffer: 32 * 1024 * 1024
    });
  } catch {
    return null;
  }
}

async function extendBackground(path, targetWidth, targetHeight) {
  const current = decodePng(await readFile(path));
  const baselineBuffer = current.width === targetWidth && current.height === targetHeight
    ? trackedBaseline(path)
    : null;
  const baseline = baselineBuffer ? decodePng(baselineBuffer) : null;
  const source = baseline && (baseline.width < targetWidth || baseline.height < targetHeight)
    ? baseline
    : current;
  if (source.width === targetWidth && source.height === targetHeight) return;
  const offsetX = Math.floor((targetWidth - source.width) / 2);
  const offsetY = Math.floor((targetHeight - source.height) / 2);
  const target = Buffer.alloc(targetWidth * targetHeight * source.channels);
  for (let y = 0; y < targetHeight; y += 1) {
    const sourceY = repeatedEdgeCoordinate(y, offsetY, source.height);
    for (let x = 0; x < targetWidth; x += 1) {
      const sourceX = repeatedEdgeCoordinate(x, offsetX, source.width);
      const sourceOffset = ((sourceY * source.width) + sourceX) * source.channels;
      const targetOffset = ((y * targetWidth) + x) * source.channels;
      source.pixels.copy(target, targetOffset, sourceOffset, sourceOffset + source.channels);
    }
  }
  await writeFile(path, encodePng(source, targetWidth, targetHeight, target));
}

function remapGrid(values, oldWidth, oldHeight, newWidth, newHeight, offsetX, offsetY, emptyValue) {
  const result = Array(newWidth * newHeight).fill(emptyValue);
  for (let y = 0; y < oldHeight; y += 1) {
    for (let x = 0; x < oldWidth; x += 1) {
      result[((y + offsetY) * newWidth) + x + offsetX] = values[(y * oldWidth) + x];
    }
  }
  return result;
}

function normalizeRoom(room, dimensions) {
  const { oldHeight, oldWidth, newHeight, newWidth, offsetX, offsetY } = dimensions;
  room.width = newWidth;
  room.height = newHeight;
  room.cameraBounds = { ...room.cameraBounds, width: newWidth, height: newHeight };
  room.tilemap = remapGrid(room.tilemap, oldWidth, oldHeight, newWidth, newHeight, offsetX, offsetY, 0);
  room.collisions = remapGrid(room.collisions, oldWidth, oldHeight, newWidth, newHeight, offsetX, offsetY, "free");
  room.collisionTypes = remapGrid(room.collisionTypes, oldWidth, oldHeight, newWidth, newHeight, offsetX, offsetY, "free");
}

function translateCommand(command, roomOffsets, actorRooms, eventRoomName) {
  const sceneChange = command.match(/^change_scene\s+(\S+)\s+(-?\d+)\s+(-?\d+)(\s+.*)$/);
  if (sceneChange) {
    const offset = roomOffsets.get(sceneChange[1]);
    if (!offset) return command;
    return `change_scene ${sceneChange[1]} ${Number(sceneChange[2]) + offset.x} ${Number(sceneChange[3]) + offset.y}${sceneChange[4]}`;
  }

  const actorMove = command.match(/^(set_actor_position|move_actor_to)\s+(\S+)\s+(-?\d+)\s+(-?\d+)$/);
  if (!actorMove) return command;
  const targetRoom = actorMove[2] === "Player" ? eventRoomName : actorRooms.get(actorMove[2]);
  const offset = roomOffsets.get(targetRoom);
  if (!offset) return command;
  return `${actorMove[1]} ${actorMove[2]} ${Number(actorMove[3]) + offset.x} ${Number(actorMove[4]) + offset.y}`;
}

const project = JSON.parse(await readFile(projectPath, "utf8"));
const roomDimensions = new Map();
for (const room of project.rooms) {
  const newWidth = Math.max(minimumWidthTiles, room.width);
  const newHeight = Math.max(minimumHeightTiles, room.height);
  const offsetX = Math.floor((newWidth - room.width) / 2);
  const offsetY = Math.floor((newHeight - room.height) / 2);
  roomDimensions.set(room.name, {
    oldWidth: room.width,
    oldHeight: room.height,
    newWidth,
    newHeight,
    offsetX,
    offsetY
  });
}

const processedBackgrounds = new Set();
for (const room of project.rooms) {
  const dimensions = roomDimensions.get(room.name);
  if (!processedBackgrounds.has(room.backgroundAssetName)) {
    await extendBackground(
      join(backgroundsRoot, room.backgroundAssetName),
      dimensions.newWidth * tileSize,
      dimensions.newHeight * tileSize
    );
    processedBackgrounds.add(room.backgroundAssetName);
  }
  normalizeRoom(room, dimensions);
}

for (const room of project.scenas ?? []) {
  const dimensions = roomDimensions.get(room.name);
  if (dimensions) normalizeRoom(room, dimensions);
}

const roomOffsets = new Map(Array.from(roomDimensions, ([name, dimensions]) => [name, {
  x: dimensions.offsetX,
  y: dimensions.offsetY
}]));
for (const actor of project.actors) {
  const offset = roomOffsets.get(actor.roomName);
  if (!offset) continue;
  actor.x += offset.x;
  actor.y += offset.y;
}
for (const trigger of project.triggers) {
  const offset = roomOffsets.get(trigger.roomName);
  if (!offset) continue;
  trigger.x += offset.x;
  trigger.y += offset.y;
}

const actorRooms = new Map(project.actors.map((actor) => [actor.name, actor.roomName]));
for (const event of project.events) {
  for (const step of event.steps ?? []) {
    step.command = translateCommand(step.command, roomOffsets, actorRooms, event.roomName);
  }
}

await writeFile(projectPath, `${JSON.stringify(project, null, 2)}\n`);
console.log(`Template normalizado: ${project.rooms.length} cenas, minimo ${minimumWidthTiles}x${minimumHeightTiles} tiles.`);
