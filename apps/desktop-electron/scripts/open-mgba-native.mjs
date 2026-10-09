#!/usr/bin/env node

import { existsSync } from "node:fs";
import { execFile, spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";

const defaultApp = "/Applications/mGBA.app";
const appPath = process.env.GBA_STUDIO_MGBA_APP ?? defaultApp;
const romArgument = process.argv.slice(2).find((argument) => argument.startsWith("--rom="));
const romPath = romArgument ? path.resolve(romArgument.slice("--rom=".length)) : null;

if (process.argv.includes("--help") || process.argv.includes("-h")) {
  console.log("Uso: npm run play:mgba-native -- --rom=/caminho/para/jogo.gba");
  console.log("Override opcional: GBA_STUDIO_MGBA_APP=/caminho/mGBA.app");
  console.log("Foco automático do viewport no macOS: GBA_STUDIO_MGBA_AUTOFOCUS=0 para desativar");
  process.exit(0);
}

if (!existsSync(appPath)) {
  console.error(`mGBA nativo não encontrado em ${appPath}. Instale o aplicativo ou defina GBA_STUDIO_MGBA_APP.`);
  process.exit(1);
}

if (!romPath || !existsSync(romPath)) {
  console.error("Informe uma ROM existente com --rom=/caminho/para/jogo.gba.");
  process.exit(1);
}

const child = spawn("/usr/bin/open", ["-a", appPath, romPath], {
  detached: true,
  stdio: "ignore"
});
child.unref();
console.log(`mGBA nativo aberto: ${romPath}`);

if (process.platform === "darwin" && process.env.GBA_STUDIO_MGBA_AUTOFOCUS !== "0") {
  setTimeout(() => {
    const focusScript = `
      tell application "System Events"
        tell process "mGBA"
          set frontmost to true
          set windowPosition to position of window 1
          set windowSize to size of window 1
          set clickX to (item 1 of windowPosition) + ((item 1 of windowSize) / 2)
          set clickY to (item 2 of windowPosition) + ((item 2 of windowSize) / 2)
          click at {clickX, clickY}
        end tell
      end tell
    `;

    execFile("/usr/bin/osascript", ["-e", focusScript], { timeout: 2_000 }, (error) => {
      if (error) {
        console.warn("Não foi possível dar foco automático ao viewport do mGBA. Clique dentro da imagem do jogo para habilitar o teclado.");
        return;
      }
      console.log("Viewport do mGBA focado; o teclado físico está pronto para o playtest.");
    });
  }, 700);
}
