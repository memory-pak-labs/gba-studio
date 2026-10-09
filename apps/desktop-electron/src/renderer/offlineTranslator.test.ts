import { describe, expect, it, vi } from "vitest";
import { translateGameText } from "./offlineTranslator.js";

describe("offline translator", () => {
  it("maps project locales to Bergamot and restores protected game tokens", async () => {
    const translate = vi.fn(async ({ from, to, text }: { from: string; to: string; text: string }) => ({
      target: { text: `${text} traduzido` }
    }));

    const result = await translateGameText({
      text: "Hello {player}!\n{pause:30}",
      from: "en",
      to: "pt-BR",
      translate
    });

    expect(translate).toHaveBeenCalledWith(expect.objectContaining({ from: "en", to: "pt" }));
    expect(result).toContain("{player}");
    expect(result).toContain("\n");
    expect(result).toContain("{pause:30}");
  });
});
