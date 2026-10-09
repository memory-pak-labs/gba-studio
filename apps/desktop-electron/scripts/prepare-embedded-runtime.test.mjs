import { describe, expect, it } from "vitest";
import path from "node:path";

import {
  devkitProToolsPath,
  embeddedRuntimeProfile,
  embeddedRuntimeRequirements,
  embeddedToolWrapper,
  preserveToolchainSymlinks,
  shouldPrepareEmbeddedRuntime,
  universalRuntimeRequested
} from "./prepare-embedded-runtime.mjs";

describe("prepare embedded runtime", () => {
  it("prepares the embedded runtime only for macOS packages", () => {
    expect(shouldPrepareEmbeddedRuntime("darwin")).toBe(true);
    expect(shouldPrepareEmbeddedRuntime("linux")).toBe(false);
    expect(shouldPrepareEmbeddedRuntime("win32")).toBe(false);
  });

  it("requires dual toolchain sources only for Universal distribution", () => {
    expect(universalRuntimeRequested({ GBA_STUDIO_REQUIRE_UNIVERSAL_RUNTIME: "1" })).toBe(true);
    expect(universalRuntimeRequested({})).toBe(false);
  });

  it("supports compact and offline installation profiles", () => {
    expect(embeddedRuntimeProfile({ GBA_STUDIO_RUNTIME_PROFILE: "compact" })).toBe("compact");
    expect(embeddedRuntimeProfile({ GBA_STUDIO_RUNTIME_PROFILE: "offline" })).toBe("offline");
    expect(embeddedRuntimeProfile({})).toBe("offline");
    expect(() => embeddedRuntimeProfile({ GBA_STUDIO_RUNTIME_PROFILE: "invalid" })).toThrow(
      "Perfil de runtime macOS desconhecido"
    );

    expect(embeddedRuntimeRequirements("compact")).toEqual({
      bundledEnginePack: true,
      bundledPython: false,
      bundledToolchain: false
    });
    expect(embeddedRuntimeRequirements("offline")).toEqual({
      bundledEnginePack: true,
      bundledPython: true,
      bundledToolchain: true
    });
  });

  it("derives devkitPro tools beside devkitARM", () => {
    expect(devkitProToolsPath("/opt/devkitpro/devkitARM")).toBe(path.join("/opt/devkitpro", "tools"));
  });

  it("runs Engine Pack Python tools with the Python framework inside the app", () => {
    const wrapper = embeddedToolWrapper("assetc", "offline");

    expect(wrapper).toContain('Runtime/Python3.framework/Versions/Current/bin/python3');
    expect(wrapper).toContain('exec "$PYTHON" "$SCRIPT_DIR/assetc.py" "$@"');
    expect(wrapper).not.toContain("/usr/bin/python3");
    expect(wrapper).not.toContain("dirname");
  });

  it("uses the host Python and devkitPro installation in the compact package", () => {
    const wrapper = embeddedToolWrapper("gbsbuild", "compact");

    expect(wrapper).toContain('PYTHON="${GBA_STUDIO_PYTHON:-python3}"');
    expect(wrapper).toContain('DEVKITPRO="${DEVKITPRO:-/opt/devkitpro}"');
    expect(wrapper).toContain('DEVKITARM="${DEVKITARM:-$DEVKITPRO/devkitARM}"');
    expect(wrapper).not.toContain("Runtime/Python3.framework");
    expect(wrapper).not.toContain('RESOURCES_DIR/Toolchain');
  });

  it("forces gbsbuild to use the devkitARM bundled beside the Engine Pack", () => {
    const wrapper = embeddedToolWrapper("gbsbuild");

    expect(wrapper).toContain('DEVKITPRO="$RESOURCES_DIR/Toolchain"');
    expect(wrapper).toContain('DEVKITARM="$DEVKITPRO/devkitARM"');
    expect(wrapper).toContain("export DEVKITPRO DEVKITARM");
    expect(wrapper).toContain('PATH="$RESOURCES_DIR/Runtime/bin:$RESOURCES_DIR/Toolchain/bin:/usr/bin:/bin"');
    expect(wrapper).toContain("export PATH");
    expect(wrapper).toContain('gbastudio-toolchain-$$');
    expect(wrapper).toContain('/bin/ln -s "$TOOLCHAIN_ROOT" "$TOOLCHAIN_LINK"');
    expect(wrapper).toContain('"$PYTHON" "$SCRIPT_DIR/gbsbuild.py" "$@"');
  });

  it("preserves the no-space toolchain link in the packaged gbsbuild", () => {
    const source = [
      "def absolute_path(value):",
      "    return Path(value).expanduser().resolve()",
      "display_command.append(f\"DEVKITARM={absolute_path(args.devkitarm)}\")",
      "make_env[\"DEVKITARM\"] = str(absolute_path(args.devkitarm))",
      "engine_pack = absolute_path(args.engine_pack)"
    ].join("\n");
    const patched = preserveToolchainSymlinks(source);

    expect(patched).toContain("def logical_path(value):");
    expect(patched).toContain("DEVKITARM={logical_path(args.devkitarm)}");
    expect(patched).toContain('str(logical_path(args.devkitarm))');
    expect(patched).toContain("engine_pack = absolute_path(args.engine_pack)");
  });
});
