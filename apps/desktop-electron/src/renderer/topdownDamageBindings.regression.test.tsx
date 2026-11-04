/** @vitest-environment happy-dom */
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { deriveEventsWorkspacePresentation } from "../shared/eventsWorkspace.js";
import { RoomEventBindingsInspector } from "./RoomEventBindingsInspector.js";
import { StudioI18nProvider } from "./i18n.js";

afterEach(() => { cleanup(); localStorage.clear(); });

it.each([["onInteract", "On interact"], ["onHitActor", "On projectile hit"], ["onDefeated", "When defeated"]])(
  "authors %s through the empty actor flow and localizes the picker context", async (bindingKey, label) => {
    localStorage.setItem("gbaStudio.locale", "en-US");
    const create = vi.fn();
    render(<StudioI18nProvider><RoomEventBindingsInspector contextKind="actor"
      entity={{ id: "target", name: "Alvo 3 HP", collisionGroup: 0, health: 3, eventBindings: {} }}
      commandSuggestions={deriveEventsWorkspacePresentation({ dialogues: [{ id: "hit", key: "hit", text: "Hit" }] }).commandPalette}
      eventOptions={[]} onChangeBinding={vi.fn()} onCreateBehavior={create} onCreateEvent={vi.fn()} sceneType="topdown"/>
    </StudioI18nProvider>);
    const user = userEvent.setup();
    await user.selectOptions(screen.getByRole("combobox", { name: "Event state" }), screen.getByRole("option", { name: label }));
    await user.click(screen.getByRole("button", { name: `Start script in ${label}` }));
    expect(screen.getByRole("dialog", { name: `Choose event for ${label}` })).toBeInTheDocument();
    await user.type(screen.getByRole("searchbox"), "show dialogue");
    await user.click(screen.getByRole("button", { name: "Show dialogue" }));
    await user.click(screen.getByRole("button", { name: "Add selected event" }));
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ bindingKey, targetKind: "actor", targetName: "Alvo 3 HP", initialCommands: ["show_dialogue hit"] }));
  }
);
