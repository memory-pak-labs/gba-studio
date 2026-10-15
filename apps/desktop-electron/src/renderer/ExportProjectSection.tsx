import { uiText as ui, useStudioUiText } from "./studioUiText";
import { ChevronRight, CircleAlert, CircleCheck, Folder, FolderOpen, Hammer, Play, RotateCcw, Settings } from "lucide-react";
import type { ReactNode } from "react";
import type { GBAProjectData } from "../shared/projectFile";
import type { SettingsWorkspaceSection, SettingsEditableField } from "../shared/settingsWorkspace";
import type { ValidateSettingsPathsResult } from "../shared/ipc";
import { deriveSettingsSectionChangeSummary } from "../shared/settingsWorkspace";
import { exportRomOutputPath } from "../shared/exportSettingsLayout";

export function ExportSettingsHeader({ section, resetPending, onRequestReset, onCancelReset, onConfirmReset }: {
  section: SettingsWorkspaceSection; resetPending: boolean; onRequestReset(): void; onCancelReset(): void; onConfirmReset(): void;
}) {
  const ui = useStudioUiText();
  const changes = deriveSettingsSectionChangeSummary(section);
  return <>
    <header className="export-settings-header">
      <div><div className="export-settings-title"><h2>{ui(section.title)}</h2><span className="export-project-scope"><Folder size={18} aria-hidden="true" />{ui("Neste projeto")}</span></div><p>{ui(section.detail)}</p></div>
      {section.editableFields.some(field => !field.readOnly) ? <button aria-label={ui("Restaurar padrão de {0}", { 0: ui(section.title) })} onClick={onRequestReset} type="button"><RotateCcw size={17} aria-hidden="true" />{ui("Restaurar padrão")}</button> : null}
    </header>
    {resetPending ? <section className="settings-reset-confirmation" aria-label={ui("Confirmar restauração dos ajustes")}><strong>{ui("Restaurar ")}{ui(section.title)}?</strong><p>{changes.changedCount ? changes.changedFields.join(", ") : ui("Esta seção já usa os valores padrão.")}</p><div><button onClick={onCancelReset} type="button">{ui("Cancelar")}</button><button aria-label={ui("Confirmar restauração")} onClick={onConfirmReset} type="button">{ui("Restaurar")}</button></div></section> : null}
  </>;
}

export function ExportRomActions({ pathValidation, validating, running, onValidatePaths, onGenerateRom, onPlayProject, onShowPaths, generateDisabled, playDisabled }: {
  pathValidation: ValidateSettingsPathsResult | null; validating: boolean; running: boolean; onValidatePaths(): void; onGenerateRom?: () => void; onPlayProject?: () => void; onShowPaths?: () => void; generateDisabled: boolean; playDisabled: boolean;
}) {
  const ui = useStudioUiText();
  const StatusIcon = pathValidation?.ok ? CircleCheck : CircleAlert;
  return <div className="export-rom-footer">
    <div className={`export-path-status ${pathValidation?.ok ? "ok" : "warning"}`} role="status"><StatusIcon size={21} aria-hidden="true" /><span>{validating ? ui("Verificando caminhos...") : pathValidation ? pathValidation.ok ? ui("Caminhos verificados") : ui("Caminhos com pendências") : ui("Caminhos ainda não verificados")}</span>{pathValidation && onShowPaths ? <button onClick={onShowPaths} type="button">{ui("Ver detalhes")}</button> : null}</div>
    <div className="export-rom-actions" aria-label={ui("Exportação da ROM")}>
      <button disabled={validating || running} onClick={onValidatePaths} type="button"><FolderOpen size={20} aria-hidden="true" />{validating ? ui("Verificando...") : ui("Verificar caminhos")}</button>
      <button disabled={!onPlayProject || playDisabled} title={ui("Compila a versão atual do projeto e abre a ROM no Play integrado.")} onClick={onPlayProject} type="button"><Play size={19} aria-hidden="true" />{ui("Executar ROM")}</button>
      <button className="export-generate-rom" disabled={!onGenerateRom || generateDisabled} onClick={onGenerateRom} type="button"><Hammer size={20} aria-hidden="true" />{running ? ui("Gerando ROM...") : ui("Gerar ROM")}</button>
    </div>
  </div>;
}

export function ExportProjectSection({ section, projectData, renderField, header, footer }: {
  section: SettingsWorkspaceSection; projectData: GBAProjectData | null; renderField(field: SettingsEditableField): ReactNode; header: ReactNode; footer: ReactNode;
}) {
  const ui = useStudioUiText();
  const field = (key: string, label?: string) => { const found = section.editableFields.find(field => field.key === key); return found ? renderField(label ? { ...found, label } : found) : null; };
  return <section className="export-settings-page export-project-page" id="settings-section-general" aria-label={ui("Editar Projeto e ROM")}>
    {header}
    <section className="export-settings-block"><h3>{ui("Informações do jogo")}</h3><p>{ui("Identificação básica da sua ROM.")}</p><div className="export-project-fields"><div className="export-full-row">{field("gameTitle", "Título")}</div>{field("author")}{field("version", "Versão")}</div></section>
    <section className="export-settings-block"><h3>{ui("Início do jogo")}</h3><p>{ui("Escolha a cena que abre a ROM.")}</p><div className="export-project-fields">{field("startScene")}{field("startPlayer")}</div></section>
    <section className="export-settings-block export-output-block"><h3>{ui("Arquivo de saída")}</h3><p>{ui("Defina o nome e o destino da ROM.")}</p><div className="export-project-fields">{field("romFileName", "Nome da ROM")}<div>{field("exportFolder", "Pasta de exportação")}<small className="export-output-hint">{exportRomOutputPath(projectData)}</small></div></div></section>
    <details className="export-rom-advanced"><summary><Settings size={24} aria-hidden="true" /><span><strong>{ui("Dados avançados da ROM")}</strong><small>{ui("Código do jogo, fabricante e revisão")}</small></span><ChevronRight className="export-advanced-chevron" size={20} aria-hidden="true" /></summary><div className="settings-edit-list">{["gameCode", "makerCode", "romVersion"].map(key => field(key))}</div></details>
    {footer}
  </section>;
}
