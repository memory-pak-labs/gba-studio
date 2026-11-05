import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import source from "./cfb-support-source.json" with { type: "json" };

const appRoot = fileURLToPath(new URL("..", import.meta.url));
const repoRoot = path.resolve(appRoot, "../..");
const patchPath = path.join(repoRoot, "tools/cartridge-writer/cfb-stm.patch");
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
export function cfbTarget(platform, arch) {
  const target = { "darwin-arm64": "aarch64-apple-darwin", "darwin-x64": "x86_64-apple-darwin", "win32-x64": "x86_64-pc-windows-msvc", "linux-x64": "x86_64-unknown-linux-gnu" }[`${platform}-${arch}`];
  if (!target) throw new Error(`Gravador não suportado: ${platform}-${arch}.`);
  return target;
}
export function isUniversalMacIntermediate(appOutDir = "") {
  return /(?:^|[\\/])mac-universal-(?:arm64|x64)-temp[\\/]?$/.test(appOutDir);
}
export function packageHelperArchitectures(platform, arch, appOutDir = "") {
  return platform === "darwin" && (arch === "universal" || isUniversalMacIntermediate(appOutDir))
    ? ["arm64", "x64"] : [arch];
}
export function prepareCartridgeTools({ platform = process.platform, arch = process.arch } = {}) {
  if (platform !== process.platform) throw new Error("Compile o gravador em um host do sistema de destino.");
  const target = cfbTarget(platform, arch);
  const patch = readFileSync(patchPath);
  if (digest(patch) !== source.patchSha256) throw new Error("Checksum do patch STM inválido.");
  const directory = path.join(appRoot, "build/cartridge-tools", `${platform}-${arch}`);
  const manifestPath = path.join(directory, "manifest.json");
  if (existsSync(manifestPath)) {
    const m = JSON.parse(readFileSync(manifestPath, "utf8"));
    if (m.version === source.version && m.sourceCommit === source.commit && m.patchSha256 === source.patchSha256 && m.platform === platform && m.arch === arch && [platform === "win32" ? "cfb.exe" : "cfb", "COPYING", "corresponding-source.tar.gz"].every(name => {
      const file = path.join(directory, name);
      return existsSync(file) && m.files?.[name]?.bytes === readFileSync(file).length && m.files[name].sha256 === digest(readFileSync(file));
    })) { console.log(`[cartridge-tools] ${platform}-${arch}: verificado (${source.version}).`); return; }
    throw new Error(`Suporte existente inválido em ${directory}; preserve-o para diagnóstico antes de reconstruir.`);
  }
  const work = path.join(appRoot, ".cache/cfb", `${source.commit}-${source.patchSha256.slice(0, 12)}`);
  const run = (cmd, args, cwd = work, env = process.env) => execFileSync(cmd, args, { cwd, env, stdio: ["ignore", "pipe", "pipe"], maxBuffer: 16 * 1024 * 1024 }).toString().trim();
  mkdirSync(path.dirname(work), { recursive: true });
  if (!existsSync(path.join(work, ".git"))) run("git", ["clone", "--no-checkout", source.repository, work], appRoot);
  if (!existsSync(path.join(work, "Cargo.toml"))) run("git", ["checkout", "--detach", source.commit]);
  if (run("git", ["rev-parse", "HEAD"]) !== source.commit) throw new Error("Fonte do gravador fora do commit fixado.");
  run("git", ["submodule", "update", "--init", "--depth", "1"]);
  if (run("git", ["-C", "vendor/chis-burner-rule", "rev-parse", "HEAD"]) !== source.submoduleCommit) throw new Error("Submódulo do gravador fora do commit fixado.");
  try { run("git", ["apply", "--reverse", "--check", patchPath]); }
  catch { run("git", ["apply", "--check", patchPath]); run("git", ["apply", patchPath]); }
  if (run("git", ["diff", "--", "src/cartridge_link.rs"]) !== patch.toString().trim() || run("git", ["diff", "--name-only"]) !== "src/cartridge_link.rs") throw new Error("Alterações inesperadas nas fontes do gravador.");
  // A different target needs its standard Rust target libraries, never an elevated installer.
  const installed = run("rustup", ["target", "list", "--installed"]);
  if (!installed.split(/\r?\n/).includes(target)) run("rustup", ["target", "add", target]);
  const flags = process.env.CARGO_ENCODED_RUSTFLAGS?.split("\x1f") ?? process.env.RUSTFLAGS?.split(/\s+/).filter(Boolean) ?? [];
  const env = { ...process.env, CARGO_ENCODED_RUSTFLAGS: [...flags, `--remap-path-prefix=${work}=/cfb-source`].join("\x1f") };
  delete env.RUSTFLAGS;
  run("cargo", ["test", "--locked", "--target", target], work, env);
  run("cargo", ["build", "--release", "--locked", "--target", target], work, env);
  mkdirSync(directory, { recursive: true });
  const binary = platform === "win32" ? "cfb.exe" : "cfb";
  copyFileSync(path.join(work, "target", target, "release", binary), path.join(directory, binary));
  chmodSync(path.join(directory, binary), 0o755);
  copyFileSync(path.join(work, "LICENSE"), path.join(directory, "COPYING"));
  copyFileSync(patchPath, path.join(work, "GBA-STUDIO-STM.patch"));
  writeFileSync(path.join(work, "GBA-STUDIO-SOURCE.json"), JSON.stringify(source, null, 2));
  run("tar", ["--exclude=.git", "--exclude=target", "-czf", path.join(directory, "corresponding-source.tar.gz"), "-C", work, "."]);
  const files = Object.fromEntries([binary, "COPYING", "corresponding-source.tar.gz"].map(name => {
    const bytes = readFileSync(path.join(directory, name)); return [name, { bytes: bytes.length, sha256: digest(bytes) }];
  }));
  writeFileSync(manifestPath, JSON.stringify({ schemaVersion: 1, version: source.version, sourceCommit: source.commit, patchSha256: source.patchSha256, platform, arch, target, rustc: run("rustc", ["--version"]), files }, null, 2) + "\n");
  console.log(`[cartridge-tools] ${platform}-${arch}: compilado e fontes GPL preservadas (${source.version}).`);
}
if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  try { prepareCartridgeTools(); } catch (error) { console.error(error.message, error.stderr?.toString()); process.exitCode = 1; }
}
