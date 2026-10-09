import { ChevronDown, ChevronUp, GripHorizontal, X } from "lucide-react";
import { useLayoutEffect, useRef, useState, type ReactNode } from "react";

/** Editor-only floating panel; never writes project or runtime camera data. */
export function FocusScenePreviewPanel({ preview, minimap, onClose }: {
  preview: ReactNode;
  minimap: ReactNode;
  onClose(): void;
}): React.ReactElement {
  const panelRef = useRef<HTMLElement>(null);
  const drag = useRef<{ pointerID: number; x: number; y: number; left: number; top: number } | null>(null);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [tab, setTab] = useState<"gba" | "map">("gba");
  const activeTab = minimap ? tab : "gba";

  useLayoutEffect(() => {
    const panel = panelRef.current;
    const host = panel?.parentElement;
    if (!panel || !host || !position) return;
    const clamp = () => setPosition(current => current && ({
      left: Math.max(0, Math.min(current.left, host.clientWidth - panel.offsetWidth)),
      top: Math.max(0, Math.min(current.top, host.clientHeight - panel.offsetHeight - (host.querySelector(".room-scene-navigation")?.clientHeight ?? 0)))
    }));
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(clamp);
    observer?.observe(host);
    clamp();
    return () => observer?.disconnect();
  }, [collapsed, activeTab, Boolean(position)]);

  return <aside aria-label="Prévia e minimapa da cena" className={`room-focus-preview-panel${collapsed ? " is-collapsed" : ""}`}
    ref={panelRef} style={position ? { left: position.left, top: position.top, right: "auto", bottom: "auto" } : undefined}>
    <header>
      <button aria-label="Mover painel de prévia" className="room-focus-preview-drag" type="button"
        onKeyDown={event => {
          const direction = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[event.key];
          const panel = panelRef.current, host = panel?.parentElement;
          if (!direction || !panel || !host) return;
          event.preventDefault();
          event.stopPropagation();
          const panelBounds = panel.getBoundingClientRect(), hostBounds = host.getBoundingClientRect();
          const step = event.shiftKey ? 32 : 8;
          setPosition({
            left: Math.max(0, Math.min(panelBounds.left - hostBounds.left + direction[0] * step, host.clientWidth - panel.offsetWidth)),
            top: Math.max(0, Math.min(panelBounds.top - hostBounds.top + direction[1] * step, host.clientHeight - panel.offsetHeight - (host.querySelector(".room-scene-navigation")?.clientHeight ?? 0)))
          });
        }}
        onPointerDown={event => {
          if (event.button !== 0) return;
          const panel = panelRef.current;
          const host = panel?.parentElement;
          if (!panel || !host) return;
          event.stopPropagation();
          event.currentTarget.setPointerCapture(event.pointerId);
          const panelBounds = panel.getBoundingClientRect(), hostBounds = host.getBoundingClientRect();
          drag.current = { pointerID: event.pointerId, x: event.clientX, y: event.clientY, left: panelBounds.left - hostBounds.left, top: panelBounds.top - hostBounds.top };
        }}
        onPointerMove={event => {
          const current = drag.current, panel = panelRef.current, host = panel?.parentElement;
          if (!current || current.pointerID !== event.pointerId || !panel || !host) return;
          event.stopPropagation();
          setPosition({
            left: Math.max(0, Math.min(current.left + event.clientX - current.x, host.clientWidth - panel.offsetWidth)),
            top: Math.max(0, Math.min(current.top + event.clientY - current.y, host.clientHeight - panel.offsetHeight - (host.querySelector(".room-scene-navigation")?.clientHeight ?? 0)))
          });
        }}
        onPointerUp={event => {
          drag.current = null;
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
        }} onPointerCancel={() => { drag.current = null; }}
        title="Arraste ou use as setas para mover o painel"><GripHorizontal aria-hidden="true" size={14} /><span>{collapsed ? "Prévia GBA" : null}</span></button>
      {!collapsed ? <div className="room-focus-preview-tabs" role="tablist" aria-label="Conteúdo do painel de prévia"
        onKeyDown={event => {
          if (!minimap || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
          event.preventDefault(); event.stopPropagation();
          const next = event.key === "Home" ? "gba" : event.key === "End" ? "map" : activeTab === "gba" ? "map" : "gba";
          setTab(next);
          event.currentTarget.querySelectorAll<HTMLButtonElement>('button')[next === "gba" ? 0 : 1]?.focus();
        }}>
        <button role="tab" aria-controls="focus-scene-preview-content" tabIndex={activeTab === "gba" ? 0 : -1} aria-selected={activeTab === "gba"} onClick={() => setTab("gba")} type="button">Prévia GBA</button>
        {minimap ? <button role="tab" aria-controls="focus-scene-preview-content" tabIndex={activeTab === "map" ? 0 : -1} aria-selected={activeTab === "map"} onClick={() => setTab("map")} type="button">Minimapa</button> : null}
      </div> : null}
      <button aria-label={collapsed ? "Expandir painel de prévia" : "Recolher painel de prévia"} aria-expanded={!collapsed}
        onClick={() => setCollapsed(!collapsed)} type="button">{collapsed ? <ChevronUp size={14} /> : <ChevronDown size={14} />}</button>
      <button aria-label="Fechar painel de prévia" onClick={onClose} type="button"><X size={14} /></button>
    </header>
    {!collapsed ? <>
      <div id="focus-scene-preview-content" role="tabpanel" aria-label={activeTab === "gba" ? "Prévia GBA em tamanho real" : "Minimapa"}>
        {activeTab === "gba" ? preview : minimap}
      </div>
      {activeTab === "gba" ? <small>240 × 160 px · 1× · prévia do editor</small> : null}
    </> : null}
  </aside>;
}
