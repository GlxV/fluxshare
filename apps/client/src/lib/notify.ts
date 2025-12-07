import { toast } from "../store/useToast";

type NotificationPermissionState = "default" | "granted" | "denied";

export interface NotifyPayload {
  title: string;
  body?: string;
  tag?: string;
  silent?: boolean;
}

function isNotificationSupported() {
  return typeof window !== "undefined" && "Notification" in window;
}

async function ensurePermission(): Promise<NotificationPermissionState> {
  if (!isNotificationSupported()) return "denied";
  if (Notification.permission === "granted" || Notification.permission === "denied") {
    return Notification.permission;
  }
  try {
    return await Notification.requestPermission();
  } catch {
    return "default";
  }
}

export async function notify(payload: NotifyPayload, useToastFallback = true) {
  const permission = await ensurePermission();
  if (permission === "granted" && isNotificationSupported()) {
    try {
      new Notification(payload.title, {
        body: payload.body,
        tag: payload.tag,
        silent: payload.silent ?? false,
      });
      return;
    } catch (error) {
      console.warn("fluxshare:notify", "native notification failed", error);
    }
  }
  if (useToastFallback) {
    toast({ message: payload.body ? `${payload.title}: ${payload.body}` : payload.title, variant: "info" });
  }
}
