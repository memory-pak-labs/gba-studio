const PROJECT_FILE_EXTENSION = ".gba-project";

export function projectSlug(name: string): string {
  const slug = name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return slug.length > 0 ? slug : "novo_projeto";
}

export function defaultProjectSaveRelativePath(projectName: string): string {
  const slug = projectSlug(projectName);
  return `${slug}/${slug}${PROJECT_FILE_EXTENSION}`;
}
