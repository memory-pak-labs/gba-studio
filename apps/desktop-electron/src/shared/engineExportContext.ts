/** Synchronous export-local memoization. Never retains authoring data between exports. */
let activeContext: WeakMap<object, Map<string, unknown>> | undefined;

export function withEngineExportContext<T>(run: () => T): T {
  if (activeContext) return run();
  activeContext = new WeakMap();
  try { return run(); } finally { activeContext = undefined; }
}

export function memoizeEngineExport<T>(source: object, key: string, compute: () => T): T {
  if (!activeContext) return compute();
  let values = activeContext.get(source);
  if (!values) { values = new Map(); activeContext.set(source, values); }
  if (values.has(key)) return values.get(key) as T;
  const value = compute();
  values.set(key, value);
  return value;
}
