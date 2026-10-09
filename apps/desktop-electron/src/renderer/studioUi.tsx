import type { LucideIcon } from "lucide-react";
import { AlertCircle, Check, ChevronDown, FolderOpen, Loader2, Search } from "lucide-react";
import React from "react";
import { useStudioI18n, workspaceLabelKey } from "./i18n";

export type WorkspaceEmptyKind = "empty" | "loading" | "error";

export type StudioButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export type WorkspaceHeaderVariant =
  | "files"
  | "sprites"
  | "events"
  | "audio"
  | "dialogues"
  | "settings"
  | "rooms"
  | "health";

export interface WorkspaceEmptyStateProps {
  title: string;
  description: string;
  hint?: string;
  kind?: WorkspaceEmptyKind;
  icon?: LucideIcon;
}

const defaultIcons: Record<WorkspaceEmptyKind, LucideIcon> = {
  empty: FolderOpen,
  loading: Loader2,
  error: AlertCircle
};

const buttonClassNames: Record<StudioButtonVariant, string> = {
  primary: "welcome-primary ui-button",
  secondary: "ui-button",
  ghost: "ghost-button ui-button",
  danger: "studio-button-danger ui-button"
};

export interface StudioButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: StudioButtonVariant;
}

export function StudioButton({
  variant = "secondary",
  className,
  type = "button",
  ...props
}: StudioButtonProps): React.ReactElement {
  return (
    <button
      className={[buttonClassNames[variant], className].filter(Boolean).join(" ")}
      type={type}
      {...props}
    />
  );
}

export interface StudioChipProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  active?: boolean;
}

export function StudioChip({
  active = false,
  className,
  type = "button",
  ...props
}: StudioChipProps): React.ReactElement {
  return (
    <button
      className={["ui-chip", active ? "active" : "", className].filter(Boolean).join(" ")}
      type={type}
      aria-pressed={active}
      {...props}
    />
  );
}

export interface ProjectReferenceOption {
  value: string;
  label: string;
  detail?: string;
  keywords?: string[];
}

export interface ProjectReferenceAction {
  label: string;
  run(): string | void | Promise<string | void>;
}

export interface ProjectReferencePickerProps {
  ariaLabel: string;
  value: string;
  options: ProjectReferenceOption[];
  onChange(value: string): void;
  emptyLabel?: string;
  disabled?: boolean;
  invalidLabel?: string;
  searchPlaceholder?: string;
  actions?: ProjectReferenceAction[];
}

function normalizedReferenceSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR")
    .trim();
}

export function ProjectReferencePicker({
  ariaLabel,
  value,
  options,
  onChange,
  emptyLabel,
  disabled = false,
  invalidLabel = "Referência não encontrada",
  searchPlaceholder,
  actions = []
}: ProjectReferencePickerProps): React.ReactElement {
  const [isOpen, setIsOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const rootRef = React.useRef<HTMLDivElement>(null);
  const listboxID = React.useId();
  const selectedOption = options.find((option) => option.value === value) ?? null;
  const isInvalid = value.length > 0 && !selectedOption;
  const displayValue = selectedOption?.label ?? (value || emptyLabel || "Selecione");
  const normalizedQuery = normalizedReferenceSearch(query);
  const visibleOptions = normalizedQuery.length === 0
    ? options
    : options.filter((option) => normalizedReferenceSearch([
      option.label,
      option.detail ?? "",
      option.value,
      ...(option.keywords ?? [])
    ].join(" ")).includes(normalizedQuery));

  React.useEffect(() => {
    if (!isOpen) return;

    const closeOnOutsidePointer = (event: PointerEvent): void => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
        setQuery("");
      }
    };
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        setIsOpen(false);
        setQuery("");
      }
    };

    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [isOpen]);

  const selectValue = (nextValue: string): void => {
    onChange(nextValue);
    setIsOpen(false);
    setQuery("");
  };

  const runAction = async (action: ProjectReferenceAction): Promise<void> => {
    const nextValue = await action.run();
    if (typeof nextValue === "string" && nextValue.length > 0) {
      onChange(nextValue);
    }
    setIsOpen(false);
    setQuery("");
  };

  return (
    <div className={["project-reference-picker", isInvalid ? "is-invalid" : ""].filter(Boolean).join(" ")} ref={rootRef}>
      <div className="project-reference-picker-control">
        <input
          aria-controls={listboxID}
          aria-expanded={isOpen}
          aria-haspopup="listbox"
          aria-invalid={isInvalid}
          aria-label={ariaLabel}
          className="project-reference-picker-value"
          disabled={disabled}
          onClick={() => setIsOpen((current) => !current)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "Enter" || event.key === " ") {
              event.preventDefault();
              setIsOpen(true);
            }
          }}
          readOnly
          role="combobox"
          value={displayValue}
        />
        <ChevronDown aria-hidden="true" size={14} />
      </div>

      {isInvalid ? <small className="project-reference-picker-warning" role="alert">{invalidLabel}: {value}</small> : null}

      {isOpen ? (
        <div className="project-reference-picker-popover">
          <label className="project-reference-picker-search">
            <Search aria-hidden="true" size={14} />
            <input
              aria-label={`Buscar ${ariaLabel}`}
              autoFocus
              onChange={(event) => setQuery(event.currentTarget.value)}
              placeholder={searchPlaceholder ?? `Buscar ${ariaLabel.toLocaleLowerCase("pt-BR")}`}
              type="search"
              value={query}
            />
          </label>
          <div className="project-reference-picker-options" id={listboxID} role="listbox">
            {emptyLabel ? (
              <button
                aria-selected={value.length === 0}
                className={value.length === 0 ? "active" : ""}
                onClick={() => selectValue("")}
                role="option"
                type="button"
              >
                <span>{emptyLabel}</span>
                {value.length === 0 ? <Check aria-hidden="true" size={14} /> : null}
              </button>
            ) : null}
            {visibleOptions.map((option) => (
              <button
                aria-selected={option.value === value}
                className={option.value === value ? "active" : ""}
                key={option.value}
                onClick={() => selectValue(option.value)}
                role="option"
                type="button"
              >
                <span>
                  <strong>{option.label}</strong>
                  {option.detail ? <small>{option.detail}</small> : null}
                </span>
                {option.value === value ? <Check aria-hidden="true" size={14} /> : null}
              </button>
            ))}
            {visibleOptions.length === 0 ? <p>Nenhuma referência encontrada.</p> : null}
          </div>
          {actions.length > 0 ? (
            <div className="project-reference-picker-actions">
              {actions.map((action) => (
                <button key={action.label} onClick={() => void runAction(action)} type="button">
                  {action.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export interface WorkspaceContextToolbarProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
}

export function WorkspaceContextToolbar({
  children,
  className,
  role = "toolbar",
  ...props
}: WorkspaceContextToolbarProps): React.ReactElement {
  return (
    <div
      className={["workspace-context-toolbar", className].filter(Boolean).join(" ")}
      role={role}
      {...props}
    >
      {children}
    </div>
  );
}

export interface StudioFieldProps {
  label: string;
  htmlFor?: string;
  hint?: string;
  children: React.ReactNode;
  className?: string;
}

export function StudioField({
  label,
  htmlFor,
  hint,
  children,
  className
}: StudioFieldProps): React.ReactElement {
  return (
    <label className={["studio-field ui-field", className].filter(Boolean).join(" ")} htmlFor={htmlFor}>
      <span>{label}</span>
      {children}
      {hint ? <small className="studio-field-hint">{hint}</small> : null}
    </label>
  );
}

export interface WorkspaceHeaderProps {
  variant: WorkspaceHeaderVariant;
  title: string;
  subtitle: React.ReactNode;
  actions?: React.ReactNode;
  meta?: React.ReactNode;
}

export function WorkspaceHeader({
  variant,
  title,
  subtitle,
  actions,
  meta
}: WorkspaceHeaderProps): React.ReactElement {
  const hasActions = Boolean(actions || meta);

  return (
    <div className={`${variant}-header`}>
      <div>
        <h3>{title}</h3>
        <p>{subtitle}</p>
      </div>
      {hasActions ? (
        <div className={`${variant}-header-actions`}>
          {actions}
          {meta}
        </div>
      ) : null}
    </div>
  );
}

export function WorkspaceEmptyState({
  title,
  description,
  hint,
  kind = "empty",
  icon
}: WorkspaceEmptyStateProps): React.ReactElement {
  const Icon = icon ?? defaultIcons[kind];

  return (
    <div
      className={`workspace-empty workspace-empty--${kind}`}
      role={kind === "error" ? "alert" : "status"}
      aria-live={kind === "loading" ? "polite" : undefined}
      aria-busy={kind === "loading" ? true : undefined}
    >
      <div className="workspace-empty-icon" aria-hidden="true">
        <Icon className={kind === "loading" ? "workspace-empty-spinner" : undefined} strokeWidth={1.8} />
      </div>
      <div className="workspace-empty-copy">
        <h3>{title}</h3>
        <p>{description}</p>
        {hint ? <small className="workspace-empty-hint">{hint}</small> : null}
      </div>
    </div>
  );
}

export interface StudioStatusBarProps {
  message: string;
  workspace?: string;
  isBusy?: boolean;
}

export function StudioStatusBar({
  message,
  workspace,
  isBusy = false
}: StudioStatusBarProps): React.ReactElement {
  const { t } = useStudioI18n();
  const workspaceLabel = workspace ? t(workspaceLabelKey(workspace)) : null;

  return (
    <footer className="studio-status-bar" role="status" aria-live="polite" aria-atomic="true">
      <div className="studio-status-bar-main">
        {isBusy ? (
          <Loader2 aria-hidden="true" className="studio-status-bar-spinner" strokeWidth={2.2} />
        ) : (
          <span aria-hidden="true" className="studio-status-bar-dot" />
        )}
        <span className="studio-status-bar-message">{message}</span>
      </div>
      {workspaceLabel ? (
        <span className="studio-status-bar-workspace" aria-label={t("workspace.activeAria", { workspace: workspaceLabel })}>
          {workspaceLabel}
        </span>
      ) : null}
    </footer>
  );
}
