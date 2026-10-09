import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  inspectGbaToolchain,
  resolveToolchainEnvironment
} from "./check-gba-toolchain.mjs";

const temporaryRoots = [];

function createToolchainFixture(extension = process.platform === "win32" ? ".exe" : "") {
  const root = mkdtempSync(path.join(os.tmpdir(), "gbastudio-toolchain-test-"));
  temporaryRoots.push(root);

  const devkitPro = path.join(root, "devkitPro");
  const devkitArm = path.join(devkitPro, "devkitARM");
  const armBin = path.join(devkitArm, "bin");
  const toolsBin = path.join(devkitPro, "tools", "bin");
  const hostBin = path.join(root, "host-bin");
  for (const directory of [armBin, toolsBin, hostBin]) {
    mkdirSync(directory, { recursive: true });
  }

  for (const name of ["arm-none-eabi-gcc", "arm-none-eabi-g++", "arm-none-eabi-objcopy"]) {
    const filePath = path.join(armBin, `${name}${extension}`);
    writeFileSync(filePath, "#!/bin/sh\nexit 0\n");
    chmodSync(filePath, 0o755);
  }

  const gbafixPath = path.join(toolsBin, `gbafix${extension}`);
  writeFileSync(gbafixPath, "#!/bin/sh\nexit 0\n");
  chmodSync(gbafixPath, 0o755);

  for (const name of ["make", "python3"]) {
    const filePath = path.join(hostBin, `${name}${extension}`);
    writeFileSync(filePath, "#!/bin/sh\nexit 0\n");
    chmodSync(filePath, 0o755);
  }

  return { root, devkitPro, devkitArm, armBin, toolsBin, hostBin };
}

afterEach(() => {
  while (temporaryRoots.length > 0) {
    rmSync(temporaryRoots.pop(), { recursive: true, force: true });
  }
});

describe("check GBA toolchain", () => {
  it("resolves the Engine Pack toolchain from explicit environment roots", () => {
    const fixture = createToolchainFixture();
    const report = inspectGbaToolchain({
      env: {
        DEVKITPRO: fixture.devkitPro,
        DEVKITARM: fixture.devkitArm,
        PATH: fixture.hostBin
      },
      platform: process.platform
    });

    expect(report.ok).toBe(true);
    expect(report.roots).toEqual({
      devkitPro: fixture.devkitPro,
      devkitArm: fixture.devkitArm
    });
    expect(report.tools).toMatchObject({
      make: path.join(fixture.hostBin, "make" + (process.platform === "win32" ? ".exe" : "")),
      python3: path.join(fixture.hostBin, "python3" + (process.platform === "win32" ? ".exe" : "")),
      armGcc: path.join(fixture.armBin, "arm-none-eabi-gcc" + (process.platform === "win32" ? ".exe" : "")),
      armGxx: path.join(fixture.armBin, "arm-none-eabi-g++" + (process.platform === "win32" ? ".exe" : "")),
      armObjcopy: path.join(fixture.armBin, "arm-none-eabi-objcopy" + (process.platform === "win32" ? ".exe" : "")),
      gbafix: path.join(fixture.toolsBin, "gbafix" + (process.platform === "win32" ? ".exe" : ""))
    });
    expect(report.missing).toEqual([]);
  });

  it("infers the devkit roots from compiler and gbafix paths", () => {
    const fixture = createToolchainFixture();
    const report = inspectGbaToolchain({
      env: {
        PATH: [fixture.armBin, fixture.toolsBin, fixture.hostBin].join(path.delimiter)
      },
      platform: process.platform
    });

    expect(report.ok).toBe(true);
    expect(report.roots.devkitPro).toBe(fixture.devkitPro);
    expect(report.roots.devkitArm).toBe(fixture.devkitArm);
  });

  it("reports missing tools without inventing a personal installation path", () => {
    const report = inspectGbaToolchain({
      env: { PATH: "" },
      platform: process.platform,
      standardRoots: [],
      hostRoots: []
    });

    expect(report.ok).toBe(false);
    expect(report.missing).toEqual([
      "DEVKITPRO",
      "DEVKITARM",
      "make",
      "python3",
      "arm-none-eabi-gcc",
      "arm-none-eabi-g++",
      "arm-none-eabi-objcopy",
      "gbafix"
    ]);
  });

  it("exports resolved roots for the ROM pipeline without discarding existing variables", () => {
    const fixture = createToolchainFixture();
    const report = inspectGbaToolchain({
      env: {
        DEVKITPRO: fixture.devkitPro,
        DEVKITARM: fixture.devkitArm,
        PATH: fixture.hostBin
      },
      platform: process.platform
    });
    const resolved = resolveToolchainEnvironment(report, {
      PATH: "/usr/bin",
      KEEP_ME: "yes"
    });

    expect(resolved).toMatchObject({
      DEVKITPRO: fixture.devkitPro,
      DEVKITARM: fixture.devkitArm,
      KEEP_ME: "yes"
    });
    expect(resolved.PATH.split(path.delimiter).slice(0, 3)).toEqual([
      fixture.armBin,
      fixture.toolsBin,
      "/usr/bin"
    ]);
  });

  it("resolves executable suffixes used by Windows installations", () => {
    const fixture = createToolchainFixture(".exe");
    const report = inspectGbaToolchain({
      env: {
        DEVKITPRO: fixture.devkitPro,
        DEVKITARM: fixture.devkitArm,
        PATH: fixture.hostBin
      },
      platform: "win32",
      hostRoots: []
    });

    expect(report.ok).toBe(true);
    expect(report.tools.armGxx).toBe(path.join(fixture.armBin, "arm-none-eabi-g++.exe"));
    expect(report.tools.gbafix).toBe(path.join(fixture.toolsBin, "gbafix.exe"));
  });
});
