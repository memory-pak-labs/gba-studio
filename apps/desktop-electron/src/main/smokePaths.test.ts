import { describe, expect, it } from "vitest";
import { resolveSmokeProjectSavePath, resolveSmokeUserDataPath } from "./smokePaths.js";

describe("resolveSmokeProjectSavePath", () => {
  it("returns a trimmed smoke project save path from the environment", () => {
    expect(resolveSmokeProjectSavePath({ GBA_STUDIO_SMOKE_PROJECT_SAVE_PATH: " /tmp/blank.gba-project " })).toBe("/tmp/blank.gba-project");
  });

  it("ignores missing or blank smoke project save paths", () => {
    expect(resolveSmokeProjectSavePath({})).toBeNull();
    expect(resolveSmokeProjectSavePath({ GBA_STUDIO_SMOKE_PROJECT_SAVE_PATH: "   " })).toBeNull();
  });
});

describe("resolveSmokeUserDataPath", () => {
  it("returns a trimmed smoke user data path from the environment", () => {
    expect(resolveSmokeUserDataPath({ GBA_STUDIO_SMOKE_USER_DATA_DIR: " /tmp/gba-studio-smoke-user-data " })).toBe("/tmp/gba-studio-smoke-user-data");
  });

  it("ignores missing or blank smoke user data paths", () => {
    expect(resolveSmokeUserDataPath({})).toBeNull();
    expect(resolveSmokeUserDataPath({ GBA_STUDIO_SMOKE_USER_DATA_DIR: "   " })).toBeNull();
  });
});
