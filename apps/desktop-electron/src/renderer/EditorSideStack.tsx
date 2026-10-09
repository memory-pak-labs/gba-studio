import { useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import {
  clampEditorSideStackSplit,
  readEditorSideStackCollapsed,
  readEditorSideStackSplit,
  toggleEditorSideStackCollapsed,
  writeEditorSideStackCollapsed,
  writeEditorSideStackSplit
} from "../shared/editorSideStack";

export type EditorSideStackHorizontalResize = {
  value: number;
  min?: number;
  max?: number;
  onChange(width: number): void;
  onCommit?(width: number): void;
};

type EditorSideStackProps = {
  ariaLabel: string;
  className?: string;
  collapseInspectorPane?: boolean;
  hideProjectPane?: boolean;
  inspectorPane: ReactNode;
  horizontalResize?: EditorSideStackHorizontalResize;
  projectPane?: ReactNode;
  workspaceId: string;
};

type ResizeDragState = {
  pointerID: number;
  startRatio: number;
  startY: number;
};

type HorizontalResizeDragState = {
  pointerID: number;
  startWidth: number;
  startX: number;
};

export function EditorSideStack({
  ariaLabel,
  className,
  collapseInspectorPane = false,
  hideProjectPane = false,
  horizontalResize,
  inspectorPane,
  projectPane,
  workspaceId
}: EditorSideStackProps): React.ReactElement {
  const [collapsed, setCollapsed] = useState(() => readEditorSideStackCollapsed(workspaceId));
  const [splitRatio, setSplitRatio] = useState(() => readEditorSideStackSplit(workspaceId));
  const stackRef = useRef<HTMLElement | null>(null);
  const resizeDrag = useRef<ResizeDragState | null>(null);
  const horizontalResizeDrag = useRef<HorizontalResizeDragState | null>(null);

  function toggleCollapsed(): void {
    setCollapsed((current) => {
      const next = toggleEditorSideStackCollapsed(current);
      writeEditorSideStackCollapsed(workspaceId, next);
      return next;
    });
  }

  function startResize(event: React.PointerEvent<HTMLDivElement>): void {
    resizeDrag.current = {
      pointerID: event.pointerId,
      startRatio: splitRatio,
      startY: event.clientY
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function continueResize(event: React.PointerEvent<HTMLDivElement>): void {
    const drag = resizeDrag.current;
    const stack = stackRef.current;
    if (!drag || drag.pointerID !== event.pointerId || !stack) return;

    const body = stack.querySelector(".editor-side-stack-body");
    if (!(body instanceof HTMLElement)) return;

    const bodyHeight = body.getBoundingClientRect().height;
    if (bodyHeight <= 0) return;

    const deltaRatio = (event.clientY - drag.startY) / bodyHeight;
    setSplitRatio(clampEditorSideStackSplit(drag.startRatio + deltaRatio));
  }

  function endResize(event: React.PointerEvent<HTMLDivElement>): void {
    const drag = resizeDrag.current;
    if (!drag || drag.pointerID !== event.pointerId) return;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    resizeDrag.current = null;
    setSplitRatio((current) => {
      const next = clampEditorSideStackSplit(current);
      writeEditorSideStackSplit(workspaceId, next);
      return next;
    });
  }

  function startHorizontalResize(event: React.PointerEvent<HTMLDivElement>): void {
    if (!horizontalResize) return;
    horizontalResizeDrag.current = {
      pointerID: event.pointerId,
      startWidth: horizontalResize.value,
      startX: event.clientX
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function continueHorizontalResize(event: React.PointerEvent<HTMLDivElement>): void {
    const drag = horizontalResizeDrag.current;
    if (!horizontalResize || !drag || drag.pointerID !== event.pointerId) return;

    const min = horizontalResize.min ?? 320;
    const max = horizontalResize.max ?? 760;
    const nextWidth = Math.min(max, Math.max(min, Math.round(drag.startWidth + drag.startX - event.clientX)));
    horizontalResize.onChange(nextWidth);
  }

  function endHorizontalResize(event: React.PointerEvent<HTMLDivElement>): void {
    const drag = horizontalResizeDrag.current;
    if (!horizontalResize || !drag || drag.pointerID !== event.pointerId) return;

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }

    horizontalResizeDrag.current = null;
    const min = horizontalResize.min ?? 320;
    const max = horizontalResize.max ?? 760;
    const nextWidth = Math.min(max, Math.max(min, Math.round(drag.startWidth + drag.startX - event.clientX)));
    horizontalResize.onChange(nextWidth);
    horizontalResize.onCommit?.(nextWidth);
  }

  function resizeHorizontalBy(nextWidth: number): void {
    if (!horizontalResize) return;
    const min = horizontalResize.min ?? 320;
    const max = horizontalResize.max ?? 760;
    const clampedWidth = Math.min(max, Math.max(min, Math.round(nextWidth)));
    horizontalResize.onChange(clampedWidth);
    horizontalResize.onCommit?.(clampedWidth);
  }

  function handleHorizontalResizeKeyDown(event: React.KeyboardEvent<HTMLDivElement>): void {
    if (!horizontalResize) return;
    if (event.key === "ArrowLeft") {
      event.preventDefault();
      resizeHorizontalBy(horizontalResize.value + 16);
    } else if (event.key === "ArrowRight") {
      event.preventDefault();
      resizeHorizontalBy(horizontalResize.value - 16);
    } else if (event.key === "Home") {
      event.preventDefault();
      resizeHorizontalBy(horizontalResize.min ?? 320);
    } else if (event.key === "End") {
      event.preventDefault();
      resizeHorizontalBy(horizontalResize.max ?? 760);
    }
  }

  const navigatorRatio = clampEditorSideStackSplit(1 - splitRatio);

  return (
    <aside
      aria-label={ariaLabel}
      className={[
        "editor-side-stack",
        collapsed ? "is-collapsed" : "",
        collapseInspectorPane ? "inspector-pane-collapsed" : "",
        hideProjectPane ? "project-pane-hidden" : "",
        className
      ].filter(Boolean).join(" ")}
      ref={stackRef}
    >
      {horizontalResize ? (
        <div
          aria-label="Largura do inspetor"
          aria-orientation="vertical"
          aria-valuemax={horizontalResize.max ?? 760}
          aria-valuemin={horizontalResize.min ?? 320}
          aria-valuenow={horizontalResize.value}
          className="editor-side-stack-horizontal-resizer"
          onKeyDown={handleHorizontalResizeKeyDown}
          onPointerCancel={endHorizontalResize}
          onPointerDown={startHorizontalResize}
          onPointerMove={continueHorizontalResize}
          onPointerUp={endHorizontalResize}
          role="separator"
          tabIndex={0}
          title="Ajustar largura do inspetor"
        />
      ) : null}
      <button
        aria-expanded={!collapsed}
        aria-label={collapsed ? "Expandir painel lateral" : "Recolher painel lateral"}
        className="editor-side-stack-toggle"
        onClick={toggleCollapsed}
        title={collapsed ? "Expandir painel lateral" : "Recolher painel lateral"}
        type="button"
      >
        {collapsed ? (
          <ChevronLeft aria-hidden="true" size={14} strokeWidth={2.4} />
        ) : (
          <ChevronRight aria-hidden="true" size={14} strokeWidth={2.4} />
        )}
      </button>
      <div className="editor-side-stack-body">
        {collapseInspectorPane ? null : (
          <section
            aria-label="Inspector"
            className="editor-side-stack-pane editor-side-stack-inspector rooms-inspector inspector-readable"
            style={{ flexGrow: hideProjectPane ? 1 : splitRatio }}
          >
            {inspectorPane}
          </section>
        )}
        {collapseInspectorPane || hideProjectPane ? null : (
          <>
            <div
              aria-orientation="horizontal"
              aria-valuemax={100}
              aria-valuemin={0}
              aria-valuenow={Math.round(splitRatio * 100)}
              className="editor-side-stack-resizer"
              onPointerCancel={endResize}
              onPointerDown={startResize}
              onPointerMove={continueResize}
              onPointerUp={endResize}
              role="separator"
              title="Ajustar altura do inspector"
            />
            <section
              aria-label="Navegador do projeto"
              className="editor-side-stack-pane editor-side-stack-project editor-project-rail"
              style={{ flexGrow: navigatorRatio }}
            >
              {projectPane}
            </section>
          </>
        )}
        {collapseInspectorPane ? (
          <section
            aria-label="Navegador do projeto"
            className="editor-side-stack-pane editor-side-stack-project editor-project-rail"
            style={{ flexGrow: 1 }}
          >
            {projectPane}
          </section>
        ) : null}
      </div>
    </aside>
  );
}
