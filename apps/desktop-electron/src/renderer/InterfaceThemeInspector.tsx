import { useEffect, useState } from "react";
import { InspectorInfoTip } from "./InspectorControls";
import type { GBAProjectData } from "../shared/projectFile";
import { interfaceSkinAssets, interfaceThemeCatalog, interfaceThemeRooms, resolveInterfaceTheme, type InterfaceThemeChange, type InterfaceThemeScope } from "../shared/interfaceThemes";
import { resolveAssetURL } from "../shared/spriteAssetURL";

const scopeNames = { scene: "Esta cena", type: "Tipo de cena", project: "Projeto" };
export function InterfaceThemeInspector({ projectData, projectPath, roomId, focus, onChange }: {
  projectData: GBAProjectData; projectPath?: string; roomId: string; focus: "hud" | "dialogue";
  onChange(change: InterfaceThemeChange): void;
}): React.ReactElement {
  const [scope, setScope] = useState<InterfaceThemeScope>("scene");
  useEffect(() => setScope("scene"), [roomId]);
  const catalog = interfaceThemeCatalog(projectData);
  const resolved = resolveInterfaceTheme(projectData, roomId);
  const typeId = String(resolved.room?.sceneType ?? "");
  const selectedId = String(scope === "project" ? catalog.defaultThemeId : scope === "type" ? catalog.sceneTypeThemeIds[typeId] ?? "" : resolved.room?.interfaceThemeId ?? "");
  const effectiveId = scope === "scene" ? resolved.themeId : selectedId || catalog.defaultThemeId;
  const theme = catalog.themes.find(item => item.id === effectiveId);
  const field = focus === "hud" ? "hudImage" : "boxImage";
  const image = theme?.[field] ?? "";
  const skins = interfaceSkinAssets(projectData);
  const asset = skins.find(item => item.name === image);
  const metadata = asset?.metadata as Record<string, unknown> | undefined;
  const source = asset ? resolveAssetURL(projectPath, String(metadata?.source ?? asset.relativePath ?? "") || null, String(asset.bundledDefaultAsset ?? metadata?.bundledDefaultAsset ?? "") || null) : null;
  const affected = interfaceThemeRooms(projectData).filter(room => {
    if (scope === "scene") return room === resolved.room;
    if (scope === "type") return room.sceneType === typeId && !room.interfaceThemeId;
    return resolveInterfaceTheme(projectData, String(room.id ?? room.name)).source === "project";
  });
  const label = focus === "hud" ? "Moldura da HUD" : "Moldura do diálogo";
  return <section className="hud-authoring-section interface-theme-inspector" aria-label="Tema das molduras">
    <div className="interface-theme-title"><h4>Tema das molduras</h4><InspectorInfoTip label="Tema das molduras">Trocar esta imagem preserva o layout e a outra moldura do tema.</InspectorInfoTip></div>
    <label>Aplicar aparência em<select value={scope} onChange={event => setScope(event.currentTarget.value as InterfaceThemeScope)}>{Object.entries(scopeNames).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
    <p className="muted">{scope === "scene" ? "Altera somente esta cena." : `Cenas que herdam este padrão: ${affected.map(room => room.name).join(", ") || "nenhuma"}.`}</p>
    <label>Tema<select value={selectedId} onChange={event => onChange({ scope, roomId, themeId: event.currentTarget.value })}>
      <option value="">{scope === "scene" ? "Herdar do tipo / projeto" : scope === "type" ? "Herdar do projeto" : "Sem tema · usar aparência original"}</option>
      {scope === "scene" ? <option value="@project">Usar padrão do projeto</option> : null}
      {selectedId && selectedId !== "@project" && !catalog.themes.some(item => item.id === selectedId) ? <option value={selectedId}>Tema ausente · {selectedId}</option> : null}
      {catalog.themes.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
    </select></label>
    <p className="muted">Nesta cena: {resolved.theme?.name ?? "Aparência original"} · {scopeNames[resolved.source]}{resolved.missing ? " · tema ausente" : ""}</p>
    <label>{label}<select value={image} onChange={event => onChange({ scope, roomId, field, image: event.currentTarget.value })}>
      <option value="">Usar aparência original</option>
      {image && !skins.some(item => item.name === image) ? <option value={image}>Asset incompatível ou ausente · {image}</option> : null}
      {skins.map(item => <option key={String(item.id ?? item.name)} value={String(item.name)}>{String(item.name)}</option>)}
    </select></label>
    {source ? <div role="img" aria-label={`Prévia da moldura ${image}`} style={{ height: 56, boxSizing: "border-box", border: "16px solid transparent", borderImageSource: `url("${source}")`, borderImageSlice: "8 fill", borderImageRepeat: "repeat", imageRendering: "pixelated" }} /> : null}
  </section>;
}
