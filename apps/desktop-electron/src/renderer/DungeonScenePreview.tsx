import { uiText as ui, useStudioUiText } from "./studioUiText";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { GBAProjectData } from "../shared/projectFile";
import type { RoomsWorkspaceRoom, RoomsWorkspaceEntity } from "../shared/roomsWorkspace/core";
import { resolveAssetURL, assetFetchURL, isDesktopAssetURL } from "../shared/spriteAssetURL";
import { decodeDungeonView, dungeonActorVisual, dungeonGeometryKey, dungeonPlayerActor, dungeonPlayerVisual, projectDungeonActor, renderDungeonWorld, type DungeonCamera, type DungeonTexture } from "../shared/dungeonSceneView";
import "./styles/dungeon-scene.css";

const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" ? value as Record<string, unknown> : {};
export function dungeonAssetURL(data: GBAProjectData | null | undefined, path: string | undefined, name: string): string | null {
  const asset = record(list(data?.assets).find(a => record(a).name === name));
  const meta = record(asset.metadata);
  return resolveAssetURL(path, String(meta.source ?? asset.relativePath ?? "") || null, String(asset.bundledDefaultAsset ?? meta.bundledDefaultAsset ?? "") || null);
}
export function dungeonStart(room: RoomsWorkspaceRoom): DungeonCamera {
  const config = record(record(room.runtime).config), start = record(config.playerStart);
  const direction = ["up", "right", "down", "left"].indexOf(String(start.direction ?? "up"));
  return { x: Number(start.x ?? 1), y: Number(start.y ?? 1), direction: Math.max(0, direction) };
}
const binaryLoads = new Map<string, Promise<Uint8Array>>();
function binary(url: string): Promise<Uint8Array> {
  if (!binaryLoads.has(url)) {
    const promise = fetch(url).then(r => { if (!r.ok) throw Error(ui("Não foi possível carregar a vista ({0})",{0:r.status})); return r.arrayBuffer(); }).then(b => new Uint8Array(b));
    binaryLoads.set(url, promise);
    promise.catch(() => binaryLoads.delete(url));
    if (binaryLoads.size > 24) binaryLoads.delete(binaryLoads.keys().next().value!);
  }
  return binaryLoads.get(url)!;
}
function textures(value: unknown): DungeonTexture[] {
  if (!Array.isArray(value)) return [];
  return value.map(encoded => {
    const raw = atob(String(encoded));
    if (raw.length !== 8192) throw Error(ui("Material Dungeon inválido"));
    const pixels = new Uint8ClampedArray(64 * 64 * 4);
    for (let n = 0; n < 4096; n++) { const c = raw.charCodeAt(n * 2) | raw.charCodeAt(n * 2 + 1) << 8; pixels.set([(c & 31) << 3, (c >> 5 & 31) << 3, (c >> 10 & 31) << 3, 255], n * 4); }
    return { width: 64, height: 64, pixels };
  });
}
export interface DungeonScenePreviewProps {
  room: RoomsWorkspaceRoom; entities: RoomsWorkspaceEntity[]; projectData?: GBAProjectData | null; projectPath?: string;
  showActors?: boolean; showHud?: boolean; showBackground?: boolean;
  camera?: DungeonCamera; displayScale?: number; assetRefreshToken?: number; hud?: ReactNode; onStatus?: (status: string) => void;
}
/** A single 240x160 camera composition is shared by cards and the scene editor. */
export function DungeonScenePreview({ room, entities, projectData, projectPath, showActors = true, showHud = true, showBackground = true, camera = dungeonStart(room), assetRefreshToken = 0, hud, onStatus, displayScale = 1 }: DungeonScenePreviewProps): React.ReactElement {
  const ui = useStudioUiText();
  const canvas = useRef<HTMLCanvasElement>(null);
  const [error, setError] = useState("");
  const grid = useMemo(() => ({ width: room.width, height: room.height, cells: room.collisionCells }), [room.width, room.height, room.collisionCells]);
  const geometry = dungeonGeometryKey(grid);
  const rawRoom = record(list(projectData?.rooms).find(r => record(r).name === room.name));
  const bg = record(list(projectData?.assets).find(a => record(a).name === rawRoom.backgroundAssetName));
  const cache = record(record(bg.metadata).dungeonViewCache), authoring = record(cache.authoring);
  const config = record(record(room.runtime).config), presentation = record(config.presentation);
  const changed = typeof authoring.geometry === "string" && authoring.geometry !== geometry;
  const materialAssets = list(presentation.materialAssets).map(String);
  const customMaterials = materialAssets.some(Boolean);
  const customDoor = presentation.door !== undefined && JSON.stringify(presentation.door) !== JSON.stringify(authoring.door);
  const loadURL = (name: string) => {
    const resolved = dungeonAssetURL(projectData, projectPath, name);
    if (!resolved) throw Error(ui("Origem das vistas Dungeon indisponível"));
    // Fetch cannot read file: in Electron; the scoped protocol checks the open project root.
    const url = assetFetchURL(resolved);
    return `${url}${url.includes("?") ? "&" : "?"}v=${assetRefreshToken}`;
  };
  useEffect(() => {
    let cancelled = false;
    setError("");
    async function loadImage(name:string) {
      const image=new Image(),url=loadURL(name);
      if(isDesktopAssetURL(url))image.crossOrigin="anonymous";
      await new Promise<void>((resolve,reject)=>{image.onload=()=>resolve();image.onerror=()=>reject(Error(ui("Não foi possível carregar o material {0}",{0:name})));image.src=url;});
      return image;
    }
    async function paint() {
      let pixels: Uint8ClampedArray;
      const view = Array.isArray(cache.index) ? cache.index.find(v => record(v).view === `${camera.x}-${camera.y}-${camera.direction}`) : null;
      if (!config.presentation && typeof bg.name === "string") {
        const image = await loadImage(bg.name as string);
        const surface=document.createElement("canvas"); surface.width=240; surface.height=160;
        const context=surface.getContext("2d")!; context.imageSmoothingEnabled=false; context.drawImage(image,0,0);
        pixels=context.getImageData(0,0,240,160).data;
      } else if (!changed && !customMaterials && !customDoor && view) {
        const values = await Promise.all(["tiles", "maps", "palettes"].map(key => binary(loadURL(String(cache[`${key}Asset`])))));
        pixels = decodeDungeonView(values[0], values[1], values[2], record(view) as unknown as Parameters<typeof decodeDungeonView>[3]);
      } else {
        let materials = textures(authoring.materials);
        if (customMaterials) {
          if (materialAssets.length !== 8 || materialAssets.some(name => !name)) throw Error(ui("Selecione os oito materiais ou use os materiais procedurais."));
          materials = await Promise.all(materialAssets.map(async name => {
            const image = await loadImage(name);
            if (image.naturalWidth !== 64 || image.naturalHeight !== 64) throw Error(ui("O material {0} precisa ter 64 × 64 pixels.",{0:name}));
            const surface=document.createElement("canvas"); surface.width=64; surface.height=64;
            const context=surface.getContext("2d")!; context.drawImage(image,0,0);
            const pixels=context.getImageData(0,0,64,64).data;
            for (let i=0;i<pixels.length;i+=4) {
              if (pixels[i+3]!==255) throw Error(ui("O material {0} precisa ser opaco.",{0:name}));
              pixels[i]&=248; pixels[i+1]&=248; pixels[i+2]&=248;
            }
            return { width:64,height:64,pixels };
          }));
        }
        const door = record(presentation.door ?? authoring.door);
        pixels = renderDungeonWorld(grid, camera, materials, { x:Number(door.x ?? -1),y:Number(door.y ?? -1) });
      }
      if (cancelled || !canvas.current) return;
      const ctx = canvas.current.getContext("2d")!;
      ctx.putImageData(new ImageData(new Uint8ClampedArray(pixels), 240, 160), 0, 0);
      onStatus?.(!config.presentation ? ui("Fundo frontal fixo") : changed || customMaterials || customDoor ? ui("Vistas serão reconstruídas ao testar/exportar") : view ? ui("Vistas GBA · geometria conferida") : ui("Vistas geradas da grade"));
    }
    paint().catch(e => { if (!cancelled) { canvas.current?.getContext("2d")?.clearRect(0, 0, 240, 160); setError(String(e.message)); onStatus?.(String(e.message)); } });
    return () => { cancelled = true; };
  }, [geometry, camera.x, camera.y, camera.direction, cache, changed, customMaterials, customDoor, JSON.stringify(materialAssets), JSON.stringify(presentation.door), assetRefreshToken, projectPath, ui]);
  const playerActor=projectData?dungeonPlayerActor(projectData,rawRoom):null;
  const playerVisual=showActors&&projectData?dungeonPlayerVisual(projectData,rawRoom):null;
  const playerURL=playerVisual?dungeonAssetURL(projectData,projectPath,playerVisual.sheet):null;
  const projected = entities.filter(e => showActors && e.kind === "actor" && e.id!==playerActor?.id).flatMap(entity => {
    const raw = record(list(projectData?.actors).find(a => record(a).id === entity.id));
    if(raw.dungeonViewAnchor && typeof raw.dungeonViewAnchor==="object")return [];
    const projection = projectDungeonActor(grid, camera, entity, Boolean(raw.dungeonCell),{modern:Boolean(config.presentation),viewDistance:Number(config.viewDistance??5),wallMounted:raw.dungeonWallMounted===true});
    if (!projection) return [];
    const visual=projectData ? dungeonActorVisual(projectData,raw,projection,Boolean(config.presentation)) : null;
    const url=visual ? dungeonAssetURL(projectData,projectPath,visual.sheet) : resolveAssetURL(projectPath, entity.spriteSource ?? null, entity.spriteBundledDefaultAsset ?? null);
    return url ? [{ entity, projection, visual, url }] : [];
  }).sort((a, b) => b.projection.distance - a.projection.distance);
  const hudURL = typeof presentation.hudAssetName === "string" ? dungeonAssetURL(projectData, projectPath, presentation.hudAssetName) : null;
  return <div className="dungeon-camera" style={{width:240*displayScale,height:160*displayScale}} data-dungeon-camera={`${camera.x}-${camera.y}-${camera.direction}`} data-dungeon-geometry={changed ? "rebuild" : "original"}>
    <div className="dungeon-camera-art" style={{transform:`scale(${displayScale})`}}>
    <canvas ref={canvas} style={{visibility:showBackground?"visible":"hidden"}} width={240} height={160} aria-label={ui("Câmera Dungeon · 240 × 160")} />
    <div className="dungeon-camera-actors">{projected.map(({ entity, projection: p, visual:v, url }) => <span key={entity.id} title={entity.name} data-dungeon-actor={entity.id} style={{ position: "absolute", left: v?.x ?? p.x, top: v?.y ?? p.y, width: v?.width ?? p.size, height: v?.height ?? p.size, backgroundImage: `url("${url}")`, backgroundSize:v?`${v.sheetWidth}px ${v.sheetHeight}px`:"auto 100%", backgroundPosition:v?`-${v.sourceX}px -${v.sourceY}px`:undefined,imageRendering: "pixelated" }} />)}</div>
    {playerVisual && playerURL ? <span data-dungeon-player={playerVisual.actorId} style={{position:"absolute",left:playerVisual.x,top:playerVisual.y,width:playerVisual.width,height:playerVisual.height,
      backgroundImage:`url("${playerURL}")`,backgroundSize:`${playerVisual.sheetWidth}px ${playerVisual.sheetHeight}px`,backgroundPosition:`-${playerVisual.sourceX}px -${playerVisual.sourceY}px`,imageRendering:"pixelated",pointerEvents:"none",zIndex:2}} /> : null}
    {showHud && hudURL ? <img className="dungeon-camera-hud" src={hudURL} alt="" /> : null}</div>{hud}
    {error ? <span className="dungeon-camera-error" role="status">{error}</span> : null}
  </div>;
}
