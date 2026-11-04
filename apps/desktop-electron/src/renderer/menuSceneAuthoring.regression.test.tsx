/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useState } from "react";
import { afterEach, expect, it } from "vitest";
import { buildProjectFromTemplate } from "../shared/projectTemplates.js";
import { createRoomInProject, updateRoomFieldsInProject } from "../shared/roomsWorkspace.js";
import { normalizeSceneRuntime } from "../shared/sceneTypeProfiles.js";
import { normalizeMenuSceneConfig } from "../shared/menuScene.js";
import { parseGBAProjectFile, serializeGBAProjectFile, summarizeGBAProject, type GBAProjectData } from "../shared/projectFile.js";
import { buildEngineExportProjectContract } from "../main/exportEngineProject.js";
import { SceneRuntimeResourcesInspector } from "./SceneRuntimeResourcesInspector.js";
import { StudioI18nProvider } from "./i18n.js";

afterEach(() => { cleanup(); localStorage.clear(); });
type Row = Record<string, any>;
const rows = (value: unknown) => value as Row[];

function mountMenu(initialConfig?: unknown) {
  let result = createRoomInProject(buildProjectFromTemplate("blank", { name: "Menu QA" }), {
    id: "menu", name: "Menu QA", sceneType: "menu", width: 30, height: 20
  });
  if (initialConfig) result = updateRoomFieldsInProject(result, "menu", {
    runtime: normalizeSceneRuntime("menu", { type: "menu", config: initialConfig })
  });
  function Harness() {
    const [data, setData] = useState(result); result = data;
    const room = rows(data.scenas).find(room => room.id === "menu")!;
    return <StudioI18nProvider><SceneRuntimeResourcesInspector sceneType="menu" roomName="Menu QA" background="" config={room.runtime.config} data={data}
      onChange={config => setData(updateRoomFieldsInProject(data, "menu", { runtime: normalizeSceneRuntime("menu", { type: "menu", config }) }))} /></StudioI18nProvider>;
  }
  render(<Harness />);
  return {
    config: () => normalizeMenuSceneConfig(rows(result.scenas).find(room => room.id === "menu")!.runtime.config),
    saved: (): GBAProjectData => parseGBAProjectFile(serializeGBAProjectFile({ data: result, summary: summarizeGBAProject(result) })).data
  };
}

function number(label: string, value: number) {
  const input = screen.getByRole("spinbutton", { name: label });
  fireEvent.change(input, { target: { value: String(value) } });
  fireEvent.blur(input);
}

function text(label: string, value: string) {
  const input = screen.getByRole("textbox", { name: label });
  fireEvent.change(input, { target: { value } });
  fireEvent.blur(input);
}

it("authors an option action and availability through save and native export", () => {
  const data = mountMenu();
  text("Rótulo da opção", "Volume QA");
  fireEvent.change(screen.getByRole("combobox", { name: "Ação da opção" }), { target: { value: "adjust_variable" } });
  expect(data.config().items[0]?.variableIndex).toBe(0);
  number("Variável", 0); number("Mínimo", 1); number("Máximo", 3); number("Incremento", 1);
  fireEvent.click(screen.getByRole("checkbox", { name: "Exigir save" }));
  fireEvent.change(screen.getByRole("combobox", { name: "Disponível em" }), { target: { value: "racing" } });
  const saved = data.saved();
  expect(rows(saved.scenas).find(room => room.id === "menu")?.runtime.config.items[0]).toMatchObject({
    label: "Volume QA", action: "adjust_variable", variableIndex: 0, minValue: 1, maxValue: 3,
    step: 1, requiresSave: true, availableRuntime: "racing"
  });
  const exported = buildEngineExportProjectContract(saved).menu_project?.screens.find(room => room.name === "Menu QA");
  expect(exported?.items[0]).toMatchObject({ label: "Volume QA", action: "adjust_variable", adjust_variable: 0,
    min: 1, max: 3, step: 1, requires_save: true, available_runtime: "racing" });
});

it("adds, reorders and removes options, including replacing the last option", () => {
  const data = mountMenu();
  fireEvent.click(screen.getByRole("button", { name: "Adicionar opção" }));
  text("Rótulo da opção", "Nova");
  const id = data.config().items[1]!.id;
  fireEvent.click(screen.getByRole("button", { name: "Subir opção" }));
  expect(data.config().items[0]).toMatchObject({ id, label: "Nova" });
  fireEvent.click(screen.getByRole("button", { name: "Descer opção" }));
  expect(data.config().items[1]?.id).toBe(id);
  fireEvent.click(screen.getByRole("button", { name: "Remover opção" }));
  expect(data.config().items).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Remover opção" }));
  expect(data.config().items).toEqual([]);
  fireEvent.click(screen.getByRole("button", { name: "Adicionar opção" }));
  expect(data.config().items).toHaveLength(1);
});

it("edits one embedded screen without replacing other screens, HUD or callbacks", () => {
  const data = mountMenu({ screenType: "menu", hudListRows: 3, screens: [
    { id: "main", title: "Main", onBackEventName: "back", items: [{ id: "a", label: "A" }] },
    { id: "options", title: "Options", onEnterEventName: "enter", items: [{ id: "b", label: "B", action: "pop_screen" }] }
  ] });
  fireEvent.change(screen.getByRole("combobox", { name: "Tela do menu" }), { target: { value: "options" } });
  text("Rótulo da opção", "Return");
  expect(data.config().screens?.[0]).toMatchObject({ id: "main", onBackEventName: "back", items: [{ label: "A" }] });
  expect(data.config().screens?.[1]).toMatchObject({ id: "options", onEnterEventName: "enter", items: [{ label: "Return", action: "pop_screen" }] });
  expect(data.config().hudListRows).toBe(3);
});

it("authors text input and exports the same variable, length and keyboard", () => {
  const data = mountMenu();
  fireEvent.click(screen.getByText("Entrada de texto"));
  fireEvent.click(screen.getByRole("checkbox", { name: "Usar entrada de texto" }));
  text("Variável de texto", "qa.name");
  number("Máximo de caracteres", 3);
  const saved = data.saved();
  expect(rows(saved.scenas).find(room => room.id === "menu")?.runtime.config.textInput).toMatchObject({
    variableName: "qa.name", maxLength: 3, keyboard: { layout: "grid", allowLowercase: true }
  });
  const exported = buildEngineExportProjectContract(saved).menu_project?.screens.find(room => room.name === "Menu QA");
  expect(exported?.text_input).toMatchObject({ max_length: 3, keyboard_layout: "grid", keyboard_allow_lowercase: true });
  fireEvent.click(screen.getByRole("checkbox", { name: "Usar entrada de texto" }));
  expect(data.config().textInput).toBeUndefined();
});

it("uses English application copy and preserves the authored option label", () => {
  localStorage.setItem("gbaStudio.locale", "en-US");
  mountMenu();
  expect(screen.getByText("Menu options")).toBeInTheDocument();
  expect(screen.getByRole("textbox", { name: "Option label" })).toHaveValue("Iniciar");
  expect(screen.getByRole("combobox", { name: "Option action" })).toHaveValue("select");
  expect(screen.getByRole("button", { name: "Add option" })).toBeInTheDocument();
  expect(screen.getByRole("option", { name: "Confirm option" })).toBeInTheDocument();
});
