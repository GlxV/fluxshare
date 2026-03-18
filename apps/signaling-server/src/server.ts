import "dotenv/config";
import { server } from "./index";

const DEFAULT_PORT = 4000;
const DEFAULT_HOST = "127.0.0.1";

function resolvePort(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed <= 0) {
    console.warn(
      `[signaling] invalid PORT "${value}" received, falling back to ${fallback}`,
    );
    return fallback;
  }

  return parsed;
}

const PORT = resolvePort(process.env.PORT, DEFAULT_PORT);
const BIND_REMOTE = /^(1|true|yes)$/i.test(process.env.SIGNALING_BIND_REMOTE ?? "");
const HOST = BIND_REMOTE ? process.env.HOST || process.env.SIGNALING_HOST || "0.0.0.0" : DEFAULT_HOST;

server.listen(PORT, HOST, () => {
  const scope = HOST === DEFAULT_HOST ? "loopback-only" : "remote binding enabled";
  console.log(`[signaling] listening on http://${HOST}:${PORT} (${scope})`);
});
