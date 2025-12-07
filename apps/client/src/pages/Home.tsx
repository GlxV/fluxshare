import { FormEvent, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { toast } from "../store/useToast";
import { useRoom } from "../state/useRoomStore";

const ROOM_CODE_PATTERN = /^[A-Z0-9-]{4,12}$/;

export function HomePage() {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<"join" | "create" | null>(null);
  const navigate = useNavigate();
  const { roomId, createRoom, joinRoom, copyInviteLink } = useRoom();

  const normalizedCode = useMemo(() => code.trim().toUpperCase(), [code]);
  const hasActiveRoom = Boolean(roomId);
  const isBusy = submitting !== null;

  function validateCode() {
    if (!normalizedCode) {
      setError("Informe um código para entrar na sala.");
      return false;
    }
    if (!ROOM_CODE_PATTERN.test(normalizedCode)) {
      setError("Código inválido. Use de 4 a 12 caracteres (A-Z, 0-9).");
      return false;
    }
    return true;
  }

  async function handleJoin(event?: FormEvent) {
    event?.preventDefault();
    if (isBusy) return;
    setError(null);

    if (!validateCode()) {
      toast({ message: "Código inválido. Verifique e tente novamente.", variant: "error" });
      return;
    }

    try {
      setSubmitting("join");
      const result = joinRoom(normalizedCode);
      if (!result?.roomId) {
        throw new Error("Não foi possível entrar na sala.");
      }
      toast({ message: `Conectando à sala ${result.roomId}`, variant: "success" });
      navigate(`/room/${result.roomId}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Falha ao entrar na sala.";
      setError(message);
      toast({ message, variant: "error" });
    } finally {
      setSubmitting(null);
    }
  }

  async function handleCreate() {
    if (isBusy) return;
    setError(null);

    try {
      setSubmitting("create");
      const result = createRoom();
      if (!result?.roomId) {
        throw new Error("Não foi possível criar a sala.");
      }
      toast({ message: `Sala ${result.roomId} criada com sucesso.`, variant: "success" });
      navigate(`/room/${result.roomId}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Falha ao criar sala.";
      setError(message);
      toast({ message, variant: "error" });
    } finally {
      setSubmitting(null);
    }
  }

  async function handleCopy() {
    if (!roomId) return;
    const result = await copyInviteLink();
    if (result.url) {
      toast({
        message: result.copied ? "Link copiado para a área de transferência." : "Link gerado. Copie manualmente se preferir.",
        variant: result.copied ? "success" : "info",
      });
    } else {
      toast({ message: "Não foi possível copiar o link da sala.", variant: "error" });
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {hasActiveRoom ? (
        <Card className="flex flex-col gap-3 p-5">
          <div className="flex flex-col gap-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Sala ativa</p>
            <p className="font-mono text-lg text-[var(--text)]">{roomId}</p>
            <p className="text-sm text-[var(--muted)]">
              Você já possui uma sala em andamento. Volte para ela ou crie uma nova somente se precisar resetar.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => navigate(`/room/${roomId}`)} disabled={isBusy} className="min-w-[160px]">
              Voltar para sala
            </Button>
            <Button variant="ghost" onClick={handleCopy} disabled={!roomId}>
              Copiar link
            </Button>
          </div>
        </Card>
      ) : null}

      <Card className="space-y-6 p-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-[var(--text)]">FluxShare</h1>
          <p className="text-sm text-[var(--muted)]">
            Entre com um código de sala para iniciar uma sessão de compartilhamento P2P ou crie uma sala nova.
          </p>
        </div>

        <form onSubmit={handleJoin} className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
              Código da sala
            </label>
            <input
              className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--text)] placeholder:text-[var(--muted)]/80 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]"
              value={code}
              onChange={(event) => {
                const next = event.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, "");
                setCode(next);
                if (error) setError(null);
              }}
              placeholder="Ex: AB12CD"
              autoComplete="off"
              spellCheck={false}
              inputMode="text"
            />
            {error ? (
              <p className="text-xs text-[color-mix(in srgb,var(--primary) 35%,#ffb4b4 65%)]">{error}</p>
            ) : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <Button type="submit" className="w-full" disabled={isBusy || normalizedCode.length === 0}>
              {submitting === "join" ? "Entrando..." : "Entrar na sala"}
            </Button>
            <Button type="button" variant="secondary" className="w-full" onClick={handleCreate} disabled={isBusy}>
              {submitting === "create" ? "Criando sala..." : "Criar nova sala"}
            </Button>
          </div>
          <p className="text-xs text-[var(--muted)]">
            O botão fica desabilitado enquanto processamos sua ação para evitar duplicidades.
          </p>
        </form>
      </Card>
    </div>
  );
}

export default HomePage;
