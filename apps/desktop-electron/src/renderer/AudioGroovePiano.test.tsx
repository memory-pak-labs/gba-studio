/** @vitest-environment happy-dom */
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { AudioGroovePiano } from "./AudioGroovePiano.js";
import { makeXmFixture } from "../shared/extendedTrackerFixtures.js";
import { parseTrackerModule } from "../shared/trackerModule.js";
import { deriveAudioWorkspacePresentation } from "../shared/audioWorkspace.js";
afterEach(cleanup);
it("opens the Piano Roll at the selected native row and keeps manual page navigation available", () => {
  const song = parseTrackerModule(makeXmFixture(2, 96), "XM", "0".repeat(64));
  const item = deriveAudioWorkspacePresentation({ audioItems: [{ ...song, id: "song", name: "Tema", kind: "Musica" }] }).items[0];
  const channel = item.previewRows[0].id;
  const props = { item, selectedCell: { audioID: item.id, channelID: channel, stepIndex: 80 }, selectedChannelID: channel, playbackStep: null, onSelectCell: vi.fn(), onUpdateChannel: vi.fn(), onSetNote: vi.fn() };
  const view = render(<AudioGroovePiano {...props} />);
  expect(screen.getByRole("button", { name: "Selecionar passo 81" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Passos anteriores" }));
  expect(screen.getByRole("button", { name: "Selecionar passo 65" })).toBeInTheDocument();
  view.rerender(<AudioGroovePiano {...props} selectedCell={{ ...props.selectedCell, stepIndex: 17 }} />);
  expect(screen.getByRole("button", { name: "Selecionar passo 18" })).toBeInTheDocument();
});
