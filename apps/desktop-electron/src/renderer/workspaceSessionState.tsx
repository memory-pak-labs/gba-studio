import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState, type DependencyList, type EffectCallback, type ReactNode, type RefObject } from "react";

type WorkspaceState = Map<string, unknown>;
const SessionContext = createContext<Map<string, WorkspaceState> | null>(null);
const StateContext = createContext<WorkspaceState | null>(null);

/** UI memory only: no project mutation, storage writes, or mounted background editors. */
export function WorkspaceSessionProvider({ children }: { children: ReactNode }) {
  const sessions = useRef(new Map<string, WorkspaceState>());
  return <SessionContext.Provider value={sessions.current}><WorkspaceSessionScope projectKey="session">{children}</WorkspaceSessionScope></SessionContext.Provider>;
}

export function WorkspaceSessionScope({ projectKey, children }: { projectKey: string; children: ReactNode }) {
  const sessions = useContext(SessionContext);
  const fallback = useRef<WorkspaceState>(new Map());
  let state = sessions?.get(projectKey);
  if (!state) { state = sessions ? new Map() : fallback.current; sessions?.set(projectKey, state); }
  return <StateContext.Provider key={projectKey} value={state}>{children}</StateContext.Provider>;
}

export function useWorkspaceState<T>(key: string, initial: T | (() => T)) {
  const cache = useContext(StateContext);
  const state = useState<T>(() => cache?.has(key) ? cache.get(key) as T : typeof initial === "function" ? (initial as () => T)() : initial);
  useLayoutEffect(() => { cache?.set(key, state[0]); }, [cache, key, state[0]]);
  return state;
}

export function useWorkspaceRef<T>(key: string, initial: T) {
  const cache = useContext(StateContext);
  const local = useRef(initial);
  if (!cache) return local;
  if (!cache.has(key)) cache.set(key, local);
  return cache.get(key) as typeof local;
}

/** Reset dependent UI only when its selection changes, never merely on remount. */
export function useWorkspaceChangeEffect(effect: EffectCallback, dependencies: DependencyList): void {
  const previous = useRef(dependencies);
  useEffect(() => {
    if (dependencies.every((value, index) => Object.is(value, previous.current[index]))) return;
    previous.current = dependencies;
    return effect();
  }, dependencies);
}

type ScrollPosition = { left: number; top: number };
export function WorkspaceScrollMemory({ rootRef, workspace }: { rootRef: RefObject<HTMLElement>; workspace: string }) {
  const cache = useContext(StateContext);
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !cache) return;
    const key = `scroll.${workspace}`;
    const positions = cache.get(key) as Record<string, ScrollPosition> | undefined ?? {};
    let restoring = true;
    const elementKeys = new WeakMap<HTMLElement, string>();
    const scrollKey = (element: HTMLElement) => {
      if (element.dataset.workspaceScroll) return element.dataset.workspaceScroll;
      const known = elementKeys.get(element);
      if (known) return known;
      const className = element.classList[0];
      if (!className) return null;
      const siblings = Array.from(root.querySelectorAll(`.${CSS.escape(className)}`));
      const name = `@class:${className}:${siblings.indexOf(element)}`;
      elementKeys.set(element, name);
      return name;
    };
    const remember = (event: Event) => {
      const target = event.target;
      if (restoring || !(target instanceof HTMLElement)) return;
      const name = scrollKey(target);
      if (!name) return;
      positions[name] = { left: target.scrollLeft, top: target.scrollTop };
      cache.set(key, positions);
    };
    const restore = () => {
      for (const element of [root, ...root.querySelectorAll<HTMLElement>("[data-workspace-scroll]")]) {
        const saved = positions[element.dataset.workspaceScroll ?? ""];
        if (saved) { element.scrollLeft = saved.left; element.scrollTop = saved.top; }
      }
      // Nested editors own additional scrollers. Resolve only previously used
      // class paths, rather than scanning/measuring thousands of map/note cells.
      for (const [name, saved] of Object.entries(positions)) {
        const match = /^@class:(.*):(\d+)$/.exec(name);
        if (!match) continue;
        const element = root.querySelectorAll<HTMLElement>(`.${CSS.escape(match[1])}`)[Number(match[2])];
        if (element) { element.scrollLeft = saved.left; element.scrollTop = saved.top; }
      }
      restoring = false;
    };
    // Run after the canvas's initial fit/focus frame; mounted editors still stop on exit.
    let secondFrame = 0;
    const frame = requestAnimationFrame(() => { secondFrame = requestAnimationFrame(restore); });
    root.addEventListener("scroll", remember, true);
    return () => {
      cancelAnimationFrame(frame); cancelAnimationFrame(secondFrame);
      root.removeEventListener("scroll", remember, true);
    };
  }, [cache, rootRef, workspace]);
  return null;
}
