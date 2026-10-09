import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { ChevronDown, ChevronRight, Info } from "lucide-react";

export interface InspectorSelectOption {
  label: string;
  value: string;
}

export interface InspectorValuePreset {
  label: string;
  value: number;
}

interface InspectorFieldProps {
  className?: string;
  description?: string;
  label: string;
}

export interface InspectorNumberProps extends InspectorFieldProps {
  ariaLabel?: string;
  defaultValue?: number;
  disabled?: boolean;
  max?: number;
  min?: number;
  onChange: (value: number) => void;
  presets?: InspectorValuePreset[];
  step?: number;
  unit?: string;
  value: number;
}

function clampInspectorValue(value: number, min?: number, max?: number): number {
  const finiteValue = Number.isFinite(value) ? value : min ?? 0;
  const withMinimum = min === undefined ? finiteValue : Math.max(min, finiteValue);
  return max === undefined ? withMinimum : Math.min(max, withMinimum);
}

function formatInspectorValue(value: number): string {
  if (Number.isInteger(value)) return String(value);
  return String(Number(value.toFixed(4))).replace(".", ",");
}

function formatInspectorValueWithUnit(value: number, unit?: string): string {
  return `${formatInspectorValue(value)}${unit ? ` ${unit}` : ""}`;
}

function inspectorConstraintText(min?: number, max?: number, step?: number): string | null {
  const bounds = [
    min === undefined ? null : `Mín. ${formatInspectorValue(min)}`,
    max === undefined ? null : `Máx. ${formatInspectorValue(max)}`
  ].filter((value): value is string => value !== null);
  if (step !== undefined && step !== 1) bounds.push(`Passo ${formatInspectorValue(step)}`);
  return bounds.length > 0 ? bounds.join(" · ") : null;
}

function InspectorPresets({
  disabled,
  label,
  onChange,
  presets,
  value
}: {
  disabled?: boolean;
  label: string;
  onChange: (value: number) => void;
  presets: InspectorValuePreset[];
  value: number;
}): React.ReactElement | null {
  if (presets.length === 0) return null;
  return (
    <div className="inspector-field-presets" aria-label={`Valores sugeridos para ${label}`}>
      {presets.map((preset) => (
        <button
          aria-pressed={preset.value === value}
          disabled={disabled}
          key={`${preset.label}-${preset.value}`}
          onClick={() => onChange(preset.value)}
          type="button"
        >
          {preset.label}
        </button>
      ))}
    </div>
  );
}

export function InspectorNumber({
  ariaLabel,
  className,
  description,
  disabled,
  defaultValue,
  label,
  max,
  min,
  onChange,
  presets,
  step,
  unit,
  value
}: InspectorNumberProps): React.ReactElement {
  const inputID = useId();
  const descriptionID = useId();
  const normalizedValue = clampInspectorValue(value, min, max);
  const constraintText = inspectorConstraintText(min, max, step);
  const helpText = [constraintText, description].filter(Boolean).join(" · ");
  const hasOutOfRangeValue = Number.isFinite(value) && ((min !== undefined && value < min) || (max !== undefined && value > max));
  const applyValue = (nextValue: number): void => onChange(clampInspectorValue(nextValue, min, max));
  return (
    <label className={className ? `inspector-field inspector-number-field ${className}` : "inspector-field inspector-number-field"}>
      <span className="inspector-field-heading">
        <span className="inspector-field-label">{label}</span>
        {defaultValue !== undefined && normalizedValue !== defaultValue ? (
          <button
            aria-label={`Restaurar padrão de ${label}`}
            className="inspector-reset-button"
            disabled={disabled}
            onClick={() => onChange(clampInspectorValue(defaultValue, min, max))}
            title={`Restaurar padrão de ${label}`}
            type="button"
          >
            Padrão
          </button>
        ) : null}
      </span>
      <span className="inspector-control-line">
        <input
          aria-label={ariaLabel ?? label}
          aria-describedby={helpText ? descriptionID : undefined}
          aria-invalid={hasOutOfRangeValue || undefined}
          disabled={disabled}
          id={inputID}
          max={max}
          min={min}
          onChange={(event) => {
            const nextValue = event.currentTarget.valueAsNumber;
            if (Number.isFinite(nextValue)) applyValue(nextValue);
          }}
          onBlur={(event) => {
            const nextValue = event.currentTarget.valueAsNumber;
            if (Number.isFinite(nextValue)) applyValue(nextValue);
          }}
          step={step}
          type="number"
          value={normalizedValue}
        />
        {unit ? <span className="inspector-field-unit">{unit}</span> : null}
      </span>
      {presets ? <InspectorPresets disabled={disabled} label={label} onChange={applyValue} presets={presets} value={normalizedValue} /> : null}
      {helpText ? <small className="inspector-field-description" id={descriptionID}>{helpText}</small> : null}
    </label>
  );
}

export interface InspectorRangeProps extends InspectorNumberProps {
  exactAriaLabel?: string;
  showNumber?: boolean;
}

export function InspectorRange({
  ariaLabel,
  className,
  description,
  defaultValue,
  disabled,
  exactAriaLabel,
  label,
  max,
  min,
  onChange,
  presets,
  showNumber = true,
  step = 1,
  unit,
  value
}: InspectorRangeProps): React.ReactElement {
  const rangeID = useId();
  const exactID = useId();
  const descriptionID = useId();
  if (min === undefined || max === undefined) {
    return <InspectorNumber {...{ ariaLabel, className, defaultValue, description, disabled, label, max, min, onChange, presets, step, unit, value }} />;
  }

  const normalizedValue = clampInspectorValue(value, min, max);
  const helpText = [step === 1 ? null : `Passo ${formatInspectorValue(step)}`, description].filter(Boolean).join(" · ");
  const applyValue = (nextValue: number): void => onChange(clampInspectorValue(nextValue, min, max));
  return (
    <div className={className ? `inspector-field inspector-range-field ${className}` : "inspector-field inspector-range-field"}>
      <div className="inspector-range-heading">
        <span className="inspector-field-label">{label}</span>
        <span className="inspector-range-value">{formatInspectorValueWithUnit(normalizedValue, unit)}</span>
      </div>
      <input
        aria-label={ariaLabel ?? label}
        aria-describedby={helpText ? descriptionID : undefined}
        disabled={disabled}
        max={max}
        min={min}
        id={rangeID}
        onChange={(event) => {
          const nextValue = event.currentTarget.valueAsNumber;
          if (Number.isFinite(nextValue)) applyValue(nextValue);
        }}
        step={step}
        type="range"
        value={normalizedValue}
      />
      <div className="inspector-range-endpoints" aria-hidden="true">
        <span>{formatInspectorValueWithUnit(min, unit)}</span>
        <span>{formatInspectorValueWithUnit(max, unit)}</span>
      </div>
      {showNumber ? (
        <span className="inspector-control-line inspector-range-exact-line">
          <input
            aria-describedby={helpText ? descriptionID : undefined}
            aria-label={exactAriaLabel ?? `${ariaLabel ?? label} valor exato`}
            disabled={disabled}
            id={exactID}
            max={max}
            min={min}
            onBlur={(event) => {
              const nextValue = event.currentTarget.valueAsNumber;
              if (Number.isFinite(nextValue)) applyValue(nextValue);
            }}
            onChange={(event) => {
              const nextValue = event.currentTarget.valueAsNumber;
              if (Number.isFinite(nextValue)) applyValue(nextValue);
            }}
            step={step}
            type="number"
            value={normalizedValue}
          />
          {unit ? <span className="inspector-field-unit">{unit}</span> : null}
        </span>
      ) : null}
      {presets ? <InspectorPresets disabled={disabled} label={label} onChange={applyValue} presets={presets} value={normalizedValue} /> : null}
      {defaultValue !== undefined && normalizedValue !== defaultValue ? (
        <button
          aria-label={`Restaurar padrão de ${label}`}
          className="inspector-reset-button inspector-reset-button-block"
          disabled={disabled}
          onClick={() => applyValue(defaultValue)}
          title={`Restaurar padrão de ${label}`}
          type="button"
        >
          Restaurar padrão
        </button>
      ) : null}
      {helpText ? <small className="inspector-field-description" id={descriptionID}>{helpText}</small> : null}
    </div>
  );
}

export interface InspectorSelectProps extends InspectorFieldProps {
  ariaLabel?: string;
  disabled?: boolean;
  onChange: (value: string) => void;
  options: InspectorSelectOption[];
  value: string;
}

export function InspectorSelect({
  ariaLabel,
  className,
  description,
  disabled,
  label,
  onChange,
  options,
  value
}: InspectorSelectProps): React.ReactElement {
  return (
    <label className={className ? `inspector-field inspector-select-field ${className}` : "inspector-field inspector-select-field"}>
      <span className="inspector-field-label">{label}</span>
      <select
        aria-label={ariaLabel ?? label}
        disabled={disabled}
        onChange={(event) => onChange(event.currentTarget.value)}
        value={value}
      >
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select>
      {description ? <small className="inspector-field-description">{description}</small> : null}
    </label>
  );
}

export interface InspectorToggleProps extends InspectorFieldProps {
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}

export function InspectorToggle({ checked, className, description, disabled, label, onChange }: InspectorToggleProps): React.ReactElement {
  return (
    <label className={className ? `inspector-field inspector-toggle-field ${className}` : "inspector-field inspector-toggle-field"}>
      <input checked={checked} disabled={disabled} onChange={(event) => onChange(event.currentTarget.checked)} type="checkbox" />
      <span className="inspector-field-label">{label}</span>
      {description ? <small className="inspector-field-description">{description}</small> : null}
    </label>
  );
}

export interface InspectorVector2Props {
  legend?: string;
  labels?: [string, string];
  onChange: (axis: "x" | "y", value: number) => void;
  values: { x: number; y: number };
}

export function InspectorVector2({ legend = "Posição", labels = ["X", "Y"], onChange, values }: InspectorVector2Props): React.ReactElement {
  return (
    <fieldset className="inspector-vector2">
      <legend>{legend}</legend>
      <InspectorNumber label={labels[0]} onChange={(value) => onChange("x", value)} value={values.x} />
      <InspectorNumber label={labels[1]} onChange={(value) => onChange("y", value)} value={values.y} />
    </fieldset>
  );
}

const INSPECTOR_SECTION_STORAGE_PREFIX = "gba-studio:inspector-section:";

export function InspectorInfoTip({ label, children }: { label: string; children: ReactNode }): React.ReactElement {
  const descriptionID = useId();
  const [pinned, setPinned] = useState(false);
  const tipRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!pinned) return;
    const closeOnOutsidePress = (event: PointerEvent): void => {
      if (event.target instanceof Node && !tipRef.current?.contains(event.target)) setPinned(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePress);
    return () => document.removeEventListener("pointerdown", closeOnOutsidePress);
  }, [pinned]);

  return (
    <span className={pinned ? "inspector-info-tip is-pinned" : "inspector-info-tip"} ref={tipRef}>
      <button
        aria-label={`Informações sobre ${label}`}
        aria-describedby={descriptionID}
        aria-expanded={pinned}
        className="inspector-info-button"
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setPinned((current) => !current);
        }}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.stopPropagation();
            setPinned(false);
            event.currentTarget.blur();
          }
        }}
        type="button"
      >
        <Info aria-hidden="true" size={15} strokeWidth={2.2} />
      </button>
      <span className="inspector-info-popover" id={descriptionID} role="tooltip">{children}</span>
    </span>
  );
}

function readInspectorSectionOpen(persistKey: string | undefined, fallback: boolean): boolean {
  if (!persistKey || typeof window === "undefined") return fallback;
  try {
    const stored = window.localStorage.getItem(`${INSPECTOR_SECTION_STORAGE_PREFIX}${persistKey}`);
    return stored === null ? fallback : stored === "open";
  } catch {
    return fallback;
  }
}

function writeInspectorSectionOpen(persistKey: string | undefined, open: boolean): void {
  if (!persistKey || typeof window === "undefined") return;
  try {
    window.localStorage.setItem(`${INSPECTOR_SECTION_STORAGE_PREFIX}${persistKey}`, open ? "open" : "closed");
  } catch {
    // localStorage can be unavailable in embedded or privacy-restricted contexts.
  }
}

export function InspectorSection({
  ariaLabel,
  children,
  className,
  defaultOpen = true,
  description,
  persistKey,
  role,
  title
}: {
  ariaLabel?: string;
  children: ReactNode;
  className?: string;
  defaultOpen?: boolean;
  description?: string;
  persistKey?: string;
  role?: "group" | "region";
  title: string;
}): React.ReactElement {
  const [isOpen, setIsOpen] = useState(() => readInspectorSectionOpen(persistKey, defaultOpen));
  return (
    <details
      aria-label={ariaLabel}
      className={className ? `inspector-section ${className}` : "inspector-section"}
      onToggle={(event) => {
        const open = event.currentTarget.open;
        setIsOpen(open);
        writeInspectorSectionOpen(persistKey, open);
      }}
      open={isOpen}
      role={role}
    >
      <summary onClickCapture={(event) => {
        if (event.target instanceof Element && event.target.closest(".inspector-info-button")) {
          event.preventDefault();
        }
      }}>
        <span className="inspector-section-summary-title">{title}</span>
        {description ? <InspectorInfoTip label={title}>{description}</InspectorInfoTip> : null}
        <span
          aria-hidden="true"
          className="inspector-section-disclosure"
          data-inspector-disclosure="true"
          data-state={isOpen ? "open" : "closed"}
        >
          {isOpen ? <ChevronDown size={18} strokeWidth={2.6} /> : <ChevronRight size={18} strokeWidth={2.6} />}
        </span>
      </summary>
      <div className="inspector-section-content">{children}</div>
    </details>
  );
}

export function InspectorAction({
  children,
  className,
  disabled,
  onClick,
  title
}: {
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  onClick?: () => void;
  title?: string;
}): React.ReactElement {
  return (
    <button className={className ? `inspector-action ${className}` : "inspector-action"} disabled={disabled} onClick={onClick} title={title} type="button">
      {children}
    </button>
  );
}
