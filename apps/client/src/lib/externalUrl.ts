const TRUSTED_RELEASE_HOSTS = new Set(["github.com", "www.github.com"]);
const TRUSTED_RELEASE_PATH_PREFIX = "/GlxV/fluxshare/releases";

export function resolveTrustedReleaseUrl(candidate?: string | null): string | null {
  if (!candidate) {
    return null;
  }

  try {
    const url = new URL(candidate);
    if (url.protocol !== "https:") {
      return null;
    }
    if (!TRUSTED_RELEASE_HOSTS.has(url.hostname)) {
      return null;
    }
    if (!url.pathname.startsWith(TRUSTED_RELEASE_PATH_PREFIX)) {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}
