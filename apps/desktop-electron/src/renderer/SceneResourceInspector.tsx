import { uiText as ui, useStudioUiText } from "./studioUiText";
import type { ReactElement } from "react";

import {
  exportSceneResourceManifest,
  normalizeSceneResourceManifest,
  sceneResourceManifestIssues,
  sceneResourceSupportedBpp,
  type SceneResourceBpp,
  type SceneResourceCachePolicy,
  type SceneResourceCompression,
  type SceneResourceCompressionComponent,
  type SceneResourceDescriptor,
  type SceneResourceFallbackMode,
  type SceneResourceKind,
  type SceneResourceManifest,
  type SceneResourcePaletteSlot,
  type SceneResourcePrefetch
} from "../shared/sceneResourceContract";
import type { ScenePhysicalBudget } from "../shared/sceneFeatureModules";
import {
  InspectorAction,
  InspectorNumber,
  InspectorSection,
  InspectorSelect,
  InspectorToggle
} from "./InspectorControls";

export interface SceneResourceAssetOption {
  label: string;
  value: string;
}

export interface SceneResourceInspectorProps {
  assetOptions: SceneResourceAssetOption[];
  onChange: (value: SceneResourceManifest) => void;
  value: SceneResourceManifest;
}

const RESOURCE_KIND_OPTIONS: Array<{ label: string; value: SceneResourceKind }> = [
  { label: "BG tiled", value: "regular_bg" },
  { label: "BG affine", value: "affine_bg" },
  { label: "Bitmap 3", value: "bitmap3" },
  { label: "Bitmap 4", value: "bitmap4" },
  { label: "Bitmap 5", value: "bitmap5" },
  { label: "OBJ / sprite", value: "obj" },
  { label: "Paleta", value: "palette" },
  { label: "Áudio", value: "audio" },
  { label: "Tabela HBlank", value: "hblank_table" }
];

const BPP_OPTIONS: Array<{ label: string; value: string }> = [
  { label: "4 bpp", value: "4" },
  { label: "8 bpp", value: "8" },
  { label: "15 bpp", value: "15" }
];

const BUDGET_FIELDS: Array<{ key: keyof ScenePhysicalBudget; label: string; unit?: string }> = [
  { key: "bgTiles", label: "Tiles BG" },
  { key: "objTiles", label: "Tiles OBJ" },
  { key: "oam", label: "OAM" },
  { key: "paletteColors", label: "Cores de paleta" },
  { key: "vramBytes", label: "VRAM", unit: "bytes" },
  { key: "eventBytes", label: "Eventos", unit: "bytes" },
  { key: "audioBytes", label: "Áudio", unit: "bytes" },
  { key: "dmaBytes", label: "DMA", unit: "bytes" },
  { key: "vblankTicks", label: "VBlank", unit: "ticks" },
  { key: "cpuWorkTicks", label: "CPU", unit: "ticks" }
];

function optionsWithCurrent(
  options: SceneResourceAssetOption[],
  currentValue: string
): SceneResourceAssetOption[] {
  if (!currentValue || options.some((option) => option.value === currentValue)) return options;
  return [{ label: `${currentValue} · não catalogado`, value: currentValue }, ...options];
}

function defaultBpp(kind: SceneResourceKind): SceneResourceBpp {
  return sceneResourceSupportedBpp(kind)[0];
}

function defaultTileLimit(kind: SceneResourceKind): number {
  if (kind === "affine_bg") return 256;
  if (kind === "regular_bg" || kind === "obj") return 1024;
  return 0;
}

function defaultPaletteSlot(kind: SceneResourceKind): SceneResourcePaletteSlot {
  if (kind === "obj") return "objects";
  if (["regular_bg", "affine_bg", "bitmap4", "palette"].includes(kind)) return "background";
  return "none";
}

function defaultResource(index: number, assetId: string): SceneResourceDescriptor {
  const id = assetId || `scene_resource_${index + 1}`;
  const kind: SceneResourceKind = "regular_bg";
  return {
    id,
    assetId,
    kind,
    enabled: true,
    required: true,
    bpp: defaultBpp(kind),
    palette: { id: assetId ? `${id}_palette` : "", slot: defaultPaletteSlot(kind), colors: 16 },
    compression: { strategy: "auto", tiles: "auto", tilemap: "auto", palette: "auto" },
    tileLimit: defaultTileLimit(kind),
    resourceGroup: "scene",
    prefetch: "scene",
    cache: "resident",
    evictionPriority: 0,
    dependencies: [],
    fallback: { mode: "error" },
    budget: {
      bgTiles: 0,
      objTiles: 0,
      oam: 0,
      paletteColors: 0,
      vramBytes: 0,
      eventBytes: 0,
      audioBytes: 0,
      dmaBytes: 0,
      vblankTicks: 0,
      cpuWorkTicks: 0
    }
  };
}

const COMPRESSION_OPTIONS: Array<{ label: string; value: SceneResourceCompression }> = [
  { label: "Nenhuma", value: "none" },
  { label: "RLE16", value: "rle16" },
  { label: "LZ77", value: "lz77" },
  { label: "Huffman", value: "huffman" }
];

function compressionOptionIsSupported(
  kind: SceneResourceKind,
  component: SceneResourceCompressionComponent,
  strategy: SceneResourceCompression
): boolean {
  if (strategy === "none") return true;
  if (strategy === "rle16") return kind === "regular_bg" && component === "tilemap";
  if (component === "palette") return ["regular_bg", "affine_bg", "bitmap4", "obj", "palette"].includes(kind);
  if (component === "tiles") return kind === "regular_bg";
  return kind === "regular_bg";
}

function compressionOptionsFor(
  kind: SceneResourceKind,
  component: SceneResourceCompressionComponent
): Array<{ label: string; value: string }> {
  return COMPRESSION_OPTIONS
    .filter((option) => compressionOptionIsSupported(kind, component, option.value))
    .map((option) => ({ label: option.label, value: option.value }));
}

function updateResource(
  manifest: SceneResourceManifest,
  resourceID: string,
  changes: Partial<SceneResourceDescriptor>
): SceneResourceManifest {
  return {
    ...manifest,
    resources: manifest.resources.map((resource) => resource.id === resourceID ? { ...resource, ...changes } : resource)
  };
}

function budgetWithChange(resource: SceneResourceDescriptor, key: keyof ScenePhysicalBudget, value: number): ScenePhysicalBudget {
  return { ...resource.budget, [key]: value };
}

export function SceneResourceInspector({ assetOptions, onChange, value }: SceneResourceInspectorProps): ReactElement {
  const ui = useStudioUiText();
  const normalized = normalizeSceneResourceManifest(value);
  const issues = sceneResourceManifestIssues(normalized);
  const update = (changes: Partial<SceneResourceManifest>): void => {
    onChange(normalizeSceneResourceManifest({ ...normalized, ...changes }));
  };
  const addResource = (): void => {
    const next = defaultResource(normalized.resources.length, assetOptions[0]?.value ?? "");
    update({ resources: [...normalized.resources, next] });
  };

  return (
    <InspectorSection
      className="scene-resource-inspector room-detail-editor-span-2"
      defaultOpen={normalized.resources.length > 0}
      description={ui("Cada entrada liga um asset a tipo, BPP, paleta, compressão, cache, prefetch, dependências e orçamento. O manifesto vazio não habilita recursos por inferência.")}
      title={ui("Recursos tipados da cena")}
    >
      <div className="scene-resource-heading">
        <div>
          <strong>{normalized.resources.length} {ui(" recurso(s) declarado(s)")}</strong>
          <small>{ui("Somente entradas enabled=true entram no export.")}</small>
        </div>
        <InspectorAction onClick={addResource}>{ui("Adicionar recurso")}</InspectorAction>
      </div>

      {normalized.resources.length === 0 ? (
        <p className="scene-resource-empty" role="status">{ui("Nenhum recurso opt-in. A cena usa apenas os assets do fluxo padrão.")}</p>
      ) : null}

      {normalized.resources.map((resource) => {
        const resourceAssets = optionsWithCurrent(assetOptions, resource.assetId);
        const patch = (changes: Partial<SceneResourceDescriptor>): void => onChange(updateResource(normalized, resource.id, changes));
        const compression = resource.compression;
        const setCompressionMode = (strategy: "auto" | "manual"): void => patch({
          compression: strategy === "auto"
            ? { strategy: "auto", tiles: "auto", tilemap: "auto", palette: "auto" }
            : compression.strategy === "manual"
              ? compression
              : { strategy: "manual", tiles: "none", tilemap: "none", palette: "none" }
        });
        const setCompressionComponent = (component: SceneResourceCompressionComponent, selected: string): void => {
          const manual = compression.strategy === "manual"
            ? compression
            : { strategy: "manual" as const, tiles: "none" as const, tilemap: "none" as const, palette: "none" as const };
          patch({ compression: { ...manual, [component]: selected as SceneResourceCompression } });
        };
        const changeKind = (kind: SceneResourceKind): void => patch({
          kind,
          bpp: defaultBpp(kind),
          tileLimit: defaultTileLimit(kind),
          palette: { ...resource.palette, slot: defaultPaletteSlot(kind) }
        });
        return (
          <fieldset className={`scene-resource-card${resource.enabled ? " is-enabled" : ""}`} key={resource.id}>
            <legend>{resource.id || ui("Recurso sem ID")}</legend>
            <div className="scene-resource-card-heading">
              <InspectorToggle checked={resource.enabled} label={ui("Recurso ativo")} onChange={(enabled) => patch({ enabled })} />
              <InspectorToggle checked={resource.required} label={ui("Obrigatório")} onChange={(required) => patch({ required })} />
              <InspectorAction onClick={() => update({ resources: normalized.resources.filter((entry) => entry.id !== resource.id) })}>{ui("Remover")}</InspectorAction>
            </div>
            <div className="scene-resource-fields">
              <label>
                <span>{ui("ID do recurso")}</span>
                <input
                  aria-label={ui("ID do recurso {0}", { 0: resource.id })}
                  onChange={(event) => patch({ id: event.currentTarget.value })}
                  value={resource.id}
                />
              </label>
              <InspectorSelect
                ariaLabel={ui("Asset do recurso {0}", { 0: resource.id })}
                disabled={resourceAssets.length === 0}
                label={ui("Asset")}
                onChange={(assetId) => patch({ assetId })}
                options={resourceAssets.length > 0 ? [{ label: "Selecionar asset", value: "" }, ...resourceAssets] : [{ label: "Nenhum asset disponível", value: "" }]}
                value={resource.assetId}
              />
              <InspectorSelect ariaLabel={ui("Tipo do recurso {0}", { 0: resource.id })} label={ui("Tipo")} onChange={(kind) => changeKind(kind as SceneResourceKind)} options={RESOURCE_KIND_OPTIONS} value={resource.kind} />
              <InspectorSelect ariaLabel={ui("BPP do recurso {0}", { 0: resource.id })} label={ui("BPP")} onChange={(bpp) => patch({ bpp: Number(bpp) as SceneResourceBpp })} options={BPP_OPTIONS.filter(option => sceneResourceSupportedBpp(resource.kind).includes(Number(option.value) as SceneResourceBpp))} value={String(resource.bpp)} />
              {resource.kind === "obj" ? <p className="scene-resource-compression-note">{ui("O formato da imagem é definido no workspace Sprites. Este BPP declara o formato esperado pela cena.")}</p> : null}
              <InspectorSelect ariaLabel={ui("Modo de compressão do recurso {0}", { 0: resource.id })} label={ui("Modo de compressão")} onChange={(strategy) => setCompressionMode(strategy as "auto" | "manual")} options={[{ label: "Automático", value: "auto" }, { label: "Manual", value: "manual" }]} value={compression.strategy} />
              {compression.strategy === "auto" ? (
                <p className="scene-resource-compression-note">{ui("O exportador compara as opções compatíveis e escolhe a menor saída por componente.")}</p>
              ) : (
                <>
                  <InspectorSelect ariaLabel={ui("Compressão dos tiles do recurso {0}", { 0: resource.id })} label={ui("Tiles")} onChange={(selected) => setCompressionComponent("tiles", selected)} options={compressionOptionsFor(resource.kind, "tiles")} value={compression.tiles} />
                  <InspectorSelect ariaLabel={ui("Compressão do tilemap do recurso {0}", { 0: resource.id })} label={ui("Tilemap")} onChange={(selected) => setCompressionComponent("tilemap", selected)} options={compressionOptionsFor(resource.kind, "tilemap")} value={compression.tilemap} />
                  <InspectorSelect ariaLabel={ui("Compressão da paleta do recurso {0}", { 0: resource.id })} label={ui("Paleta")} onChange={(selected) => setCompressionComponent("palette", selected)} options={compressionOptionsFor(resource.kind, "palette")} value={compression.palette} />
                </>
              )}
              <InspectorNumber label={ui("Limite de tiles")} max={1024} min={0} onChange={(tileLimit) => patch({ tileLimit })} value={resource.tileLimit} />
              <label>
                <span>{ui("Grupo de recurso")}</span>
                <input aria-label={ui("Grupo do recurso {0}", { 0: resource.id })} onChange={(event) => patch({ resourceGroup: event.currentTarget.value })} value={resource.resourceGroup} />
              </label>
              <InspectorSelect ariaLabel={ui("Prefetch do recurso {0}", { 0: resource.id })} label={ui("Prefetch")} onChange={(prefetch) => patch({ prefetch: prefetch as SceneResourcePrefetch })} options={[{ label: "Nenhum", value: "none" }, { label: "Ao entrar na cena", value: "scene" }, { label: "Pela câmera", value: "camera" }, { label: "Manual", value: "manual" }]} value={resource.prefetch} />
              <InspectorSelect ariaLabel={ui("Cache do recurso {0}", { 0: resource.id })} label={ui("Cache")} onChange={(cache) => patch({ cache: cache as SceneResourceCachePolicy })} options={[{ label: "Residente", value: "resident" }, { label: "Evictable", value: "evictable" }]} value={resource.cache} />
              <InspectorNumber label={ui("Prioridade de eviction")} max={255} min={0} onChange={(evictionPriority) => patch({ evictionPriority })} value={resource.evictionPriority} />
            </div>

            <fieldset className="scene-resource-subsection">
              <legend>{ui("Paleta")}</legend>
              <div className="scene-resource-fields">
                <label>
                  <span>{ui("ID da paleta")}</span>
                  <input aria-label={ui("Paleta do recurso {0}", { 0: resource.id })} onChange={(event) => patch({ palette: { ...resource.palette, id: event.currentTarget.value } })} value={resource.palette.id} />
                </label>
                <InspectorSelect ariaLabel={ui("Slot de paleta do recurso {0}", { 0: resource.id })} label={ui("Slot")} onChange={(slot) => patch({ palette: { ...resource.palette, slot: slot as SceneResourcePaletteSlot } })} options={[{ label: "Background", value: "background" }, { label: "Objects", value: "objects" }, { label: "Sem paleta", value: "none" }]} value={resource.palette.slot} />
                <InspectorNumber label={ui("Cores")} max={256} min={0} onChange={(colors) => patch({ palette: { ...resource.palette, colors } })} value={resource.palette.colors} />
              </div>
            </fieldset>

            <fieldset className="scene-resource-subsection">
              <legend>{ui("Fallback e dependências")}</legend>
              <div className="scene-resource-fields">
                <InspectorSelect ariaLabel={ui("Fallback do recurso {0}", { 0: resource.id })} label={ui("Fallback")} onChange={(mode) => patch({ fallback: { ...resource.fallback, mode: mode as SceneResourceFallbackMode } })} options={[{ label: "Erro", value: "error" }, { label: "Omitir decorativo", value: "omit_decorative" }, { label: "Voltar para tiled", value: "tiled_default" }]} value={resource.fallback.mode} />
                {resource.fallback.mode !== "error" ? (
                  <label>
                    <span>{ui("Asset de fallback")}</span>
                    <input aria-label={ui("Asset de fallback do recurso {0}", { 0: resource.id })} onChange={(event) => patch({ fallback: { ...resource.fallback, assetId: event.currentTarget.value } })} value={resource.fallback.assetId ?? ""} />
                  </label>
                ) : null}
              </div>
              <label className="scene-resource-textarea-field">
                <span>{ui("Dependências · IDs separados por vírgula")}</span>
                <textarea aria-label={ui("Dependências do recurso {0}", { 0: resource.id })} onChange={(event) => patch({ dependencies: event.currentTarget.value.split(",").map((entry) => entry.trim()).filter(Boolean) })} rows={2} value={resource.dependencies.join(", ")} />
              </label>
            </fieldset>

            <fieldset className="scene-resource-subsection">
              <legend>{ui("Orçamento físico declarado")}</legend>
              <div className="scene-resource-budget-grid">
                {BUDGET_FIELDS.map(({ key, label, unit }) => (
                  <InspectorNumber key={key} label={label} min={0} onChange={(nextValue) => patch({ budget: budgetWithChange(resource, key, nextValue) })} unit={unit} value={resource.budget[key]} />
                ))}
              </div>
            </fieldset>
          </fieldset>
        );
      })}

      {issues.length > 0 ? (
        <ul className="scene-resource-issues" role="status">
          {issues.slice(0, 8).map((entry, index) => <li key={`${entry.code}-${entry.resourceId ?? "manifest"}-${index}`}>{ui(entry.message)}</li>)}
        </ul>
      ) : (
        <p className="scene-resource-valid" role="status">{ui("Manifesto de recursos compatível com o contrato do exportador.")}</p>
      )}
      <output className="scene-resource-export-summary" aria-label={ui("Recursos exportados")}>
        {exportSceneResourceManifest(normalized).resources.length} {ui(" recurso(s) serão exportado(s).")}</output>
    </InspectorSection>
  );
}
