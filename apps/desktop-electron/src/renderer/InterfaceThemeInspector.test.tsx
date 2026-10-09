/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { InterfaceThemeInspector } from "./InterfaceThemeInspector";
import type { GBAProjectData } from "../shared/projectFile";
afterEach(cleanup);
it("browses scopes without mutation and sends a scoped skin edit with only compatible assets", () => {
  const data: GBAProjectData = { scenas: [{ id: "port", name: "Porto", sceneType: "topdown" }, { id: "other", name: "Caverna", sceneType: "topdown" }], assets: [
    { name: "skin.png", metadata: { width: 24, height: 24 } }, { name: "panel.png", metadata: { width: 64, height: 112 } }
  ], settings: { interfaceThemes: { themes: [{ id: "sea", name: "Mar", boxImage: "skin.png", hudImage: "skin.png" }], defaultThemeId: "sea" } } };
  const change = vi.fn();
  render(<InterfaceThemeInspector projectData={data} roomId="port" focus="dialogue" onChange={change}/>);
  fireEvent.change(screen.getByLabelText("Aplicar aparência em"), { target: { value: "type" } });
  expect(change).not.toHaveBeenCalled();
  expect(screen.getByText(/Porto, Caverna/)).toBeInTheDocument();
  expect(screen.queryByRole("option", { name: "panel.png" })).not.toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Moldura do diálogo"), { target: { value: "skin.png" } });
  expect(change).toHaveBeenCalledWith({ scope: "type", roomId: "port", field: "boxImage", image: "skin.png" });
});
