/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, it } from "vitest";
import { buildProjectFromTemplate } from "../shared/projectTemplates";
import { createRoomInProject, updateRoomEntityInProject } from "../shared/roomsWorkspace";
import { parseGBAProjectFile, serializeGBAProjectFile, summarizeGBAProject } from "../shared/projectFile";
import { PointClickTargetInspector } from "./PointClickTargetInspector";
import { StudioI18nProvider } from "./i18n";

afterEach(() => { cleanup(); localStorage.clear(); });

it("authors collector and item requirement through controls, save and reopen in English", () => {
  localStorage.setItem("gbaStudio.locale", "en-US");
  let current = createRoomInProject(buildProjectFromTemplate("blank", { name: "Target UI" }), {
    id: "office", name: "Oficina", sceneType: "pointAndClick", width: 30, height: 20
  });
  current.triggers = [{ id: "key", name: "Key", roomName: "Oficina", x: 6, y: 8, width: 3, height: 3 }];
  current.dialogues = [{ key: "blocked", text: "Missing key" }];
  function Harness() {
    const [data, setData] = useState(current); current = data;
    const target = (data.triggers as Record<string, unknown>[])[0];
    return <StudioI18nProvider><PointClickTargetInspector data={data} value={target.pointClick}
      onChange={pointClick => setData(updateRoomEntityInProject(data, "trigger", "key", { pointClick }))} /></StudioI18nProvider>;
  }
  render(<Harness />);
  const name = screen.getByRole("textbox", { name: "Item granted" });
  fireEvent.change(name, { target: { value: "key" } });
  fireEvent.blur(name);
  const variable = screen.getByRole("spinbutton", { name: "Ownership variable" });
  fireEvent.change(variable, { target: { value: "20" } });
  fireEvent.blur(variable);
  fireEvent.change(screen.getByRole("combobox", { name: "Required selected item" }), { target: { value: "key" } });
  fireEvent.click(screen.getByRole("checkbox", { name: "Consume required item" }));
  fireEvent.change(screen.getByRole("combobox", { name: "Unavailable dialogue" }), { target: { value: "blocked" } });
  const saved = parseGBAProjectFile(serializeGBAProjectFile({ data: current, summary: summarizeGBAProject(current) })).data;
  expect((saved.triggers as Record<string, unknown>[])[0].pointClick).toMatchObject({ giveItem: "key", ownershipVariable: 20,
    requiredItem: "key", consumeRequiredItem: true, unavailableDialogue: "blocked" });
});
