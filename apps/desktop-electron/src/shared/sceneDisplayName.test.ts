import { describe, expect, it } from "vitest";

import { sceneDisplayName } from "./sceneDisplayName.js";

describe("sceneDisplayName", () => {
  it("remove o prefixo legado das cenas do exemplo sem alterar o identificador", () => {
    expect(sceneDisplayName("logo")).toBe("logo");
    expect(sceneDisplayName("usina_submersa")).toBe("usina_submersa");
  });

  it("preserva nomes de outros projetos e trata valores vazios", () => {
    expect(sceneDisplayName("main_menu")).toBe("main_menu");
    expect(sceneDisplayName("  " )).toBe("Cena sem nome");
    expect(sceneDisplayName(undefined)).toBe("Cena sem nome");
  });
});
