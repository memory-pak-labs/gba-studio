/** @vitest-environment happy-dom */
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { BuildDiagnosticReportPanel } from "./BuildDiagnosticReportPanel";

afterEach(cleanup);
it("offers a reviewable report and copies only the sanitized content", async () => {
  let finishCopy!: () => void;
  const copy = vi.fn(() => new Promise<void>((resolve) => { finishCopy = resolve; }));
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: copy } });
  render(<BuildDiagnosticReportPanel result={{ ran: true, exitCode: 2, stderr: "/Users/alice/secret.c: error: invalid code" }} />);
  const content = (screen.getByRole("textbox", { name: "Conteúdo do relatório de build" }) as HTMLTextAreaElement).value;
  expect(content).not.toContain("alice");
  expect(content).toContain("COMPILE_ERROR");
  fireEvent.click(screen.getByRole("button", { name: "Copiar relatório de build" }));
  await waitFor(() => expect(copy).toHaveBeenCalledWith(content));
  expect(screen.queryByRole("status")).toBeNull();
  await act(async () => { finishCopy(); });
  expect(await screen.findByRole("status")).toHaveTextContent("Relatório copiado");
});
