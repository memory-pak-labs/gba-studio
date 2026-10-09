import { useEffect, useRef, useState } from "react";

import {
  DEFAULT_PLUGIN_REPOSITORY_URL,
  type PluginRepository,
  type PluginRepositoryEntry
} from "../shared/gbaStudioPluginRepository";
import { deserializeProjectPluginRegistry, type ProjectPluginRegistry } from "../shared/gbaStudioPlugins";
import { StudioButton } from "./studioUi";
import { useStudioDialog } from "./studioDialog";

const PLUGIN_REPOSITORY_URL_STORAGE_KEY = "gba-studio.native-plugin-repository-url";

interface PluginCatalogModalProps {
  projectPath: string;
  onClose: () => void;
  onInstalled: (registry: ProjectPluginRegistry) => void;
  setStatus: (message: string) => void;
}

export function PluginCatalogModal({
  projectPath,
  onClose,
  onInstalled,
  setStatus
}: PluginCatalogModalProps): React.ReactElement {
  const { confirm } = useStudioDialog();
  const urlInput = useRef<HTMLInputElement>(null);
  const [repositoryURL, setRepositoryURL] = useState(() => (
    window.localStorage.getItem(PLUGIN_REPOSITORY_URL_STORAGE_KEY) ?? DEFAULT_PLUGIN_REPOSITORY_URL
  ));
  const [repository, setRepository] = useState<PluginRepository | null>(null);
  const [loading, setLoading] = useState(false);
  const [installingId, setInstallingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    urlInput.current?.focus();
    return () => previousFocus?.focus();
  }, []);

  async function loadRepository(): Promise<void> {
    const requestedURL = repositoryURL.trim();
    if (!requestedURL) return;
    setLoading(true);
    setError(null);
    setRepository(null);
    try {
      const result = await window.gbaStudio.fetchPluginRepository({ repositoryURL: requestedURL });
      if (!result.ok || !result.repository) {
        setError(result.error ?? "Falha ao carregar catálogo.");
        return;
      }
      window.localStorage.setItem(PLUGIN_REPOSITORY_URL_STORAGE_KEY, requestedURL);
      setRepository(result.repository);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Falha ao carregar catálogo.");
    } finally {
      setLoading(false);
    }
  }

  function changeRepositoryURL(value: string): void {
    setRepositoryURL(value);
    setRepository(null);
    setError(null);
    if (!value.trim()) window.localStorage.removeItem(PLUGIN_REPOSITORY_URL_STORAGE_KEY);
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  async function installEntry(entry: PluginRepositoryEntry): Promise<void> {
    const replacingExisting = await confirm(`Instalar ${entry.name}? Substituir se ja existir?`, {
      title: "Instalar plugin",
      confirmLabel: "Instalar"
    });
    if (!replacingExisting) return;
    setInstallingId(entry.id);
    const result = await window.gbaStudio.installPluginFromCatalog({
      projectPath,
      repositoryBaseURL: repositoryURL.trim(),
      entry,
      replacingExisting
    });
    setInstallingId(null);

    if (!result.ok || !result.registry) {
      setStatus(result.error ?? "Falha ao instalar plugin.");
      return;
    }

    onInstalled(deserializeProjectPluginRegistry(result.registry));
    setStatus(result.pluginId ? `Plugin instalado: ${result.pluginId}` : "Plugin instalado.");
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <section
        className="modal-card plugin-catalog-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="plugin-catalog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="modal-card-header">
          <div>
            <h2 id="plugin-catalog-title">Plugins para GBA Studio</h2>
            <p>Receba plugins criados para o GBA Studio por um catálogo da comunidade.</p>
          </div>
          <StudioButton className="ghost-button" onClick={onClose} type="button" variant="ghost">Fechar</StudioButton>
        </header>

        <div className="plugin-catalog-controls">
          <label className="studio-field">
            <span>URL do catálogo</span>
            <input
              ref={urlInput}
              className="ui-field"
              disabled={loading}
              value={repositoryURL}
              onChange={(event) => changeRepositoryURL(event.target.value)}
              placeholder="https://example.com/repository.json"
            />
          </label>
          <StudioButton disabled={loading || !repositoryURL.trim()} onClick={() => void loadRepository()} type="button" variant="secondary">
            {loading ? "Carregando..." : "Carregar catálogo"}
          </StudioButton>
        </div>

        {!repository && !error && !loading ? <div role="status">
          <p>{repositoryURL.trim() ? "Catálogo ainda não carregado." : "Nenhum catálogo configurado."}</p>
          <p>Ainda não há um catálogo padrão. Quando houver plugins para GBA Studio, informe a URL acima. Para instalar por pasta ou ZIP, use “Instalar plugin” no menu Projeto.</p>
        </div> : null}
        {error ? <p className="workspace-error" role="alert">{error}</p> : null}

        {repository ? (
          <div className="plugin-catalog-list">
            <p className="plugin-catalog-meta">{repository.name} · {repository.plugins.length} plugin(s)</p>
            {repository.plugins.length === 0 ? <p role="status">Este catálogo ainda não tem plugins.</p> : null}
            {repository.plugins.map((entry) => (
              <article key={entry.id} className="plugin-catalog-entry">
                <div>
                  <h3>{entry.name}</h3>
                  <p>{entry.description}</p>
                  <p className="plugin-catalog-entry-meta">
                    {entry.author} · v{entry.version} · {entry.type}
                  </p>
                </div>
                <StudioButton
                  disabled={installingId === entry.id}
                  onClick={() => void installEntry(entry)}
                  type="button"
                  variant="primary"
                >
                  {installingId === entry.id ? "Instalando..." : "Instalar"}
                </StudioButton>
              </article>
            ))}
          </div>
        ) : null}
      </section>
    </div>
  );
}
