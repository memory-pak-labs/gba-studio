/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { RoomDialoguesInspector } from "./RoomDialoguesInspector";

describe("RoomDialoguesInspector", () => {
  afterEach(cleanup);

  it("keeps a newly created key selected while waiting for the catalogue update", async () => {
    const existing = { key: "old", character: "Guia", text: "Anterior", choices: [] };
    const onCreateDialogue = vi.fn(async () => "new");
    const props = { dialogues: [existing], catalog: [existing], onCreateDialogue };
    const { rerender } = render(<RoomDialoguesInspector {...props} />);
    fireEvent.click(screen.getByRole("button", { name: "Nova fala" }));
    await waitFor(() => expect(onCreateDialogue).toHaveBeenCalledOnce());
    rerender(<RoomDialoguesInspector {...props} catalog={[existing, { key: "new", character: "", text: "Nova", choices: [] }]} />);
    expect(screen.getByRole("textbox", { name: "Texto do diálogo" })).toHaveValue("Nova");
  });

  it("renderiza apenas a lista contextual de dialogos usados na cena", () => {
    render(
      <RoomDialoguesInspector
        dialogues={[
          { key: "npc_intro", character: "Lyra", text: "Olá!", choices: [] },
          { key: "sign_post", character: "Placa", text: "Cuidado.", choices: [] }
        ]}
      />
    );

    expect(screen.getByRole("button", { name: "Selecionar diálogo npc_intro" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Selecionar diálogo sign_post" })).toBeInTheDocument();
    expect(screen.getByText("Diálogos da cena")).toBeInTheDocument();
    expect(screen.getByText("2 usados")).toBeInTheDocument();
  });

  it("edita texto e configuracoes do dialogo selecionado", () => {
    const onUpdateDialogue = vi.fn();
    render(
      <RoomDialoguesInspector
        assetOptions={["nara.png", "smile.png"]}
        dialogues={[{
          key: "npc_intro",
          character: "Lyra",
          emote: "smile.png",
          portrait: "nara.png",
          portraitSlot: "left",
          text: "Olá!",
          textSound: "blip.wav",
          confirmSound: "confirm.wav",
          choices: [{ label: "Continuar" }]
        }]}
        onUpdateDialogue={onUpdateDialogue}
        sfxOptions={["blip.wav", "confirm.wav"]}
      />
    );

    fireEvent.change(screen.getByRole("textbox", { name: "Texto do diálogo" }), { target: { value: "Bem-vindo!" } });
    fireEvent.change(screen.getByRole("combobox", { name: "Emote do diálogo" }), { target: { value: "smile.png" } });
    expect(onUpdateDialogue).toHaveBeenCalledWith("npc_intro", { text: "Bem-vindo!" });
    expect(onUpdateDialogue).toHaveBeenCalledWith("npc_intro", { emote: "smile.png" });
  });

  it("abre o workspace global preservando o dialogo selecionado", () => {
    const onOpenDialoguesWorkspace = vi.fn();
    render(
      <RoomDialoguesInspector
        dialogues={[{ key: "npc_intro", character: "Lyra", text: "Olá!", choices: [] }]}
        onOpenDialoguesWorkspace={onOpenDialoguesWorkspace}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Abrir workspace Diálogos" }));
    expect(onOpenDialoguesWorkspace).toHaveBeenCalledWith("npc_intro");
  });

  it("permite vincular a fala a um ator real da cena e sinaliza o estado", () => {
    const onUpdateDialogue = vi.fn();
    render(
      <RoomDialoguesInspector
        actorOptions={[{ id: "actor-guide", name: "Guia", roomName: "harbor" }]}
        dialogues={[{
          actorBindingStatus: "unbound",
          character: "Guia",
          key: "guide_intro",
          text: "Olá!",
          choices: []
        }]}
        onUpdateDialogue={onUpdateDialogue}
      />
    );

    fireEvent.change(screen.getByRole("combobox", { name: "Ator da cena do diálogo" }), { target: { value: "actor-guide" } });

    expect(onUpdateDialogue).toHaveBeenCalledWith("guide_intro", { actorId: "actor-guide" });
    expect(screen.getByText("A fala não depende de uma instância física da cena.")).toBeInTheDocument();
  });
  it("opens an unused catalogue speech without attaching it to the current scene", () => {
    const onUpdateDialogue = vi.fn();
    const onPreviewChange = vi.fn();
    render(<RoomDialoguesInspector dialogues={[]} catalog={[{ key: "unused", character: "Nara", text: "Rascunho", choices: [] }]} focusedDialogueKey="unused" onUpdateDialogue={onUpdateDialogue} onPreviewChange={onPreviewChange} variables={["coins"]} onImportAssets={vi.fn()} />);
    expect(screen.getByRole("textbox", { name: "Texto do diálogo" })).toHaveValue("Rascunho");
    expect(screen.getByText(/Fala do catálogo · não usada nesta cena/)).toBeInTheDocument();
    expect(onUpdateDialogue).not.toHaveBeenCalled();
    fireEvent.change(screen.getByRole("combobox", { name: "Inserir variável no diálogo" }), { target: { value: "coins" } });
    expect(onUpdateDialogue).toHaveBeenCalledWith("unused", { text: "Rascunho{coins}" });
    expect(onPreviewChange).toHaveBeenLastCalledWith("unused");
    fireEvent.click(screen.getByRole("button", { name: "Prévia na cena" }));
    expect(onPreviewChange).toHaveBeenLastCalledWith(null);
  });

  it("keeps catalogue creation and shared speech editing in the scene inspector", async () => {
    const onCreateDialogue = vi.fn(async () => "new_key");
    const onUpdateDialogue = vi.fn();
    const onImportAssets = vi.fn();
    const onOpenDialogueEvent = vi.fn();
    render(<RoomDialoguesInspector
      dialogues={[{ key: "shared", character: "Nara", text: "Olá", choices: [] }]}
      catalog={[{ key: "new_key", character: "Narrador", text: "Nova fala.", choices: [] }]}
      sceneUsageNames={{ shared: ["porto", "farol"] }}
      usages={{ shared: [{ eventName: "intro", command: "choice_event shared 0 reward", targetEventName: "reward" }] }}
      onCreateDialogue={onCreateDialogue} onUpdateDialogue={onUpdateDialogue}
      onImportAssets={onImportAssets} onOpenDialogueEvent={onOpenDialogueEvent} />);
    expect(screen.getByText(/Fala compartilhada/)).toHaveTextContent("porto, farol");
    fireEvent.click(screen.getByRole("button", { name: /reward · choice_event/ }));
    expect(onOpenDialogueEvent).toHaveBeenCalledWith("reward");
    fireEvent.click(screen.getByRole("button", { name: "Importar assets" }));
    expect(onImportAssets).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole("button", { name: "Nova fala" }));
    await waitFor(() => expect(screen.getByRole("textbox", { name: "Texto do diálogo" })).toHaveValue("Nova fala."));
    expect(onUpdateDialogue).not.toHaveBeenCalled();
  });

});
