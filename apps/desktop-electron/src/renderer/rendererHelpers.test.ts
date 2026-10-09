import { describe, expect, it } from "vitest";

import { defaultRoomName, statusText, uniqueDefaultRoomName } from "./rendererHelpers.js";

describe("nomes padrão de cena", () => {
  it("usa cena como prefixo para novas cenas", () => {
    expect(defaultRoomName(0)).toBe("cena_1");
    expect(uniqueDefaultRoomName(["cena_1", "cena_2"])).toBe("cena_3");
  });

  it("ignora nomes antigos ao procurar o próximo nome de cena", () => {
    expect(uniqueDefaultRoomName(["room_1", "cena_2"])).toBe("cena_3");
  });
});

describe("status de importacao", () => {
  it("resume o resultado de uma importacao do GB Studio", () => {
    expect(statusText({
      canceled: false,
      path: "/tmp/demo.gba-project",
      importReport: {
        kind: "gb-studio",
        sourcePath: "/tmp/demo.gbsproj",
        resourceCount: 281,
        copiedAssetCount: 89,
        translatedEventCount: 128,
        unsupportedEventCount: 108,
        warningCount: 0,
        diagnosticCount: 113
      }
    } as never)).toBe("GB Studio importado: 281 recursos, 89 assets, 128 eventos convertidos e 108 pendentes. Arquivo: /tmp/demo.gba-project");
  });
});
