/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { StudioUiAppearanceControl } from "./StudioUiAppearanceControl.js";

describe("StudioUiAppearanceControl", () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
    document.documentElement.removeAttribute("data-studio-ui-text-contrast");
    document.documentElement.removeAttribute("data-studio-ui-contrast");
    document.documentElement.style.removeProperty("--studio-ui-app-gray");
    document.documentElement.style.removeProperty("--studio-ui-canvas-gray");
    document.documentElement.style.removeProperty("--studio-ui-brightness");
  });

  it("renders the five interface controls with the current defaults", () => {
    render(<StudioUiAppearanceControl />);

    expect(screen.getByRole("region", { name: "Aparência da interface" })).toBeInTheDocument();
    expect(screen.getByRole("slider", { name: "Nível de cinza do plano de fundo" })).toHaveValue("0");
    expect(screen.getByRole("slider", { name: "Nível de cinza do plano de fundo" })).toHaveAttribute("min", "0");
    expect(screen.getByRole("slider", { name: "Nível de cinza do plano de fundo" })).toHaveAttribute("max", "100");
    expect(screen.getAllByText("100 %").length).toBeGreaterThan(0);
    expect(screen.getByRole("slider", { name: "Nível de cinza do fundo da prancheta" })).toHaveValue("0");
    expect(screen.getByRole("slider", { name: "Contraste de texto" })).toHaveValue("50");
    expect(screen.getByRole("slider", { name: "Brilho da interface" })).toHaveValue("50");
    expect(screen.getByRole("radio", { name: "Padrão" })).toBeChecked();
  });

  it("applies and persists changes immediately", async () => {
    const user = userEvent.setup();
    render(<StudioUiAppearanceControl />);

    fireEvent.change(screen.getByRole("slider", { name: "Nível de cinza do plano de fundo" }), { target: { value: "72" } });
    await user.click(screen.getByRole("radio", { name: "Alto" }));

    expect(screen.getByRole("slider", { name: "Nível de cinza do plano de fundo" })).toHaveValue("72");
    expect(screen.getByRole("radio", { name: "Alto" })).toBeChecked();
    expect(document.documentElement).toHaveAttribute("data-studio-ui-contrast", "high");
    expect(document.documentElement.style.getPropertyValue("--studio-ui-app-gray")).toBe("72%");
    expect(JSON.parse(localStorage.getItem("gba-studio:ui-appearance") ?? "{}")).toMatchObject({
      appBackgroundGray: 72,
      contrast: "high"
    });
  });

  it("restores the device defaults", async () => {
    const user = userEvent.setup();
    render(<StudioUiAppearanceControl />);

    fireEvent.change(screen.getByRole("slider", { name: "Brilho da interface" }), { target: { value: "15" } });
    await user.click(screen.getByRole("button", { name: "Restaurar" }));

    expect(screen.getByRole("slider", { name: "Brilho da interface" })).toHaveValue("50");
    expect(screen.getByRole("radio", { name: "Padrão" })).toBeChecked();
    expect(JSON.parse(localStorage.getItem("gba-studio:ui-appearance") ?? "{}")).toMatchObject({ brightness: 50, contrast: "standard" });
  });
});
