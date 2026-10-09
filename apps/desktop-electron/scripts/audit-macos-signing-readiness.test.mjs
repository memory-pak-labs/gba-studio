import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";

import { auditMacosSigningReadiness } from "./audit-macos-signing-readiness.mjs";

const entitlementPlist = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "https://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>com.apple.security.cs.allow-jit</key>
  <true/>
  <key>com.apple.security.cs.allow-unsigned-executable-memory</key>
  <true/>
</dict>
</plist>
`;

const permissiveEntitlementPlist = entitlementPlist.replace(
  "</dict>",
  "  <key>com.apple.security.cs.disable-library-validation</key>\n  <true/>\n</dict>"
);

async function withAppRoot(callback) {
  const appRoot = await mkdtemp(join(tmpdir(), "gbastudio-signing-"));
  try {
    await mkdir(join(appRoot, "build"), { recursive: true });
    await callback(appRoot);
  } finally {
    await rm(appRoot, { force: true, recursive: true });
  }
}

async function writePackage(appRoot, mac, afterPack = "./scripts/after-pack-macos.mjs") {
  await writeFile(
    join(appRoot, "package.json"),
    `${JSON.stringify({ build: { afterPack, mac } }, null, 2)}\n`
  );
}

describe("auditMacosSigningReadiness", () => {
  it("blocks when the macOS package does not declare entitlements", async () => {
    await withAppRoot(async (appRoot) => {
      await writePackage(appRoot, { target: ["dmg", "zip"] });

      const report = await auditMacosSigningReadiness({ appRoot });

      expect(report.status).toBe("blocked");
      expect(report.blockers).toContain("build.mac ainda nao aponta para os arquivos de entitlements esperados.");
    });
  });

  it("passes when macOS entitlements and hardened runtime configuration are ready", async () => {
    await withAppRoot(async (appRoot) => {
      await writePackage(appRoot, {
        entitlements: "build/entitlements.mac.plist",
        entitlementsInherit: "build/entitlements.mac.inherit.plist",
        hardenedRuntime: true,
        target: ["dmg", "zip"]
      });
      await writeFile(join(appRoot, "build", "entitlements.mac.plist"), entitlementPlist);
      await writeFile(join(appRoot, "build", "entitlements.mac.inherit.plist"), entitlementPlist);
      await writeFile(join(appRoot, "build", "entitlements.mac.local.plist"), permissiveEntitlementPlist);

      const report = await auditMacosSigningReadiness({ appRoot });

      expect(report.status).toBe("ready");
      expect(report.items.every((item) => item.state === "passed")).toBe(true);
    });
  });

  it("blocks permissive library validation and a missing pre-sign Info.plist hardening hook", async () => {
    await withAppRoot(async (appRoot) => {
      await writePackage(
        appRoot,
        {
          entitlements: "build/entitlements.mac.plist",
          entitlementsInherit: "build/entitlements.mac.inherit.plist",
          hardenedRuntime: true,
          target: ["dmg", "zip"]
        },
        null
      );
      await writeFile(join(appRoot, "build", "entitlements.mac.plist"), permissiveEntitlementPlist);
      await writeFile(join(appRoot, "build", "entitlements.mac.inherit.plist"), permissiveEntitlementPlist);

      const report = await auditMacosSigningReadiness({ appRoot });

      expect(report.status).toBe("blocked");
      expect(report.blockers).toContain("Library validation foi desativada sem necessidade declarada.");
      expect(report.blockers).toContain("O hook de hardening do Info.plist nao esta configurado antes da assinatura.");
    });
  });
});
