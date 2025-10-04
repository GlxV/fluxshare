interface Props {
  rate: number; // bytes/sec
  etaSeconds?: number | null;
}

function formatBytes(bytes: number) {
  if (bytes <= 0) return "0 B";
  const units = ["B", "KiB", "MiB", "GiB"];
  const idx = Math.min(Math.floor(Math.log2(bytes) / 10), units.length - 1);
  const value = bytes / 2 ** (idx * 10);
  return `${value.toFixed(1)} ${units[idx]}`;
}

export default function SpeedMeter({ rate, etaSeconds }: Props) {
  return (
    <div className="flex items-center gap-4 text-sm text-white/80">
      <span>Velocidade: {formatBytes(rate)}/s</span>
      {etaSeconds != null && Number.isFinite(etaSeconds) && (
        <span>ETA: {Math.max(0, etaSeconds).toFixed(0)}s</span>
      )}
    </div>
  );
}
