import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

// Own only the directory created here, never a project or evidence path supplied
// by the caller. Stop Electron before removing its profile and exported builds.
export async function createTemporarySmokeWorkspace(prefix, stop = async () => {}) {
  if (!prefix || basename(prefix) !== prefix || prefix === "." || prefix === "..") {
    throw new Error("O prefixo temporário deve ser apenas um nome de diretório.");
  }
  const path = await mkdtemp(join(tmpdir(), prefix));
  const keep = process.env.GBA_STUDIO_KEEP_SMOKE_TEMP === "1";
  let disposal;
  const handlers = new Map();

  function dispose() {
    disposal ??= (async () => {
      try {
        await stop();
      } finally {
        try {
          if (keep) console.error(`Diretório temporário preservado: ${path}`);
          else await rm(path, { recursive: true, force: true, maxRetries: 3, retryDelay: 100 });
        } finally {
          for (const [signal, handler] of handlers) process.off(signal, handler);
        }
      }
    })();
    return disposal;
  }

  for (const [signal, code] of [["SIGINT", 130], ["SIGTERM", 143]]) {
    const handler = () => {
      void dispose().then(
        () => process.exit(code),
        (error) => { console.error(error); process.exit(1); }
      );
    };
    handlers.set(signal, handler);
    process.on(signal, handler);
  }
  // Engine staging and converter subprocesses must not populate the host's
  // shared temporary cache with one-off smoke builds.
  return { path, env: { TMPDIR: path, TMP: path, TEMP: path }, dispose };
}
