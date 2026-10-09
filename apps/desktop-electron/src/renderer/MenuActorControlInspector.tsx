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
  return (
    <section aria-label="Controle de menu do ator" className="room-menu-actor-control-inspector">
      <header>
        <div>
          <strong>Controle do menu</strong>
          <span>{menuActorRoleLabel(menuActorRole)} · {actorName}</span>
        </div>
        <span className="room-menu-actor-control-badge">Ator visual</span>
      </header>
      <p>
        Este ator compõe a arte do menu. A seleção e o comportamento são controlados pelo item lógico da tela,
        não pelos eventos de um fragmento individual.
      </p>
      {menuItem ? (
        <dl>
          <div><dt>Item</dt><dd>{menuItem.label}</dd></div>
          <div><dt>Partes visuais</dt><dd>{visualPartCount}</dd></div>
          <div><dt>Ação</dt><dd>{menuItem.action === "select" ? "Executar evento" : menuItem.action}</dd></div>
          <div><dt>Evento</dt><dd>{menuItem.eventName || "Sem evento"}</dd></div>
        </dl>
      ) : (
        <p className="room-menu-actor-control-empty">Este elemento não está associado a um item selecionável.</p>
      )}
      {menuItem?.eventName ? (
        <button onClick={() => onOpenEvent?.(menuItem.eventName)} type="button">
          Abrir evento do item
        </button>
      ) : null}
      <small>Use a aba Eventos da cena para configurar o evento desta opção. A montagem visual e a área de clique continuam na aba Cena.</small>
    </section>
  );
}
