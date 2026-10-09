/** @vitest-environment happy-dom */
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it } from "vitest";
import { StudioI18nProvider } from "./i18n";
import { StudioThemeToggle } from "./StudioThemeToggle";

afterEach(() => {
  cleanup();
  localStorage.clear();
  document.documentElement.removeAttribute("data-studio-theme");
});

it("keeps theme controls synchronized within the same window", async () => {
  const user = userEvent.setup();
  render(<StudioI18nProvider><StudioThemeToggle /><StudioThemeToggle /></StudioI18nProvider>);
  await user.click(screen.getAllByRole("button", { name: "Ativar tema escuro" })[0]!);
  await waitFor(() => expect(screen.getAllByRole("button", { name: "Ativar tema claro" })).toHaveLength(2));
  expect(localStorage.getItem("gba-studio:theme")).toBe("dark");
  await user.click(screen.getAllByRole("button", { name: "Ativar tema claro" })[1]!);
  await waitFor(() => expect(screen.getAllByRole("button", { name: "Ativar tema escuro" })).toHaveLength(2));
  expect(document.documentElement).toHaveAttribute("data-studio-theme", "light");
});
