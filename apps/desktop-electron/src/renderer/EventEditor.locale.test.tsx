/** @vitest-environment happy-dom */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { createBlankProjectData } from "../shared/newProject";
import { EventStructureEditor } from "./EventStructureEditor";
import { StudioI18nProvider } from "./i18n";
import { LogicNavigator } from "./LogicNavigator";

afterEach(() => { cleanup(); window.localStorage.removeItem("gbaStudio.locale"); });

it("localizes the event insertion label and the script category in English", () => {
  window.localStorage.setItem("gbaStudio.locale", "en-US");
  const events = { groups: [{ events: [{ name: "intro", category: "Cena" }] }] } as never;
  render(<StudioI18nProvider>
    <LogicNavigator projectData={createBlankProjectData({ name: "Logic" })} events={events} selection={null} onSelect={() => {}} />
    <EventStructureEditor eventName="intro" onOpenCommandMenu={vi.fn()} onSelectStep={vi.fn()} steps={[]} />
  </StudioI18nProvider>);
  expect(screen.getByText("Scene")).toBeTruthy();
  expect(screen.getByRole("button", { name: "Add event to the main flow" }).textContent).toBe("Add event");
});
