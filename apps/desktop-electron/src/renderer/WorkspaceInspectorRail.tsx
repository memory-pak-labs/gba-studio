import { uiText as ui, useStudioUiText } from "./studioUiText";
import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import {
  readInspectorRailCollapsed,
  toggleInspectorRailCollapsed,
  writeInspectorRailCollapsed
} from "../shared/workspaceInspectorRail";

type WorkspaceInspectorRailProps = {
  ariaLabel: string;
  children: React.ReactNode;
  className?: string;
  collapsible?: boolean;
  collapseLabel?: string;
  expandLabel?: string;
  workspaceId: string;
};

export function WorkspaceInspectorRail({
  ariaLabel,
  children,
  className,
  collapsible = true,
  collapseLabel = "Recolher inspetor",
  expandLabel = "Expandir inspetor",
  workspaceId
}: WorkspaceInspectorRailProps): React.ReactElement {
  const ui = useStudioUiText();
  const [collapsed, setCollapsed] = useState(() => collapsible && readInspectorRailCollapsed(workspaceId));
  const isCollapsed = collapsible && collapsed;
  const toggleLabel = ui(isCollapsed ? expandLabel : collapseLabel);

  function toggleCollapsed(): void {
    setCollapsed((current) => {
      const next = toggleInspectorRailCollapsed(current);
      writeInspectorRailCollapsed(workspaceId, next);
      return next;
    });
  }

  return (
    <aside
      aria-label={ui(ariaLabel)}
      className={[
        "workspace-inspector-rail",
        "inspector-readable",
        isCollapsed ? "is-collapsed" : "",
        className
      ].filter(Boolean).join(" ")}
    >
      {collapsible ? (
        <button
          aria-expanded={!isCollapsed}
          aria-label={toggleLabel}
          className="workspace-inspector-rail-toggle"
          onClick={toggleCollapsed}
          title={toggleLabel}
          type="button"
        >
          {isCollapsed ? (
            <ChevronLeft aria-hidden="true" size={14} strokeWidth={2.4} />
          ) : (
            <ChevronRight aria-hidden="true" size={14} strokeWidth={2.4} />
          )}
        </button>
      ) : null}
      <div
        aria-label={ui("{0} conteúdo rolável", { 0: ui(ariaLabel) })}
        className="workspace-inspector-rail-body"
        data-scroll-owner="inspector"
        tabIndex={0}
      >
        {children}
      </div>
    </aside>
  );
}
