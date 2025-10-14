import { create } from "zustand";

export type ToastVariant = "default" | "info" | "success" | "warning" | "error";

export interface ToastItem {
  id: string;
  message: string;
  variant: ToastVariant;
  duration: number;
}

interface ToastStore {
  toasts: ToastItem[];
  showToast: (toast: Omit<ToastItem, "id"> & { id?: string }) => string;
  dismiss: (id: string) => void;
}

const DEFAULT_DURATION = 5000;

function createId() {
  return Math.random().toString(36).slice(2, 10);
}

export const useToastStore = create<ToastStore>((set, get) => ({
  toasts: [],
  showToast: (toast) => {
    const id = toast.id ?? createId();
    const item: ToastItem = {
      id,
      message: toast.message,
      variant: toast.variant ?? "default",
      duration: toast.duration ?? DEFAULT_DURATION,
    };
    set((state) => ({
      toasts: [...state.toasts.filter((existing) => existing.id !== id), item],
    }));
    const duration = toast.duration ?? DEFAULT_DURATION;
    if (duration !== Infinity && typeof window !== "undefined") {
      window.setTimeout(() => {
        get().dismiss(id);
      }, duration);
    }
    return id;
  },
  dismiss: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((toast) => toast.id !== id),
    })),
}));

export function toast(options: Omit<ToastItem, "id"> & { id?: string }) {
  return useToastStore.getState().showToast(options);
}
