import {
  Archive,
  AudioLines,
  Map as MapIcon,
  MapPinned,
  MessageSquare,
  PanelsTopLeft,
  PackageOpen,
  PersonStanding,
  Settings as SettingsIcon,
  type LucideIcon
} from "lucide-react";

export const workspaceNames = ["Editor", "Cenas", "Sprites", "Dialogos", "Audio", "Arquivos", "Exportar", "Ajustes"] as const;
export type WorkspaceName = "Editor" | "Cenas" | "Sprites" | "Dialogos" | "Audio" | "Arquivos" | "Exportar" | "Ajustes";

export const workspaceIcons: Record<WorkspaceName, LucideIcon> = {
  Editor: MapIcon,
  Cenas: MapPinned,
  Sprites: PersonStanding,
  Dialogos: MessageSquare,
  Audio: AudioLines,
  Arquivos: Archive,
  Exportar: PackageOpen,
  Ajustes: SettingsIcon
};
