/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { normalizeMenuSceneConfig } from "../shared/menuScene";
import { menuTextInputLayout, useCustomMenuKeyboard } from "../shared/menuTextInputLayout";
import { StudioI18nProvider } from "./i18n";
import { MenuTextInputOverlay } from "./MenuTextInputOverlay";

afterEach(() => { cleanup(); window.localStorage.clear(); });
const input = () => normalizeMenuSceneConfig({ role: "name_input", textInput: {
  variableName: "player.name", maxLength: 8, x: 15, y: 5, width: 8,
  keyboard: { layout: "grid", controlLayout: "bottom_grid", surface: "background", x: 11, y: 8, width: 16, height: 10, allowLowercase: true }
} }).textInput!;

function setup(readOnly = false) {
  const value = input(), change = vi.fn();
  const result = render(<MenuTextInputOverlay input={value} editable readOnly={readOnly} onChange={change} />);
  const root = result.container.firstElementChild!;
  root.getBoundingClientRect = vi.fn(() => ({ x: 0, y: 0, left: 0, top: 0, right: 480, bottom: 320, width: 480, height: 320, toJSON() {} }));
  for (const button of screen.getAllByRole("button")) {
    button.setPointerCapture = vi.fn(); button.hasPointerCapture = vi.fn(() => true); button.releasePointerCapture = vi.fn();
  }
  return { ...result, change, value, field: screen.getByRole("button", { name: "Mover campo do nome" }), keyboard: screen.getByRole("button", { name: "Mover teclado" }) };
}
const down = (button: HTMLElement) => fireEvent.pointerDown(button, { pointerId: 3, button: 0, clientX: 100, clientY: 100 });
const move = (button: HTMLElement, clientX: number, clientY: number) => fireEvent.pointerMove(button, { pointerId: 3, clientX, clientY });
const up = (button: HTMLElement) => fireEvent.pointerUp(button, { pointerId: 3 });

describe("native interface selection and movement", () => {
  it("selects and moves the field at the rendered zoom, committing once only on release", () => {
    const { field, keyboard, change, value } = setup();
    down(field);
    expect(field).toHaveAttribute("aria-pressed", "true");
    expect(keyboard).toHaveAttribute("aria-pressed", "false");
    move(field, 116, 100); move(field, 132, 116);
    expect(change).not.toHaveBeenCalled();
    up(field); fireEvent.lostPointerCapture(field, { pointerId: 3 });
    expect(change).toHaveBeenCalledTimes(1);
    expect(change).toHaveBeenCalledWith({ ...value, x: 17, y: 6 });
  });
  it("keeps a gesture alive when the parent renders the same input again", () => {
    const { keyboard, change, value, rerender } = setup();
    down(keyboard); move(keyboard, 68, 84);
    rerender(<MenuTextInputOverlay input={structuredClone(value)} editable onChange={change} />);
    up(keyboard);
    expect(change).toHaveBeenCalledExactlyOnceWith({ ...value, keyboard: { ...value.keyboard!, x: 9, y: 7 } });
  });
  it("commits once when the pointer is released outside the moving handle", () => {
    const { keyboard, change, value } = setup();
    down(keyboard); move(keyboard, 68, 84);
    fireEvent.pointerUp(window, { pointerId: 3 });
    expect(change).toHaveBeenCalledTimes(1);
    up(keyboard);
    expect(change).toHaveBeenCalledExactlyOnceWith({ ...value, keyboard: { ...value.keyboard!, x: 9, y: 7 } });
  });
  it("moves the whole keyboard independently, including the DEL/Aa/OK bounds", () => {
    const { keyboard, change, value } = setup();
    expect(keyboard.style.width).toBe(`${136 / 240 * 100}%`);
    down(keyboard); move(keyboard, 68, 84); up(keyboard);
    expect(change).toHaveBeenCalledExactlyOnceWith({ ...value, keyboard: { ...value.keyboard!, x: 9, y: 7 } });
  });
  it("cancels with Escape, pointer cancellation and loss of pointer capture", () => {
    const { field, keyboard, change } = setup();
    down(field); move(field, 132, 116); fireEvent.keyDown(field, { key: "Escape" }); up(field);
    down(keyboard); move(keyboard, 68, 84); fireEvent.pointerCancel(keyboard, { pointerId: 3 });
    down(field); move(field, 132, 116); fireEvent.lostPointerCapture(field, { pointerId: 3 });
    expect(change).not.toHaveBeenCalled();
    expect(field.style.left).toBe("50%");
  });
  it("keeps a click out of history and supports one-tile keyboard movement", () => {
    const { field, keyboard, change, value } = setup();
    down(field); up(field); expect(change).not.toHaveBeenCalled();
    fireEvent.keyDown(keyboard, { key: "ArrowLeft" });
    expect(change).toHaveBeenCalledExactlyOnceWith({ ...value, keyboard: { ...value.keyboard!, x: 10 } });
  });
  it("protects locked elements and drops an unfinished gesture when editing ends", () => {
    const { field, change, value, rerender } = setup(true);
    down(field); move(field, 132, 116); up(field); fireEvent.keyDown(field, { key: "ArrowRight" });
    expect(field).toHaveAttribute("aria-disabled", "true"); expect(change).not.toHaveBeenCalled();
    rerender(<MenuTextInputOverlay input={value} editable onChange={change} />);
    down(field); move(field, 132, 116);
    rerender(<MenuTextInputOverlay input={value} onChange={change} />);
    expect(change).not.toHaveBeenCalled(); expect(screen.queryByRole("button")).not.toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Prévia visual da entrada do nome" })).toBeInTheDocument();
  });
  it.each([["en-US", "Move name field", "Move keyboard"], ["es-ES", "Mover campo del nombre", "Mover teclado"]])("localizes canvas controls in %s", (locale, field, keyboard) => {
    window.localStorage.setItem("gbaStudio.locale", locale);
    render(<StudioI18nProvider><MenuTextInputOverlay input={input()} editable onChange={vi.fn()} /></StudioI18nProvider>);
    expect(screen.getByRole("button", { name: field })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: keyboard })).toBeInTheDocument();
  });
});

it("resizes the name field with one undoable gesture at the current zoom",()=>{
 const {change}=setup();const handle=screen.getByRole("button",{name:"Redimensionar campo do nome"});
 down(handle);move(handle,132,100);expect(change).not.toHaveBeenCalled();up(handle);
 expect(change).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({width:10,maxLength:8}));
});
it("moves individual letters and commands while retaining all other absolute key positions",()=>{
 const value=useCustomMenuKeyboard(input()),change=vi.fn();const result=render(<MenuTextInputOverlay input={value} editable onChange={change}/>);
 result.container.firstElementChild!.getBoundingClientRect=vi.fn(()=>({width:480,height:320} as DOMRect));
 const key=screen.getByRole("button",{name:"Mover tecla A"});key.setPointerCapture=vi.fn();key.hasPointerCapture=vi.fn(()=>true);key.releasePointerCapture=vi.fn();
 down(key);move(key,84,84);up(key);
 expect(change).toHaveBeenCalledTimes(1);
 const layout=menuTextInputLayout(change.mock.lastCall![0])!;
 expect(layout.keys[0]).toMatchObject({x:80,y:56});
 expect(layout.keys[1]).toEqual(menuTextInputLayout(value)!.keys[1]);
 expect(screen.getByRole("button",{name:"Mover tecla DEL"})).toBeInTheDocument();
 expect(screen.getByRole("button",{name:"Mover tecla Aa"})).toBeInTheDocument();
 expect(screen.getByRole("button",{name:"Mover tecla OK"})).toBeInTheDocument();
});
