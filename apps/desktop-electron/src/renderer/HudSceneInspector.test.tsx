import { HudCanvasToolbar } from "./HudCanvasToolbar";
/** @vitest-environment happy-dom */
import { useState } from "react";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HudSceneInspector } from "./HudSceneInspector";
import { RoomHudOverlay } from "./roomsWorkspace";
import { createBlankProjectData } from "../shared/newProject";
import { deriveRoomsWorkspacePresentation } from "../shared/roomsWorkspace";
import { createAdvancedHudPresetInProject, DEFAULT_HUD_PRESET, deriveHudPresetsWorkspacePresentation, resolveExplicitHudPresetBinding, updateHudPresetInProject, setActiveHudPresetInProject } from "../shared/hudPresets";
import { bindSceneHudInProject, createSceneHudVariationInProject } from "../shared/hudSceneAuthoring";
import { StudioI18nProvider } from "./i18n";

function fixture() {
  const data = createAdvancedHudPresetInProject(createBlankProjectData({name:"HUD authoring"}), DEFAULT_HUD_PRESET.id, "shared", "Compartilhada");
  data.variables = [{id:"choice",name:"choice",initialValue:0}];
  data.scenas = [{ id:"port", name:"Porto", sceneType:"topdown", width:30, height:20, hudPresetId:"shared" }, { id:"cave", name:"Caverna", sceneType:"topdown", width:30, height:20, hudPresetId:"shared" }];
  return data;
}
function Harness({ onChange = vi.fn() }: { onChange?: (...args: any[]) => void }) {
  const [data, setData] = useState(fixture);
  const [previewID, setPreviewID] = useState<string|null>(null);
  const [selection, setSelection] = useState<string|null>(null);
  const [sharedID, setSharedID] = useState<string|null>(null);
  const [view, setView] = useState<"edit"|"preview">("edit");
  const room = deriveRoomsWorkspacePresentation(data).rooms.find(room => room.id === "port")!;
  const hud = deriveHudPresetsWorkspacePresentation(data);
  const save = (next: typeof data) => { setData(next); onChange(next); };
  return <StudioI18nProvider><HudCanvasToolbar preset={hud.presets.find(p => p.id === previewID) ?? resolveExplicitHudPresetBinding(data,{roomPresetId:room.hudPresetId})?.preset} canEdit={Boolean(sharedID || room.hudPresetId === "local")} selectedComponentID={selection} onSelectComponent={setSelection} onUpdateHudPreset={(id,fields) => save(updateHudPresetInProject(data,id,fields))} viewMode={view} onViewMode={setView} /><HudSceneInspector room={room} projectData={data}
    binding={resolveExplicitHudPresetBinding(data,{roomPresetId:room.hudPresetId})}
    presets={hud.presets} activePresetID={hud.activePresetId} previewPreset={hud.presets.find(p => p.id === previewID) ?? null}
    onPreviewPreset={setPreviewID} selectedComponentID={selection} onSelectComponent={setSelection}
    editingSharedPresetID={sharedID} onEditSharedPreset={setSharedID} viewMode={view} onViewMode={setView}
    onBindHud={(id,preset) => save(bindSceneHudInProject(data,id,preset))}
    onCreateHudVariationForRoom={(id,source) => save(createSceneHudVariationInProject(data,id,source,"local","Porto local"))}
    onUpdateHudPreset={(id,fields) => save(updateHudPresetInProject(data,id,fields))}
    onSetActiveHudPreset={id => save(setActiveHudPresetInProject(data,id))} onRemoveHudPreset={vi.fn()}
  /></StudioI18nProvider>;
}
afterEach(cleanup);
describe("scene HUD inspector", () => {
  it("browses and searches the library without changing scene bindings or the global default", async () => {
    const user = userEvent.setup(); const changed = vi.fn(); render(<Harness onChange={changed}/>);
    await user.click(screen.getByRole("button",{name:"Biblioteca de HUDs"}));
    const library = screen.getByRole("dialog",{name:"Biblioteca de HUDs"});
    await user.type(within(library).getByRole("searchbox"), "Compartilhada");
    await user.click(within(library).getByRole("button",{name:/Compartilhada/}));
    expect(changed).not.toHaveBeenCalled();
    expect(screen.getByText("Prévia da biblioteca · Compartilhada")).toBeInTheDocument();
    await user.click(screen.getByRole("button",{name:"Voltar à HUD aplicada"}));
    expect(changed).not.toHaveBeenCalled();
  });
  it("protects shared edits and creates a local variation without changing the other scene", async () => {
    const user=userEvent.setup();const changed=vi.fn();render(<Harness onChange={changed}/>);
    expect(screen.getByRole("button",{name:"+ Texto"})).toBeDisabled();
    expect(screen.getByRole("button",{name:"Encaixar"})).toBeDisabled();
    await user.click(screen.getByRole("button",{name:"Personalizar nesta cena"}));
    expect(screen.getByRole("button",{name:"+ Texto"})).toBeEnabled();
    expect(changed.mock.lastCall?.[0].scenas).toMatchObject([{hudPresetId:"local"},{hudPresetId:"shared"}]);
    expect(deriveHudPresetsWorkspacePresentation(changed.mock.lastCall?.[0]).activePresetId).toBe(DEFAULT_HUD_PRESET.id);
    await user.click(screen.getByRole("button",{name:"+ Texto"}));
    expect(screen.getByRole("textbox",{name:"Nome"})).toHaveValue("Texto");
    fireEvent.change(screen.getByRole("spinbutton",{name:"X"}),{target:{value:"23"}});
    const component=deriveHudPresetsWorkspacePresentation(changed.mock.lastCall?.[0]).presets.find(p => p.id === "local")?.components.at(-1);
    expect(component).toMatchObject({x:24,anchor:"freeform",anchorOffsetX:24});
    expect(screen.getByRole("button",{name:"Encaixar"})).toBeEnabled();
    await user.click(screen.getByRole("button",{name:"Encaixar"}));
    expect(deriveHudPresetsWorkspacePresentation(changed.mock.lastCall?.[0]).presets.find(p => p.id === "local")?.components.at(-1)).toMatchObject({x:24,anchor:"freeform",anchorOffsetX:24});
    await user.click(screen.getByRole("button",{name:"Duplicar elemento"}));
    expect(screen.getByRole("textbox",{name:"Nome"})).toHaveValue("Texto cópia");
    await user.click(screen.getByRole("button",{name:"Remover elemento"}));
    expect(screen.queryByRole("textbox",{name:"Nome"})).not.toBeInTheDocument();
  });
  it("enables explicit shared editing and applies HUD none and project inheritance", async () => {
    const user=userEvent.setup();const changed=vi.fn();render(<Harness onChange={changed}/>);
    await user.click(screen.getByRole("button",{name:"Editar compartilhada"}));
    expect(screen.getByRole("button",{name:"+ Texto"})).toBeEnabled();
    await user.click(screen.getByRole("tab",{name:"Aparência"}));
    fireEvent.change(screen.getByRole("textbox",{name:"Nome da HUD"}),{target:{value:"HUD comum"}});
    expect(deriveHudPresetsWorkspacePresentation(changed.mock.lastCall?.[0]).presets.find(p => p.id === "shared")?.name).toBe("HUD comum");
    await user.selectOptions(screen.getByRole("combobox",{name:"Preset de HUD desta cena"}), "");
    expect((changed.mock.lastCall?.[0].scenas as any[])[0].hudPresetId).toBeUndefined();
    await user.selectOptions(screen.getByRole("combobox",{name:"Preset de HUD desta cena"}), "@project");
    expect((changed.mock.lastCall?.[0].scenas as any[])[0].hudPresetId).toBe("@project");
  });
});
describe("HUD element behavior and deletion", () => {
  it("protects a read-only selection from keyboard deletion", () => {
    const preset=deriveHudPresetsWorkspacePresentation(fixture()).presets.find(p=>p.id==="shared")!;
    const update=vi.fn();render(<HudCanvasToolbar preset={preset} canEdit={false} selectedComponentID={preset.components[0].id} onSelectComponent={vi.fn()} onUpdateHudPreset={update} viewMode="edit" onViewMode={vi.fn()}/>);
    fireEvent.keyDown(window,{key:"Delete"});expect(update).not.toHaveBeenCalled();
    expect(screen.getByRole("button",{name:"Remover elemento"})).toBeDisabled();
  });

  it("keeps Backspace in a text field and deletes only the selected writable element", async () => {
    const user=userEvent.setup(); const changed=vi.fn(); render(<Harness onChange={changed}/>);
    await user.click(screen.getByRole("button",{name:"Personalizar nesta cena"}));
    await user.click(screen.getByRole("button",{name:"+ Texto"}));
    const input=screen.getByRole("textbox",{name:"Nome"});
    const before=changed.mock.calls.length;
    fireEvent.keyDown(input,{key:"Backspace"}); expect(changed).toHaveBeenCalledTimes(before);
    fireEvent.keyDown(window,{key:"Delete"});
    expect(screen.queryByRole("textbox",{name:"Nome"})).not.toBeInTheDocument();
    expect(changed).toHaveBeenCalledTimes(before+1);
  });
  it("persists independent states and actions through the inspector tabs", async () => {
    const user=userEvent.setup();const changed=vi.fn();render(<Harness onChange={changed}/>);
    await user.click(screen.getByRole("button",{name:"Personalizar nesta cena"}));
    await user.click(screen.getByRole("button",{name:"+ Texto"}));
    await user.click(screen.getByRole("tab",{name:"Estados"}));
    await user.click(screen.getByRole("checkbox",{name:"Ativar condição de selecionado"}));
    fireEvent.change(screen.getByRole("textbox",{name:"Texto · Selecionado"}),{target:{value:"FOCO"}});
    await user.click(screen.getByRole("tab",{name:"Eventos"}));
    await user.click(screen.getByRole("button",{name:"Adicionar evento"}));
    await user.selectOptions(screen.getByRole("combobox",{name:"Gatilho do evento 1"}),"confirm");
    const component=deriveHudPresetsWorkspacePresentation(changed.mock.lastCall?.[0]).presets.find(p=>p.id==="local")!.components.at(-1)!;
    expect(component.behavior).toMatchObject({states:{selected:{variable:"choice",value:0,text:"FOCO"}},events:[{trigger:"confirm",actions:[{op:"set_variable",variable:"choice",value:0}]}]});
  });
});
describe("HUD canvas gestures", () => {
  function canvas(canEdit=true) {
    const data=fixture();const binding=resolveExplicitHudPresetBinding(data,{roomPresetId:"shared"})!;
    const component=binding.preset.components.find(c => c.kind === "text")!;
    const update=vi.fn();
    const result=render(<RoomHudOverlay binding={binding} canEdit={canEdit} editable viewportScale={2} selectedComponentID={component.id} onSelectComponent={vi.fn()} onUpdateHudPreset={update}/>);
    const button=screen.getByRole("button",{name:`Editar ${component.label}`});
    button.setPointerCapture=vi.fn();button.hasPointerCapture=vi.fn(() => false);
    return {update,component,button,...result};
  }
  it("snaps a scaled drag and commits only on release, as one undoable mutation", () => {
    const {update,component,button}=canvas();
    fireEvent.pointerDown(button,{pointerId:1,button:0,clientX:20,clientY:20});
    fireEvent.pointerMove(button,{pointerId:1,clientX:53,clientY:39});
    expect(update).not.toHaveBeenCalled();
    fireEvent.pointerUp(button,{pointerId:1,clientX:53,clientY:39});
    expect(update).toHaveBeenCalledTimes(1);
    expect(update.mock.lastCall?.[1].components.find((c:any) => c.id===component.id)).toMatchObject({x:component.x+16,y:component.y+8});
  });
  it("cancels an in-flight drag and protects shared HUDs against keyboard edits", () => {
    const {update,button}=canvas();
    fireEvent.pointerDown(button,{pointerId:1,button:0,clientX:20,clientY:20});
    fireEvent.pointerMove(button,{pointerId:1,clientX:60,clientY:60});
    fireEvent.keyDown(button,{key:"Escape"});
    fireEvent.pointerUp(button,{pointerId:1});
    expect(update).not.toHaveBeenCalled();cleanup();
    const locked=canvas(false);fireEvent.keyDown(locked.button,{key:"ArrowRight"});
    expect(locked.update).not.toHaveBeenCalled();expect(screen.queryByRole("button",{name:/Redimensionar/})).not.toBeInTheDocument();
  });
  it("moves and resizes with the keyboard on the 8 pixel grid", () => {
    const {update,component,button}=canvas();
    fireEvent.keyDown(button,{key:"ArrowDown"});
    expect(update.mock.lastCall?.[1].components.find((c:any)=>c.id===component.id)).toMatchObject({y:component.y+8});
    fireEvent.keyDown(screen.getByRole("button",{name:`Redimensionar ${component.label}`}),{key:"ArrowDown"});
    expect(update.mock.lastCall?.[1].components.find((c:any)=>c.id===component.id)).toMatchObject({height:component.height+8});
  });
});
