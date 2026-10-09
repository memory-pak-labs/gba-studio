import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { parseGBAProjectFile } from "../shared/projectFile.js";

const projectPath = join(
  dirname(fileURLToPath(import.meta.url)),
  "../../default-assets/templates/exemplo-gba/exemplo-gba.gba-project"
);

describe("aceite de conteúdo do Exemplo GBA", () => {
  it("preserva as cenas aprovadas do Armazém e Observatório sem reintroduzir a Oficina", () => {
    const project = parseGBAProjectFile(readFileSync(projectPath, "utf8")).data;
    const sceneNames = (project.rooms as Array<{ name: string }>).map((room) => room.name);
    expect(sceneNames).toEqual(expect.arrayContaining(["armazem_das_mares", "observatorio_do_farol"]));
    expect(sceneNames).not.toContain("oficina");
    expect((project.events as Array<{ name?: string }>).map((event) => event.name))
      .toContain("aplicar_perfil_jogador_base");
  });
});
