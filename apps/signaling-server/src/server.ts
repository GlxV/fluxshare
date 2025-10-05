import "dotenv/config";
import { server } from "./index";

const DEFAULT_PORT = 4000;

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

server.listen(PORT, () => {
  console.log(`[signaling] listening on http://localhost:${PORT}`);
});
