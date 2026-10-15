import ts from "typescript";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const catalogFile = ts.createSourceFile("studioUiCatalog.ts", readFileSync(resolve(appRoot, "src/shared/studioUiCatalog.ts"), "utf8"), ts.ScriptTarget.Latest, true);
const catalog = new Set();
function readCatalog(node) {
  if (ts.isVariableDeclaration(node) && node.name.getText(catalogFile) === "studioUiMessages" && node.initializer && ts.isObjectLiteralExpression(node.initializer)) {
    for (const property of node.initializer.properties) if (property.name && ts.isStringLiteral(property.name)) catalog.add(property.name.text);
  }
  ts.forEachChild(node, readCatalog);
}
readCatalog(catalogFile);
const missing = [];
const hardcoded = [];
let references = 0;
const technical = /^(?:GBA|HUDs?|VRAM|OBJ|OAM|BG|FPS|BPM|PCM|PNG|MOD|WAV|ROM|RGB555|RGBA|TSX|CSV|XLIFF|XML|JSON|px|KB|MB|GB|Hz|ms|B|X|Y|Z|CPU|DMA|EWRAM|IWRAM|RNG|seed|0x|\d[\d ×x.%/+·–-]*)(?:[ :%/×x\d.-]*)$/i;
for (const filename of readdirSync(resolve(appRoot, "src/renderer"))) {
  if (!/\.tsx?$/.test(filename) || /\.test\.|\.d\.ts$|^i18n|^studioUiText/.test(filename)) continue;
  const file = resolve(appRoot, "src/renderer", filename);
  const source = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, filename.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  function location(node) { return { file: "src/renderer/" + filename, line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1 }; }
  function visit(node) {
    if (ts.isCallExpression(node) && node.expression.getText(source) === "ui" && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) {
      references++;
      const message = node.arguments[0].text.trim();
      if (!catalog.has(message)) missing.push({ ...location(node), message });
    }
    if (ts.isJsxText(node)) {
      let ancestor = node.parent;
      while (ancestor) {
        if (ts.isJsxElement(ancestor) && /^(code|pre|kbd)$/.test(ancestor.openingElement.tagName.getText(source))) return;
        ancestor = ancestor.parent;
      }
      const text = node.text.trim();
      if (/[A-Za-zÀ-ÿ]{3}/.test(text) && !technical.test(text)) hardcoded.push({ ...location(node), text });
    }
    ts.forEachChild(node, visit);
  }
  visit(source);
}
const result = { kind: "studio_ui_copy_audit", catalogMessages: catalog.size, references, missing, hardcoded };
if (process.argv.includes("--json")) console.log(JSON.stringify(result, null, 2));
else {
  console.log("UI copy: " + catalog.size + " messages, " + references + " literal references, " + missing.length + " missing, " + hardcoded.length + " hardcoded.");
  if (missing.length || hardcoded.length) console.log(JSON.stringify({ missing, hardcoded }, null, 2));
}
if (missing.length || hardcoded.length || references < 1000) process.exitCode = 1;
