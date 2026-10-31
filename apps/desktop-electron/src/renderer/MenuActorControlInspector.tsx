import { uiText as ui, useStudioUiText } from "./studioUiText";
import type { MenuSceneItem } from "../shared/menuScene";

export interface MenuActorControlInspectorProps {
  actorName: string;
  menuActorRole: string | null;
  menuItem: MenuSceneItem | null;
  visualPartCount: number;
  onOpenEvent?(eventName: string): void;
}

function menuActorRoleLabel(role: string | null): string {
  if (role === "option") return "Parte visual de uma opção";
  if (role === "cursor") return "Cursor visual";
  if (role === "title") return "Título visual";
  return "Elemento visual";
}

export function MenuActorControlInspector({
  actorName,
  menuActorRole,
  menuItem,
  visualPartCount,
  onOpenEvent
}: MenuActorControlInspectorProps): React.ReactElement {
  const ui = useStudioUiText();
  return (
    <section aria-label={ui("Controle de menu do ator")} className="room-menu-actor-control-inspector">
      <header>
        <div>
          <strong>{ui("Controle do menu")}</strong>
          <span>{menuActorRoleLabel(menuActorRole)} · {actorName}</span>
        </div>
        <span className="room-menu-actor-control-badge">{ui("Ator visual")}</span>
      </header>
      <p>
        {ui("Este ator compõe a arte do menu. A seleção e o comportamento são controlados pelo item lógico da tela, não pelos eventos de um fragmento individual.")}</p>
      {menuItem ? (
        <dl>
          <div><dt>{ui("Item")}</dt><dd>{ui(menuItem.label)}</dd></div>
          <div><dt>{ui("Partes visuais")}</dt><dd>{visualPartCount}</dd></div>
          <div><dt>{ui("Ação")}</dt><dd>{menuItem.action === "select" ? ui("Executar evento") : menuItem.action}</dd></div>
          <div><dt>{ui("Evento")}</dt><dd>{menuItem.eventName || ui("Sem evento")}</dd></div>
        </dl>
      ) : (
        <p className="room-menu-actor-control-empty">{ui("Este elemento não está associado a um item selecionável.")}</p>
      )}
      {menuItem?.eventName ? (
        <button onClick={() => onOpenEvent?.(menuItem.eventName)} type="button">
          {ui("Abrir evento do item")}</button>
      ) : null}
      <small>{ui("Use a aba Eventos da cena para configurar o evento desta opção. A montagem visual e a área de clique continuam na aba Cena.")}</small>
    </section>
  );
}
