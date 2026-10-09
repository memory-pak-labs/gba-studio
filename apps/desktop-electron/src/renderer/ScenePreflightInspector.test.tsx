/** @vitest-environment happy-dom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { createBlankProjectData } from "../shared/newProject";
import { buildScenePreflightReport } from "../shared/scenePreflight";
import { ScenePreflightInspector } from "./ScenePreflightInspector";

describe("ScenePreflightInspector", () => {
  afterEach(() => cleanup());

  it("identifica uma fixture estrutural como não produtiva", () => {
    const project = createBlankProjectData({ name: "Fixture estrutural" });
    project.fixture = {
      schema: 1,
      registry: "gba-studio-complete-structural-fixture",
      mode: "structural",
      productionReady: false
    };
    const scene = String((project.scenas as Array<Record<string, unknown>>)[0]?.name);
    const report = buildScenePreflightReport(project, scene);

    render(<ScenePreflightInspector report={report} />);

    const preflight = screen.getByRole("region", { name: "Preflight da cena" });
    expect(preflight).toHaveAttribute("data-preflight-fixture", "structural");
    expect(screen.getByRole("status")).toHaveTextContent("Fixture estrutural · não produtiva");
    expect(screen.getByRole("status")).toHaveTextContent("arte e a aprovação de produção permanecem separadas");
  });
});
