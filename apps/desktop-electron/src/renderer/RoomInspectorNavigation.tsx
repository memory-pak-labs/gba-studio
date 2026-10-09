import type { RoomInspectorTab, RoomInspectorTabID } from "../shared/roomInspectorTabs";
import { EditorPopover } from "./EditorPopover";

export function RoomInspectorNavigation({ title, tabs, activeTab, onSelect }: {
  title: string; tabs: RoomInspectorTab[]; activeTab: RoomInspectorTabID | null;
  onSelect(tab: RoomInspectorTabID): void;
}): React.ReactElement {
  const primary = tabs.filter((tab) => tab.id === "events" || tab.id === "hud" || tab.id === "actor"
    || tab.id === "trigger" || tab.id === "connection" || tab.id === "collision"
    || tab.id === "scene" && !tabs.some((item) => item.id === "actor" || item.id === "trigger" || item.id === "connection"));
  const secondary = tabs.filter((tab) => !primary.includes(tab));
  const selectedSecondary = secondary.find((tab) => tab.id === activeTab);
  const button = (tab: RoomInspectorTab) => <button
    aria-controls={`rooms-inspector-panel-${tab.id}`} aria-selected={activeTab === tab.id}
    className={activeTab === tab.id ? "active" : ""} id={`rooms-inspector-tab-${tab.id}`}
    key={tab.id} onClick={() => onSelect(tab.id)} role="tab" type="button" title={tab.label}
  >{tab.label}</button>;
  return <div aria-label={`Seções de ${title}`} className="rooms-inspector-tabs" role="tablist">
    {primary.map(button)}
    {secondary.length ? <EditorPopover label={selectedSecondary?.label ?? "Mais"} ariaLabel="Mais seções do inspetor"
      className={`rooms-inspector-more${selectedSecondary ? " is-active" : ""}`} closeOnAction>
      {secondary.map(button)}
    </EditorPopover> : null}
  </div>;
}
