'use client';

import { createContext, useContext, useState, useCallback, ReactNode, ReactElement } from 'react';

export type ToastType = 'pending' | 'success' | 'error' | 'info';

export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  txHash?: string;
  duration?: number;
}

interface ToastCtx {
  addToast: (t: Omit<Toast, 'id'>) => string;
  removeToast: (id: string) => void;
  updateToast: (id: string, updates: Partial<Toast>) => void;
}

const ToastContext = createContext<ToastCtx>({
  addToast: () => '',
  removeToast: () => {},
  updateToast: () => {},
});

export function useToast() {
  return useContext(ToastContext);
}

const ICONS: Record<ToastType, ReactElement> = {
  pending: (
    <svg className="w-5 h-5 text-blue-500 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  ),
  success: (
    <svg className="w-5 h-5 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
    </svg>
  ),
  error: (
    <svg className="w-5 h-5 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  ),
  info: (
    <svg className="w-5 h-5 text-indigo-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
    </svg>
  ),
};

const BSCSCAN_BASE = process.env.NEXT_PUBLIC_CHAIN_ID === '31337'
  ? 'https://localhost:8545/tx/'
  : 'https://bscscan.com/tx/';

function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: () => void }) {
  return (
    <div className={`flex items-start gap-3 bg-white border rounded-2xl p-4 shadow-lg shadow-black/5 min-w-[300px] max-w-[380px] transition-all duration-300 animate-in slide-in-from-right-2
      ${toast.type === 'error' ? 'border-red-100' : toast.type === 'success' ? 'border-emerald-100' : 'border-gray-100'}`}>
      <div className="shrink-0 mt-0.5">{ICONS[toast.type]}</div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-gray-900 text-sm">{toast.title}</div>
        {toast.message && <div className="text-xs text-gray-500 mt-0.5 leading-relaxed">{toast.message}</div>}
        {toast.txHash && (
          <a
            href={`${BSCSCAN_BASE}${toast.txHash}`}
            target="_blank" rel="noreferrer"
            className="text-xs text-indigo-500 hover:text-indigo-700 font-mono mt-1 block truncate transition-colors"
          >
            {toast.txHash.slice(0, 10)}…{toast.txHash.slice(-6)} ↗
          </a>
        )}
      </div>
      <button onClick={onRemove} className="shrink-0 text-gray-300 hover:text-gray-500 transition-colors mt-0.5">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const addToast = useCallback((t: Omit<Toast, 'id'>): string => {
    const id = Math.random().toString(36).slice(2);
    setToasts(prev => [...prev, { ...t, id }]);
    const duration = t.duration ?? (t.type === 'pending' ? 60_000 : t.type === 'error' ? 8_000 : 5_000);
    if (duration > 0) setTimeout(() => removeToast(id), duration);
    return id;
  }, [removeToast]);

  const updateToast = useCallback((id: string, updates: Partial<Toast>) => {
    setToasts(prev => prev.map(t => t.id === id ? { ...t, ...updates } : t));
  }, []);

  return (
    <ToastContext.Provider value={{ addToast, removeToast, updateToast }}>
      {children}
      {/* Toast portal */}
      <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-3 items-end pointer-events-none">
        {toasts.map(t => (
          <div key={t.id} className="pointer-events-auto">
            <ToastItem toast={t} onRemove={() => removeToast(t.id)} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
