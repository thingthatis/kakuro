import { useState, useCallback, useEffect } from 'react';

export type ToastKind = 'info' | 'success' | 'error';

export interface ToastState {
  message: string;
  kind: ToastKind;
  /** Monotonic id used as a key so the same message can fire repeatedly. */
  id: number;
}

/**
 * Lightweight ephemeral banner shown in the bottom-right of the viewport.
 * Auto-dismisses after `TOAST_TTL_MS`. Used for feedback that doesn't
 * deserve a modal ("Copied!", "Daily challenge loaded").
 *
 * Returns the current `toast` element (or null) plus a `showToast` callback.
 */
export function useToast() {
  const [toast, setToast] = useState<ToastState | null>(null);

  const showToast = useCallback((message: string, kind: ToastKind = 'info') => {
    setToast({ message, kind, id: Date.now() });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const id = window.setTimeout(() => {
      setToast(prev => (prev && prev.id === toast.id ? null : prev));
    }, 2400);
    return () => window.clearTimeout(id);
  }, [toast]);

  return { toast, showToast };
}
