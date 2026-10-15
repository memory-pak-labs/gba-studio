/** @vitest-environment happy-dom */
import React, { memo } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { StudioI18nProvider, useStudioI18n } from "./i18n";
import { useStudioUiText } from "./studioUiText";
import { ProjectReferencePicker } from "./studioUi";

const Copy = memo(function Copy() {
  const ui = useStudioUiText();
  return <><p>{ui("Buscar cenas")}</p><select aria-label={ui("Posição")} value="Inferior" onChange={() => {}}><option value="Inferior">{ui("Inferior")}</option></select></>;
});
function Switcher() {
  const { setLocale } = useStudioI18n();
  return <><button onClick={() => setLocale("en-US")}>English</button><button onClick={() => setLocale("es-ES")}>Español</button><Copy /></>;
}
afterEach(() => { cleanup(); window.localStorage.clear(); });
describe("studio UI copy", () => {
  it("preserves authored reference names even when they match interface copy", () => {
    window.localStorage.setItem("gbaStudio.locale", "en-US");
    render(<StudioI18nProvider><ProjectReferencePicker ariaLabel="Cena" onChange={() => {}}
      options={[{ value: "scene-id", label: "Buscar cenas" }]} value="scene-id" /></StudioI18nProvider>);
    expect(screen.getByRole("combobox")).toHaveValue("Buscar cenas");
    fireEvent.click(screen.getByRole("combobox"));
    expect(screen.getByRole("option", { name: "Buscar cenas" })).toBeInTheDocument();
  });
  it("updates memoized UI without changing project option values", () => {
    render(<StudioI18nProvider><Switcher /></StudioI18nProvider>);
    fireEvent.click(screen.getByText("English"));
    expect(screen.getByText("Search scenes")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Position" })).toHaveValue("Inferior");
    expect(screen.getByRole("option", { name: "Bottom" })).toHaveValue("Inferior");
    fireEvent.click(screen.getByText("Español"));
    expect(screen.getByText("Buscar escenas")).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Posición" })).toHaveValue("Inferior");
  });
});
