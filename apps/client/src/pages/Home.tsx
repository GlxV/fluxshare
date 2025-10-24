import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { useRoom } from "../state/useRoomStore";

export function HomePage() {
  const [code, setCode] = useState("");
  const navigate = useNavigate();
  const { createRoom, joinRoom } = useRoom();

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const trimmed = code.trim();
    const result = trimmed ? joinRoom(trimmed) : createRoom();
    if (result?.roomId) {
      navigate(`/room/${result.roomId}`);
    }
  }

  return (
    <div className="mx-auto max-w-xl">
      <Card className="space-y-6 p-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-[var(--text)]">FluxShare</h1>
          <p className="text-sm text-[var(--muted)]">
            Entre com um código de sala para iniciar uma sessão de compartilhamento P2P.
          </p>
        </div>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
              Código da sala
            </label>
            <input
              className="w-full rounded-2xl border border-[var(--border)]/70 bg-[var(--card)]/60 px-4 py-3 text-sm text-[var(--text)] placeholder:text-[var(--muted)]/80 focus-visible:outline focus-visible:outline-2 focus-visible:outline-[var(--primary)] focus-visible:outline-offset-2"
              value={code}
              onChange={(event) => setCode(event.target.value.toUpperCase())}
              placeholder="Ex: AB12CD"
            />
          </div>
          <Button type="submit" className="w-full">
            Entrar ou criar sala
          </Button>
        </form>
      </Card>
    </div>
  );
}

export default HomePage;
