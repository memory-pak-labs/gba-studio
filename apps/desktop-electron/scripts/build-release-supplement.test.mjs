import { it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const python = process.platform === "win32" ? "python" : "python3";
const script = fileURLToPath(new URL("./build-release-supplement.py", import.meta.url));

it("exports committed source, original notices and hashes while excluding private/untracked/runtime binaries", () => {
  const root = mkdtempSync(path.join(tmpdir(), "gbs-supplement-"));
  const repo = path.join(root, "repo"), runtime = path.join(root, "runtime"), output = path.join(root, "supplement.zip");
  const put = (base, name, text) => { const target = path.join(base, name); mkdirSync(path.dirname(target), { recursive: true }); writeFileSync(target, text); };
  const git = (...args) => execFileSync("git", ["-C", repo, ...args], { stdio: "pipe" });
  try {
    put(repo, "LICENSE", "MIT"); put(repo, "THIRD_PARTY_NOTICES.md", "Original notices");
    put(repo, "apps/desktop-electron/package.json", '{"version":"0.1.0-rc.1"}');
    put(repo, "apps/desktop-electron/package-lock.json", "{}");
    put(repo, "apps/desktop-electron/scripts/portable-runtime-sources.json", "{}");
    put(repo, "apps/desktop-electron/build/icon.png", "original icon");
    git("init"); git("add", "."); git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-m", "test");
    put(repo, ".env", "private"); put(repo, ".agent/STATE.md", "private");
    put(runtime, "Toolchain/licenses/GPL.txt", "Original GPL");
    put(runtime, "Runtime/Sources/tool.c", "int main() { return 0; }");
    put(runtime, "Runtime/Sources/AuthKey.p8", "private");
    put(runtime, "Runtime/Python/python.exe", "executable");
    put(runtime, "Runtime/runtime.json", '{"hostPackageVersions":["make 4.4.1"]}');
    const args = ["-I", script, "--repo", repo, "--runtime", runtime, "--output", output, "--platform", "linux-x64"];
    execFileSync(python, args, { stdio: "pipe" });
    execFileSync(python, ["-I", "-c", `
import hashlib,io,json,tarfile,zipfile
with zipfile.ZipFile(${JSON.stringify(output)}) as z:
    names=z.namelist()
    assert 'bundled/Toolchain/licenses/GPL.txt' in names
    assert 'bundled/Runtime/Sources/tool.c' in names
    assert not any('AuthKey' in n or n.endswith('.exe') for n in names)
    m=json.loads(z.read('MANIFEST.json'))
    assert len(m['entries']) == len(names)-1
    for e in m['entries']: assert hashlib.sha256(z.read(e['path'])).hexdigest() == e['sha256']
    with tarfile.open(fileobj=io.BytesIO(z.read(next(n for n in names if n.endswith('source.tar.gz'))))) as t:
        assert 'gba-studio/LICENSE' in t.getnames()
        assert not any('.env' in n or '.agent/' in n for n in t.getnames())
`], { stdio: "pipe" });
    if (process.platform !== "win32") {
      const docs = path.join(runtime, "Runtime/Licenses/bash"); mkdirSync(docs, { recursive: true });
      symlinkSync("../bash-completion/README.md.gz", path.join(docs, "README.md.bash_completion.gz"));
      execFileSync(python, args, { stdio: "pipe" });
      symlinkSync(path.join(root, "outside-COPYING"), path.join(docs, "COPYING"));
      expect(() => execFileSync(python, args, { stdio: "pipe" })).toThrow();
      rmSync(path.join(docs, "COPYING"));
    }
    put(repo, "LICENSE", "modified");
    expect(() => execFileSync(python, args, { stdio: "pipe" })).toThrow();
    expect(() => execFileSync(python, [...args, "--allow-generated-icons"], { stdio: "pipe" })).toThrow();
    git("add", "LICENSE"); git("-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-m", "test");
    put(repo, "apps/desktop-electron/build/icon.png", "native generated icon");
    expect(() => execFileSync(python, args, { stdio: "pipe" })).toThrow();
    execFileSync(python, [...args, "--allow-generated-icons"], { stdio: "pipe" });
    execFileSync(python, ["-I", "-c", `
import json,zipfile
with zipfile.ZipFile(${JSON.stringify(output)}) as z:
    assert z.read('generated/apps/desktop-electron/build/icon.png') == b'native generated icon'
    assert json.loads(z.read('MANIFEST.json'))['generatedIconOverrides'] == ['apps/desktop-electron/build/icon.png']
`], { stdio: "pipe" });
    rmSync(path.join(runtime, "Toolchain/licenses"), { recursive: true });
    expect(() => execFileSync(python, [...args, "--allow-generated-icons"], { stdio: "pipe" })).toThrow();
  } finally { rmSync(root, { recursive: true, force: true }); }
});
