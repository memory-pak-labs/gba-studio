import { useEffect, useRef, type ReactNode } from "react";
import { ChevronDown } from "lucide-react";

/** A native disclosure with consistent dismissal and focus restoration. */
export function EditorPopover({ label, ariaLabel = label, icon, children, className = "", closeOnAction = false }: {
  label: string; ariaLabel?: string; icon?: ReactNode; children: ReactNode;
  className?: string; closeOnAction?: boolean;
}): React.ReactElement {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const dismiss = (event: PointerEvent) => {
      if (event.target instanceof Node && !ref.current?.contains(event.target)) ref.current?.removeAttribute("open");
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || !ref.current?.open) return;
      event.preventDefault();
      event.stopPropagation();
      ref.current.removeAttribute("open");
      ref.current.querySelector("summary")?.focus();
    };
    window.addEventListener("pointerdown", dismiss);
    window.addEventListener("keydown", escape, true);
    return () => {
      window.removeEventListener("pointerdown", dismiss);
      window.removeEventListener("keydown", escape, true);
    };
  }, []);
  return <details className={`editor-popover ${className}`} ref={ref}>
    <summary aria-label={ariaLabel}>{icon}<span>{label}</span><ChevronDown aria-hidden="true" size={12} /></summary>
    <div className="editor-popover-content" onClick={(event) => {
      if (!closeOnAction || !(event.target instanceof Element) || !event.target.closest("button")) return;
      ref.current?.removeAttribute("open");
      ref.current?.querySelector("summary")?.focus();
    }}>{children}</div>
  </details>;
}
