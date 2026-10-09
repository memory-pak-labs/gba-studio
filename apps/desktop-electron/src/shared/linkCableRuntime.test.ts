import { describe, expect, it } from "vitest";

import {
  applyLinkCablePreviewCommand,
  defaultLinkCablePreviewState,
  parseLinkCableCommand,
  toEngineLinkCableCommand
} from "./linkCableRuntime.js";

describe("linkCableRuntime", () => {
  it("maps host, join, transfer and close with callback and timeout", () => {
    expect(toEngineLinkCableCommand(parseLinkCableCommand("multiplayer_host conectado 180")!, {
      eventIndex: (name) => name === "conectado" ? 4 : -1,
      variableIndex: () => -1
    })).toEqual({ op: "link_host", script: 4, timeout_frames: 180 });
    expect(toEngineLinkCableCommand(parseLinkCableCommand("multiplayer_join pronto 90")!, {
      eventIndex: (name) => name === "pronto" ? 2 : -1,
      variableIndex: () => -1
    })).toEqual({ op: "link_join", script: 2, timeout_frames: 90 });
    expect(toEngineLinkCableCommand(parseLinkCableCommand("multiplayer_transfer net.recebido 255 45")!, {
      eventIndex: () => -1,
      variableIndex: (name) => name === "net.recebido" ? 7 : -1
    })).toEqual({ op: "link_transfer", variable: 7, value: 255, timeout_frames: 45 });
    expect(toEngineLinkCableCommand(parseLinkCableCommand("multiplayer_close")!, {
      eventIndex: () => -1,
      variableIndex: () => -1
    })).toEqual({ op: "link_close" });
  });

  it("keeps multiplayer state in the debugger preview instead of drawing over the ROM", () => {
    const hosted = applyLinkCablePreviewCommand(defaultLinkCablePreviewState(), "multiplayer_host conectado 120");
    const transferred = applyLinkCablePreviewCommand(hosted, "multiplayer_transfer net.recebido 42 30");
    const closed = applyLinkCablePreviewCommand(transferred, "multiplayer_close");

    expect(hosted).toMatchObject({ role: "host", status: "connected", timeoutFrames: 120 });
    expect(transferred).toMatchObject({ lastSent: 42, lastReceived: 42, transferOk: true });
    expect(closed).toMatchObject({ role: "none", status: "closed", transferOk: false });
  });

  it("parses rumble and 4-player multiplayer commands for preview and native export", () => {
    expect(parseLinkCableCommand("rumble_on")).toEqual({ kind: "rumble_on" });
    expect(parseLinkCableCommand("rumble_on_for 60")).toEqual({ kind: "rumble_on_for", frames: 60 });
    expect(parseLinkCableCommand("rumble_off")).toEqual({ kind: "rumble_off" });
    expect(parseLinkCableCommand("multiplayer4_open 4")).toEqual({ kind: "mp4_open", players: 4 });
    expect(parseLinkCableCommand("multiplayer4_set 1234")).toEqual({ kind: "mp4_set", value: 1234 });
    expect(parseLinkCableCommand("multiplayer4_sync")).toEqual({ kind: "mp4_sync" });
    expect(parseLinkCableCommand("multiplayer4_read net.var_player net.var_count net.var_data")).toEqual({
      kind: "mp4_read",
      varPlayer: "net.var_player",
      varCount: "net.var_count",
      varBase: "net.var_data"
    });
    expect(parseLinkCableCommand("multiplayer4_close")).toEqual({ kind: "mp4_close" });

    const opened = applyLinkCablePreviewCommand(defaultLinkCablePreviewState(), "multiplayer4_open 3");
    expect(opened.mp4).toMatchObject({ open: true, players: 3 });
    const withData = applyLinkCablePreviewCommand(opened, "multiplayer4_set 99");
    expect(withData.mp4).toMatchObject({ local: 99 });
    const rumbling = applyLinkCablePreviewCommand(withData, "rumble_on_for 10");
    expect(rumbling.rumble).toMatchObject({ active: true });
    const silent = applyLinkCablePreviewCommand(rumbling, "rumble_off");
    expect(silent.rumble).toMatchObject({ active: false });
    const closed = applyLinkCablePreviewCommand(silent, "multiplayer4_close");
    expect(closed.mp4).toMatchObject({ open: false });
  });
});
