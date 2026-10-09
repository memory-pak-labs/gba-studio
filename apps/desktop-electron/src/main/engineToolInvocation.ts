export interface EngineToolInvocationOptions {
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
}

export function resolveEngineToolInvocation(
  toolPath: string,
  args: string[],
  options: EngineToolInvocationOptions = {}
): { executable: string; args: string[]; windowsVerbatimArguments?: boolean } {
  const platform = options.platform ?? process.platform;
  const env = options.env ?? process.env;
  if (/\.py$/i.test(toolPath)) {
    return {
      executable: env.GBA_STUDIO_PYTHON?.trim() || (platform === "win32" ? "python" : "python3"),
      args: ["-X", "utf8", toolPath, ...args]
    };
  }
  if (platform === "win32" && /\.(cmd|bat)$/i.test(toolPath)) {
    const command = [toolPath, ...args].map((value) => `"${value.replaceAll('"', '""')}"`).join(" ");
    return {
      executable: env.ComSpec ?? "cmd.exe",
      args: ["/d", "/s", "/c", `"${command}"`],
      windowsVerbatimArguments: true
    };
  }
  return { executable: toolPath, args };
}
