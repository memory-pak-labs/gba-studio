import { useStudioUiText } from "./studioUiText";
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import type { GBAProjectData } from "../shared/projectFile";
import type { RoomsWorkspaceRoom, RoomsWorkspaceEntity, UpdateRoomFields, UpdateRoomEntityFields, CreateActorInProjectOptions, CreateTriggerInProjectOptions, RoomTilePaintTool } from "../shared/roomsWorkspace/core";
import type { RoomCollisionType } from "../shared/roomsWorkspace";
import { dungeonBlocked, DUNGEON_DIRECTIONS, type DungeonCamera } from "../shared/dungeonSceneView";
import { deriveFocusSceneViewportGeometry } from "../shared/focusSceneViewport";
import { DungeonViewportEditor } from "./DungeonViewportEditor";
import { FocusScenePreviewPanel } from "./FocusScenePreviewPanel";
import { DungeonScenePreview, dungeonStart } from "./DungeonScenePreview";

interface Props {
  room: RoomsWorkspaceRoom; entities: RoomsWorkspaceEntity[]; projectData?: GBAProjectData | null; projectPath?: string; assetRefreshToken?: number;
  placementMode?: "brush" | "rectangle" | "fill"; mode: string; tool: RoomTilePaintTool; collision: RoomCollisionType; locked: boolean; selected: string[];
  onSelect: (keys: string[]) => void; onCell: (roomID: string, index: number) => void;
  onCollision: (roomID: string, index: number, type: RoomCollisionType, historyGroupID?: string) => void;
  onRectangle?: (roomID: string, start: number, end: number, type: RoomCollisionType, historyGroupID?: string) => void;
  onFill?: (roomID: string, index: number, type: RoomCollisionType, historyGroupID?: string) => void;
  onBeginHistoryGroup?: (id: string) => void; onEndHistoryGroup?: (id: string) => void;
  onUpdate: (roomID: string, fields: UpdateRoomFields) => void;
  onEntity: (kind: "actor" | "trigger", id: string, fields: UpdateRoomEntityFields) => void;
  onCreateActor?: (options: CreateActorInProjectOptions) => unknown; onCreateTrigger?: (options: CreateTriggerInProjectOptions, historyGroupID?: string) => unknown;
  actorsLocked?: boolean; triggersLocked?: boolean;
  showBounds?: boolean; showBackground?: boolean; showGrid?: boolean; showActors?: boolean; showTriggers?: boolean; showHud?: boolean;
  viewMode: "map" | "viewport"; previewVisible: boolean; onClosePreview: () => void;
  renderHud: (camera: DungeonCamera, scale: number, readOnly?: boolean) => ReactNode;
}
export function DungeonSceneEditor(p: Props): React.ReactElement {
  const ui = useStudioUiText();
  const { room, entities } = p;
  const [camera, setCamera] = useState(() => dungeonStart(room));
  const host = useRef<HTMLDivElement>(null), cameraPane = useRef<HTMLElement>(null);
  const [manualScale, setScale] = useState(0), [autoScale, setAutoScale] = useState(2), [cellSize, setCellSize] = useState(28);
  const scale = manualScale || autoScale;
  useLayoutEffect(() => {
    const element = cameraPane.current;
    if (!element || typeof ResizeObserver === "undefined") return;
    const resize = () => setAutoScale(deriveFocusSceneViewportGeometry({availableWidth:Math.max(1,element.clientWidth),availableHeight:Math.max(1,element.clientHeight),roomWidthTiles:30,roomHeightTiles:20}).scale);
    const observer = new ResizeObserver(resize); observer.observe(element); resize();
    return () => observer.disconnect();
  }, [p.viewMode]);
  const [status, setStatus] = useState("");
  const grid = { width: room.width, height: room.height, cells: room.collisionCells };
  const stroke = useRef<string | undefined>(undefined);
  const [focusedCell, setFocusedCell] = useState(() => dungeonStart(room).y * room.width + dungeonStart(room).x);
  const latest = useRef(p); latest.current = p;
  const drag = useRef<{ start:number; end:number; kind:"trigger"|"wall" } | null>(null);
  const suppressClick = useRef(false);
  const [draftArea, setDraftArea] = useState<{start:number;end:number}|null>(null);
  const endStroke = (cancel = false) => {
    const current = latest.current, area = drag.current;
    if (area && !cancel && !current.locked) {
      if (area.kind === "wall") current.onRectangle?.(current.room.id, area.start, area.end, current.tool === "eraser" ? "free" : current.collision, stroke.current);
      else {
        const w = current.room.width, x1 = area.start % w, y1 = Math.floor(area.start/w), x2 = area.end % w, y2 = Math.floor(area.end/w);
        const id = current.onCreateTrigger?.({roomID:current.room.id,x:Math.min(x1,x2),y:Math.min(y1,y2),width:Math.abs(x2-x1)+1,height:Math.abs(y2-y1)+1},stroke.current);
        if (typeof id === "string") current.onSelect([`trigger:${id}`]);
      }
    }
    drag.current = null; setDraftArea(null);
    if (stroke.current) current.onEndHistoryGroup?.(stroke.current); stroke.current = undefined;
  };
  useEffect(() => {
    const up = () => endStroke(), cancel = () => endStroke(true);
    window.addEventListener("pointerup", up); window.addEventListener("pointercancel", cancel);
    return () => { window.removeEventListener("pointerup", up); window.removeEventListener("pointercancel", cancel); if (stroke.current) latest.current.onEndHistoryGroup?.(stroke.current); };
  }, []);
  const start = dungeonStart(room), arrows = ["↑", "→", "↓", "←"];
  const move = (step: number) => { const [dx, dy] = DUNGEON_DIRECTIONS[camera.direction]; const x = camera.x + dx * step, y = camera.y + dy * step; if (!dungeonBlocked(grid, x, y)) setCamera({ ...camera, x, y }); };
  function createEntity(kind: "actor" | "trigger", x: number, y: number) {
    const id = kind === "actor" ? p.onCreateActor?.({roomID:room.id,x,y}) : p.onCreateTrigger?.({roomID:room.id,x,y,width:1,height:1});
    if (typeof id === "string") p.onSelect([`${kind}:${id}`]);
  }
  function cell(index: number) {
    const x = index % room.width, y = Math.floor(index / room.width);
    p.onCell(room.id, index);
    if (p.mode === "collision") {
      if (p.locked) return;
      const type = p.tool === "eraser" ? "free" : p.collision;
      if ((p.tool === "fill" || p.placementMode === "fill") && p.onFill) p.onFill(room.id, index, type, stroke.current); else p.onCollision(room.id, index, type, stroke.current);
      return;
    }
    const entity = entities.find(e => x >= e.x && x < e.x + e.width && y >= e.y && y < e.y + e.height);
    if (p.mode === "actor" || p.mode === "trigger") {
      if (p.locked) return;
      const selected = entities.find(e => p.selected.includes(`${e.kind}:${e.id}`) && e.kind === p.mode);
      if (entity?.kind === p.mode) p.onSelect([`${entity.kind}:${entity.id}`]);
      else if (selected) p.onEntity(selected.kind, selected.id, { x, y });
      else createEntity(p.mode,x,y);
      return;
    }
    if (entity) p.onSelect([`${entity.kind}:${entity.id}`]);
    if (!dungeonBlocked(grid, x, y)) setCamera({ ...camera, x, y });
  }
  const previewScale = p.viewMode === "viewport" ? scale : 1;
  const previewAtScale = (displayScale: number, readOnly = false) => <DungeonScenePreview displayScale={displayScale} showBackground={p.showBackground} showActors={p.showActors} showHud={p.showHud} room={room} entities={entities} projectData={p.projectData} projectPath={p.projectPath} assetRefreshToken={p.assetRefreshToken} camera={camera} onStatus={setStatus} hud={p.renderHud(camera, displayScale, readOnly)} />;
  const preview = previewAtScale(previewScale);
  return <div ref={host} className={`dungeon-scene-editor is-${p.viewMode}`} aria-label={ui("Editor Dungeon Crawler")}>
    {p.viewMode === "map" ? <section className="dungeon-maze-pane" aria-label={ui("Labirinto lógico")}>
      <header><strong>{ui("Labirinto · {0} × {1} células",{0:room.width,1:room.height})}</strong><label>{ui("Célula")} <select aria-label={ui("Zoom do labirinto")} value={cellSize} onChange={e => setCellSize(Number(e.target.value))}>{[20, 28, 36].map(n => <option key={n} value={n}>{n} px</option>)}</select></label></header>
      <p>{p.mode === "collision" ? ui("Pinte paredes; borracha abre passagens. Preenchimento atua na região conectada.") : p.mode === "actor" || p.mode === "trigger" ? ui("Selecione um marcador e clique no destino. Sem seleção, clique ou arraste para adicionar.") : ui("Clique numa passagem para posicionar a prévia. O início do jogo só muda ao confirmar.")}</p>
      <div className="dungeon-grid-scroll"><div className="dungeon-grid" role="grid" aria-label={ui("Células do labirinto")} onKeyDown={event => {
        const step = ({ ArrowLeft: -1, ArrowRight: 1, ArrowUp: -room.width, ArrowDown: room.width } as Record<string, number>)[event.key];
        if (step === undefined) return; event.preventDefault(); event.stopPropagation();
        const next = Math.max(0, Math.min(room.width * room.height - 1, focusedCell + step));
        setFocusedCell(next); event.currentTarget.querySelector<HTMLButtonElement>(`[data-cell-index="${next}"]`)?.focus();
      }} style={{ gridTemplateColumns: `repeat(${room.width}, ${cellSize}px)` }}>
        {Array.from({ length: room.width * room.height }, (_, i) => {
          const x = i % room.width, y = Math.floor(i / room.width), wall = room.collisionCells[i];
          const markers = entities.filter(e => x >= e.x && x < e.x + e.width && y >= e.y && y < e.y + e.height);
          const current = x === camera.x && y === camera.y, initial = x === start.x && y === start.y;
          return <button role="gridcell" key={i} type="button" data-cell-index={i} tabIndex={i === focusedCell ? 0 : -1} onFocus={() => setFocusedCell(i)} className={[wall ? "wall" : "passage", current ? "camera" : "", initial ? "start" : "", draftArea && x>=Math.min(draftArea.start%room.width,draftArea.end%room.width) && x<=Math.max(draftArea.start%room.width,draftArea.end%room.width) && y>=Math.floor(Math.min(draftArea.start,draftArea.end)/room.width) && y<=Math.floor(Math.max(draftArea.start,draftArea.end)/room.width) ? "draft" : "", markers.some(e => p.selected.includes(`${e.kind}:${e.id}`)) ? "selected" : ""].join(" ")} style={{ width: cellSize, height: cellSize }} aria-label={ui("Célula {0}, {1} · {2}",{0:x,1:y,2:ui(wall ? "parede" : "passagem")})+(initial ? ` · ${ui("início")}` : "")+markers.map(e => ` · ${e.name}`).join("")} onPointerDown={event => {
              if (event.button !== 0 || p.locked) return;
              const createTrigger = p.mode === "trigger" && !p.selected.length && !markers.some(e => e.kind === "trigger");
              if (p.mode !== "collision" && !createTrigger) return;
              stroke.current = `dungeon-paint-${Date.now()}`; p.onBeginHistoryGroup?.(stroke.current);
              if (createTrigger || p.placementMode === "rectangle") { drag.current = {start:i,end:i,kind:createTrigger?"trigger":"wall"}; setDraftArea(drag.current); suppressClick.current = true; }
              else cell(i);
            }}
            onPointerEnter={event => {
              if (event.buttons !== 1 || !stroke.current) return;
              if (drag.current) { drag.current.end = i; setDraftArea({...drag.current}); }
              else if (p.mode === "collision" && p.tool !== "fill" && p.placementMode !== "fill") cell(i);
            }}
            onClick={event => { if (suppressClick.current) { suppressClick.current = false; return; } if (p.mode !== "collision" || event.detail === 0) cell(i); }}>
            {current ? arrows[camera.direction] : markers.length ? markers[0].kind === "actor" ? "●" : "◆" : initial ? "I" : ""}
          </button>;
        })}
      </div></div>
      <p className="dungeon-legend">{ui("■ Parede · □ Passagem · ● Ator · ◆ Gatilho · I Início · Seta: câmera")}</p>
      <ul className="dungeon-entity-list">{entities.map(e => <li key={`${e.kind}:${e.id}`}><button type="button" aria-pressed={p.selected.includes(`${e.kind}:${e.id}`)} onClick={() => p.onSelect([`${e.kind}:${e.id}`])}>{e.kind === "actor" ? "●" : "◆"} {e.name} · {e.x}, {e.y}</button></li>)}</ul>
    </section> : <section ref={cameraPane} className="dungeon-camera-pane" aria-label={ui("Câmera em primeira pessoa")}>
      <DungeonViewportEditor room={room} entities={entities} projectData={p.projectData} camera={camera} scale={scale} mode={p.mode} locked={p.locked}
        actorsLocked={p.actorsLocked} triggersLocked={p.triggersLocked} showBounds={p.showBounds} showGrid={p.showGrid} showActors={p.showActors} showTriggers={p.showTriggers} selected={p.selected} onSelect={p.onSelect} onMove={p.onEntity}
        onPlace={({x,y})=>{
          const index=y*room.width+x;if(p.locked)return;
          if(p.mode==="collision")cell(index);
          else if(p.mode==="actor"||p.mode==="trigger") {
            p.onCell(room.id,index);
            const existing=entities.find(e=>e.kind===p.mode&&x>=e.x&&x<e.x+e.width&&y>=e.y&&y<e.y+e.height);
            if(existing)p.onSelect([`${existing.kind}:${existing.id}`]);
            else createEntity(p.mode,x,y);
          }
        }}>{preview}</DungeonViewportEditor>
    </section>}
    <footer className="dungeon-navigation">
      {p.viewMode==="viewport"?<label className="dungeon-camera-zoom">{ui("240 × 160 · {0}%",{0:Math.round(scale*100)})} <select aria-label={ui("Ampliação da câmera")} value={manualScale} onChange={e=>setScale(Number(e.target.value))}><option value={0}>{ui("Automática")}</option>{[1,2,3,4].map(n=><option key={n} value={n}>{n}×</option>)}</select></label>:null}
      <div className="dungeon-camera-controls"><button type="button" onClick={() => setCamera({ ...camera, direction: (camera.direction + 3) % 4 })}>{ui("↶ Girar")}</button><button type="button" onClick={() => move(1)}>{ui("Avançar")}</button><button type="button" onClick={() => move(-1)}>{ui("Recuar")}</button><button type="button" onClick={() => setCamera({ ...camera, direction: (camera.direction + 1) % 4 })}>{ui("Girar ↷")}</button></div>
      <p>{ui("Prévia · célula {0}, {1} · {2}",{0:camera.x,1:camera.y,2:ui(["Norte", "Leste", "Sul", "Oeste"][camera.direction])})}</p>
      <div className="dungeon-camera-controls"><button type="button" onClick={() => setCamera(dungeonStart(room))}>{ui("Ir ao início")}</button><button type="button" disabled={dungeonBlocked(grid, camera.x, camera.y)} onClick={() => { if (room.runtime?.type === "dungeonCrawler") p.onUpdate(room.id, { runtime: { ...room.runtime, config: { ...room.runtime.config, playerStart: { x: camera.x, y: camera.y, direction: (["up", "right", "down", "left"] as const)[camera.direction] } } } }); }}>{ui("Definir como início")}</button></div>
      <p className="dungeon-preview-status" role="status">{status}</p>
    </footer>
    {p.previewVisible ? <FocusScenePreviewPanel preview={<div aria-hidden="true">{previewAtScale(1,true)}</div>} minimap={null} onClose={p.onClosePreview} /> : null}
  </div>;
}
