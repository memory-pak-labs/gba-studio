/** @vitest-environment happy-dom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { createBlankProjectData } from "../shared/newProject";
import { StudioI18nProvider } from "./i18n";
import { LogicNavigator } from "./LogicNavigator";

afterEach(() => { cleanup(); window.localStorage.removeItem("gbaStudio.locale"); });

describe("Logic navigator accessibility labels", () => {
  it.each([
    ["pt-BR", "Adicionar variável", "Adicionar script", "Adicionar constante"],
    ["en-US", "Add variable", "Add script", "Add constant"],
    ["es-ES", "Añadir variable", "Añadir script", "Añadir constante"]
  ])("uses the selected locale %s for all creation controls", (locale, variable, script, constant) => {
    window.localStorage.setItem("gbaStudio.locale", locale);
    render(<StudioI18nProvider><LogicNavigator projectData={createBlankProjectData({ name: "Logic" })} events={null} selection={null} onSelect={() => {}} /></StudioI18nProvider>);
    for (const name of [variable, script, constant]) expect(screen.getByRole("button", { name })).toBeTruthy();
  });
});
