interface WorkAreaSize {
  width: number;
  height: number;
}

export interface MainWindowBounds {
  width: number;
  height: number;
  minWidth: number;
  minHeight: number;
}

const idealWindowBounds = {
  width: 1600,
  // Aproxima a proporção da tela principal de referência (1470 × 956).
  height: 1040,
  minWidth: 900,
  minHeight: 800
} as const;

const workAreaUsageRatio = 0.92;

function positiveDimension(value: number, fallback: number): number {
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

export function resolveMainWindowBounds(workAreaSize: WorkAreaSize): MainWindowBounds {
  const workAreaWidth = positiveDimension(workAreaSize.width, idealWindowBounds.width);
  const workAreaHeight = positiveDimension(workAreaSize.height, idealWindowBounds.height);
  const availableWidth = Math.floor(workAreaWidth * workAreaUsageRatio);
  const availableHeight = Math.floor(workAreaHeight * workAreaUsageRatio);
  const scale = Math.min(
    1,
    availableWidth / idealWindowBounds.width,
    availableHeight / idealWindowBounds.height
  );
  const width = Math.round(idealWindowBounds.width * scale);
  const height = Math.round(idealWindowBounds.height * scale);

  return {
    width,
    height,
    minWidth: Math.min(idealWindowBounds.minWidth, width),
    minHeight: Math.min(idealWindowBounds.minHeight, height)
  };
}

/** Keep native controls; only the macOS main window shares its titlebar with the shell. */
export function resolveMainWindowChrome(platform: NodeJS.Platform) {
  return platform === "darwin"
    ? { titleBarStyle: "hidden" as const, trafficLightPosition: { x: 16, y: 19 } }
    : {};
}
