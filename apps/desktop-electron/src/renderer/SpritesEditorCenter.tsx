import { useRef, useState, type ReactNode } from "react";

import {
  clampSpriteEditorBottomHeight,
  readSpriteEditorBottomHeight,
  toggleSpriteEditorBottomHeight,
  writeSpriteEditorBottomHeight
} from "../shared/spriteEditorLayout";

type SpritesEditorCenterProps = {
  bottomPane: ReactNode;
  canvasPane: ReactNode;
};

type ResizeDragState = {
  pointerID: number;
  startHeight: number;
  startY: number;
};

export function SpritesEditorCenter({
  bottomPane,
  canvasPane
}: SpritesEditorCenterProps): React.ReactElement {
  const [bottomHeight, setBottomHeight] = useState(() => readSpriteEditorBottomHeight());
  const centerRef = useRef<HTMLDivElement>(null);
  const resizeDrag = useRef<ResizeDragState | null>(null);
  const isBottomCollapsed = bottomHeight <= 36;

  function toggleBottomPane(): void {
    setBottomHeight((current) => {
      const next = toggleSpriteEditorBottomHeight(current);
      writeSpriteEditorBottomHeight(next);
      return next;
    });
  }

  function startResize(event: React.PointerEvent<HTMLDivElement>): void {
    resizeDrag.current = {
      pointerID: event.pointerId,
      startHeight: bottomHeight,
      startY: event.clientY
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function continueResize(event: React.PointerEvent<HTMLDivElement>): void {
    const drag = resizeDrag.current;
    if (!drag || drag.pointerID !== event.pointerId) return;

    const nextHeight = clampSpriteEditorBottomHeight(drag.startHeight + (drag.startY - event.clientY));
    setBottomHeight(nextHeight);
  }

  function endResize(event: React.PointerEvent<HTMLDivElement>): void {
    const drag = resizeDrag.current;
    if (!drag || drag.pointerID !== event.pointerId) return;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    resizeDrag.current = null;
    setBottomHeight((current) => {
      const next = clampSpriteEditorBottomHeight(current);
      writeSpriteEditorBottomHeight(next);
      return next;
    });
  }

  return (
    <div className="sprites-editor-center" ref={centerRef}>
      <div className="sprites-editor-canvas-pane">
        {canvasPane}
      </div>
      <div
        aria-label="Altura da folha de sprites e quadros"
        aria-orientation="horizontal"
        aria-valuemax={420}
        aria-valuemin={36}
        aria-valuenow={bottomHeight}
        className="sprites-editor-bottom-resizer"
        onKeyDown={(event) => {
          if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return;
          event.preventDefault();
          const next = clampSpriteEditorBottomHeight(event.key === "Home" ? 36 : event.key === "End" ? 420 : bottomHeight + (event.key === "ArrowUp" ? 20 : -20));
          setBottomHeight(next);
          writeSpriteEditorBottomHeight(next);
        }}
        onPointerCancel={endResize}
        onPointerDown={startResize}
        onPointerMove={continueResize}
        onPointerUp={endResize}
        role="separator"
        tabIndex={0}
        title="Ajustar altura do painel de tiles e frames"
      />
      <section
        className={isBottomCollapsed ? "sprites-editor-bottom-pane is-collapsed" : "sprites-editor-bottom-pane"}
        style={{ height: `${bottomHeight}px` }}
      >
        <button
          aria-expanded={!isBottomCollapsed}
          className="sprites-editor-bottom-toggle"
          onClick={toggleBottomPane}
          type="button"
        >
          <span>Folha · Quadros</span>
          <span>{isBottomCollapsed ? "Expandir" : "Recolher"}</span>
        </button>
        {isBottomCollapsed ? null : bottomPane}
      </section>
    </div>
  );
}
