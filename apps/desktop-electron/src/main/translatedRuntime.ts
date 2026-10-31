interface TranslationRuntimeApp {
  readonly runningUnderARM64Translation: boolean;
  commandLine: {
    getSwitchValue(name: string): string;
    appendSwitch(name: string, value?: string): void;
  };
}

/** Configure renderer V8 before Electron's ready event. Native Intel is unchanged. */
export function configureTranslatedRuntime(
  app: TranslationRuntimeApp,
  platform: NodeJS.Platform = process.platform,
  architecture: string = process.arch
): void {
  if (platform !== "darwin" || architecture !== "x64" || !app.runningUnderARM64Translation) return;

  // Rosetta translates each JIT tier again. Avoid repeated JavaScript tier
  // transitions, and compile the emulation core at its optimized tier upfront.
  const flags = [app.commandLine.getSwitchValue("js-flags").trim(),
    "--max-opt=1", "--always-sparkplug", "--no-liftoff",
    "--no-wasm-lazy-compilation", "--no-wasm-tier-up"];
  app.commandLine.appendSwitch("js-flags", flags.filter(Boolean).join(" "));
}
