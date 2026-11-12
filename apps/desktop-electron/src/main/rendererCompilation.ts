interface RendererRuntimeApp {
  readonly runningUnderARM64Translation: boolean;
  commandLine: {
    getSwitchValue(name: string): string;
    appendSwitch(name: string, value?: string): void;
  };
}

/** Configure renderer V8 before Electron's ready event. */
export function configureRendererCompilation(
  app: RendererRuntimeApp,
  platform: NodeJS.Platform = process.platform,
  architecture: string = process.arch
): void {
  if (platform !== "darwin" || architecture !== "x64") return;

  // Compile the emulation core at its optimized tier before running game frames.
  // Native Intel skips Maglev but keeps the optimizing JavaScript compiler.
  // Rosetta translates each JIT tier again, so retain its single-tier JS policy.
  const javascriptFlags = app.runningUnderARM64Translation
    ? ["--max-opt=1", "--always-sparkplug"]
    : ["--no-maglev"];
  const flags = [app.commandLine.getSwitchValue("js-flags").trim(),
    ...javascriptFlags, "--no-liftoff", "--no-wasm-lazy-compilation", "--no-wasm-tier-up"];
  app.commandLine.appendSwitch("js-flags", flags.filter(Boolean).join(" "));
}
