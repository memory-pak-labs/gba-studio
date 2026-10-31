import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const checkout = fileURLToPath(new URL("../../../../", import.meta.url));

function physicalPath(value) {
  let parent = path.resolve(value);
  const missing = [];
  for (;;) {
    try {
      return path.join(fs.realpathSync(parent), ...missing);
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
      missing.unshift(path.basename(parent));
      parent = path.dirname(parent);
    }
  }
}

function contains(parent, child) {
  const relative = path.relative(parent, child);
  return relative === "" || (!path.isAbsolute(relative) && relative !== ".." && !relative.startsWith(".." + path.sep));
}

/** Claim one fresh external directory, including when a parent is a symlink. */
export function createExternalReviewDirectory(output) {
  if (typeof output !== "string" || !output.trim()) throw Error("Provide a new output directory outside the checkout.");
  const target = path.resolve(output);
  for (const [root, candidate] of [[path.resolve(checkout), target], [physicalPath(checkout), physicalPath(target)]]) {
    if (contains(root, candidate) || contains(candidate, root)) throw Error("Review output must be outside the checkout.");
  }
  fs.mkdirSync(target, { recursive: false });
  return target;
}
