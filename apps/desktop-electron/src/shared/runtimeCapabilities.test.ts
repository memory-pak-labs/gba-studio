import { describe, expect, it } from "vitest";
import { buildProjectRuntimeCapabilityManifest } from "./runtimeCapabilities.js";

describe("runtimeCapabilities", () => {
  it("exporta as capacidades universais e ignora o antigo toggle global de Affine", () => {
    const manifest = buildProjectRuntimeCapabilityManifest({
      settings: {
        save: { saveType: "sram", slots: 4, autoSave: true, manualSave: true },
        runtimeCapabilities: {
          rtc: { enabled: true },
          link: { enabled: true },
          affine: { enabled: true }
        }
      }
    });

    expect(manifest).toEqual({
      schema: 1,
      registry: "gba-studio-runtime-capabilities",
      capabilities: [
        {
          id: "save",
          enabled: true,
          required: true,
          settings: {
            device: "sram",
            autosave: true,
            slot_count: 4,
            slot_capacity: 2048,
            offset: 0,
            version: 1
          }
        },
        {
          id: "rtc",
          enabled: true,
          required: true,
          settings: { preview_clock: "fake", hardware_provider: "gba_rtc" }
        },
        {
          id: "link",
          enabled: true,
          required: true,
          settings: { transport: "link_cable", preview_transport: "loopback", max_peers: 2 }
        },
        {
          id: "affine",
          enabled: false,
          required: false,
          settings: { bg: true, obj: true, hblank: true }
        }
      ]
    });
  });

  it("deriva Affine quando uma cena opta por composição avançada", () => {
    const manifest = buildProjectRuntimeCapabilityManifest({
      settings: { runtimeCapabilities: { affine: { enabled: false } } },
      scenas: [{
        name: "mercado_suspenso",
        runtime: { config: { composition: { enabled: true, mode: "affine" } } }
      }]
    });

    expect(manifest.capabilities.find((capability) => capability.id === "affine")).toMatchObject({
      enabled: true,
      required: true
    });
  });

  it("deriva Affine quando o padrão global de Backgrounds usa Modo 1 ou 2", () => {
    const manifest = buildProjectRuntimeCapabilityManifest({
      settings: { backgrounds: { graphicsMode: "Mode 2 - Affine" } }
    });

    expect(manifest.capabilities.find((capability) => capability.id === "affine")).toMatchObject({
      enabled: true,
      required: true
    });
  });

  it("declara Affine para a aeronave do mapa somente com opt-in", () => {
    for (const cursorAffine of [undefined, false, true]) {
      const manifest = buildProjectRuntimeCapabilityManifest({
        scenas: [{ name: "mapa_rota", type: "worldMap", runtime: { config: { cursorAffine } } }]
      });
      expect(manifest.capabilities.find((capability) => capability.id === "affine")).toMatchObject({
        enabled: cursorAffine === true,
        required: cursorAffine === true
      });
    }
  });
});
