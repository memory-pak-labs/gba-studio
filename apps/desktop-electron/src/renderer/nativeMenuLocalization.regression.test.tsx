/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { RoomEventBindingsInspector } from "./RoomEventBindingsInspector.js";
import { StudioI18nProvider } from "./i18n.js";
import { studioUiMessages, translateStudioMessage } from "../shared/studioUiMessages.js";
import { runtimeEventStates } from "../shared/sceneEventStates.js";

afterEach(() => { cleanup(); localStorage.clear(); });

const actions = [
  ["select", "Confirm option"],
  ["open_screen", "Switch screen"],
  ["push_screen", "Open screen"],
  ["pop_screen", "Back to previous screen"],
  ["toggle_variable", "Toggle variable"],
  ["adjust_variable", "Adjust variable"]
] as const;

function menu(action: string) {
  return { name: "Menu QA", runtime: { type: "menu", config: { screens: [{
    id: "title", title: "Ilha {0}", items: [{
      id: "start", label: "Iniciar da ilha", action, targetScreenID: "options", targetItemID: "audio",
      requiresSave: true, variableIndex: 2, minValue: 0, maxValue: 3, step: 1, checkedValue: 1
    }]
  }] } } };
}

it.each(actions)("localizes the native %s menu action and preserves authored labels", (action, title) => {
  localStorage.setItem("gbaStudio.locale", "en-US");
  render(<StudioI18nProvider><RoomEventBindingsInspector contextKind="room" entity={menu(action)}
    eventOptions={[]} onChangeBinding={vi.fn()} onCreateEvent={vi.fn()} onUpdateRuntimeState={vi.fn()}
    sceneType="menu" /></StudioI18nProvider>);
  expect(screen.getByRole("group", { name: "Screens" })).toBeInTheDocument();
  expect(screen.getByRole("option", { name: "Screens · Enter · Ilha {0}" })).toBeInTheDocument();
  expect(screen.getByRole("option", { name: "Screens · Back · Ilha {0}" })).toBeInTheDocument();
  const option = screen.getByRole("option", { name: "Options · Select · Iniciar da ilha" }) as HTMLOptionElement;
  fireEvent.change(screen.getByRole("combobox", { name: "Event state" }), { target: { value: option.value } });
  expect(screen.getByText(title)).toBeInTheDocument();
  fireEvent.click(screen.getByText(title));
  expect(screen.getByLabelText("Select · Iniciar da ilha · Require save")).toBeInTheDocument();
});

it.each(["en-US", "es-ES"])("covers every native menu title and field in %s", locale => {
  const sources = new Set<string>();
  for (const [action] of actions) {
    for (const state of runtimeEventStates(menu(action))) {
      sources.add(state.group);
      for (const entry of state.actions) {
        sources.add(entry.title);
        entry.fields.forEach(field => sources.add(field.label));
      }
    }
  }
  for (const source of sources) {
    const messages = studioUiMessages[source];
    expect(messages, source).toBeDefined();
    expect(translateStudioMessage(locale, source), source).toBe(messages?.[locale === "en-US" ? 1 : 2]);
  }
});
