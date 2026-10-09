import { AlertCircle, CheckCircle2, Info } from "lucide-react";
import React, { createContext, useCallback, useContext, useRef, useState } from "react";

export type StudioToastKind = "success" | "error" | "info";

export interface StudioToastItem {
  id: string;
  message: string;
  kind: StudioToastKind;
}

export interface StudioToastOptions {
  kind?: StudioToastKind;
  durationMs?: number;
}

interface StudioToastContextValue {
  pushToast(message: string, options?: StudioToastOptions): void;
}

const StudioToastContext = createContext<StudioToastContextValue | null>(null);

const defaultDurationMs = 4200;

const toastIcons: Record<StudioToastKind, React.ReactElement> = {
  success: <CheckCircle2 aria-hidden="true" strokeWidth={2.2} />,
  error: <AlertCircle aria-hidden="true" strokeWidth={2.2} />,
  info: <Info aria-hidden="true" strokeWidth={2.2} />
};

function StudioToastStack({ toasts, onDismiss }: {
  toasts: StudioToastItem[];
  onDismiss(id: string): void;
}): React.ReactElement | null {
  if (toasts.length === 0) return null;

  return (
    <div aria-live="polite" className="studio-toast-stack" role="region" aria-label="Notificacoes">
      {toasts.map((toast) => (
        <div className={`studio-toast studio-toast--${toast.kind}`} key={toast.id} role="status">
          <span className="studio-toast-icon">{toastIcons[toast.kind]}</span>
          <span className="studio-toast-message">{toast.message}</span>
          <button
            aria-label="Fechar notificacao"
            className="studio-toast-dismiss"
            onClick={() => onDismiss(toast.id)}
            type="button"
          >
            ×
          </button>
        </div>
      ))}
    </div>
  );
}

export function StudioToastProvider({ children }: { children: React.ReactNode }): React.ReactElement {
  const [toasts, setToasts] = useState<StudioToastItem[]>([]);
  const timeoutsRef = useRef<Map<string, number>>(new Map());

  const dismissToast = useCallback((id: string) => {
    const timeout = timeoutsRef.current.get(id);
    if (timeout) {
      window.clearTimeout(timeout);
      timeoutsRef.current.delete(id);
    }
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const pushToast = useCallback((message: string, options: StudioToastOptions = {}) => {
    const id = globalThis.crypto.randomUUID();
    const kind = options.kind ?? "info";
    const durationMs = options.durationMs ?? defaultDurationMs;

    setToasts((current) => [...current.slice(-4), { id, message, kind }]);

    const timeout = window.setTimeout(() => dismissToast(id), durationMs);
    timeoutsRef.current.set(id, timeout);
  }, [dismissToast]);

  const value = useRef<StudioToastContextValue>({ pushToast });
  value.current = { pushToast };

  return (
    <StudioToastContext.Provider value={value.current}>
      {children}
      <StudioToastStack toasts={toasts} onDismiss={dismissToast} />
    </StudioToastContext.Provider>
  );
}

export function useStudioToast(): StudioToastContextValue {
  const context = useContext(StudioToastContext);
  if (!context) {
    throw new Error("useStudioToast must be used within StudioToastProvider");
  }
  return context;
}
