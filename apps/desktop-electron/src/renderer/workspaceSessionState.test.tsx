/** @vitest-environment happy-dom */
import { StrictMode, useRef, useState } from "react";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { WorkspaceSessionProvider, WorkspaceSessionScope, WorkspaceScrollMemory, useWorkspaceState, useWorkspaceChangeEffect } from "./workspaceSessionState";

afterEach(cleanup);
function Counter() {
  const [count, set] = useWorkspaceState("count", 0);
  return <button onClick={() => set(value => value + 1)}>Contagem {count}</button>;
}
function Projects() {
  const [project, setProject] = useState("A");
  const [open, setOpen] = useState(true);
  return <><button onClick={() => setProject(value => value === "A" ? "B" : "A")}>Outro projeto</button>
    <button onClick={() => setOpen(value => !value)}>Outra aba</button>
    <WorkspaceSessionScope projectKey={project}>{open ? <Counter/> : null}</WorkspaceSessionScope></>;
}
it("isolates project memory and survives remounts without writing project data or local storage", async () => {
  const user = userEvent.setup();
  const write = vi.spyOn(window.localStorage, "setItem");
  render(<StrictMode><WorkspaceSessionProvider><Projects/></WorkspaceSessionProvider></StrictMode>);
  await user.click(screen.getByRole("button", { name: "Contagem 0" }));
  await user.click(screen.getByRole("button", { name: "Outra aba" }));
  await user.click(screen.getByRole("button", { name: "Outra aba" }));
  expect(screen.getByRole("button", { name: "Contagem 1" })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Outro projeto" }));
  expect(screen.getByRole("button", { name: "Contagem 0" })).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Outro projeto" }));
  expect(screen.getByRole("button", { name: "Contagem 1" })).toBeInTheDocument();
  expect(write).not.toHaveBeenCalled(); write.mockRestore();
});

it("does not reset restored selection on mount, but resets dependents when it actually changes", () => {
  const reset = vi.fn();
  function Dependent({ selection }: { selection: string }) { useWorkspaceChangeEffect(reset, [selection]); return null; }
  const view = render(<StrictMode><Dependent selection="actor-a"/></StrictMode>);
  expect(reset).not.toHaveBeenCalled();
  view.rerender(<StrictMode><Dependent selection="actor-b"/></StrictMode>);
  expect(reset).toHaveBeenCalledOnce();
});

const layoutFrames = () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
function Scrollers() {
  const [workspace, set] = useState("Editor");
  const ref = useRef<HTMLDivElement>(null);
  return <><button onClick={() => set(value => value === "Editor" ? "Audio" : "Editor")}>Trocar</button>
    <div ref={ref}><WorkspaceScrollMemory rootRef={ref} workspace={workspace}/>
      <section key={workspace} data-testid="pane" data-workspace-scroll="canvas">{workspace}
        <div className="nested-editor" data-testid="nested">Conteúdo</div>
      </section>
    </div></>;
}
it("restores each workspace scroll position after initial canvas layout", async () => {
  const user = userEvent.setup();
  render(<WorkspaceSessionProvider><Scrollers/></WorkspaceSessionProvider>);
  await layoutFrames();
  screen.getByTestId("pane").scrollTop = 135;
  screen.getByTestId("pane").scrollLeft = 75;
  fireEvent.scroll(screen.getByTestId("pane"));
  screen.getByTestId("nested").scrollTop = 43;
  fireEvent.scroll(screen.getByTestId("nested"));
  await user.click(screen.getByRole("button", { name: "Trocar" }));
  await layoutFrames();
  expect(screen.getByTestId("pane").scrollTop).toBe(0);
  await user.click(screen.getByRole("button", { name: "Trocar" }));
  await layoutFrames();
  expect(screen.getByTestId("pane").scrollTop).toBe(135);
  expect(screen.getByTestId("pane").scrollLeft).toBe(75);
  expect(screen.getByTestId("nested").scrollTop).toBe(43);
});
