/** @vitest-environment happy-dom */
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_STUDIO_UI_APPEARANCE, STUDIO_UI_APPEARANCE_STORAGE_KEY, readStudioUiAppearance } from "../shared/studioUiAppearance";
import { STUDIO_UI_FONT_SIZE_STORAGE_KEY } from "../shared/studioUiFontSize";
import { STUDIO_THEME_STORAGE_KEY } from "../shared/studioTheme";
import { SettingsInterfaceSection } from "./SettingsInterfaceSection";
import { StudioThemeToggle } from "./StudioThemeToggle";
import { StudioI18nProvider } from "./i18n";

beforeEach(() => { localStorage.clear(); document.documentElement.removeAttribute("data-studio-theme"); });
afterEach(() => { cleanup(); localStorage.clear(); });
const view = () => <StudioI18nProvider><StudioThemeToggle /><SettingsInterfaceSection /></StudioI18nProvider>;

describe("Settings interface preferences", () => {
  it("starts with advanced customization collapsed and keeps both theme controls synchronized", async () => {
    const user = userEvent.setup();
    const { container } = render(view());
    expect(container.querySelector("details")).not.toHaveAttribute("open");
    await user.click(screen.getByRole("radio", { name: "Escuro" }));
    expect(localStorage.getItem(STUDIO_THEME_STORAGE_KEY)).toBe("dark");
    expect(await screen.findByRole("button", { name: "Ativar tema claro" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Ativar tema claro" }));
    expect(await screen.findByRole("radio", { name: "Claro", checked: true })).toBeChecked();
  });

  it("retains font size, contrast and fine adjustments after leaving and returning", async () => {
    const user = userEvent.setup();
    const first = render(view());
    await user.click(screen.getByRole("radio", { name: "Ampliada" }));
    await user.click(within(screen.getByRole("radiogroup", { name: "Contraste" })).getByRole("radio", { name: "Alto" }));
    fireEvent.click(first.container.querySelector("summary")!);
    // happy-dom does not implement the native <details> click behavior.
    first.container.querySelector("details")!.open = true;
    fireEvent.change(screen.getByRole("slider", { name: "Brilho da interface" }), { target: { value: "63" } });
    expect(readStudioUiAppearance()).toMatchObject({ contrast: "high", brightness: 63 });
    first.unmount();
    render(view());
    expect(screen.getByRole("radio", { name: "Ampliada" })).toBeChecked();
    expect(within(screen.getByRole("radiogroup", { name: "Contraste" })).getByRole("radio", { name: "Alto" })).toBeChecked();
    expect(localStorage.getItem(STUDIO_UI_FONT_SIZE_STORAGE_KEY)).toBe("large");
  });

  it("restores local appearance defaults while preserving language and other stored data", async () => {
    localStorage.setItem(STUDIO_THEME_STORAGE_KEY, "dark");
    localStorage.setItem(STUDIO_UI_FONT_SIZE_STORAGE_KEY, "large");
    localStorage.setItem(STUDIO_UI_APPEARANCE_STORAGE_KEY, JSON.stringify({ ...DEFAULT_STUDIO_UI_APPEARANCE, brightness: 90, contrast: "high" }));
    localStorage.setItem("unrelated-project-data", "preserved");
    const user = userEvent.setup();
    render(view());
    await user.selectOptions(screen.getByRole("combobox", { name: "Idioma do app" }), "en-US");
    expect(screen.getByRole("heading", { name: "Appearance and language" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Restore defaults" }));
    expect(localStorage.getItem(STUDIO_THEME_STORAGE_KEY)).toBe("light");
    expect(localStorage.getItem(STUDIO_UI_FONT_SIZE_STORAGE_KEY)).toBe("compact");
    expect(readStudioUiAppearance()).toEqual(DEFAULT_STUDIO_UI_APPEARANCE);
    expect(screen.getByRole("combobox", { name: "App language" })).toHaveValue("en-US");
    expect(localStorage.getItem("unrelated-project-data")).toBe("preserved");
  });
});
