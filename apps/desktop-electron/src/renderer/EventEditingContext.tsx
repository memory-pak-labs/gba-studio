import { createContext } from "react";

export const EventEditingContext = createContext<{
  name: string;
  activeKey: string;
  states: Array<{ key: string; label: string }>;
  onSelectState(key: string): void;
  expandedHost?: HTMLElement | null;
  onChangeExpandedHost?(host: HTMLElement | null): void;
} | null>(null);
