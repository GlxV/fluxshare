interface Props {
  value: number; // 0-1
  label?: string;
}

export default function ProgressBar({ value, label }: Props) {
  return (
    <div className="space-y-1">
      {label && <div className="text-sm text-white/70">{label}</div>}
      <div className="h-2 bg-white/10 rounded-full overflow-hidden">
        <div
          className="h-full bg-accent transition-all"
          style={{ width: `${Math.min(1, Math.max(0, value)) * 100}%` }}
        />
      </div>
    </div>
  );
}
