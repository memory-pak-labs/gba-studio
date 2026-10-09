export function isSafePluginRelativePath(value: string): boolean {
  const normalized = value.trim();
  if (!normalized) return false;
  if (normalized.includes("\\") || normalized.startsWith("/")) return false;
  if (/^[A-Za-z]:/.test(normalized)) return false;
  if (/[\u0000-\u001f\u007f]/.test(normalized)) return false;

  return normalized.split("/").every((segment) => (
    segment.length > 0 &&
    segment !== "." &&
    segment !== ".." &&
    !segment.includes(":")
  ));
}
