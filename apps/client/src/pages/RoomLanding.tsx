import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { useRoom } from "../state/useRoomStore";

export function RoomLandingPage() {
  const navigate = useNavigate();
  const { roomId } = useRoom();
  const hasRoom = useMemo(() => Boolean(roomId), [roomId]);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <Card className="space-y-3 p-6">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold text-[var(--text)]">Sala</h1>
          <p className="text-sm text-[var(--muted)]">
            {hasRoom
              ? "Você já tem uma sala ativa. Volte para ela ou crie/entre em outra sala pela tela inicial."
              : "Nenhuma sala foi criada ainda. Crie uma nova sala ou entre em uma existente para começar."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {hasRoom ? (
            <>
              <Button onClick={() => navigate(`/room/${roomId}`)} className="min-w-[160px]">
                Ir para sala {roomId}
              </Button>
              <Button variant="secondary" onClick={() => navigate("/")}>
                Criar/entrar em outra sala
              </Button>
            </>
          ) : (
            <>
              <Button onClick={() => navigate("/")} className="min-w-[160px]">
                Criar sala
              </Button>
              <Button variant="ghost" onClick={() => navigate("/")}>
                Voltar
              </Button>
            </>
          )}
        </div>
      </Card>
    </div>
  );
}

export default RoomLandingPage;
