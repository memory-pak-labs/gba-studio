/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { MapStatesInspector } from "./MapStatesInspector";

afterEach(cleanup);
it("authors a complete persistent door and keeps invalid drafts out of the project", () => {
  const onChange = vi.fn();
  render(<MapStatesInspector value={[]} width={30} height={20} sceneName="start" onChange={onChange} />);
  fireEvent.click(screen.getByText("Estados de mapa · 0"));
  fireEvent.click(screen.getByRole("button", { name: "Adicionar estado de mapa" }));
  expect(screen.getByText("set_map_state map_start_1 open")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Aplicar estados" }));
  expect(onChange.mock.calls[0]![0][0]).toMatchObject({ id: "map_start_1", variable: "map_start_1", variants: [
    { id: "closed", value: 0, tiles: [{ collision: "solid" }] }, { id: "open", value: 1, tiles: [{ collision: "free" }] }
  ] });
  fireEvent.change(screen.getByLabelText("ID do estado"), { target: { value: "with spaces" } });
  fireEvent.click(screen.getByRole("button", { name: "Aplicar estados" }));
  expect(screen.getByRole("alert")).toHaveTextContent("identificador sem espaços");
  expect(onChange).toHaveBeenCalledTimes(1);
});
