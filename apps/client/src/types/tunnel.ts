export type TunnelProvider = "cloudflare" | "mock";

export const TUNNEL_PROVIDERS: TunnelProvider[] = ["cloudflare", "mock"];

export const TUNNEL_PROVIDER_LABEL: Record<TunnelProvider, string> = {
  cloudflare: "Cloudflare",
  mock: "Mock local",
};
