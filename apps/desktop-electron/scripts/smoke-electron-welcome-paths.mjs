import { join } from "node:path";

function projectSlug(name) {
  const slug = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return slug.length > 0 ? slug : "novo_projeto";
}

export function defaultWelcomeSavedProjectPath(tempRoot) {
  const slug = projectSlug("Novo projeto");
  return join(tempRoot, slug, `${slug}.gba-project`);
}
