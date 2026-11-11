import { describe, expect, it } from "vitest";
import { createBlankProjectData } from "../shared/newProject.js";
import { buildEngineExportProjectContract } from "./exportEngineProject.js";
import { parseLinkCableCommand, toEngineLinkCableCommand } from "../shared/linkCableRuntime.js";
import { deriveEventsWorkspacePresentation } from "../shared/eventsWorkspace.js";
import { createPreviewRuntime, runPreviewRuntimeEvent } from "../shared/previewRuntime.js";

const commands = ["multiplayer_queue_open 2 115200 30", "multiplayer_queue_send net.message net.accepted",
  "multiplayer_queue_receive net.value net.sender net.received", "multiplayer_queue_status net.state net.local net.pending", "multiplayer_queue_close"];

describe("queued multiplayer authoring", () => {
  it("parses supported baud rates and preserves quoted variable names", () => {
    expect(parseLinkCableCommand(commands[0]!)).toEqual({ kind: "queue_open", players: 2, baud: 115200, timeoutFrames: 30 });
    const parsed = parseLinkCableCommand('multiplayer_queue_send "mensagem local" aceito');
    expect(toEngineLinkCableCommand(parsed!, { eventIndex: () => -1, variableIndex: name => name === "mensagem local" ? 4 : 5 }))
      .toEqual({ op: "multiplayer_queue_send", var_value: 4, var_accepted: 5 });
    for (const invalid of ["multiplayer_queue_open 1 115200 30", "multiplayer_queue_open 4 12345 30", "multiplayer_queue_open 2 9600 0", "multiplayer_queue_send", "multiplayer_queue_receive a b a"])
      expect(() => parseLinkCableCommand(invalid)).toThrow();
  });
  it("registers every variable, compiles the native ops and requires the global link capability", () => {
    const data = createBlankProjectData({ name: "Fila", includeStarterContent: false });
    data.events = [{ id: "network", name: "network", category: "Cena", steps: commands.map(command => ({ command })) }];
    expect(() => buildEngineExportProjectContract(data)).toThrow(/Runtime Universal/);
    (data.settings as any).runtimeCapabilities.link.enabled = true;
    const exported = buildEngineExportProjectContract(data);
    expect(exported.runtime_capabilities.capabilities.find(capability => capability.id === "link")!.settings.max_peers).toBe(4);
    const script = exported.topdown_project!.scripts!.find(script => script.name === "network")!;
    expect(script.script.map(command => command.op)).toEqual(commands.map(command => command.split(" ")[0]));
    expect(script.script[1]).toMatchObject({ var_value: expect.any(Number), var_accepted: expect.any(Number) });
    expect(exported.requires.features).toContain("link.link_queued_events");
    expect(JSON.parse(JSON.stringify(data)).events[0].steps[1].command).toBe(commands[1]);
  });
  it("offers the five actions and labels the variables and connection controls", () => {
    const data = createBlankProjectData({ name: "Fila", includeStarterContent: false });
    data.events = [{ name: "network", category: "Cena", steps: commands.map(command => ({ command })) }];
    const presentation = deriveEventsWorkspacePresentation(data);
    const steps = presentation.groups[0]!.events[0]!.steps;
    expect(steps[0]!.commandParameters.map(p => p.label)).toEqual(["Jogadores", "Velocidade do cabo (bps)", "Tempo limite (quadros)"]);
    expect(steps[0]!.commandParameters[1]!.options).toEqual(["9600", "38400", "57600", "115200"]);
    expect(steps[1]!.commandParameters.map(p => p.kind)).toEqual(["variable", "variable"]);
    expect(steps[2]!.commandParameters.map(p => p.label)).toEqual(["Variável da mensagem", "Variável do remetente", "Variável de recebimento"]);
    for (const step of steps) expect(step.commandRuntimeStatus).toBe("ok-rom");
  });
  it("simulates a missing cable without echoing or confirming its own messages", () => {
    const data = createBlankProjectData({ name: "Fila", includeStarterContent: false });
    (data.settings as any).runtimeCapabilities.link.enabled = true;
    data.events = [{ name: "network", category: "Cena", steps: ["set_variable net.message 65535", ...commands.slice(0,4)].map(command => ({ command })) }];
    const state = runPreviewRuntimeEvent(createPreviewRuntime(data), "network");
    expect(state.variables["net.accepted"]).toBe(1);
    expect(state.variables["net.received"]).toBe(0);
    expect(state.variables["net.pending"]).toBe(1);
    expect(state.variables["net.state"]).toBe(1);
  });
});
