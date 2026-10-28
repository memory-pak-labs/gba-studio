/** @vitest-environment happy-dom */
import { useState } from "react";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { deriveEventsWorkspacePresentation, type EventsCommandMenuTab, type EventsWorkspaceCommandSuggestion } from "../shared/eventsWorkspace.js";
import { EventBlockLibrary } from "./EventBlockLibrary.js";
import { StudioI18nProvider, useStudioI18n } from "./i18n.js";
import { useStudioUiText } from "./studioUiText.js";

afterEach(() => { cleanup(); localStorage.clear(); });

function Library({ choose = vi.fn() }: { choose?: (suggestion: EventsWorkspaceCommandSuggestion) => void }) {
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<EventsCommandMenuTab>("all");
  const { setLocale } = useStudioI18n();
  const ui = useStudioUiText();
  return <><button onClick={() => setLocale("en-US")}>English</button><button onClick={() => setLocale("pt-BR")}>Português</button><button onClick={() => setLocale("es-ES")}>Español</button>
    <EventBlockLibrary allowRecipes contextLabel={ui("Script do projeto")} stepIndex={null}
      query={query} tab={tab} suggestions={deriveEventsWorkspacePresentation({}).commandPalette}
      onChangeQuery={setQuery} onChangeTab={setTab} onChooseSuggestion={choose} onClose={vi.fn()}/></>;
}

it("localizes categories, event labels, descriptions, parameters and status in English", async () => {
  localStorage.setItem("gbaStudio.locale", "en-US");
  render(<StudioI18nProvider><Library/></StudioI18nProvider>);
  const user = userEvent.setup();
  expect(screen.getByRole("button", { name: /^Engine fields / })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /^Music and sound effects / })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /^Campos do motor / })).not.toBeInTheDocument();
  await user.type(screen.getByRole("searchbox"), "load projectile");
  const result = within(screen.getByRole("region", { name: "Search results" }));
  await user.click(result.getByRole("button", { name: "Load projectile into slot" }));
  expect(screen.getByRole("complementary", { name: "Event description" })).toHaveTextContent("Available in ROM");
  expect(screen.getByRole("complementary", { name: "Event description" })).toHaveTextContent("Speed (hundredths of a pixel/frame)");
  expect(screen.getByRole("complementary", { name: "Event description" })).toHaveTextContent("Assigns a project sprite, damage and speed to projectile slot 0–7.");
  expect(screen.getAllByText("Project script").length).toBeGreaterThan(0);
});

it("searches translated titles and keeps serialized commands when choosing an event", async () => {
  localStorage.setItem("gbaStudio.locale", "en-US");
  const choose = vi.fn();
  render(<StudioI18nProvider><Library choose={choose}/></StudioI18nProvider>);
  const user = userEvent.setup();
  await user.type(screen.getByRole("searchbox"), "shop dialogue");
  expect(screen.getByRole("button", { name: "Open shop dialogue" })).toBeInTheDocument();
  expect(screen.getByRole("region", { name: "Search results" })).toHaveTextContent("1 item");
  expect(screen.getByRole("region", { name: "Search results" })).not.toHaveTextContent("1 items");
  await user.click(screen.getByRole("button", { name: "Add selected event" }));
  expect(choose).toHaveBeenCalledWith(expect.objectContaining({ command: "open_shop Player", label: "Abrir diálogo de loja" }));
});

it("updates an open library when the locale changes and translates script templates", async () => {
  localStorage.setItem("gbaStudio.locale", "pt-BR");
  render(<StudioI18nProvider><Library/></StudioI18nProvider>);
  const user = userEvent.setup();
  expect(screen.getByRole("button", { name: /^Campos do motor / })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "English" }));
  expect(screen.getByRole("button", { name: /^Engine fields / })).toBeInTheDocument();
  await user.click(screen.getByRole("tab", { name: "Script templates" }));
  await user.type(screen.getByRole("searchbox"), "chest");
  expect(screen.getByRole("button", { name: "Chest gives item" })).toBeInTheDocument();
  expect(screen.getByRole("complementary", { name: "Event description" })).toHaveTextContent(/Inserts a sequence of \d+ events for this behavior\./);
});


it("localizes Spanish search, preview and parameters", async () => {
  localStorage.setItem("gbaStudio.locale", "es-ES");
  render(<StudioI18nProvider><Library/></StudioI18nProvider>);
  const user = userEvent.setup();
  expect(screen.getByRole("button", { name: /^Campos del motor / })).toBeInTheDocument();
  await user.type(screen.getByRole("searchbox"), "cargar proyectil");
  await user.click(screen.getByRole("button", { name: "Cargar proyectil en una ranura" }));
  const preview = screen.getByRole("complementary", { name: "Descripción del evento" });
  expect(preview).toHaveTextContent("Disponible en la ROM");
  expect(preview).toHaveTextContent("Daño");
  expect(preview).toHaveTextContent("Velocidad (centésimas de píxel/fotograma)");
});

it("keeps the same favorites when switching from English to Portuguese", async () => {
  localStorage.setItem("gbaStudio.locale", "en-US");
  render(<StudioI18nProvider><Library/></StudioI18nProvider>);
  const user = userEvent.setup();
  await user.type(screen.getByRole("searchbox"), "load projectile");
  const favorite = screen.getByRole("button", { name: /^(Add|Remove) Load projectile into slot (to|from) favorites$/ });
  if (favorite.getAttribute("aria-pressed") === "true") await user.click(favorite);
  await user.click(screen.getByRole("button", { name: "Add Load projectile into slot to favorites" }));
  const saved = localStorage.getItem("gba-studio-event-favorites");
  await user.clear(screen.getByRole("searchbox"));
  await user.click(screen.getByRole("button", { name: "Português" }));
  await user.click(screen.getByRole("button", { name: "Favoritos" }));
  expect(screen.getByRole("button", { name: "Carregar projétil para espaço" })).toBeInTheDocument();
  expect(localStorage.getItem("gba-studio-event-favorites")).toBe(saved);
});

it("preserves authored script and context names that match application messages", () => {
  localStorage.setItem("gbaStudio.locale", "en-US");
  const presentation = deriveEventsWorkspacePresentation({ events: [{ name: "Salvar", steps: [{ command: "noop" }] }] });
  render(<StudioI18nProvider><EventBlockLibrary allowRecipes event={presentation.groups[0]!.events[0]} contextLabel="Salvar" stepIndex={null}
    query="" tab="all" suggestions={presentation.commandPalette} onChangeQuery={vi.fn()} onChangeTab={vi.fn()}
    onChooseSuggestion={vi.fn()} onClose={vi.fn()}/></StudioI18nProvider>);
  expect(screen.getByRole("dialog", { name: "Add event to Salvar" })).toBeInTheDocument();
  expect(screen.getByText("Salvar", { selector: ".event-library-header small" })).toBeInTheDocument();
  expect(document.querySelector(".event-library-footer")).toHaveTextContent("Insert in Salvar");
});
