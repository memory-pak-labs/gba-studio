/** @vitest-environment happy-dom */
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";

import { StudioUiFontSizeControl } from "./StudioUiFontSizeControl.js";

describe("StudioUiFontSizeControl", () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
    document.documentElement.removeAttribute("data-studio-font-size");
    document.documentElement.style.removeProperty("--studio-font-scale");
  });

  it("starts at the compact size and persists a newly selected option", async () => {
    const user = userEvent.setup();

    render(<StudioUiFontSizeControl />);

    expect(screen.getByRole("radiogroup", { name: "Tamanho da interface" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Compacta" })).toBeChecked();

    await user.click(screen.getByRole("radio", { name: "Ampliada" }));

    expect(screen.getByRole("radio", { name: "Ampliada" })).toBeChecked();
    expect(localStorage.getItem("gba-studio:ui-font-size")).toBe("large");
    expect(document.documentElement).toHaveAttribute("data-studio-font-size", "large");
    expect(document.documentElement.style.getPropertyValue("--studio-font-scale")).toBe("1.15");
  });
});
