import { useCallback, useEffect, useState } from "react";
import { Check, Download, HardDrive, Languages, Trash2 } from "lucide-react";
import type { TranslationPackStatus } from "../shared/translationPacks.js";
import { translationPackSizeLabel } from "../shared/translationPacks.js";
import {
  downloadTranslationPack,
  getTranslationPackStatuses,
  invalidateTranslationPackStatuses,
  removeTranslationPack
} from "./translationPacks.js";

export function TranslationPacksPanel(): React.ReactElement {
  const [packs, setPacks] = useState<TranslationPackStatus[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyPackID, setBusyPackID] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setPacks(await getTranslationPackStatuses());
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  async function handleDownload(pack: TranslationPackStatus): Promise<void> {
    setBusyPackID(pack.id);
    setError(null);
    setFeedback(null);
    const result = await downloadTranslationPack(pack.id);
    setBusyPackID(null);
    if (!result.ok) {
      setError(result.error ?? "Não foi possível baixar o pacote.");
      return;
    }
    setFeedback(`${pack.label} está disponível offline.`);
    await refresh();
  }

  async function handleRemove(pack: TranslationPackStatus): Promise<void> {
    if (!window.confirm(`Remover o pacote offline de ${pack.label}? Ele poderá ser baixado novamente depois.`)) return;
    setBusyPackID(pack.id);
    setError(null);
    setFeedback(null);
    const result = await removeTranslationPack(pack.id);
    setBusyPackID(null);
    if (!result.ok) {
      setError(result.error ?? "Não foi possível remover o pacote.");
      return;
    }
    invalidateTranslationPackStatuses();
    setFeedback(`${pack.label} foi removido do cache offline.`);
    await refresh();
  }

  return (
    <section className="settings-translation-packs" aria-label="Pacotes de tradução offline">
      <div className="settings-translation-packs-heading">
        <span className="settings-translation-packs-icon" aria-hidden="true"><Languages size={17} strokeWidth={2.1} /></span>
        <div>
          <strong>Tradução offline</strong>
          <span>O Bergamot usa o pacote básico incluído e pacotes opcionais para outros idiomas.</span>
        </div>
      </div>
      <p className="settings-translation-packs-note">
        Baixe somente os idiomas que você precisa. Depois do download, a tradução funciona sem conexão.
      </p>
      {loading ? <p className="settings-translation-packs-message">Consultando pacotes disponíveis…</p> : null}
      {error ? <p className="settings-translation-packs-message error" role="alert">{error}</p> : null}
      {feedback ? <p className="settings-translation-packs-message success" role="status">{feedback}</p> : null}
      {!loading && !error ? (
        <div className="settings-translation-packs-list">
          {packs.map((pack) => {
            const busy = busyPackID === pack.id;
            return (
              <article className="settings-translation-pack-row" key={pack.id}>
                <div className="settings-translation-pack-copy">
                  <strong>{pack.label}</strong>
                  <span>{pack.description}</span>
                  <small>
                    {pack.languages.join(" · ")} · {pack.available ? translationPackSizeLabel(pack.sizeBytes) : "sem modelo publicado"}
                  </small>
                </div>
                <div className="settings-translation-pack-actions">
                  {pack.bundled ? (
                    <span className="settings-translation-pack-status included"><Check size={14} strokeWidth={2.4} />Incluído</span>
                  ) : pack.installed ? (
                    <>
                      <span className="settings-translation-pack-status installed"><HardDrive size={14} strokeWidth={2.1} />Offline</span>
                      <button disabled={busy} onClick={() => void handleRemove(pack)} type="button">
                        <Trash2 size={14} strokeWidth={2.1} />Remover
                      </button>
                    </>
                  ) : pack.available ? (
                    <button disabled={busy} onClick={() => void handleDownload(pack)} type="button">
                      <Download size={14} strokeWidth={2.1} />{busy ? "Baixando…" : `Baixar · ${translationPackSizeLabel(pack.sizeBytes)}`}
                    </button>
                  ) : (
                    <span className="settings-translation-pack-status unavailable">Indisponível</span>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
