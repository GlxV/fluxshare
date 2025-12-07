import { getVersion } from "@tauri-apps/api/app";

export interface UpdateInfo {
  hasUpdate: boolean;
  currentVersion: string;
  latestVersion: string;
  releaseUrl: string;
  releaseNotes?: string;
}

const RELEASES_ENDPOINT = "https://api.github.com/repos/GlxV/fluxshare/releases/latest";
const RELEASES_PAGE = "https://github.com/GlxV/fluxshare/releases";

function normalizeVersion(version: string) {
  return version.replace(/^v/i, "").trim();
}

function toSemverParts(version: string) {
  return normalizeVersion(version)
    .split(".")
    .map((value) => {
      const parsed = Number.parseInt(value, 10);
      return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
    });
}

function compareSemver(a: string, b: string): number {
  const aParts = toSemverParts(a);
  const bParts = toSemverParts(b);
  const length = Math.max(aParts.length, bParts.length, 3);
  for (let index = 0; index < length; index += 1) {
    const aVal = aParts[index] ?? 0;
    const bVal = bParts[index] ?? 0;
    if (aVal > bVal) return 1;
    if (aVal < bVal) return -1;
  }
  return 0;
}

export async function checkForUpdates(): Promise<UpdateInfo> {
  let currentVersion = "0.0.0";
  try {
    currentVersion = normalizeVersion(await getVersion());
  } catch (error) {
    console.warn("fluxshare:update", "failed to read current version", error);
  }

  try {
    const response = await fetch(RELEASES_ENDPOINT, {
      headers: { Accept: "application/vnd.github+json" },
    });
    if (!response.ok) {
      throw new Error(`GitHub API respondeu ${response.status}`);
    }

    const data = (await response.json()) as {
      tag_name?: string;
      html_url?: string;
      body?: string;
    };

    const latestVersion = normalizeVersion(data?.tag_name ?? "");
    const releaseUrl = data?.html_url || RELEASES_PAGE;
    const releaseNotes = data?.body?.trim() ? data.body : undefined;
    const versionToCompare = latestVersion || currentVersion;
    const hasUpdate = compareSemver(versionToCompare, currentVersion) > 0;

    return {
      hasUpdate,
      currentVersion,
      latestVersion: versionToCompare,
      releaseUrl,
      releaseNotes,
    };
  } catch (error) {
    console.error("fluxshare:update", error);
    return {
      hasUpdate: false,
      currentVersion,
      latestVersion: currentVersion,
      releaseUrl: RELEASES_PAGE,
    };
  }
}
