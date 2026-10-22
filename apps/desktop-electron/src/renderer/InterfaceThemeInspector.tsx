import { uiText as ui, useStudioUiText } from "./studioUiText";
import { useEffect, useState } from "react";
import { InspectorInfoTip } from "./InspectorControls";
import type { GBAProjectData } from "../shared/projectFile";
import { interfaceSkinAssets, interfaceThemeCatalog, interfaceThemeRooms, resolveInterfaceTheme, resolveSceneDialogueUiSettings, type InterfaceThemeChange, type InterfaceThemeScope } from "../shared/interfaceThemes";
import { resolveAssetURL } from "../shared/spriteAssetURL";

const scopeNames = { scene: "Esta cena", type: "Tipo de cena", project: "Projeto" };
export function InterfaceThemeInspector({ projectData, projectPath, roomId, focus, onChange }: {
  projectData: GBAProjectData; projectPath?: string; roomId: string; focus: "hud" | "dialogue";
  onChange(change: InterfaceThemeChange): void;
}): React.ReactElement {
  const ui = useStudioUiText();
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
  return <section className="hud-authoring-section interface-theme-inspector" aria-label={ui("Tema das molduras")}>
    <div className="interface-theme-title"><h4>{ui("Tema das molduras")}</h4><InspectorInfoTip label={ui("Tema das molduras")}>{ui("Trocar esta imagem preserva o layout e a outra moldura do tema.")}</InspectorInfoTip></div>
    {focus === "dialogue" ? <label>{ui("Apresentação nesta cena")}<select aria-label={ui("Apresentação nesta cena")} value={resolveSceneDialogueUiSettings(projectData, roomId).presentation} onChange={event => onChange({ roomId, presentation: event.currentTarget.value === "portrait_tab" ? "portrait_tab" : "standard" })}>
      <option value="standard">{ui("Padrão do projeto")}</option>
      <option value="portrait_tab">{ui("Retrato com aba compacta · 40 px")}</option>
    </select><small>{ui("Retrato emoldurado e nome fora da caixa. Altera somente esta cena.")}</small></label> : null}
    <label>{ui("Aplicar aparência em")}<select value={scope} onChange={event => setScope(event.currentTarget.value as InterfaceThemeScope)}>{Object.entries(scopeNames).map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
    <p className="muted">{scope === "scene" ? ui("Altera somente esta cena.") : ui("Cenas que herdam este padrão: {0}.", { 0: affected.map(room => room.name).join(", ") || "nenhuma" })}</p>
    <label>{ui("Tema")}<select value={selectedId} onChange={event => onChange({ scope, roomId, themeId: event.currentTarget.value })}>
      <option value="">{scope === "scene" ? ui("Herdar do tipo / projeto") : scope === "type" ? ui("Herdar do projeto") : ui("Sem tema · usar aparência original")}</option>
      {scope === "scene" ? <option value="@project">{ui("Usar padrão do projeto")}</option> : null}
      {selectedId && selectedId !== "@project" && !catalog.themes.some(item => item.id === selectedId) ? <option value={selectedId}>{ui("Tema ausente · ")}{selectedId}</option> : null}
      {catalog.themes.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
    </select></label>
    <p className="muted">{ui("Nesta cena: ")}{resolved.theme?.name ?? ui("Aparência original")} · {scopeNames[resolved.source]}{resolved.missing ? ui(" · tema ausente") : ""}</p>
    <label>{ui(label)}<select value={image} onChange={event => onChange({ scope, roomId, field, image: event.currentTarget.value })}>
      <option value="">{ui("Usar aparência original")}</option>
      {image && !skins.some(item => item.name === image) ? <option value={image}>{ui("Asset incompatível ou ausente · ")}{image}</option> : null}
      {skins.map(item => <option key={String(item.id ?? item.name)} value={String(item.name)}>{String(item.name)}</option>)}
    </select></label>
    {source ? <div role="img" aria-label={ui("Prévia da moldura {0}", { 0: image })} style={{ height: 56, boxSizing: "border-box", border: "16px solid transparent", borderImageSource: `url("${source}")`, borderImageSlice: "8 fill", borderImageRepeat: "repeat", imageRendering: "pixelated" }} /> : null}
  </section>;
}
