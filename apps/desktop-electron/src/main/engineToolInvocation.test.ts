import { describe, expect, it } from "vitest";
import { execFile } from "node:child_process";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { resolveEngineToolInvocation } from "./engineToolInvocation.js";

describe("Engine Pack Python tools", () => {
  it("executes a Python tool with spaces, Unicode and shell characters unchanged", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "GBA Studio Python "));
    try {
      const tool = path.join(root, "tool.py");
      await writeFile(tool, "import json,sys\nprint(json.dumps(sys.argv[1:]))\n");
      const args = ["Meu jogo & teste", "ação", "literal$(whoami)"];
      const invocation = resolveEngineToolInvocation(tool, args);
      const { stdout } = await promisify(execFile)(invocation.executable, invocation.args);
      expect(JSON.parse(stdout)).toEqual(args);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it("passes paths and arguments literally to Python on Windows", () => {
    const tool = "C:\\Program Files\\GBA Studio\\resources\\assetc.py";
    const args = ["--project-dir", "C:\\Jogos\\Meu jogo & teste", "ação"];
    expect(resolveEngineToolInvocation(tool, args, { platform: "win32", env: {} })).toEqual({
      executable: "python", args: [tool, ...args]
    });
  });

  it("honors an explicitly configured Python executable on Linux", () => {
    expect(resolveEngineToolInvocation("/opt/GBA Studio/tools/gbsbuild.py", ["--json"], {
      platform: "linux", env: { GBA_STUDIO_PYTHON: "/opt/Python 3/bin/python3" }
    })).toEqual({ executable: "/opt/Python 3/bin/python3", args: ["/opt/GBA Studio/tools/gbsbuild.py", "--json"] });
  });

  it("keeps native and macOS wrapper invocations unchanged", () => {
    expect(resolveEngineToolInvocation("/Applications/GBA Studio.app/tools/gbsbuild", ["--json"], {
      platform: "darwin", env: {}
    })).toEqual({ executable: "/Applications/GBA Studio.app/tools/gbsbuild", args: ["--json"] });
  });

  it("quotes batch tool paths and project arguments containing spaces", () => {
    const invocation = resolveEngineToolInvocation("C:\\GBA Studio\\tools\\gbsbuild.cmd", ["--project-dir", "C:\\Meu jogo"], {
      platform: "win32", env: {}
    });
    expect(invocation.executable).toBe("cmd.exe");
    expect(invocation.args).toEqual(["/d", "/s", "/c", '""C:\\GBA Studio\\tools\\gbsbuild.cmd" "--project-dir" "C:\\Meu jogo""']);
    expect(invocation.windowsVerbatimArguments).toBe(true);
  });
});
