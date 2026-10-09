import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import { auditExemploTemplate, expandCompactSequence } from "./exemplo-template-audit.mjs";
import { EXEMPLO_GB_STUDIO_SCENE_TYPES } from "./exemplo-gba-scene-types.mjs";

const appRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const templatePath = join(appRoot, "default-assets", "templates", "exemplo-gba", "exemplo-gba.gba-project");
const project = JSON.parse(await readFile(templatePath, "utf8"));

describe("auditoria do template Vértice", () => {
  it("aceita o template canônico com campanha e Menu Start de suporte", () => {
    const audit = auditExemploTemplate(project);
    expect(audit.ok).toBe(true);
    expect(audit.counts.scenes).toBe(Object.keys(EXEMPLO_GB_STUDIO_SCENE_TYPES).length);
    expect(audit.counts.dialogues).toBeGreaterThan(0);
  });

  it("audita a geometria visual, a área caminhável e os pontos de interação de todas as cenas", () => {
    const audit = auditExemploTemplate(project);

    expect(audit.geometry).toMatchObject({
      ok: true,
      sceneCount: Object.keys(EXEMPLO_GB_STUDIO_SCENE_TYPES).length,
      visualAlignment: { audited: true, ok: true }
    });
  });

  it("aceita o formato persistido que mantém collisionTypes sem o alias collisions", () => {
    const persisted = structuredClone(project);
    persisted.scenas = persisted.scenas.map((scene) => {
      const copy = { ...scene };
      delete copy.collisions;
      return copy;
    });
    persisted.rooms = persisted.rooms.map((room) => {
      const copy = { ...room };
      delete copy.collisions;
      return copy;
    });

    expect(auditExemploTemplate(persisted)).toMatchObject({ ok: true });
  });

  it("aceita a posição fracionária do cursor no mapa e rejeita coordenadas fora da cena", () => {
    const currentIssues = auditExemploTemplate(project).geometry.issues;
    expect(currentIssues.some((issue) => issue.includes("ator Aeronave de viagem está fora dos limites"))).toBe(false);

    const broken = structuredClone(project);
    broken.actors.find((actor) => actor.id === "map-cursor").x = 60.5;
    expect(auditExemploTemplate(broken).geometry.issues).toContain(
      "Cena mapa_rota: ator Aeronave de viagem está fora dos limites."
    );
  });

  it("confere as dimensões das duas camadas da superfície paginada", () => {
    const currentIssues = auditExemploTemplate(project).geometry.issues;
    expect(currentIssues.some((issue) => issue.startsWith("Cena mercado_suspenso: background"))).toBe(false);

    const broken = structuredClone(project);
    broken.assets.find((asset) => asset.name === "mercado-adventure-foreground.png").metadata.height = 336;
    expect(auditExemploTemplate(broken).geometry.issues).toContain(
      "Cena mercado_suspenso: foreground 512x336 não cobre a superfície paginada 512x344."
    );
  });

  it("mantém os pontos visuais atuais da pista coerentes com a colisão", () => {
    expect(auditExemploTemplate(project).geometry.issues.filter((issue) => issue.startsWith("circuito_final:")))
      .toEqual([]);
  });

  it("detecta ator fora da área caminhável e gatilho fora dos limites da cena", () => {
    const broken = structuredClone(project);
    const portActor = broken.actors.find((actor) => actor.name === "Nara" && actor.roomName === "porto_lumen");
    portActor.x = 58;
    portActor.y = 38;
    broken.triggers.find((trigger) => trigger.id === "trigger-porto-exit").x = 59;

    const audit = auditExemploTemplate(broken);

    expect(audit.ok).toBe(false);
    expect(audit.geometry.issues).toEqual(expect.arrayContaining([
      expect.stringContaining("Nara"),
      expect.stringContaining("trigger-porto-exit")
    ]));
  });

  it("detecta ordem de cena e destino de transição inválidos", () => {
    const broken = structuredClone(project);
    broken.scenas[0].name = "cena_invalida";
    broken.events[0].steps = [{ command: "change_scene inexistente 0 0" }];
    const audit = auditExemploTemplate(broken);

    expect(audit.ok).toBe(false);
    expect(audit.issues).toEqual(expect.arrayContaining([
      expect.stringContaining("esperada logo"),
      expect.stringContaining("destino inexistente")
    ]));
  });

  it("expande sequências compactas somente quando a codificação é válida", () => {
    expect(expandCompactSequence({ encoding: "rle-v1", length: 3, runs: [[0, 2], [1, 1]] })).toEqual([0, 0, 1]);
    expect(expandCompactSequence({ encoding: "rle-v1", length: 3, runs: [[0, 2]] })).toEqual([]);
    expect(expandCompactSequence({
      encoding: "metatile-v1",
      width: 4,
      height: 2,
      blockWidth: 2,
      blockHeight: 2,
      dictionary: [["free", "solid", "free", "solid"]],
      indices: [0, 0]
    })).toEqual(["free", "solid", "free", "solid", "free", "solid", "free", "solid"]);
    expect(expandCompactSequence({
      encoding: "metatile-v1",
      width: 4,
      height: 2,
      blockWidth: 2,
      blockHeight: 2,
      dictionary: [["free"]],
      indices: [0, 0]
    })).toEqual([]);
  });
});
