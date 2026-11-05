import { useStudioUiText } from "./studioUiText";
import { useStudioLocale } from "./i18n";
import { useEffect, useRef, useState } from "react";
import { ChevronRight, Download, FolderOpen, RefreshCw, Usb } from "lucide-react";
import { CARTRIDGE_PROFILE, type CartridgeFirmware, type CartridgeOutcome, type CartridgePhase, type CartridgePort, type CartridgeProgress, type CartridgeReview, type CartridgeToolStatus } from "../shared/cartridgeWriter";
import type { ParsedGBAProject } from "../shared/projectFile";
import "./styles/cartridge-writer.css";

const PHASES: Record<CartridgePhase, string> = {
  building: "Compilando a versão atual do projeto…", checking: "Conferindo o gravador e o cartucho…",
  backup: "Criando e conferindo o backup do save…", ready: "ROM e backup prontos para revisão.",
  erase: "Apagando os setores da ROM…", write: "Gravando a ROM…", verify: "Verificando a ROM gravada…",
  "save-check": "Conferindo a preservação do save…", complete: "ROM gravada e verificada. Save preservado."
};
function size(bytes: number, locale: string): string { return `${(bytes / 1048576).toLocaleString(locale, { maximumFractionDigits: 2 })} MiB`; }

export function CartridgeWriterPanel({ project, projectPath, disabled = false }: {
  project: ParsedGBAProject | null; projectPath?: string; disabled?: boolean;
}): React.ReactElement {
  const ui = useStudioUiText();
  const locale = useStudioLocale();
  const api = window.gbaStudio?.cartridgeWriter;
  const [status, setStatus] = useState<CartridgeToolStatus | null>(null);
  const [ports, setPorts] = useState<CartridgePort[]>([]);
  const [port, setPort] = useState("");
  const [firmware, setFirmware] = useState<CartridgeFirmware>("stm");
  const [confirmedProfile, setConfirmedProfile] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<CartridgeProgress | null>(null);
  const [review, setReview] = useState<CartridgeReview | null>(null);
  const [outcome, setOutcome] = useState<CartridgeOutcome | null>(null);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const alive = useRef(true);
  const locked = busy || status?.busy === true;

  useEffect(() => {
    alive.current = true;
    if (!api) return;
    let timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      try {
        const next = await api.status();
        if (!alive.current) return;
        setStatus(next);
        if (next.progress) setProgress(next.progress);
        if (next.outcome) {
          setOutcome(next.outcome);
          if (!next.outcome.ok) setError(next.outcome.error ?? "A gravação não foi concluída.");
        }
        if (next.busy) timer = setTimeout(() => void refresh(), 1000);
      } catch (cause) { if (alive.current) setError(cause instanceof Error ? cause.message : String(cause)); }
    };
    void refresh();
    const unsubscribe = api.onProgress(event => { if (alive.current) setProgress(event); });
    return () => { alive.current = false; clearTimeout(timer); unsubscribe(); };
  }, [api]);

  useEffect(() => {
    generation.current += 1; setReview(null);
    void api?.discard().catch(() => {});
  }, [api, project?.data, projectPath, port, firmware, confirmedProfile]);

  async function perform(action: () => Promise<void>): Promise<void> {
    if (locked) return;
    setBusy(true); setError(null);
    try { await action(); } catch (cause) { if (alive.current) setError(cause instanceof Error ? cause.message : String(cause)); }
    finally { if (alive.current) { setBusy(false); setStatus(current => current ? { ...current, busy: false } : current); } }
  }
  async function detect(): Promise<void> {
    const result = await api!.detect();
    if (!alive.current) return;
    setPorts(result.ports); setPort(result.ports.find(p => p.available)?.port ?? ""); setReview(null);
    if (result.error) setError(result.error);
    else if (!result.ports.length) setError("Nenhum ChisFlash Burner encontrado. Conecte o cabo USB e feche outros programas que estejam usando o gravador.");
  }
  async function prepare(): Promise<void> {
    if (!api || !project || !projectPath || !port || !confirmedProfile) return;
    const revision = generation.current;
    setReview(null); setOutcome(null); setProgress({ phase: "building" });
    const result = await api.prepare({ project, projectPath, port, profileID: CARTRIDGE_PROFILE.id, firmware });
    if (!alive.current || revision !== generation.current) { await api.discard(); return; }
    if (result.ok && result.review) setReview(result.review);
    else { setOutcome(result); setError(result.error ?? "Não foi possível preparar a gravação."); }
  }
  async function write(): Promise<void> {
    if (!api || !review) return;
    const token = review.token;
    setReview(null); setOutcome(null); setProgress({ phase: "checking" });
    const result = await api.write(token);
    if (!alive.current) return;
    setOutcome(result);
    if (!result.ok) setError(result.error ?? "A gravação não foi concluída.");
  }
  const fraction = progress?.total && progress.done !== undefined ? Math.min(100, Math.max(0, progress.done / progress.total * 100)) : undefined;
  const backupPath = review?.backupPath ?? outcome?.backupPath;

  return <details className="cartridge-writer">
    <summary><Usb size={22} aria-hidden="true" /><span><strong>{ui("Gravar cartucho")}</strong><small>{ui("Envie seu jogo para um ChisFlash Burner conectado por USB.")}</small></span><ChevronRight className="cartridge-chevron" size={20} aria-hidden="true" /></summary>
    <div className="cartridge-writer-content">
      <p>{ui("O GBA Studio compila o projeto, cria um backup do save e verifica a ROM depois da gravação.")}</p>
      {!api ? <p role="status">{ui("A gravação de cartuchos está disponível no aplicativo desktop.")}</p> : !status ? <p role="status">{ui("Consultando suporte ao gravador…")}</p> : <>
        {!status.installed ? <div className="cartridge-install"><p>{ui("Instale o suporte uma vez. Depois, a gravação funciona offline.")}</p><button disabled={locked || !status.supported} onClick={() => void perform(async () => { const next = await api.install(); if (alive.current) { setStatus(next); if (next.error) setError(next.error); } })} type="button"><Download size={17} aria-hidden="true" />{ui("Instalar suporte ChisFlash · 3 MB")}</button>{status.error ? <p role="status">{ui(status.error)}</p> : null}</div> : <>
          <div className="cartridge-device-row"><label>{ui("Modelo do gravador")}<select disabled={locked} value={firmware} onChange={event => setFirmware(event.target.value as CartridgeFirmware)}><option value="stm">{ui("ChisFlash Burner · STM")}</option><option value="stc8">{ui("ChisFlash Burner · STC8")}</option></select></label><label>{ui("Gravador USB")}<select disabled={locked} value={port} onChange={event => setPort(event.target.value)}><option value="">{ui("Selecione o gravador")}</option>{ports.map(p => <option key={p.port} value={p.port} disabled={!p.available}>{p.name} · {p.port}{p.available ? "" : ui(" · ocupado")}</option>)}</select></label><button type="button" disabled={locked} onClick={() => void perform(detect)}><RefreshCw size={17} aria-hidden="true" />{ui("Buscar gravadores")}</button></div>
          <label className="cartridge-profile"><input type="checkbox" checked={confirmedProfile} disabled={locked} onChange={event => setConfirmedProfile(event.target.checked)} /><span>{ui("Meu cartucho é um ")}<strong>{CARTRIDGE_PROFILE.label}</strong>{ui(", com ROM de 32 MiB.")}</span></label>
          <p className="cartridge-note">{ui("Esta primeira versão atende esse perfil. GBxCart RW e outros cartuchos ainda não estão disponíveis aqui.")}</p>
          {!projectPath ? <p>{ui("Salve o projeto antes de preparar a gravação.")}</p> : null}
          <button disabled={locked || disabled || !projectPath || !project || !port || !confirmedProfile} onClick={() => void perform(prepare)} type="button">{ui("Preparar ROM e backup")}</button>
        </>}
        {locked ? <div className="cartridge-progress" role="status" aria-live="polite"><strong>{progress ? ui(PHASES[progress.phase]) : ui("Aguarde…")}</strong><progress aria-label={ui("Progresso da gravação")} max={100} value={fraction} /><p>{ui("Mantenha o cartucho e o cabo conectados. Aguarde a conclusão antes de fechar o aplicativo.")}</p></div> : null}
        {review && !locked ? <section className="cartridge-review" aria-label={ui("Revisão da gravação")}><h4>{ui("Confira antes de gravar")}</h4><dl><dt>{ui("Cartucho")}</dt><dd>{review.profile}</dd><dt>{ui("ROM")}</dt><dd>{ui("{0} de {1}", { 0: size(review.romBytes, locale), 1: size(review.capacityBytes, locale) })}</dd><dt>{ui("Chip")}</dt><dd>{review.chipID}</dd><dt>{ui("SHA-256 da ROM")}</dt><dd><code>{review.romSha256}</code></dd><dt>{ui("Save")}</dt><dd>{ui("Backup de 128 KiB confirmado por duas leituras.")}</dd></dl><p>{ui("A gravação substitui o jogo que está no cartucho. A revisão vale por 10 minutos.")}</p><div className="cartridge-review-actions"><button type="button" onClick={() => { setReview(null); void api.discard(); }}>{ui("Cancelar")}</button><button type="button" className="cartridge-write-button" onClick={() => void perform(write)}>{ui("Substituir ROM e gravar cartucho")}</button></div></section> : null}
        {error ? <p role="alert" className="cartridge-error">{ui(error)}</p> : null}
        {outcome?.ok ? <p role="status" className="cartridge-success">{ui("ROM gravada e verificada. Os 128 KiB do save foram preservados. Teste o jogo e o save no GBA físico.")}</p> : null}
        {backupPath ? <button type="button" disabled={locked} onClick={() => void window.gbaStudio.revealPath(backupPath)}><FolderOpen size={17} aria-hidden="true" />{ui("Mostrar backup do save")}</button> : null}
        <small className="cartridge-note">{ui("Componente opcional cfb ")}{status.version}{ui(" · GPLv3. Origem e licença: eyenobig/chis-burner-cmd no GitHub.")}</small>
      </>}
    </div>
  </details>;
}
