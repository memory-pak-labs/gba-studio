/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { InspectorNumber, InspectorRange, InspectorSection, InspectorSelect, InspectorToggle, InspectorVector2 } from "./InspectorControls";

describe("InspectorControls", () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
  });

  it("clamps slider and exact number input to the declared range", () => {
    const onChange = vi.fn();
    render(<InspectorRange label="Volume" max={127} min={0} onChange={onChange} value={80} />);

    fireEvent.change(screen.getByLabelText("Volume"), { target: { value: "200" } });
    fireEvent.change(screen.getByLabelText("Volume valor exato"), { target: { value: "-2" } });

    expect(onChange).toHaveBeenNthCalledWith(1, 127);
    expect(onChange).toHaveBeenNthCalledWith(2, 0);
  });

  it("exposes numeric constraints and clamps a direct numeric field", () => {
    const onChange = vi.fn();
    render(<InspectorNumber defaultValue={64} label="Volume" max={127} min={0} onChange={onChange} step={1} unit="nível" value={80} />);

    expect(screen.getByText("Mín. 0 · Máx. 127")).toBeInTheDocument();
    expect(screen.getByText("nível")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Volume"), { target: { value: "200" } });
    fireEvent.click(screen.getByRole("button", { name: "Restaurar padrão de Volume" }));

    expect(onChange).toHaveBeenNthCalledWith(1, 127);
    expect(onChange).toHaveBeenNthCalledWith(2, 64);
  });

  it("renders range endpoints, presets and a reset action", () => {
    const onChange = vi.fn();
    render(
      <InspectorRange
        defaultValue={100}
        label="Zoom"
        max={400}
        min={50}
        onChange={onChange}
        presets={[{ label: "100%", value: 100 }, { label: "200%", value: 200 }]}
        step={25}
        unit="%"
        value={200}
      />
    );

    expect(screen.getByText("50 %")).toBeInTheDocument();
    expect(screen.getByText("400 %")).toBeInTheDocument();
    expect(screen.getByText("Passo 25")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "100%" }));
    fireEvent.click(screen.getByRole("button", { name: "Restaurar padrão de Zoom" }));

    expect(onChange).toHaveBeenNthCalledWith(1, 100);
    expect(onChange).toHaveBeenNthCalledWith(2, 100);
  });

  it("keeps select, toggle, vector and native collapsible section accessible", () => {
    const onSelect = vi.fn();
    const onToggle = vi.fn();
    const onVector = vi.fn();
    render(
      <>
        <InspectorSelect label="Modo" onChange={onSelect} options={[{ label: "Aventura", value: "adventure" }]} value="adventure" />
        <InspectorToggle checked={false} label="Loop" onChange={onToggle} />
        <InspectorVector2 onChange={onVector} values={{ x: 12, y: 8 }} />
        <InspectorSection defaultOpen={false} title="Avançado"><span>Conteúdo</span></InspectorSection>
      </>
    );

    fireEvent.change(screen.getByLabelText("Modo"), { target: { value: "adventure" } });
    fireEvent.click(screen.getByLabelText("Loop"));
    fireEvent.change(screen.getByLabelText("X"), { target: { value: "20" } });

    expect(onSelect).toHaveBeenCalledWith("adventure");
    expect(onToggle).toHaveBeenCalledWith(true);
    expect(onVector).toHaveBeenCalledWith("x", 20);
    expect(screen.getByText("Avançado").closest("details")).not.toHaveAttribute("open");
    expect(screen.getByText("Avançado").closest("summary")?.querySelector("[data-inspector-disclosure]")).toHaveAttribute(
      "data-state",
      "closed"
    );
  });

  it("persists the open state of a named section", () => {
    const { unmount } = render(
      <InspectorSection defaultOpen={false} persistKey="test.section" title="Opções">
        <span>Conteúdo</span>
      </InspectorSection>
    );

    const section = screen.getByText("Opções").closest("details");
    expect(section).not.toHaveAttribute("open");
    expect(section?.querySelector("[data-inspector-disclosure]")).toHaveAttribute("data-state", "closed");
    fireEvent.click(screen.getByText("Opções"));
    expect(section).toHaveAttribute("open");
    expect(section?.querySelector("[data-inspector-disclosure]")).toHaveAttribute("data-state", "open");
    unmount();

    render(
      <InspectorSection defaultOpen={false} persistKey="test.section" title="Opções">
        <span>Conteúdo</span>
      </InspectorSection>
    );
    expect(screen.getByText("Opções").closest("details")).toHaveAttribute("open");
  });

  it("abre a ajuda de uma seção sem alterar sua expansão", () => {
    render(<InspectorSection defaultOpen={false} description="Explicação contextual." title="Camadas"><span>Conteúdo</span></InspectorSection>);

    const section = screen.getByText("Camadas").closest("details");
    const help = screen.getByRole("button", { name: "Informações sobre Camadas" });
    expect(section).not.toHaveAttribute("open");
    expect(help).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("tooltip")).toHaveTextContent("Explicação contextual.");

    fireEvent.click(help);
    expect(help).toHaveAttribute("aria-expanded", "true");
    expect(section).not.toHaveAttribute("open");
    fireEvent.keyDown(help, { key: "Escape" });
    expect(help).toHaveAttribute("aria-expanded", "false");
    expect(section).not.toHaveAttribute("open");
    fireEvent.click(help);
    fireEvent.pointerDown(document.body);
    expect(help).toHaveAttribute("aria-expanded", "false");
  });
});
