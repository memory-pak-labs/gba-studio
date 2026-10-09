import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseGBAProjectFile, serializeGBAProjectFile } from "../src/shared/projectFile.js";
import { promoteExemploGBAAdvancedTools } from "./exemplo-gba-advanced-tools.mjs";

const electronRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const targets = [
  path.join(electronRoot, "default-assets", "templates", "exemplo-gba", "exemplo-gba.gba-project")
];
const authoritative = parseGBAProjectFile(await readFile(targets[0], "utf8"));
authoritative.data = promoteExemploGBAAdvancedTools(authoritative.data);
const serialized = serializeGBAProjectFile(authoritative);
await Promise.all(targets.map((target) => writeFile(target, serialized, "utf8")));
console.log(JSON.stringify({
  targets,
  advancedToolGroups: Object.keys(authoritative.data.advancedTools ?? {}).length
}, null, 2));
