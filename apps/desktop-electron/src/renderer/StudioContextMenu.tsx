import { useEffect, useRef } from "react";

export interface StudioContextMenuState {
  x: number;
  y: number;
  label: string;
}

export interface StudioContextMenuAction {
  label: string;
  onSelect(): void | Promise<void>;
  danger?: boolean;
}

interface StudioContextMenuProps {
  state: StudioContextMenuState;
  actions: StudioContextMenuAction[];
  onClose(): void;
}

export function StudioContextMenu({ state, actions, onClose }: StudioContextMenuProps): React.ReactElement {
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const firstAction = menuRef.current?.querySelector<HTMLButtonElement>("button");
    firstAction?.focus();

    const handleKeyDown = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if ((event.key !== "ArrowDown" && event.key !== "ArrowUp") || actions.length === 0) return;
      const buttons = Array.from(menuRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? []);
      const currentIndex = buttons.indexOf(document.activeElement as HTMLButtonElement);
      const direction = event.key === "ArrowDown" ? 1 : -1;
      const nextIndex = currentIndex < 0
        ? direction > 0 ? 0 : buttons.length - 1
        : (currentIndex + direction + buttons.length) % buttons.length;
      event.preventDefault();
      buttons[nextIndex]?.focus();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [actions.length, onClose]);

  const menuWidth = 188;
  const menuHeight = Math.max(8, actions.length * 34 + 12);
  const menuLeft = Math.max(8, Math.min(state.x, window.innerWidth - menuWidth - 8));
  const menuTop = Math.max(8, Math.min(state.y, window.innerHeight - menuHeight - 8));

  return (
    <div
      className="studio-context-menu-backdrop"
      onContextMenu={(event) => event.preventDefault()}
      onPointerDown={onClose}
      role="presentation"
    >
      <div
        aria-label={`Ações para ${state.label}`}
        className="studio-context-menu"
        onPointerDown={(event) => event.stopPropagation()}
        ref={menuRef}
        role="menu"
        style={{ left: `${menuLeft}px`, top: `${menuTop}px` }}
      >
        {actions.map((action) => (
          <button
            className={action.danger ? "danger" : undefined}
            key={action.label}
            onClick={() => {
              onClose();
              void action.onSelect();
            }}
            role="menuitem"
            type="button"
          >
            {action.label}
          </button>
        ))}
      </div>
    </div>
  );
}
