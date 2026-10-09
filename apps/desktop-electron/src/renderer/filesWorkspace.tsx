import { AlertTriangle, Boxes, Check, CheckCircle2, ChevronDown, FileImage, Grid3X3, Image, MessageSquare, MoreHorizontal, Package, Search, UserRound, Folder, FolderOpen, List, LayoutGrid, Replace, ExternalLink, Type } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  deriveFilesWorkspaceFilterChips,
  deriveFilesWorkspaceFolders,
  filterFilesWorkspaceAssets,
  type FilesWorkspaceAsset,
  type FilesWorkspaceName,
  type FilesWorkspacePresentation,
  type FilesWorkspaceUsageFilter,
} from "../shared/filesWorkspace";
import { isDesktopAssetURL, resolveAssetURL } from "../shared/spriteAssetURL";
import type { AssetPipelineStageStatus, InspectAssetFileResult } from "../shared/ipc";
import { useStudioI18n, workspaceLabelKey, type StudioTranslationKey } from "./i18n";
import { WorkspaceEmptyState, StudioButton, StudioChip } from "./studioUi";
import { StudioContextMenu, type StudioContextMenuAction, type StudioContextMenuState } from "./StudioContextMenu";

interface AssetContextMenuState extends StudioContextMenuState {
  assetID: string;
}

export interface FilesWorkspaceOpenRequest {
  assetID: string;
  assetName: string;
  kind: string;
  label: string;
  requestID: number;
  targetID?: string;
  targetName?: string;
  usageKind?: string;
  workspace: FilesWorkspaceName;
}

interface FilesWorkspaceProps {
  advancedTools?: ReactNode;
  assetRefreshToken?: number;
  presentation: FilesWorkspacePresentation | null;
  projectPath?: string;
  onBatchConvertAssets(assetIDs: string[], kind: string): void;
  onBatchMoveAssets(assetIDs: string[], groupID: string | null): void;
  onBatchRemoveAssets(assetIDs: string[]): void;
  onBatchRenameAssets(assetIDs: string[]): void;
  onImportAssets(): void;
  onImportGifAnimation?(): void;
  onRenameAsset(assetID: string, currentName: string): void;
  onRemoveAsset(assetID: string, currentName: string): void;
  onDuplicateAsset(assetID: string, currentName: string): void;
  onRevealAsset(source: string | null): void;
  onRepairReferences(): void;
  onReplaceAsset(assetID: string, currentName: string): void;
  onOpenAssetWorkspace(request: FilesWorkspaceOpenRequest): void;
}

export function FilesWorkspace({
  advancedTools,
  assetRefreshToken = 0,
  presentation,
  projectPath,
  onBatchConvertAssets,
  onBatchMoveAssets,
  onBatchRemoveAssets,
  onBatchRenameAssets,
  onImportAssets,
  onImportGifAnimation,
  onRenameAsset,
  onRemoveAsset,
  onDuplicateAsset,
  onRevealAsset,
  onRepairReferences,
  onReplaceAsset,
  onOpenAssetWorkspace
}: FilesWorkspaceProps): React.ReactElement {
  const { t } = useStudioI18n();
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedKind, setSelectedKind] = useState("");
  const [usageFilter, setUsageFilter] = useState<FilesWorkspaceUsageFilter>("all");
  const [viewMode, setViewMode] = useState<"list" | "grid">("grid");
  const [selectedFolder, setSelectedFolder] = useState("");
  const [selectionMode, setSelectionMode] = useState(false);
  const [previewZoom, setPreviewZoom] = useState<"fit" | 1 | 2>("fit");
  const [technicalOpen, setTechnicalOpen] = useState(false);
  const [fileInfoFailed, setFileInfoFailed] = useState(false);
  const [commandMenu, setCommandMenu] = useState<{ state: StudioContextMenuState; actions: StudioContextMenuAction[] } | null>(null);
  const menuTriggerRef = useRef<HTMLButtonElement | null>(null);
  const closeCommandMenu = useCallback(() => {
    setCommandMenu(null);
    menuTriggerRef.current?.focus();
  }, []);
  const [selectedAssetID, setSelectedAssetID] = useState<string | null>(null);
  const [selectedAssetIDs, setSelectedAssetIDs] = useState<Set<string>>(() => new Set());
  const [contextMenu, setContextMenu] = useState<AssetContextMenuState | null>(null);
  const [collapsedGroupIDs, setCollapsedGroupIDs] = useState<Set<string>>(() => new Set());
  const [previewLoadFailed, setPreviewLoadFailed] = useState(false);
  const [activeFileInfo, setActiveFileInfo] = useState<InspectAssetFileResult | null>(null);
  const openRequestSequence = useRef(0);
  const visibleAssets = useMemo(
    () => filterFilesWorkspaceAssets(presentation?.assets ?? [], { query: searchQuery, kind: selectedKind, folder: selectedFolder, usage: usageFilter }),
    [presentation?.assets, searchQuery, selectedKind, selectedFolder, usageFilter]
  );
  const visibleAssetGroups = useMemo(() => {
    const groups = groupFilesWorkspaceAssetsForRail(visibleAssets, t);
    return groups.filter((group) => group.assets.length > 0);
  }, [searchQuery, selectedKind, usageFilter, visibleAssets, t]);
  const filterChips = useMemo(
    () => presentation ? deriveFilesWorkspaceFilterChips(presentation, { kind: selectedKind, usage: usageFilter }) : null,
    [presentation, selectedKind, usageFilter]
  );
  const categoryChips = useMemo(() => {
    const priority = (kind: string): number => {
      if (!kind) return 0;
      const id = assetRailCategoryID(kind);
      if (id === "backgrounds") return 1;
      if (id === "sprites") return 2;
      if (id === "dialog-ui") return 3;
      if (["font", "fonte"].includes(normalizedAssetKind(kind))) return 4;
      return 5;
    };
    return [...(filterChips?.kind ?? [])].sort((a, b) => priority(a.value) - priority(b.value));
  }, [filterChips]);
  const activeAsset =
    visibleAssets.find((asset) => asset.id === selectedAssetID) ??
    visibleAssetGroups[0]?.assets[0] ??
    null;
  const activeAssetPreviewURL = useMemo(() => {
    return assetPreviewURL(activeAsset, projectPath, assetRefreshToken);
  }, [activeAsset, assetRefreshToken, projectPath]);
  const activeUsageSummary = useMemo(() => activeAsset ? summarizeAssetUsage(activeAsset, t) : [], [activeAsset, t]);
  const sourceFolders = useMemo(() => deriveFilesWorkspaceFolders(presentation?.assets ?? []), [presentation?.assets]);
  const galleryTitle = selectedFolder ? selectedFolder.split("/").at(-1) : selectedKind ? categoryLabel(selectedKind, t) : t("files.navigation.all");
  const openCommandMenu = (event: React.MouseEvent<HTMLButtonElement>, label: string, actions: StudioContextMenuAction[]): void => {
    menuTriggerRef.current = event.currentTarget;
    const bounds = event.currentTarget.getBoundingClientRect();
    setCommandMenu({ state: { label, x: bounds.right - 188, y: bounds.bottom + 4 }, actions });
  };
  useEffect(() => {
    setPreviewLoadFailed(false);
    setPreviewZoom("fit");
    setTechnicalOpen(false);
  }, [activeAssetPreviewURL, activeAsset?.id]);
  useEffect(() => {
    let canceled = false;
    setFileInfoFailed(false);
    if (!projectPath || !activeAsset?.source) {
      setActiveFileInfo(null);
      return () => { canceled = true; };
    }
    setActiveFileInfo(null);
    void window.gbaStudio.inspectAssetFile({ projectPath, source: activeAsset.source, assetID: activeAsset.id, ...(activeAsset.colorMode ? { colorMode: activeAsset.colorMode } : {}) }).then((info) => {
      if (!canceled) setActiveFileInfo(info);
    }).catch(() => {
      if (!canceled) setFileInfoFailed(true);
    });
    return () => { canceled = true; };
  }, [activeAsset?.id, activeAsset?.source, activeAsset?.colorMode, assetRefreshToken, projectPath]);
  useEffect(() => {
    const validIDs = new Set(presentation?.assets.map((asset) => asset.id) ?? []);
    setSelectedAssetIDs((current) => new Set(Array.from(current).filter((id) => validIDs.has(id))));
  }, [presentation?.assets]);
  const selectedIDs = useMemo(() => Array.from(selectedAssetIDs), [selectedAssetIDs]);
  const toggleBatchSelection = (assetID: string): void => {
    setSelectedAssetIDs((current) => {
      const next = new Set(current);
      if (next.has(assetID)) next.delete(assetID);
      else next.add(assetID);
      return next;
    });
  };
  const openAssetWorkspace = (
    asset: FilesWorkspaceAsset,
    action: NonNullable<FilesWorkspaceAsset["primaryAction"]> | FilesWorkspaceAsset["usageLinks"][number]
  ): void => {
    onOpenAssetWorkspace({
      assetID: asset.id,
      assetName: asset.name,
      kind: asset.kind,
      label: action.label,
      requestID: ++openRequestSequence.current,
      targetID: action.targetID,
      targetName: action.targetName,
      usageKind: action.usageKind,
      workspace: action.workspace
    });
  };
  const openActiveAssetWorkspace = (): void => {
    if (!activeAsset?.primaryAction) return;
    openAssetWorkspace(activeAsset, activeAsset.primaryAction);
  };
  const toggleAssetGroup = (groupID: string): void => {
    setCollapsedGroupIDs((current) => {
      const next = new Set(current);
      if (next.has(groupID)) next.delete(groupID);
      else next.add(groupID);
      return next;
    });
  };

  function openAssetContextMenu(event: React.MouseEvent<HTMLElement>, asset: FilesWorkspaceAsset): void {
    event.preventDefault();
    event.stopPropagation();
    setSelectedAssetID(asset.id);
    setContextMenu({ assetID: asset.id, label: asset.name, x: event.clientX, y: event.clientY });
  }

  if (!presentation) {
    return (
      <WorkspaceEmptyState
        title={t("workspace.files")}
        description={t("files.empty.description")}
        hint={t("files.empty.hint")}
      />
    );
  }

  return (
    <section className="files-workspace" aria-label={t("shell.workspaceAria", { workspace: t("workspace.files") })}>
      {contextMenu ? (
        <StudioContextMenu
          actions={[
            { label: "Renomear", onSelect: () => onRenameAsset(contextMenu.assetID, contextMenu.label) },
            { label: "Duplicar", onSelect: () => onDuplicateAsset(contextMenu.assetID, contextMenu.label) },
            { danger: true, label: "Excluir", onSelect: () => onRemoveAsset(contextMenu.assetID, contextMenu.label) }
          ]}
          onClose={() => setContextMenu(null)}
          state={contextMenu}
        />
      ) : null}
      {commandMenu ? <StudioContextMenu actions={commandMenu.actions} onClose={closeCommandMenu} state={commandMenu.state} /> : null}
      <div className="files-layout">
        <aside className="files-navigation" aria-label={t("files.library")}>
          <h3>{t("files.navigation.library")}</h3>
          <nav aria-label={t("files.kindCategories")} className="files-category-list">
            {categoryChips.map(chip => (
              <button
                aria-label={`${t("files.kindCategories")}: ${chip.value ? categoryLabel(chip.value, t) : t("files.navigation.all")}`}
                aria-pressed={chip.isActive && !selectedFolder}
                key={chip.id}
                title={chip.value ? categoryLabel(chip.value, t) : t("files.navigation.all")}
                onClick={() => { setSelectedKind(chip.value); setSelectedFolder(""); setSelectedAssetID(null); }}
                type="button"
              >
                {chip.value ? assetIconForKind(chip.value) : <Boxes aria-hidden="true" size={16} />}
                <span>{chip.value ? categoryLabel(chip.value, t) : t("files.navigation.all")}</span>
                <small>{chip.count}</small>
              </button>
            ))}
          </nav>
          {sourceFolders.length > 0 ? (
            <nav className="files-folder-list" aria-label={t("files.navigation.folders")}>
              <h3>{t("files.navigation.folders")}</h3>
              {sourceFolders.map(folder => (
                <button
                  aria-label={`${t("files.navigation.folder")}: ${folder.path}`}
                  aria-pressed={selectedFolder === folder.path}
                  key={folder.path}
                  onClick={() => { setSelectedFolder(folder.path); setSelectedKind(""); setSelectedAssetID(null); }}
                  style={{ paddingInlineStart: `${8 + Math.min(folder.depth, 4) * 12}px` }}
                  title={folder.path}
                  type="button"
                >
                  {selectedFolder === folder.path ? <FolderOpen aria-hidden="true" size={16} /> : <Folder aria-hidden="true" size={16} />}
                  <span>{folder.name}</span>
                  <small>{folder.count}</small>
                </button>
              ))}
            </nav>
          ) : null}
          {presentation.missingGroupAssetReferenceCount > 0 ? (
            <button className="files-repair-action" onClick={onRepairReferences} type="button">
              <AlertTriangle aria-hidden="true" size={14} />
              {t("files.actions.repairReferences", { count: presentation.missingGroupAssetReferenceCount })}
            </button>
          ) : null}
        </aside>
        <section className="files-gallery" aria-label={t("files.assetList")}>
          <div className="files-filter-bar" aria-label={t("files.filters")}>
            <div className="files-filter-heading">
              <div className="files-filter-heading-copy">
                <h2>{galleryTitle}</h2>
                <span>{t("files.navigation.count", { count: visibleAssets.length })}</span>
              </div>
              <StudioButton className="files-library-import" variant="primary"
                aria-haspopup={onImportGifAnimation ? "menu" : undefined}
                aria-expanded={onImportGifAnimation ? commandMenu?.state.label === t("files.actions.import") : undefined}
                onClick={event => onImportGifAnimation ? openCommandMenu(event, t("files.actions.import"), [
                  { label: t("files.actions.importFiles"), onSelect: onImportAssets },
                  { label: t("files.actions.importGifAnimation"), onSelect: onImportGifAnimation }
                ]) : onImportAssets()}
              >
                {t("files.actions.import")}{onImportGifAnimation ? <ChevronDown aria-hidden="true" size={14} /> : null}
              </StudioButton>
            </div>
            <label className="files-search-field">
              <Search aria-hidden="true" size={16} />
              <input aria-label={t("files.searchPlaceholder")} onChange={event => setSearchQuery(event.currentTarget.value)}
                placeholder={t("files.searchPlaceholder")} type="search" value={searchQuery} />
            </label>
            <div className="files-gallery-controls">
              <div className="files-filter-chip-group" aria-label={t("files.filter.byUsage")}>
                {filterChips?.usage.map(chip => (
                  <StudioChip active={chip.isActive} aria-label={t("files.filter.usage", { label: usageFilterLabel(chip.value, t) })}
                    key={chip.id} onClick={() => setUsageFilter(chip.value)}>
                    {usageFilterLabel(chip.value, t)}
                  </StudioChip>
                ))}
              </div>
              <button className="files-selection-toggle" aria-pressed={selectionMode}
                onClick={() => { setSelectionMode(!selectionMode); if (selectionMode) setSelectedAssetIDs(new Set()); }} type="button">
                {t(selectionMode ? "files.selection.done" : "files.selection.start")}
              </button>
              <div className="files-segmented-control" aria-label={t("files.view.label")}>
                <button aria-label={t("files.view.grid")} title={t("files.view.grid")} aria-pressed={viewMode === "grid"} onClick={() => setViewMode("grid")} type="button"><LayoutGrid aria-hidden="true" size={16} /></button>
                <button aria-label={t("files.view.list")} title={t("files.view.list")} aria-pressed={viewMode === "list"} onClick={() => setViewMode("list")} type="button"><List aria-hidden="true" size={16} /></button>
              </div>
            </div>
          </div>

          {selectedIDs.length > 0 ? (
            <div className="files-batch-toolbar" aria-label="Ações para seleção de arquivos">
              <strong>{selectedIDs.length} {selectedIDs.length === 1 ? "selecionado" : "selecionados"}</strong>
              <select
                aria-label="Mover seleção para grupo"
                className="files-batch-select"
                defaultValue=""
                onChange={(event) => {
                  const groupID = event.currentTarget.value;
                  if (!groupID) return;
                  onBatchMoveAssets(selectedIDs, groupID === "__ungrouped__" ? null : groupID);
                  event.currentTarget.value = "";
                }}
              >
                <option value="">Mover para…</option>
                <option value="__ungrouped__">Sem grupo</option>
                {presentation.groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
              </select>
              <select
                aria-label="Converter tipo da seleção"
                className="files-batch-select"
                defaultValue=""
                onChange={(event) => {
                  const kind = event.currentTarget.value;
                  if (!kind) return;
                  onBatchConvertAssets(selectedIDs, kind);
                  event.currentTarget.value = "";
                }}
              >
                <option value="">Converter para…</option>
                {["Sprite", "Tileset", "Background", "UI", "Emote", "Audio", "Fonte", "Arquivo"].map((kind) => (
                  <option key={kind} value={kind}>{kind}</option>
                ))}
              </select>
              <button aria-label="Renomear seleção" onClick={() => onBatchRenameAssets(selectedIDs)} type="button">Renomear</button>
              <button aria-label="Remover seleção" className="files-batch-remove" onClick={() => onBatchRemoveAssets(selectedIDs)} type="button">Remover</button>
              <button aria-label="Limpar seleção" onClick={() => setSelectedAssetIDs(new Set())} type="button">Limpar</button>
            </div>
          ) : null}

          <div className={`asset-list ${viewMode === "grid" ? "asset-list-grid" : ""}`} role="list" aria-label={t("files.assetList")}>
            {presentation.assets.length === 0 ? (
              <p className="muted">{t("files.empty.noAssets")}</p>
            ) : visibleAssets.length === 0 ? (
              <div className="files-no-results"><Search aria-hidden="true" size={24} /><p>{t("files.empty.noResults")}</p>
                <button type="button" onClick={() => { setSearchQuery(""); setSelectedFolder(""); setSelectedKind(""); setUsageFilter("all"); }}>{t("files.filters.clear")}</button>
              </div>
            ) : (
              visibleAssetGroups.map((group) => (
                <section className="asset-kind-group" key={group.id} aria-label={t("files.group.label", { label: group.label })}>
                  {!selectedKind && !selectedFolder ? <header>
                    <button
                      aria-expanded={!collapsedGroupIDs.has(group.id)}
                      onClick={() => toggleAssetGroup(group.id)}
                      type="button"
                    >
                      <ChevronDown aria-hidden="true" className="asset-group-chevron" size={12} />
                      {group.icon}
                      <span>{group.label}</span>
                    </button>
                    <small>{group.assets.length}</small>
                  </header> : null}
                  {!selectedKind && !selectedFolder && collapsedGroupIDs.has(group.id) ? null : group.assets.length === 0 ? (
                    <p className="asset-empty-row">{group.emptyLabel}</p>
                  ) : (
                    <div className="asset-kind-group-list">
                      {group.assets.map((asset) => {
                        const isActive = activeAsset?.id === asset.id;
                        const isSelected = selectedAssetIDs.has(asset.id);
                        return (
                          <article className={`${isActive ? "asset-row active" : "asset-row"}${isSelected ? " selected" : ""}`} key={asset.id} onContextMenu={(event) => openAssetContextMenu(event, asset)} role="listitem">
                            {selectionMode ? <button
                              aria-label={`${isSelected ? "Desmarcar" : "Selecionar"} ${asset.name}`}
                              aria-pressed={isSelected}
                              className="asset-batch-check"
                              onClick={() => toggleBatchSelection(asset.id)}
                              type="button"
                            >
                              {isSelected ? <Check aria-hidden="true" size={10} /> : null}
                            </button> : null}
                            <button
                              aria-label={asset.name}
                              aria-pressed={isActive}
                              title={asset.source ?? asset.name}
                              className={`asset-row-main${selectionMode ? " is-selecting" : ""}`}
                              onClick={() => setSelectedAssetID(asset.id)}
                              type="button"
                            >
                              {viewMode === "grid" ? (
                                <AssetGridThumbnail
                                  asset={asset}
                                  projectPath={projectPath}
                                  assetRefreshToken={assetRefreshToken}
                                />
                              ) : <>{assetIcon(asset)}<span className="asset-row-caption">{assetDisplayName(asset.name)}</span></>}
                            </button>
                          </article>
                        );
                      })}
                    </div>
                  )}
                </section>
              ))
            )}
          </div>
        </section>

        <section className="files-details-panel" aria-label={t("files.preview")}>
          {activeAsset ? (
            <>
              <header className="files-preview-header">
                <div><h3>{assetDisplayName(activeAsset.name)}</h3><p>{activeAsset.name}</p></div>
                <span className="files-kind-badge">{categoryLabel(activeAsset.kind, t)}</span>
              </header>
              <div className="files-preview-card">
                {activeAssetPreviewURL && !previewLoadFailed ? (
                  <div className={`files-preview-image-frame ${previewZoom === "fit" ? "is-fit" : "is-native"}`}>
                    <div className="files-preview-image-viewport">
                      <img alt={t("files.previewAlt", { name: activeAsset.name })}
                        crossOrigin={isDesktopAssetURL(activeAssetPreviewURL) ? "anonymous" : undefined}
                        onError={() => setPreviewLoadFailed(true)} onLoad={() => setPreviewLoadFailed(false)} src={activeAssetPreviewURL}
                        style={previewZoom !== "fit" && activeFileInfo?.width && activeFileInfo.height ? { width: activeFileInfo.width * previewZoom, height: activeFileInfo.height * previewZoom } : undefined} />
                    </div>
                  </div>
                ) : activeAsset.previewKind === "image" ? (
                  <div className="files-preview-missing"><AlertTriangle aria-hidden="true" size={22} /><strong>{t("files.imageMissing")}</strong><span>{activeAsset.source ?? t("files.noImageSource")}</span></div>
                ) : <div className="files-preview-icon">{assetIcon(activeAsset)}</div>}
                {activeAssetPreviewURL && !previewLoadFailed ? (
                  <div className="files-preview-zoom" aria-label={t("files.preview.zoom")}>
                    {([1, 2, "fit"] as const).map(zoom => <button key={zoom} aria-pressed={previewZoom === zoom}
                      disabled={zoom !== "fit" && !activeFileInfo?.width} onClick={() => setPreviewZoom(zoom)} type="button">
                      {zoom === "fit" ? t("files.preview.fit") : `${zoom}×`}
                    </button>)}
                  </div>
                ) : null}
              </div>
              <div className="files-preview-meta">
                {activeFileInfo?.width && activeFileInfo.height ? <span>{t("files.detail.dimensions", { width: activeFileInfo.width, height: activeFileInfo.height })}</span> : null}
                {activeFileInfo ? <span>{t("files.detail.formatSize", { format: activeFileInfo.format, size: activeFileInfo.byteSize === undefined ? t("files.detail.missing") : formatFileBytes(activeFileInfo.byteSize) })}</span> : null}
              </div>
              <div className="files-preview-actions" aria-label={t("files.inspector.aria")}>
                <button aria-label={`${t("files.actions.replace")} de ${activeAsset.name}`} type="button" onClick={() => onReplaceAsset(activeAsset.id, activeAsset.name)}><Replace aria-hidden="true" size={15} />{t("files.actions.replace")}</button>
                <button aria-label={t("files.actions.more", { name: activeAsset.name })} aria-haspopup="menu"
                  aria-expanded={commandMenu?.state.label === activeAsset.name}
                  onClick={event => openCommandMenu(event, activeAsset.name, [
                    { label: t("files.actions.rename"), onSelect: () => onRenameAsset(activeAsset.id, activeAsset.name) },
                    { label: t("files.actions.duplicate"), onSelect: () => onDuplicateAsset(activeAsset.id, activeAsset.name) },
                    ...(activeAsset.source ? [{ label: t("files.actions.reveal"), onSelect: () => onRevealAsset(activeAsset.source) }] : []),
                    { label: t("files.actions.remove"), danger: true, onSelect: () => onRemoveAsset(activeAsset.id, activeAsset.name) }
                  ])} type="button"><MoreHorizontal aria-hidden="true" size={17} /></button>
              </div>
              <AssetPipelineNotice fileInfo={activeFileInfo} failed={fileInfoFailed} onDetails={() => setTechnicalOpen(true)} t={t} />
              <section className="files-details-usage" aria-labelledby="files-details-usage-title">
                <h4 id="files-details-usage-title">{t("files.inspector.title")}</h4>
                {activeAsset.usageLinks.length ? (
                  <ul className="files-usage-links">
                    {activeAsset.usageLinks.map((link, index) => (
                      <li key={`${link.workspace}-${link.targetID}-${link.usageKind}-${index}`}>
                        {primaryActionIcon(link.workspace)}
                        <span title={link.label}>{link.label}</span>
                        <button type="button" aria-label={`${t("files.actions.openInWorkspace", { workspace: t(workspaceLabelKey(link.workspace)) })}: ${link.label}`}
                          onClick={() => openAssetWorkspace(activeAsset, link)}>
                          {t(link.workspace === "Editor" ? "files.actions.openScene" : "files.actions.openWorkspace")}<ExternalLink aria-hidden="true" size={12} />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : <p className="muted">{t("files.noReferences")}</p>}
                {activeAsset.primaryAction && !activeAsset.usageLinks.length ? (
                  <button className="files-details-primary-action" onClick={openActiveAssetWorkspace} type="button">
                    {primaryActionIcon(activeAsset.primaryAction.workspace)}{t("files.actions.openInWorkspace", { workspace: t(workspaceLabelKey(activeAsset.primaryAction.workspace)) })}
                  </button>
                ) : null}
              </section>
              <details className="files-technical-details" open={technicalOpen} onToggle={event => setTechnicalOpen(event.currentTarget.open)}>
                <summary>{t("files.detail.technical")}<ChevronDown aria-hidden="true" size={15} /></summary>
                <dl className="files-preview-details">
                  <div><dt>{t("files.source")}</dt><dd>{activeAsset.source ?? t("files.internalFile")}</dd></div>
                  {activeFileInfo?.estimatedGbaBytes !== undefined && activeFileInfo.gbaBudgetPercent !== undefined ? (
                    <div><dt>{t("files.detail.gbaBudgetLabel")}</dt><dd>{t("files.detail.gbaBudget", { bytes: formatFileBytes(activeFileInfo.estimatedGbaBytes), percent: formatBudgetPercent(activeFileInfo.gbaBudgetPercent), colorMode: activeAsset.colorMode ?? "4bpp" })}</dd></div>
                  ) : null}
                  <div><dt>{t("files.group.field")}</dt><dd>{activeAsset.groupNames.length ? activeAsset.groupNames.join(" / ") : t("files.noGroup")}</dd></div>
                  {activeUsageSummary.length ? <div><dt>{t("files.inspector.usageSummary")}</dt><dd>{activeUsageSummary.map(item => <p key={item.label}>{item.label}</p>)}</dd></div> : null}
                </dl>
                <AssetPipelineStatus asset={activeAsset} fileInfo={activeFileInfo} onRevealReport={onRevealAsset} t={t} />
                {advancedTools ? <div className="files-details-advanced-tools">{advancedTools}</div> : null}
              </details>
            </>
          ) : <><h4 id="files-details-usage-title">{t("files.inspector.title")}</h4><p className="muted">{t("files.empty.previewPrompt")}</p></>}

        </section>
      </div>
    </section>
  );
}

function assetDisplayName(name: string): string {
  return name.replace(/\.(png|apng|gif|jpg|jpeg|webp|bmp|wav|mp3|ogg|mod|xm|json)$/i, "");
}

function categoryLabel(kind: string, t: FilesTranslate): string {
  const normalized = normalizedAssetKind(kind);
  if (["background", "fundo", "imagem de fundo"].includes(normalized)) return t("files.navigation.backgrounds");
  if (["sprite", "sprites", "ator"].includes(normalized)) return t("workspace.sprites");
  if (["font", "fonte"].includes(normalized)) return t("files.summary.fonts");
  if (["ui", "dialogo", "frame", "cursor"].includes(normalized)) return t("files.navigation.interface");
  if (normalized === "audio") return t("workspace.audio");
  return kind;
}

function assetIconForKind(kind: string): React.ReactElement {
  if (["font", "fonte"].includes(normalizedAssetKind(kind))) return <Type aria-hidden="true" size={16} />;
  return railGroupIcon(assetRailCategoryID(kind));
}

function AssetPipelineNotice({ fileInfo, failed, onDetails, t }: {
  fileInfo: InspectAssetFileResult | null; failed: boolean; onDetails(): void; t: FilesTranslate;
}): React.ReactElement {
  const prepared = fileInfo?.pipeline?.preparedStatus;
  const exported = fileInfo?.pipeline?.exportedStatus;
  const complete = fileInfo?.exists && prepared === "complete" && exported === "complete";
  const warning = failed || (fileInfo && !fileInfo.exists) || prepared === "attention" || exported === "attention";
  const label = failed ? t("files.detail.inspectFailed") : fileInfo && !fileInfo.exists ? t("files.pipeline.source.pending")
    : prepared === "attention" ? t("files.pipeline.reviewPreparation") : exported === "attention" ? t("files.pipeline.reviewExport")
    : complete ? t("files.pipeline.exported.registered") : t("files.pipeline.status.pending");
  return <div className={`files-pipeline-notice ${warning ? "attention" : complete ? "complete" : "pending"}`}>
    {complete ? <CheckCircle2 aria-hidden="true" size={16} /> : <AlertTriangle aria-hidden="true" size={16} />}
    <span>{label}</span><button onClick={onDetails} type="button">{t("files.detail.view")}</button>
  </div>;
}

interface FilesRailGroup {
  id: string;
  label: string;
  emptyLabel: string;
  icon: React.ReactElement;
  assets: FilesWorkspaceAsset[];
}

interface AssetGridThumbnailProps {
  asset: FilesWorkspaceAsset;
  assetRefreshToken: number;
  projectPath?: string;
}

function AssetGridThumbnail({ asset, assetRefreshToken, projectPath }: AssetGridThumbnailProps): React.ReactElement {
  const previewURL = assetPreviewURL(asset, projectPath, assetRefreshToken);
  const [dimensions, setDimensions] = useState<{ width: number; height: number } | null>(null);
  const { t } = useStudioI18n();
  useEffect(() => setDimensions(null), [previewURL]);

  return (
    <>
    <span className="asset-grid-thumbnail" aria-hidden="true">
      {!dimensions ? <span className="asset-grid-thumbnail-fallback">{assetIcon(asset)}</span> : null}
      {previewURL ? (
        <img
          alt=""
          loading="lazy"
          onError={(event) => { event.currentTarget.hidden = true; setDimensions(null); }}
          onLoad={(event) => {
            const image = event.currentTarget;
            image.hidden = false;
            setDimensions({ width: image.naturalWidth, height: image.naturalHeight });
          }}
          src={previewURL}
        />
      ) : null}
    </span>
    <span className="asset-row-caption">{assetDisplayName(asset.name)}</span>
    <small className="asset-row-kind">{dimensions ? `${dimensions.width} × ${dimensions.height} px` : categoryLabel(asset.kind, t)}</small>
    </>
  );
}

interface AssetUsageSummaryItem {
  label: string;
  icon: React.ReactElement;
}

interface AssetPipelineStatusProps {
  asset: FilesWorkspaceAsset;
  fileInfo: InspectAssetFileResult | null;
  onRevealReport(path: string | null): void;
  t: FilesTranslate;
}

function AssetPipelineStatus({ asset, fileInfo, onRevealReport, t }: AssetPipelineStatusProps): React.ReactElement {
  const sourceStatus: AssetPipelineStageStatus = fileInfo?.exists ? "complete" : "pending";
  const preparedStatus = fileInfo?.pipeline?.preparedStatus ?? "pending";
  const exportedStatus = fileInfo?.pipeline?.exportedStatus ?? "pending";
  const reportPath = fileInfo?.pipeline?.reportPath ?? null;
  const stages: Array<{
    id: "source" | "prepared" | "exported";
    status: AssetPipelineStageStatus;
    detail: string;
  }> = [
    {
      id: "source",
      status: sourceStatus,
      detail: t(sourceStatus === "complete" ? "files.pipeline.source.complete" : "files.pipeline.source.pending")
    },
    {
      id: "prepared",
      status: preparedStatus,
      detail: pipelinePreparedDetail(preparedStatus, fileInfo?.pipeline?.preparedDetail, t)
    },
    {
      id: "exported",
      status: exportedStatus,
      detail: pipelineExportedDetail(exportedStatus, fileInfo?.pipeline?.exportedDetail, t)
    }
  ];

  return (
    <section className="files-asset-pipeline" aria-label={`${t("files.pipeline.title")}: ${asset.name}`}>
      <div className="files-asset-pipeline-header">
        <div>
          <strong>{t("files.pipeline.title")}</strong>
          <p>{t("files.pipeline.description")}</p>
        </div>
        {reportPath ? (
          <button type="button" onClick={() => onRevealReport(reportPath)}>
            {t("files.pipeline.revealReport")}
          </button>
        ) : null}
      </div>
      <ol>
        {stages.map((stage) => (
          <li className={`pipeline-stage ${stage.status}`} key={stage.id}>
            <span className="pipeline-stage-marker" aria-hidden="true">
              {pipelineStatusIcon(stage.status)}
            </span>
            <span className="pipeline-stage-copy">
              <strong>{t(`files.pipeline.stage.${stage.id}` as StudioTranslationKey)}</strong>
              <small>{stage.detail}</small>
            </span>
            <span className="pipeline-stage-status">
              {t(`files.pipeline.status.${stage.status}` as StudioTranslationKey)}
            </span>
          </li>
        ))}
      </ol>
      {reportPath ? <small className="files-asset-pipeline-report">{t("files.pipeline.report")}: {reportPath}</small> : null}
    </section>
  );
}

function pipelineStatusIcon(status: AssetPipelineStageStatus): React.ReactElement {
  return status === "complete"
    ? <Check aria-hidden="true" size={12} />
    : <AlertTriangle aria-hidden="true" size={12} />;
}

function pipelinePreparedDetail(
  status: AssetPipelineStageStatus,
  detail: string | undefined,
  t: FilesTranslate
): string {
  if (detail === "assetc_attention") return t("files.pipeline.prepared.attention");
  if (status === "complete") return t("files.pipeline.prepared.complete");
  if (status === "attention") return t("files.pipeline.prepared.attention");
  return t("files.pipeline.prepared.pending");
}

function pipelineExportedDetail(
  status: AssetPipelineStageStatus,
  detail: string | undefined,
  t: FilesTranslate
): string {
  if (detail === "registered") return t("files.pipeline.exported.registered");
  if (detail === "report_diagnostic") return t("files.pipeline.exported.reportDiagnostic");
  if (detail === "source_newer") return t("files.pipeline.exported.sourceNewer");
  if (detail === "prepared_pending") return t("files.pipeline.exported.preparedPending");
  if (detail === "not_in_export") return t("files.pipeline.exported.notInExport");
  if (detail === "no_export") return t("files.pipeline.exported.noExport");
  if (status === "attention") return t("files.pipeline.exported.notInExport");
  return t("files.pipeline.exported.pending");
}

type FilesTranslate = (key: StudioTranslationKey, values?: Partial<Record<string, string | number>>) => string;

function assetPreviewURL(
  asset: FilesWorkspaceAsset | null,
  projectPath: string | undefined,
  assetRefreshToken: number
): string | null {
  if (!asset || asset.previewKind !== "image") return null;
  const url = resolveAssetURL(projectPath, asset.source, asset.bundledDefaultAsset);
  if (!url || assetRefreshToken === 0) return url;
  return `${url}${url.includes("?") ? "&" : "?"}assetRevision=${assetRefreshToken}`;
}

function usageFilterLabel(value: FilesWorkspaceUsageFilter, t: FilesTranslate): string {
  if (value === "used") return t("files.filter.used");
  if (value === "unused") return t("files.summary.unused");
  return t("files.all");
}

function normalizedAssetKind(kind: string): string {
  return kind.trim().toLocaleLowerCase("pt-BR");
}

function assetRailCategoryID(kindName: string): string {
  const kind = normalizedAssetKind(kindName);
  if (["background", "fundo", "imagem de fundo"].includes(kind)) return "backgrounds";
  if (["tileset", "tilemap", "conjunto de tiles"].includes(kind)) return "tilesets";
  if (["sprite", "sprites", "ator"].includes(kind)) return "sprites";
  if (["ui", "dialogo", "frame", "cursor"].includes(kind)) return "dialog-ui";
  return `kind-${kindName}`;
}

function railGroupIcon(id: string): React.ReactElement {
  if (id === "backgrounds") return <Image aria-hidden="true" size={12} />;
  if (id === "tilesets") return <Grid3X3 aria-hidden="true" size={12} />;
  if (id === "sprites") return <FileImage aria-hidden="true" size={12} />;
  if (id === "dialog-ui") return <MessageSquare aria-hidden="true" size={12} />;
  return <Package aria-hidden="true" size={12} />;
}

function groupFilesWorkspaceAssetsForRail(assets: FilesWorkspaceAsset[], t: FilesTranslate): FilesRailGroup[] {
  const fixedGroups: FilesRailGroup[] = [
    { id: "backgrounds", label: t("files.group.backgrounds"), emptyLabel: t("files.group.emptyBackgrounds"), icon: railGroupIcon("backgrounds"), assets: [] },
    { id: "tilesets", label: t("files.group.tilesets"), emptyLabel: t("files.group.emptyTilesets"), icon: railGroupIcon("tilesets"), assets: [] },
    { id: "sprites", label: t("workspace.sprites"), emptyLabel: t("files.group.emptySprites"), icon: railGroupIcon("sprites"), assets: [] },
    { id: "dialog-ui", label: t("files.group.dialogUi"), emptyLabel: t("files.group.emptyDialogUi"), icon: railGroupIcon("dialog-ui"), assets: [] }
  ];
  const fixedMap = new Map(fixedGroups.map((group) => [group.id, group]));
  const extraGroups = new Map<string, FilesRailGroup>();

  for (const asset of assets) {
    const categoryID = assetRailCategoryID(asset.kind);
    const fixedGroup = fixedMap.get(categoryID);
    if (fixedGroup) {
      fixedGroup.assets.push(asset);
      continue;
    }

    const extraGroup = extraGroups.get(categoryID) ?? {
      id: categoryID,
      label: asset.kind,
      emptyLabel: t("files.group.emptyFiles"),
      icon: railGroupIcon(categoryID),
      assets: []
    };
    extraGroup.assets.push(asset);
    extraGroups.set(categoryID, extraGroup);
  }

  return [...fixedGroups, ...Array.from(extraGroups.values()).sort((lhs, rhs) => lhs.label.localeCompare(rhs.label, "pt-BR"))];
}

function assetIcon(asset: FilesWorkspaceAsset): React.ReactElement {
  return railGroupIcon(assetRailCategoryID(asset.kind));
}

function primaryActionIcon(workspace: FilesWorkspaceName): React.ReactElement {
  if (workspace === "Sprites") return <UserRound aria-hidden="true" size={15} />;
  if (workspace === "Editor") return <Grid3X3 aria-hidden="true" size={15} />;
  if (workspace === "Dialogos") return <MessageSquare aria-hidden="true" size={15} />;
  return <Package aria-hidden="true" size={15} />;
}

function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

function formatFileBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${Math.round((bytes / (1024 * 1024)) * 10) / 10} MB`;
}

function formatBudgetPercent(percent: number): string {
  return `${percent.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}

function translatedCountLabel(
  count: number,
  singularKey: StudioTranslationKey,
  pluralKey: StudioTranslationKey,
  t: FilesTranslate
): string {
  return countLabel(count, t(singularKey), t(pluralKey));
}

function labelsForUsageKind(asset: FilesWorkspaceAsset, usageKind: string, prefix: string): string[] {
  return asset.usageLinks
    .filter((link) => link.usageKind === usageKind)
    .map((link) => link.label.replace(prefix, "").trim())
    .filter((label) => label.length > 0);
}

function summarizeAssetUsage(asset: FilesWorkspaceAsset, t: FilesTranslate): AssetUsageSummaryItem[] {
  const items: AssetUsageSummaryItem[] = [];
  const actorNames = labelsForUsageKind(asset, "sprite-actor", "Ator:");
  const animationCount = asset.usageLinks.filter((link) => link.usageKind === "sprite-animation").length;
  const stateCount = asset.usageLinks.filter((link) => link.usageKind === "sprite-state").length;
  const tacticalResourceCount = asset.usageLinks.filter((link) => link.usageKind === "tactical-resource").length;
  const roomCount = asset.usageLinks.filter((link) => link.usageKind.startsWith("room-")).length;
  const dialogueCount = asset.usageLinks.filter((link) => link.workspace === "Dialogos").length;
  const eventCount = asset.usageLinks.filter((link) => link.workspace === "Eventos").length;
  const audioCount = asset.usageLinks.filter((link) => link.workspace === "Audio").length;
  const settingsCount = asset.usageLinks.filter((link) => link.workspace === "Ajustes").length;

  if (actorNames.length) {
    items.push({ label: t("files.usage.actorPrefix", { names: actorNames.join(", ") }), icon: <UserRound aria-hidden="true" size={14} /> });
  }
  if (animationCount) {
    items.push({ label: translatedCountLabel(animationCount, "files.usage.spriteAnimationSingular", "files.usage.spriteAnimationPlural", t), icon: <CheckCircle2 aria-hidden="true" size={14} /> });
  }
  if (stateCount) {
    items.push({ label: translatedCountLabel(stateCount, "files.usage.spriteStateSingular", "files.usage.spriteStatePlural", t), icon: <CheckCircle2 aria-hidden="true" size={14} /> });
  }
  if (tacticalResourceCount) {
    items.push({ label: translatedCountLabel(tacticalResourceCount, "files.usage.tacticalResourceSingular", "files.usage.tacticalResourcePlural", t), icon: <Grid3X3 aria-hidden="true" size={14} /> });
  }
  if (roomCount) {
    items.push({ label: translatedCountLabel(roomCount, "files.usage.editorSingular", "files.usage.editorPlural", t), icon: <Grid3X3 aria-hidden="true" size={14} /> });
  }
  if (dialogueCount) {
    items.push({ label: translatedCountLabel(dialogueCount, "files.usage.dialoguesSingular", "files.usage.dialoguesPlural", t), icon: <MessageSquare aria-hidden="true" size={14} /> });
  }
  if (eventCount) {
    items.push({ label: translatedCountLabel(eventCount, "files.usage.eventsSingular", "files.usage.eventsPlural", t), icon: <Package aria-hidden="true" size={14} /> });
  }
  if (audioCount) {
    items.push({ label: translatedCountLabel(audioCount, "files.usage.audioSingular", "files.usage.audioPlural", t), icon: <Package aria-hidden="true" size={14} /> });
  }
  if (settingsCount) {
    items.push({ label: translatedCountLabel(settingsCount, "files.usage.settingsSingular", "files.usage.settingsPlural", t), icon: <Package aria-hidden="true" size={14} /> });
  }

  return items;
}
