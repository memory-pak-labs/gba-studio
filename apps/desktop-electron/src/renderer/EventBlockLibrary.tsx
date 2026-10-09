import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Clock, Search, Star, X } from "lucide-react";
import { filterEventsCommandSuggestions, type EventsWorkspaceCommandSuggestion } from "../shared/eventsWorkspace";
import { eventCommandCategory, eventCommandDescription } from "../shared/eventCommandMetadata";
import type { EventCommandMenuProps } from "./eventsWorkspace";

const favoritesKey = "gba-studio-event-favorites";
const recentKey = "gba-studio-event-recent";
type LibraryItem = EventsWorkspaceCommandSuggestion & { preferenceIDs: string[] };
function readPreference<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) ?? "null") ?? fallback; } catch { return fallback; }
}
function savePreference(key: string, value: unknown): void {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* Editing also works without local storage. */ }
}
function groups(item: EventsWorkspaceCommandSuggestion) {
  return (item.authoringCategories ?? [{ category: item.category, section: item.section }])
    .map(group => ({ ...group, category: eventCommandCategory(group.category) }));
}
/** Shared actions appear once in the picker while retaining their historical preference IDs. */
function libraryItems(suggestions: EventsWorkspaceCommandSuggestion[]): LibraryItem[] {
  const unique = new Map<string, LibraryItem>();
  for (const item of suggestions) {
    const key = item.id.startsWith("command:") ? `${item.commandTemplate}\n${item.command}\n${item.label}` : item.id;
    const previous = unique.get(key);
    if (!previous) { unique.set(key, { ...item, preferenceIDs: [item.id] }); continue; }
    previous.preferenceIDs.push(item.id);
    previous.isFavorite ||= item.isFavorite;
    previous.searchAliases = [...new Set([...(previous.searchAliases ?? []), ...(item.searchAliases ?? [])])];
    previous.authoringCategories = [...new Map([...groups(previous), ...groups(item)].map(group => [JSON.stringify(group), group])).values()];
  }
  return [...unique.values()];
}
function description(item: EventsWorkspaceCommandSuggestion): string {
  if (item.isRecipe) return `Insere uma sequência de ${item.steps?.length ?? 1} eventos para este comportamento.`;
  return eventCommandDescription(item.command.split(/\s+/)[0] ?? "") ?? `Ação: ${item.label}. Configure os valores no inspetor após adicionar.`;
}
function status(item: EventsWorkspaceCommandSuggestion): string {
  if (item.isRecipe) return "Modelo de script";
  if (item.runtimeStatus === "ok-rom") return "Disponível na ROM";
  if (item.runtimeStatus === "unsupported") return "Sem suporte na ROM";
  return "Somente preview";
}

export function EventBlockLibrary({ allowRecipes, event, contextLabel, stepIndex, query, tab, suggestions, onChangeQuery, onChangeTab, onChooseSuggestion, onClose }: EventCommandMenuProps): React.ReactElement {
  const dialogRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const returnFocusRef = useRef(document.activeElement as HTMLElement | null);
  const [category, setCategory] = useState<string | null>(null);
  const [shortcut, setShortcut] = useState<"all" | "favorites" | "recent">(tab === "favorites" ? "favorites" : "all");
  const [favoriteOverrides, setFavoriteOverrides] = useState<Record<string, boolean>>(() => {
    const stored = readPreference<unknown>(favoritesKey, {});
    return stored && typeof stored === "object" && !Array.isArray(stored)
      ? Object.fromEntries(Object.entries(stored).filter(([, value]) => typeof value === "boolean")) : {};
  });
  const [recentIDs, setRecentIDs] = useState<string[]>(() => {
    const stored = readPreference<unknown>(recentKey, []);
    return Array.isArray(stored) ? stored.filter((id): id is string => typeof id === "string") : [];
  });
  const [selectedID, setSelectedID] = useState<string | null>(null);
  const recipes = allowRecipes && tab === "recipes";
  const items = useMemo(() => libraryItems(suggestions), [suggestions]);
  const favorites = (item: LibraryItem): boolean => {
    const saved = item.preferenceIDs.map(id => favoriteOverrides[id]).filter(value => value !== undefined);
    return saved.length ? saved.some(Boolean) : item.isFavorite;
  };
  const filtered = filterEventsCommandSuggestions(items, { query, tab: recipes ? "recipes" : "all" })
    .filter(item => recipes ? item.isRecipe : !item.isRecipe)
    .map(item => item as LibraryItem)
    .filter(item => shortcut === "favorites" ? favorites(item) : shortcut === "recent" ? item.preferenceIDs.some(id => recentIDs.includes(id)) : true);
  const counts = new Map<string, number>();
  filtered.forEach(item => new Set(groups(item).map(group => group.category)).forEach(name => counts.set(name, (counts.get(name) ?? 0) + 1)));
  const categories = [...counts.entries()].sort(([left], [right]) => left.localeCompare(right, "pt-BR"));
  function itemGroup(item: LibraryItem) { return groups(item).find(group => !category || group.category === category)!; }
  const visible = filtered.filter(item => !category || groups(item).some(group => group.category === category))
    .sort((left, right) => {
      const a = itemGroup(left); const b = itemGroup(right);
      return a.category.localeCompare(b.category, "pt-BR") || (a.section ?? "").localeCompare(b.section ?? "", "pt-BR") || left.label.localeCompare(right.label, "pt-BR");
    });
  const selected = visible.find(item => item.id === selectedID) ?? visible[0] ?? null;
  const title = event ? `${stepIndex === null ? "Adicionar evento em" : "Trocar evento de"} ${event.name}` : `Escolher evento para ${contextLabel ?? "novo script"}`;

  useEffect(() => {
    searchRef.current?.focus();
    return () => { const previous = returnFocusRef.current; queueMicrotask(() => { if (previous?.isConnected) previous.focus(); }); };
  }, []);
  useEffect(() => { if (category && !counts.has(category)) setCategory(null); }, [category, categories.map(([name]) => name).join("\n")]);
  useEffect(() => { dialogRef.current?.querySelector<HTMLElement>(".event-library-result.is-selected")?.scrollIntoView?.({ block: "nearest" }); }, [selected?.id]);
  function choose(): void {
    if (!selected) return;
    const next = [selected.id, ...recentIDs.filter(id => !selected.preferenceIDs.includes(id))].slice(0, 20);
    setRecentIDs(next); savePreference(recentKey, next);
    onChooseSuggestion(selected);
  }
  function toggleFavorite(item: LibraryItem): void {
    const next = { ...favoriteOverrides };
    item.preferenceIDs.forEach(id => { next[id] = !favorites(item); });
    setFavoriteOverrides(next); savePreference(favoritesKey, next);
  }
  function keyDown(keyEvent: React.KeyboardEvent): void {
    if (keyEvent.key === "Escape") { keyEvent.preventDefault(); keyEvent.stopPropagation(); onClose(); return; }
    if (keyEvent.key === "Tab") {
      const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input, select, [tabindex="0"]') ?? []).filter(item => item.tabIndex >= 0 && !item.closest("[hidden]"));
      const first = controls[0]; const last = controls.at(-1);
      if (keyEvent.shiftKey && document.activeElement === first) { keyEvent.preventDefault(); last?.focus(); }
      else if (!keyEvent.shiftKey && document.activeElement === last) { keyEvent.preventDefault(); first?.focus(); }
    }
    const target = keyEvent.target as HTMLElement;
    if (!(target === searchRef.current || target.classList.contains("event-library-result")) || keyEvent.altKey || keyEvent.metaKey || keyEvent.ctrlKey) return;
    if (keyEvent.key === "ArrowDown" || keyEvent.key === "ArrowUp") {
      keyEvent.preventDefault(); keyEvent.stopPropagation();
      const current = visible.findIndex(item => item.id === selected?.id);
      const next = Math.max(0, Math.min(visible.length - 1, current + (keyEvent.key === "ArrowDown" ? 1 : -1)));
      setSelectedID(visible[next]?.id ?? null);
    } else if (keyEvent.key === "Enter") { keyEvent.preventDefault(); keyEvent.stopPropagation(); choose(); }
  }
  const menu = <div className="event-library-backdrop" onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
    <div aria-label={title} aria-modal="true" role="dialog" className="event-library" ref={dialogRef} onKeyDown={keyDown}>
      <header className="event-library-header"><div><strong>{stepIndex === null ? "Adicionar evento" : "Trocar evento"}</strong><small>{contextLabel ?? event?.name ?? "Novo script"}</small></div><button aria-label="Fechar biblioteca de eventos" onClick={onClose} type="button"><X size={16}/></button></header>
      <label className="event-library-search"><Search size={16}/><input aria-label="Buscar evento" placeholder="Buscar evento por nome ou ação" ref={searchRef} value={query} onChange={e => onChangeQuery(e.currentTarget.value)} type="search"/></label>
      <div className="event-library-tabs" role="tablist" aria-label="Tipo de item"><button role="tab" aria-selected={!recipes} onClick={() => { onChangeTab("all"); setCategory(null); setShortcut("all"); }} type="button">Eventos</button>{allowRecipes ? <button role="tab" aria-selected={recipes} onClick={() => { onChangeTab("recipes"); setCategory(null); setShortcut("all"); }} type="button">Modelos de script</button> : null}</div>
      <div className="event-library-body">
        <nav className="event-library-categories" aria-label="Categorias de eventos">
          <button type="button" aria-pressed={shortcut === "favorites"} onClick={() => { setShortcut(shortcut === "favorites" ? "all" : "favorites"); setCategory(null); }}><Star size={14}/>Favoritos</button>
          <button type="button" aria-pressed={shortcut === "recent"} onClick={() => { setShortcut(shortcut === "recent" ? "all" : "recent"); setCategory(null); }}><Clock size={14}/>Recentes</button>
          <hr/><button aria-pressed={!category && shortcut === "all"} type="button" onClick={() => { setCategory(null); setShortcut("all"); }}>Todos</button>
          {categories.map(([name,count]) => <button key={name} aria-pressed={category === name} type="button" onClick={() => setCategory(name)}><span>{name}</span><small>{count}</small></button>)}
        </nav>
        <section className="event-library-results" aria-label="Resultados da busca"><header><strong>{category ?? (shortcut === "all" ? recipes ? "Modelos de script" : "Eventos" : shortcut === "favorites" ? "Favoritos" : "Recentes")}</strong><small>{visible.length} itens</small></header>
          {visible.length ? visible.map((item, index) => {
            const group = itemGroup(item); const previous = index ? itemGroup(visible[index - 1]!) : null;
            const heading = !previous || group.category !== previous.category || group.section !== previous.section;
            return <div key={item.id}>{heading && (!category || group.section) ? <h3 className="event-library-group">{category ? group.section : `${group.category}${group.section ? ` · ${group.section}` : ""}`}</h3> : null}<div className="event-library-row"><button type="button" aria-label={item.label} aria-pressed={selected?.id === item.id} tabIndex={selected?.id === item.id ? 0 : -1} className={`event-library-result${selected?.id === item.id ? " is-selected" : ""}`} onClick={() => setSelectedID(item.id)}><strong>{item.label}{item.isExtension ? <span className="event-library-origin">GBA Studio</span> : null}</strong><small>{description(item)}</small></button><button className="event-library-star" type="button" aria-label={`${favorites(item) ? "Remover" : "Adicionar"} ${item.label} ${favorites(item) ? "dos" : "aos"} favoritos`} aria-pressed={favorites(item)} onClick={() => toggleFavorite(item)}><Star size={14} fill={favorites(item) ? "currentColor" : "none"}/></button></div></div>;
          }) : <p className="muted">Nenhum evento corresponde à busca.</p>}
        </section>
        <aside className="event-library-preview" aria-label="Descrição do evento">{selected ? <><header><strong>{selected.label}</strong><small className={`event-library-status is-${selected.runtimeStatus}`}>{status(selected)}</small>{selected.isExtension ? <small>Extensão GBA Studio</small> : null}</header><p>{description(selected)}</p>{selected.adaptation ? <p>{selected.adaptation}</p> : null}<strong>O que este evento configura</strong><dl>{selected.parameters.map(p => <div key={p.id}><dt>{p.label}</dt><dd>{p.options.length ? "Selecione um recurso ou valor." : "Valor definido no inspetor."}</dd></div>)}</dl>{selected.isRecipe ? <p>{selected.steps?.length ?? 1} eventos serão inseridos juntos.</p> : <p className="muted">Configure os valores no inspetor após adicionar.</p>}<details><summary>Detalhes técnicos</summary><code>{selected.commandTemplate ?? selected.command}</code></details></> : <p>Selecione um evento para conhecer a ação.</p>}</aside>
      </div>
      <footer className="event-library-footer"><small>{stepIndex !== null ? `Substituir evento ${stepIndex + 1}` : `Inserir em ${contextLabel ?? event?.name ?? "novo script"}`}<span>↑↓ escolher · Enter adicionar · Esc fechar</span></small><button type="button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={!selected} type="button" onClick={choose}>{stepIndex === null ? "Adicionar evento selecionado" : "Trocar evento selecionado"}</button></footer>
    </div>
  </div>;
  return createPortal(menu, document.body);
}
