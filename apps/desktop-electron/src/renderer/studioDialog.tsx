import { X } from "lucide-react";
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";

import { StudioButton } from "./studioUi";

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

interface StudioDialogContextValue {
  confirm(message: string, options?: StudioConfirmOptions): Promise<boolean>;
  prompt(message: string, defaultValue?: string, options?: StudioPromptOptions): Promise<string | null>;
}

const StudioDialogContext = createContext<StudioDialogContextValue | null>(null);

type DialogState =
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
  const [promptValue, setPromptValue] = useState(state.kind === "prompt" ? state.defaultValue : "");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (state.kind !== "prompt") return;
    setPromptValue(state.defaultValue);
    const frame = window.requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [state]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key === "Escape") {
        event.preventDefault();
        if (state.kind === "confirm") {
          state.resolve(false);
        } else {
          state.resolve(null);
        }
        onClose();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, state]);

  const title = state.kind === "confirm"
    ? state.options.title ?? "Confirmar acao"
    : state.options.title ?? "Informe o valor";

  function handleConfirm(): void {
    if (state.kind === "confirm") {
      state.resolve(true);
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
        aria-labelledby="studio-dialog-title"
        aria-modal="true"
        className="modal-card studio-dialog-card"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
      >
        <header className="modal-card-header studio-dialog-header">
          <div>
            <h2 id="studio-dialog-title">{title}</h2>
            <p>{state.message}</p>
          </div>
          <StudioButton aria-label="Fechar" className="ghost-button" onClick={handleCancel} type="button" variant="ghost">
            <X aria-hidden="true" size={16} strokeWidth={2.2} />
          </StudioButton>
        </header>

        {state.kind === "prompt" ? (
          <label className="studio-field ui-field">
            <span>{state.options.label ?? "Valor"}</span>
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

        <div className="studio-dialog-actions">
          <StudioButton onClick={handleCancel} type="button" variant="secondary">
            {state.kind === "confirm"
              ? state.options.cancelLabel ?? "Cancelar"
              : state.options.cancelLabel ?? "Cancelar"}
          </StudioButton>
          <StudioButton
            disabled={state.kind === "prompt" && !promptValue.trim()}
            onClick={handleConfirm}
            type="button"
            variant={state.kind === "confirm" && state.options.variant === "danger" ? "danger" : "primary"}
          >
            {state.kind === "confirm"
              ? state.options.confirmLabel ?? "Confirmar"
              : state.options.confirmLabel ?? "OK"}
          </StudioButton>
        </div>
      </section>
    </div>
  );
}

export function StudioDialogProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [dialogState, setDialogState] = useState<DialogState | null>(null);
  const queueRef = useRef<DialogState[]>([]);

  const pumpQueue = useCallback(() => {
    setDialogState((current) => {
      if (current) return current;
      return queueRef.current.shift() ?? null;
    });
  }, []);

  const enqueueDialog = useCallback((state: DialogState) => {
    queueRef.current.push(state);
    pumpQueue();
  }, [pumpQueue]);

  const closeDialog = useCallback(() => {
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

  const value = useRef<StudioDialogContextValue>({ confirm, prompt });
  value.current = { confirm, prompt };

  return (
    <StudioDialogContext.Provider value={value.current}>
      {children}
      {dialogState ? <StudioDialogSurface state={dialogState} onClose={closeDialog} /> : null}
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
