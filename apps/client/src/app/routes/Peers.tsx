import { useState } from "react";
import PeerList from "../components/PeerList";

const dummyPeers = [
  { id: "alice", status: "online" as const },
  { id: "bob", status: "offline" as const },
];

export default function Peers() {
  const [selfId, setSelfId] = useState("peer-" + crypto.randomUUID().slice(0, 6));
  const [targetId, setTargetId] = useState("");

  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-semibold">Peers</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <label className="text-sm text-white/70">Seu ID</label>
          <input
            className="bg-surface border border-white/10 rounded px-3 py-2 w-full"
            value={selfId}
            onChange={(e) => setSelfId(e.target.value)}
          />
          <p className="text-xs text-white/40">Compartilhe este ID com quem for enviar/receber arquivos.</p>
        </div>
        <div className="space-y-2">
          <label className="text-sm text-white/70">ID do destinatário</label>
          <input
            className="bg-surface border border-white/10 rounded px-3 py-2 w-full"
            value={targetId}
            onChange={(e) => setTargetId(e.target.value)}
          />
          <p className="text-xs text-white/40">Será usado ao iniciar uma sessão WebRTC ou QUIC.</p>
        </div>
      </div>

      <PeerList peers={dummyPeers} onSelect={(peer) => setTargetId(peer.id)} />
    </div>
  );
}
