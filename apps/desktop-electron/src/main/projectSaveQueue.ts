/** Preserve request order so an older write cannot overwrite the update snapshot. */
export function createProjectSaveQueue() {
  let tail = Promise.resolve();
  let pending = 0;
  return {
    pending: () => pending,
    run<T>(save: () => Promise<T>): Promise<T> {
      pending += 1;
      const result = tail.then(save);
      tail = result.then(() => undefined, () => undefined);
      return result.finally(() => { pending -= 1; });
    }
  };
}
