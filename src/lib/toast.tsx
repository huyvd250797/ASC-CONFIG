import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';

export type ToastKind = 'success' | 'error' | 'info';

export type ToastInput = {
  kind: ToastKind;
  title: string;
  detail?: string;
  /** Thời gian tự đóng (ms). 0 = không tự đóng. */
  duration?: number;
};

type Toast = ToastInput & { id: number };

const ToastContext = createContext<(toast: ToastInput) => void>(() => {});

/** Gửi một thông báo ngắn cho người dùng. */
export function useToast() {
  return useContext(ToastContext);
}

const ICONS = {
  success: CheckCircle2,
  error: AlertTriangle,
  info: Info,
} as const;

const DEFAULT_DURATION = { success: 2600, error: 5000, info: 5000 } as const;

function ToastItem({ toast, onClose }: { toast: Toast; onClose: (id: number) => void }) {
  const duration = toast.duration ?? DEFAULT_DURATION[toast.kind];

  useEffect(() => {
    if (!duration) return;
    const timer = window.setTimeout(() => onClose(toast.id), duration);
    return () => window.clearTimeout(timer);
  }, [duration, onClose, toast.id]);

  const Icon = ICONS[toast.kind];

  return (
    <div className={`toast ${toast.kind}`} role={toast.kind === 'error' ? 'alert' : 'status'}>
      <Icon size={22} />
      <div className="toast-text">
        <strong>{toast.title}</strong>
        {toast.detail && <span>{toast.detail}</span>}
      </div>
      <button type="button" onClick={() => onClose(toast.id)} aria-label="Đóng thông báo">
        <X size={16} />
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const remove = useCallback((id: number) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const notify = useCallback((toast: ToastInput) => {
    setToasts((current) => {
      const next = [...current, { ...toast, id: Date.now() + Math.random() }];
      // Giữ tối đa 4 thông báo để không che mất dữ liệu.
      return next.slice(-4);
    });
  }, []);

  const value = useMemo(() => notify, [notify]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-stack" aria-live="polite">
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onClose={remove} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}
