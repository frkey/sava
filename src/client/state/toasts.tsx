/**
 * Stacked toast host (DESIGN_REFERENCE §2 "Toast": bg ink-900, radius 12, anchored
 * bottom, auto-dismiss). ToastProvider renders both the context and the host — callers
 * never need a separate `<ToastHost/>`.
 */
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';

export type ToastKind = 'info' | 'error' | 'success';

interface ToastItem {
  id: number;
  message: string;
  kind: ToastKind;
}

export interface ToastContextValue {
  show(message: string, kind?: ToastKind): void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

const AUTO_DISMISS_MS = 5000;

function toastIcon(kind: ToastKind): string {
  if (kind === 'error') return '!';
  if (kind === 'success') return '✓';
  return 'i';
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts(current => current.filter(item => item.id !== id));
  }, []);

  const show = useCallback((message: string, kind: ToastKind = 'info') => {
    const id = ++idRef.current;
    setToasts(current => [...current, { id, message, kind }]);
    setTimeout(() => dismiss(id), AUTO_DISMISS_MS);
  }, [dismiss]);

  const value = useMemo<ToastContextValue>(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-host" aria-live="polite">
        {toasts.map(toast => (
          <div key={toast.id} className={`toast toast-${toast.kind}`} role="status">
            <span className="toast-icon" aria-hidden="true">{toastIcon(toast.kind)}</span>
            <span className="toast-message">{toast.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within a ToastProvider');
  return ctx;
}
