import { useLayoutEffect, type RefObject } from "react";

const focusableSelector = 'button, input, select, textarea, a[href], summary, [tabindex], [contenteditable="true"]';

/** Isolate the active surface without keeping hidden workspaces interactive. */
export function useModalFocus(surfaceRef: RefObject<HTMLElement>, initialFocusRef: RefObject<HTMLElement>): void {
  useLayoutEffect(() => {
    const surface = surfaceRef.current;
    if (!surface) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const background: Array<{ element: HTMLElement; inert: string | null }> = [];
    let branch: HTMLElement = surface;
    while (branch.parentElement && branch.parentElement !== document.documentElement) {
      for (const sibling of branch.parentElement.children) {
        if (sibling instanceof HTMLElement && sibling !== branch) {
          background.push({ element: sibling, inert: sibling.getAttribute("inert") });
          sibling.setAttribute("inert", "");
        }
      }
      branch = branch.parentElement;
    }
    const controls = () => Array.from(surface.querySelectorAll<HTMLElement>(focusableSelector)).filter(element => {
      if (element.tabIndex < 0 || element.matches(":disabled") || element.closest("[hidden], [inert]")) return false;
      for (let node: HTMLElement | null = element; node && node !== surface; node = node.parentElement) {
        const style = getComputedStyle(node);
        if (style.display === "none" || style.visibility === "hidden") return false;
      }
      return true;
    });
    const focusInside = () => (initialFocusRef.current ?? controls()[0] ?? surface).focus({ preventScroll: true });
    const containTab = (event: KeyboardEvent) => {
      if (event.key !== "Tab") return;
      const items = controls();
      const first = items[0], last = items.at(-1);
      if (!first || !last) { event.preventDefault(); surface.focus(); return; }
      if (!surface.contains(document.activeElement) || (event.shiftKey ? document.activeElement === first : document.activeElement === last)) {
        event.preventDefault();
        (event.shiftKey ? last : first).focus();
      }
    };
    const containFocus = (event: FocusEvent) => {
      if (event.target instanceof Node && !surface.contains(event.target)) focusInside();
    };
    document.addEventListener("keydown", containTab, true);
    document.addEventListener("focusin", containFocus);
    focusInside();
    return () => {
      document.removeEventListener("keydown", containTab, true);
      document.removeEventListener("focusin", containFocus);
      for (const { element, inert } of background) {
        if (inert === null) element.removeAttribute("inert"); else element.setAttribute("inert", inert);
      }
      if (previousFocus?.isConnected && !previousFocus.closest("[inert]")) previousFocus.focus({ preventScroll: true });
    };
  }, [surfaceRef, initialFocusRef]);
}
