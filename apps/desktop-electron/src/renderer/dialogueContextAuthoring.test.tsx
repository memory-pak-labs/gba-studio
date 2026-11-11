/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { deriveDialoguesWorkspacePresentation } from "../shared/dialoguesWorkspace";
import { deriveEventsWorkspacePresentation } from "../shared/eventsWorkspace";
import { EventDialogueParameter } from "./EventDialogueParameter";
import { DialoguesWorkspace } from "./dialoguesWorkspace";
import { DialogueComposerDialog } from "./DialogueComposerDialog";
import { StudioI18nProvider } from "./i18n";
afterEach(cleanup);
const data = { dialogues: [{ key: "guia", character: "Guia", text: "Olá", choices: [] }], events: [{ id: "e", name: "entrar", steps: [{ command: "show_dialogue guia", isEnabled: true }] }] };
it("edits source speech in the dialogue workspace even when previewing another locale", () => {
  const update = vi.fn();
  render(<StudioI18nProvider><DialoguesWorkspace presentation={deriveDialoguesWorkspacePresentation(data)} projectData={data} onUpdateDialogue={update} onOpenDialogueEvent={vi.fn()} onExportDialogue={vi.fn()} /></StudioI18nProvider>);
  fireEvent.change(screen.getByRole("textbox", { name: "Texto do diálogo" }), { target: { value: "Nova fala" } });
  expect(update).toHaveBeenCalledWith("guia", { text: "Nova fala" });
});
it("offers searchable speech, contextual editing and the target for atomic creation", () => {
  const step = deriveEventsWorkspacePresentation(data).groups[0].events[0].steps[0];
  const create = vi.fn(async () => "nova"), update = vi.fn();
  const target = { eventID: "e", stepIndex: 0, command: step.command, tokenIndex: 1 };
  render(<EventDialogueParameter parameter={step.commandParameters[0]} projectData={data} target={target} onChange={vi.fn()} onCreate={create} onUpdate={update} />);
  fireEvent.click(screen.getByRole("button", { name: "Editar fala" }));
  fireEvent.change(screen.getByRole("textbox", { name: "Texto do diálogo" }), { target: { value: "Olá de novo" } });
  expect(update).toHaveBeenCalledWith("guia", { text: "Olá de novo" });
  expect(screen.getByText(/Alterações afetam todos os usos/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Criar fala" }));
  expect(create).toHaveBeenCalledWith(target);
});
it("keeps cancelled creation local and offers a generated, editable key", () => {
  const save = vi.fn(), cancel = vi.fn();
  render(<DialogueComposerDialog projectData={data} onSave={save} onCancel={cancel} />);
  fireEvent.change(screen.getByRole("textbox", { name: "Texto do diálogo" }), { target: { value: "Rascunho" } });
  fireEvent.click(screen.getByText("Identificação"));
  expect(screen.getByRole("textbox", { name: "Chave do diálogo" })).toHaveValue("fala_1");
  fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
  expect(cancel).toHaveBeenCalledOnce(); expect(save).not.toHaveBeenCalled(); expect(data.dialogues).toHaveLength(1);
});
