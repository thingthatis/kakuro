import type { ToastState } from './toast-state';

interface ToastProps {
  toast: ToastState | null;
}

export function Toast({ toast }: ToastProps) {
  if (!toast) return null;
  return (
    <div
      className={`toast toast-${toast.kind}`}
      role="status"
      aria-live="polite"
      key={toast.id}
    >
      {toast.message}
    </div>
  );
}

