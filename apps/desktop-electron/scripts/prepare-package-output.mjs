import { rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = dirname(dirname(fileURLToPath(import.meta.url)));

async function main() {
  const generatedDirectories = process.platform === "darwin"
    ? ["mac-universal", "mac-arm64", "mac-x64", "mac"]
    : process.platform === "win32"
      ? ["win-unpacked"]
      : ["linux-unpacked"];

  await Promise.all(generatedDirectories.map((directory) => (
    rm(join(appRoot, "release", directory), { force: true, recursive: true })
  )));
  console.log(`[prepare-package-output] cleaned: ${generatedDirectories.join(", ")}`);
}

main().catch((error) => {
  console.error("[prepare-package-output] failed");
  console.error(error);
  process.exit(1);
});
