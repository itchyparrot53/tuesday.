import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { CheckCircle2, XCircle } from 'lucide-react';
import { cn } from '../../lib/cn';

type ToastKind = 'error' | 'success';

interface ToastAction {
  label: string;
  onClick: () => void;
}

interface ToastItem {
  id: number;
  message: string;
  kind: ToastKind;
  action?: ToastAction;
}

interface ToastApi {
  show: (message: string, kind?: ToastKind, action?: ToastAction) => void;
}

const ToastContext = createContext<ToastApi>({ show: () => {} });

export function useToast(): ToastApi {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const next = useRef(1);

  const show = useCallback((message: string, kind: ToastKind = 'error', action?: ToastAction) => {
    const id = next.current++;
    setItems((prev) => [...prev, { id, message, kind, action }]);
    window.setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
    }, 4000);
  }, []);

  const value = useMemo(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed bottom-4 right-4 z-[100] flex w-[360px] max-w-[calc(100vw-32px)] flex-col gap-2 max-sm:bottom-4 max-sm:left-1/2 max-sm:right-auto max-sm:-translate-x-1/2">
        {items.map((item) => (
          <div
            key={item.id}
            className={cn(
              'flex items-start gap-2 rounded-[10px] border bg-surface px-3 py-2.5 text-sm shadow-pop',
              item.kind === 'error' ? 'border-danger/30 text-danger' : 'border-success/30 text-ink',
            )}
          >
            {item.kind === 'error' ? (
              <XCircle size={16} className="mt-0.5 shrink-0" />
            ) : (
              <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-success" />
            )}
            <span className="min-w-0 flex-1">{item.message}</span>
            {item.action && (
              <button
                className="shrink-0 rounded-[6px] px-1.5 py-0.5 font-semibold text-ink hover:bg-sunken"
                onClick={() => {
                  item.action?.onClick();
                  setItems((prev) => prev.filter((entry) => entry.id !== item.id));
                }}
              >
                {item.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
