import { uiText as ui, useStudioUiText } from "./studioUiText";
import { X } from "lucide-react";
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

import { StudioButton } from "./studioUi";
import { useModalFocus } from "./useModalFocus";

export type StudioDialogVariant = "default" | "danger";

export interface StudioConfirmOptions {
  title?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: StudioDialogVariant;
}

export interface StudioPromptOptions {
  title?: string;
  label?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  placeholder?: string;
}

export interface StudioDeletionOptions extends StudioConfirmOptions {
  usages: readonly string[];
  replacements: readonly { value: string; label: string }[];
  canUnlink: boolean;
  suggestedReplacement?: string;
}

export type StudioDeletionChoice =
  | { kind: "unlink" }
  | { kind: "replace"; value: string };

interface StudioDialogContextValue {
  resolveDeletion(message: string, options: StudioDeletionOptions): Promise<StudioDeletionChoice | null>;
  confirm(message: string, options?: StudioConfirmOptions): Promise<boolean>;
  prompt(message: string, defaultValue?: string, options?: StudioPromptOptions): Promise<string | null>;
}

const StudioDialogContext = createContext<StudioDialogContextValue | null>(null);

type DialogState =
  | {
      kind: "deletion";
      message: string;
      options: StudioDeletionOptions;
      resolve: (value: StudioDeletionChoice | null) => void;
    }
  | {
      kind: "confirm";
      message: string;
      options: StudioConfirmOptions;
      resolve: (value: boolean) => void;
    }
  | {
      kind: "prompt";
      message: string;
      defaultValue: string;
      options: StudioPromptOptions;
      resolve: (value: string | null) => void;
    };

function StudioDialogSurface({
  state,
  onClose
}: {
  state: DialogState;
  onClose: () => void;
}): React.ReactElement {
  const ui = useStudioUiText();
  const [promptValue, setPromptValue] = useState(state.kind === "prompt" ? state.defaultValue : "");
  const inputRef = useRef<HTMLInputElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const surfaceRef = useRef<HTMLElement>(null);
  useModalFocus(surfaceRef, state.kind === "prompt" ? inputRef : cancelRef);
  const [resolution, setResolution] = useState<"replace" | "unlink" | "">("");
  const [replacement, setReplacement] = useState("");

  useEffect(() => {
    if (state.kind !== "deletion") return;
    setResolution("");
    setReplacement(state.options.suggestedReplacement ?? "");
    cancelRef.current?.focus();
  }, [state]);

  useEffect(() => {
    if (state.kind !== "prompt") return;
    setPromptValue(state.defaultValue);
    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [state]);

  const title = state.options.title ?? (state.kind === "prompt" ? "Informe o valor" : "Confirmar acao");
  const canResolveDeletion = state.kind === "deletion" && (
    (resolution === "unlink" && state.options.canUnlink)
    || (resolution === "replace" && state.options.replacements.some(option => option.value === replacement))
  );
  const canChooseResolution = state.kind === "deletion"
    && (state.options.canUnlink || state.options.replacements.length > 0);

  function handleConfirm(): void {
    if (state.kind === "confirm") {
      state.resolve(true);
      onClose();
      return;
    }

    if (state.kind === "deletion") {
      if (!canResolveDeletion) return;
      state.resolve(resolution === "replace" ? { kind: "replace", value: replacement } : { kind: "unlink" });
      onClose();
      return;
    }

    const trimmed = promptValue.trim();
    if (!trimmed) return;
    state.resolve(trimmed);
    onClose();
  }

  function handleCancel(): void {
    if (state.kind === "confirm") {
      state.resolve(false);
    } else {
      state.resolve(null);
    }
    onClose();
  }

  return (
    <div className="modal-backdrop studio-dialog-backdrop" role="presentation" onMouseDown={handleCancel}>
      <section
        ref={surfaceRef}
        tabIndex={-1}
        aria-labelledby="studio-dialog-title"
        aria-modal="true"
        className="modal-card studio-dialog-card"
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.key === "Escape") { event.preventDefault(); handleCancel(); }
        }}
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header className="modal-card-header studio-dialog-header">
          <div>
            <h2 id="studio-dialog-title">{ui(title)}</h2>
            <p>{ui(state.message)}</p>
          </div>
          <StudioButton aria-label={ui("Fechar")} className="ghost-button" onClick={handleCancel} type="button" variant="ghost">
            <X aria-hidden="true" size={16} strokeWidth={2.2} />
          </StudioButton>
        </header>

        {state.kind === "prompt" ? (
          <label className="studio-field ui-field">
            <span>{ui(state.options.label ?? "Valor")}</span>
            <input
              ref={inputRef}
              placeholder={state.options.placeholder}
              value={promptValue}
              onChange={(event) => setPromptValue(event.currentTarget.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  handleConfirm();
                }
              }}
            />
          </label>
        ) : null}

        {state.kind === "deletion" ? (
          <>
            <section className="studio-deletion-usages" aria-labelledby="studio-deletion-usages-title">
              <h3 id="studio-deletion-usages-title">{ui("Onde é usado")}</h3>
              <ul tabIndex={0}>{state.options.usages.map((usage, index) => <li key={index}>{ui(usage)}</li>)}</ul>
            </section>
            {canChooseResolution ? (
              <fieldset className="studio-deletion-choices">
                <legend>{ui("O que fazer com os vínculos?")}</legend>
                {state.options.replacements.length ? (
                  <label>
                    <input type="radio" name="deletion-resolution" checked={resolution === "replace"} onChange={() => setResolution("replace")} />
                    {ui("Substituir")}
                  </label>
                ) : null}
                {resolution === "replace" ? (
                  <label className="studio-field studio-deletion-replacement">
                    <span>{ui("Substituir por")}</span>
                    <select value={replacement} onChange={event => setReplacement(event.currentTarget.value)}>
                      <option value="">{ui("Escolha um item")}</option>
                      {state.options.replacements.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}
                    </select>
                  </label>
                ) : null}
                {state.options.canUnlink ? (
                  <label>
                    <input type="radio" name="deletion-resolution" checked={resolution === "unlink"} onChange={() => setResolution("unlink")} />
                    {ui("Desvincular")}
                  </label>
                ) : null}
                <p>{ui("Você pode desfazer a exclusão e restaurar os vínculos de uma vez.")}</p>
              </fieldset>
            ) : <p>{ui("Edite os vínculos acima para liberar a exclusão.")}</p>}
          </>
        ) : null}

        <div className="studio-dialog-actions">
          <button className="ui-button" ref={cancelRef} onClick={handleCancel} type="button">
            {ui(state.options.cancelLabel ?? "Cancelar")}
          </button>
          {state.kind !== "deletion" || canChooseResolution ? <StudioButton
            disabled={state.kind === "deletion" ? !canResolveDeletion : state.kind === "prompt" && !promptValue.trim()}
            onClick={handleConfirm}
            type="button"
            variant={state.kind !== "prompt" && state.options.variant === "danger" ? "danger" : "primary"}
          >
            {ui(state.options.confirmLabel ?? (state.kind === "prompt" ? "OK" : "Confirmar"))}
          </StudioButton> : null}
        </div>
      </section>
    </div>
  );
}

export function StudioDialogProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const ui = useStudioUiText();
  const [dialogState, setDialogState] = useState<DialogState | null>(null);
  const queueRef = useRef<DialogState[]>([]);
  const activeDialogRef = useRef<DialogState | null>(null);
  const dialogSequenceRef = useRef(0);

  const pumpQueue = useCallback(() => {
    if (activeDialogRef.current) return;
    // Dequeue once in the action, never in a state updater replayed by StrictMode.
    const next = queueRef.current.shift() ?? null;
    activeDialogRef.current = next;
    if (next) dialogSequenceRef.current++;
    setDialogState(next);
  }, []);

  const enqueueDialog = useCallback((state: DialogState) => {
    queueRef.current.push(state);
    pumpQueue();
  }, [pumpQueue]);

  const closeDialog = useCallback(() => {
    activeDialogRef.current = null;
    setDialogState(null);
    window.setTimeout(() => pumpQueue(), 0);
  }, [pumpQueue]);

  const confirm = useCallback((message: string, options: StudioConfirmOptions = {}) => {
    return new Promise<boolean>((resolve) => {
      enqueueDialog({ kind: "confirm", message, options, resolve });
    });
  }, [enqueueDialog]);

  const prompt = useCallback((message: string, defaultValue = "", options: StudioPromptOptions = {}) => {
    return new Promise<string | null>((resolve) => {
      enqueueDialog({ kind: "prompt", message, defaultValue, options, resolve });
    });
  }, [enqueueDialog]);

  const resolveDeletion = useCallback((message: string, options: StudioDeletionOptions) => {
    return new Promise<StudioDeletionChoice | null>((resolve) => {
      enqueueDialog({ kind: "deletion", message, options, resolve });
    });
  }, [enqueueDialog]);

  const value = useRef<StudioDialogContextValue>({ confirm, prompt, resolveDeletion });
  value.current = { confirm, prompt, resolveDeletion };

  return (
    <StudioDialogContext.Provider value={value.current}>
      {children}
      {dialogState ? <StudioDialogSurface key={dialogSequenceRef.current} state={dialogState} onClose={closeDialog} /> : null}
    </StudioDialogContext.Provider>
  );
}

export function useStudioDialog(): StudioDialogContextValue {
  const context = useContext(StudioDialogContext);
  if (!context) {
    throw new Error("useStudioDialog must be used within StudioDialogProvider");
  }
  return context;
}
