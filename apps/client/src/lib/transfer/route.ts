import { isTauri } from "../persist/tauri";
import { type TunnelProvider } from "../../types/tunnel";

export type TransferRoute = "tunnel" | "tunnel-fallback" | "local" | "p2p";

export interface TransferIntent {
  preferLocal?: boolean;
  forceRoute?: TransferRoute;
}

export interface TransferEnvironment {
  fallbackEnabled: boolean;
  primaryProvider: TunnelProvider;
  fallbackProvider: TunnelProvider;
  localOnly: boolean;
}

export interface RouteDecision {
  route: TransferRoute;
  provider?: TunnelProvider;
  fallback?: TunnelProvider;
}

export function selectTransferRoute(intent: TransferIntent, env: TransferEnvironment): RouteDecision {
  if (intent.forceRoute) {
    return { route: intent.forceRoute, provider: env.primaryProvider, fallback: env.fallbackProvider };
  }
  if (!isTauri()) {
    return { route: "p2p" };
  }
  if (env.localOnly || intent.preferLocal) {
    return { route: "local" };
  }
  if (env.fallbackEnabled) {
    return { route: "tunnel-fallback", provider: env.primaryProvider, fallback: env.fallbackProvider };
  }
  return { route: "tunnel", provider: env.primaryProvider };
}
