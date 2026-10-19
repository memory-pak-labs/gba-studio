import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { decodePngRgba } from './lib/png-icons.mjs';
import { auditRgbaAgainstExportedTilemap } from './rgb555-framebuffer-contract.mjs';
import { buildAssetcTilesetPackGeneration } from '../src/shared/engineProjectExport.js';
import { promoteExemploGBAVerticeCampaign } from './vertice-showcase-project.mjs';

const templateURL = new URL('../default-assets/templates/exemplo-gba/exemplo-gba.gba-project', import.meta.url);
const assetc = fileURLToPath(new URL('../../../packages/GBAStudioEngine/tools/assetc/assetc.py', import.meta.url));
const python = process.env.GBA_STUDIO_PYTHON || (process.platform === 'win32' ? 'python' : 'python3');
const warehouse = JSON.parse(readFileSync(new URL('../fixtures/asset-provenance/warehouse-frontal-manifest.json', import.meta.url)));
const observatory = JSON.parse(readFileSync(new URL('../fixtures/asset-provenance/observatory-frontal-manifest.json', import.meta.url)));
const lumen=JSON.parse(readFileSync(new URL('../fixtures/asset-provenance/world-map-lumen-manifest.json',import.meta.url)));
const approved = [
  ['mapa_rota', lumen.assets.background.name, lumen.assets.background.metadata.preparedSha256, lumen.assets.background.metadata.visualApproval],
  ['armazem_das_mares', warehouse.asset.file, warehouse.asset.sha256, {date:'2026-10-17',contract:'warehouse-frontal-v1-approved'}],
  ['observatorio_do_farol', observatory.asset.file, observatory.asset.sha256, {date:'2026-10-17',contract:'observatory-frontal-v1-approved'}],
  ['conselho_guardia', 'council-v5-background.png', '98a6ccb4597f25f2156e30fed19ce7f9e9f88a5403ea5b46f1cefb1281c1cdff'],
  ['circuito_final', 'racing-approved-topdown.png', 'e1de92b280ebb5210e3a786ab98dc83c8bcb8ccbb053586d654db608148fced6', {date:'2026-10-18',contract:'racing-two-views-approved-2026-10-18'}]
];

describe('conversões de background aprovadas por cena', () => {
  for (const [scene, name, sha256, visualApproval = { date: '2026-10-02', contract: 'play-background-fidelity-v1-approved' }] of approved) {
    it(`${scene}: recompila os pixels aprovados sem nova perda de cor ou tiles`, () => {
      const saved = JSON.parse(readFileSync(templateURL, 'utf8'));
      const bytes = readFileSync(new URL(`Assets/backgrounds/${name}`, templateURL));
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(sha256);
      const png = decodePngRgba(bytes);
      const project = promoteExemploGBAVerticeCampaign(saved);
      const asset = project.assets.find(asset => asset.name === name);
      expect(asset.metadata).toMatchObject({
        preparedSha256: sha256,
        backgroundPaletteBankBudget: 14,
        visualStatus: 'approved',
        visualApproval
      });
      expect(asset.metadata.backgroundPaletteReferencePlan).toEqual(saved.assets.find(asset => asset.name === name).metadata.backgroundPaletteReferencePlan);
      const packAsset = buildAssetcTilesetPackGeneration(project).packAssets.find(asset => asset.id === name.replace('.png', '').replaceAll('-', '_'));
      expect(packAsset).toBeDefined();
      const root = mkdtempSync(join(tmpdir(), 'gba-approved-bg-contract-'));
      try {
        const output = join(root, 'background.hpp');
        const args = [fileURLToPath(new URL(`Assets/backgrounds/${name}`, templateURL)), '--name', packAsset.symbol, '--output', output];
        if (packAsset.kind === 'paged_bg') {
          args.push('--paged-tilemap');
        } else {
          expect(packAsset.background_palette_reference_plan.banks).toHaveLength(14);
          expect(packAsset.background_palette_reference_plan.tile_palette_banks).toHaveLength(png.width * png.height / 64);
          const planPath = join(root, 'palette-plan.json');
          writeFileSync(planPath, JSON.stringify(packAsset.background_palette_reference_plan));
          args.push('--background-palette-banks', '14', '--background-palette-reference', planPath);
        }
        const reportPath = join(root, 'tiles.json');

        execFileSync(python, [assetc, ...args], { stdio: 'pipe' });
        const header = readFileSync(output, 'utf8');
        expect(auditRgbaAgainstExportedTilemap({ ...png, headerSource: header, symbol: packAsset.symbol })).toMatchObject({ ok: true, mismatchCount: 0 });
        execFileSync(python, [assetc, ...args], { stdio: 'pipe' });
        expect(readFileSync(output, 'utf8')).toBe(header);
        if (scene === 'circuito_final') expect(header).toContain('tile_count = 766');
      } finally {
        rmSync(root, { recursive: true, force: true });
      }
    });
  }
});
