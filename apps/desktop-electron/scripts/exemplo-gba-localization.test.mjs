import { describe, expect, it } from "vitest";
import { localizeExemploGBAProject } from "./exemplo-gba-localization.mjs";

describe("localização do Exemplo GBA", () => {
  it("preserva traduções autorais existentes em vez de repor o texto legado pelo ID", () => {
    const project = {
      dialogues: [{
        key: "gb_dialogue_16", // gitleaks:allow -- dialogue content identifier, not a credential.
        text: "Os drones bloquearam a trilha.",
        translations: {
          "pt-BR": "Os drones bloquearam a trilha.",
          es: "Los drones bloquearon la ruta."
        },
        translationStatus: {
          "pt-BR": "approved",
          es: "approved"
        }
      }]
    };

    const localized = localizeExemploGBAProject(project);

    expect(localized.dialogues[0].translations).toEqual({
      "pt-BR": "Os drones bloquearam a trilha.",
      es: "Los drones bloquearon la ruta."
    });
  });
});
