/** @vitest-environment happy-dom */
import React from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { buildAssetPackVideoBudget } from "../shared/assetPackVideoBudget.js";
import { SceneVideoBudgetPanel } from "./SceneVideoBudgetPanel.js";
import { attachLinkedSceneRomBudget } from "../shared/linkedSceneRomBudget.js";
import { StudioI18nProvider } from "./i18n.js";

afterEach(() => { cleanup(); window.localStorage.removeItem("gbaStudio.locale"); });
describe("scene video budget panel", () => {
  it("keeps missing compiler data pending", () => {
    render(<SceneVideoBudgetPanel sceneName="track" />);
    expect(screen.getByText("Faça a análise para carregar as reservas de vídeo desta cena.")).toBeInTheDocument();
    expect(screen.queryByText(/0 B/)).not.toBeInTheDocument();
  });
  it("shows the native mode, reservation scope and measured ROM without claiming complete coverage", () => {
    const report = buildAssetPackVideoBudget([{ name: "track", bankGroup: "scene_track" }], { schema: 11, ok: true, allocations: [], scene_video_layouts: {
      schema: 1, plans: [{ scene: "track", bank_group: "scene_track", bank_groups: ["scene_track"], runtime: "racing", display_mode: 1,
        scope: "reservation_envelope", notes: [], resources: { bgVram: [{ start: 32768, count: 16384 }], screenblocks: [{ start: 0, count: 2 }] } }] } });
    report.linkedRomBytes = 1024 * 1024;
    render(<SceneVideoBudgetPanel report={report} sceneName="track" />);
    expect(screen.getByText("Modo de vídeo 1")).toBeInTheDocument();
    expect(within(screen.getByRole("article", { name: "Reserva BG" })).getByText(/16.*KiB/)).toBeInTheDocument();
    expect(screen.getByText("Reservas e alocações; cobertura parcial.")).toBeInTheDocument();
    expect(screen.getByText(/1.*MiB/)).toBeInTheDocument();
    expect(screen.queryByText("Dentro dos limites")).not.toBeInTheDocument();
  });
  it("does not display another scene's report as the selected scene", () => {
    const report = buildAssetPackVideoBudget([{ name: "other", bankGroup: "scene_other" }], { schema: 11, ok: true, allocations: [] });
    render(<SceneVideoBudgetPanel report={report} sceneName="track" />);
    expect(screen.getByText("Faça a análise para carregar as reservas de vídeo desta cena.")).toBeInTheDocument();
  });
  it("shows exclusive/shared ROM bytes and dynamic arenas as reservations", () => {
    const report = buildAssetPackVideoBudget([{ name: "track", bankGroup: "scene_track" }], { schema: 11, ok: true, allocations: [], scene_video_layouts: {
      schema: 1, plans: [{ scene: "track", bank_group: "scene_track", bank_groups: ["scene_track"], runtime: "menu", display_mode: 0,
        scope: "reservation_envelope", notes: [], resources: {}, dynamic_reservations: [
          { feature: "name_keyboard", resources: { objVram: [{ start: 29952, count: 1280 }], oam: [{ start: 40, count: 40 }] } }
        ] }] } });
    report.linkedRomBytes = 1024;
    const measured = attachLinkedSceneRomBudget(report, { schema: 1, source: "linked_asset_symbols", attributedBytes: 100, otherBytes: 924,
      scenes: [{ scene: "track", bytes: 100, exclusiveBytes: 60, sharedBytes: 40, assetCount: 2 }] });
    render(<SceneVideoBudgetPanel report={measured} sceneName="track" />);
    expect(screen.getByText(/^ROM atribuída à cena:/)).toBeInTheDocument();
    expect(screen.getByText("Exclusivos: 60 B · Compartilhados: 40 B")).toBeInTheDocument();
    expect(screen.getByText("Teclado do nome")).toBeInTheDocument();
    expect(screen.getByText("Faixas compartilhadas contam uma vez; reservas não são picos medidos por frame.")).toBeInTheDocument();
    expect(screen.queryByText("ROM por cena e uso dinâmico de OBJ/OAM ainda pendentes.")).not.toBeInTheDocument();
  });
  it("translates the added copy in English", () => {
    window.localStorage.setItem("gbaStudio.locale", "en-US");
    render(<StudioI18nProvider><SceneVideoBudgetPanel sceneName="track" /></StudioI18nProvider>);
    expect(screen.getByText("Compiled video")).toBeInTheDocument();
    expect(screen.getByText("Run the analysis to load this scene's video reservations.")).toBeInTheDocument();
  });
});
