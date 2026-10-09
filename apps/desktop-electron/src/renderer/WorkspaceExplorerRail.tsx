import { useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

import {
  readExplorerRailCollapsed,
  toggleExplorerRailCollapsed,
  writeExplorerRailCollapsed
} from "../shared/workspaceExplorerRail";

type WorkspaceExplorerRailProps = {
  ariaLabel: string;
  children: React.ReactNode;
  className?: string;
  collapseLabel?: string;
  expandLabel?: string;
  workspaceId: string;
};

export function WorkspaceExplorerRail({
  ariaLabel,
  children,
  className,
  collapseLabel = "Recolher navegador",
  expandLabel = "Expandir navegador",
  workspaceId
}: WorkspaceExplorerRailProps): React.ReactElement {
  const [collapsed, setCollapsed] = useState(() => readExplorerRailCollapsed(workspaceId));
  const toggleLabel = collapsed ? expandLabel : collapseLabel;

  function toggleCollapsed(): void {
    setCollapsed((current) => {
      const next = toggleExplorerRailCollapsed(current);
      writeExplorerRailCollapsed(workspaceId, next);
      return next;
    });
  }

  return (
    <aside
      aria-label={ariaLabel}
      className={[
        "workspace-explorer-rail",
        collapsed ? "is-collapsed" : "",
        className
      ].filter(Boolean).join(" ")}
    >
      <button
        aria-expanded={!collapsed}
        aria-label={toggleLabel}
        className="workspace-explorer-rail-toggle"
        onClick={toggleCollapsed}
        title={toggleLabel}
        type="button"
      >
        {collapsed ? (
          <ChevronRight aria-hidden="true" size={14} strokeWidth={2.4} />
        ) : (
          <ChevronLeft aria-hidden="true" size={14} strokeWidth={2.4} />
        )}
      </button>
      <div className="workspace-explorer-rail-body">
        {children}
      </div>
    </aside>
  );
}
