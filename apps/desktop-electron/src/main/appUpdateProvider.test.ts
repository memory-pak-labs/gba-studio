import { describe, expect, it, vi } from "vitest";
import { GitHubProvider } from "electron-updater/out/providers/GitHubProvider.js";
import type { AppUpdater } from "electron-updater";
import type { ProviderRuntimeOptions } from "electron-updater/out/providers/Provider.js";

/** Exercise the real GitHub provider with generated-feed conventions and no network. */
function provider(currentVersion: string, releases: string[], stableTag = releases[0]) {
  const request = vi.fn(async ({ path }: { path: string }) => {
    if (path.endsWith(".atom")) return `<feed>${releases.map((version) => `<entry><title>${version}</title><link href="https://github.com/memory-pak-labs/gba-studio/releases/tag/v${version}"/><content>Release notes</content></entry>`).join("")}</feed>`;
    if (path.endsWith("/latest")) return JSON.stringify({ tag_name: `v${stableTag}` });
    if (path.endsWith("/beta-mac.yml") || path.endsWith("/rc-mac.yml")) throw new Error("channel file absent: builder generates latest-mac.yml for GitHub");
    const version = path.match(/\/download\/v([^/]+)\//)?.[1];
    return `version: ${version}\nfiles:\n  - url: GBA-Studio-${version}-mac-universal.zip\n    sha512: dGVzdA==\n    size: 123\n`;
  });
  const client = { allowPrerelease: currentVersion.includes("-"), currentVersion, fullChangelog: false } as unknown as AppUpdater;
  const runtime = { platform: "darwin", isUseMultipleRangeRequest: false, executor: { request } } as unknown as ProviderRuntimeOptions;
  return { request, source: new GitHubProvider({ provider: "github", owner: "memory-pak-labs", repo: "gba-studio" }, client, runtime) };
}

describe("official GitHub update feed", () => {
  it("finds a newer beta using the actual latest-mac.yml artifact and skips alpha", async () => {
    const { source, request } = provider("0.1.0-beta.3", ["0.2.0-alpha.1", "0.1.0-beta.4"]);
    const info = await source.getLatestVersion();
    expect(info.version).toBe("0.1.0-beta.4");
    expect(request.mock.calls.some(([options]) => options.path.endsWith("v0.1.0-beta.4/latest-mac.yml"))).toBe(true);
    expect(source.resolveFiles(info)[0].url.href).toBe("https://github.com/memory-pak-labs/gba-studio/releases/download/v0.1.0-beta.4/GBA-Studio-0.1.0-beta.4-mac-universal.zip");
  });
  it("finds a newer RC using the published latest-mac.yml while skipping alpha", async () => {
    const { source, request } = provider("0.1.0-rc.4", ["0.2.0-alpha.1", "0.1.0-rc.5"]);
    expect((await source.getLatestVersion()).version).toBe("0.1.0-rc.5");
    expect(request.mock.calls.some(([options]) => options.path.endsWith("v0.1.0-rc.5/latest-mac.yml"))).toBe(true);
  });
  it("offers the stable successor to a beta installation", async () => {
    const { source } = provider("0.1.0-beta.3", ["0.1.0"]);
    expect((await source.getLatestVersion()).version).toBe("0.1.0");
  });
  it("uses the stable release endpoint instead of the newest prerelease for stable installs", async () => {
    const { source, request } = provider("1.0.0", ["1.1.0-beta.1", "1.0.1"], "1.0.1");
    expect((await source.getLatestVersion()).version).toBe("1.0.1");
    expect(request.mock.calls.some(([options]) => options.path.endsWith("/releases/latest"))).toBe(true);
  });
});
