interface PeerInfo {
  id: string;
  status: "online" | "offline";
}

interface Props {
  peers: PeerInfo[];
  onSelect?: (peer: PeerInfo) => void;
}

export default function PeerList({ peers, onSelect }: Props) {
  return (
    <div className="space-y-2">
      {peers.map((peer) => (
        <button
          key={peer.id}
          className={`w-full flex items-center justify-between px-4 py-2 rounded-md bg-surface/70 border border-white/10 hover:border-accent/60`}
          onClick={() => onSelect?.(peer)}
        >
          <span>{peer.id}</span>
          <span
            className={`text-xs uppercase tracking-wide ${
              peer.status === "online" ? "text-green-400" : "text-white/40"
            }`}
          >
            {peer.status}
          </span>
        </button>
      ))}
    </div>
  );
}
