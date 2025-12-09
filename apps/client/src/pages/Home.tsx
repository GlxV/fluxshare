import { FormEvent, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Card } from "../components/ui/Card";
import { Button } from "../components/ui/Button";
import { toast } from "../store/useToast";
import { useRoom } from "../state/useRoomStore";
import { useI18n } from "../i18n/LanguageProvider";

const ROOM_CODE_PATTERN = /^[A-Z0-9-]{4,12}$/;

export function HomePage() {
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState<"join" | "create" | null>(null);
  const navigate = useNavigate();
  const { roomId, createRoom, joinRoom, copyInviteLink } = useRoom();
  const { t } = useI18n();

  const normalizedCode = useMemo(() => code.trim().toUpperCase(), [code]);
  const hasActiveRoom = Boolean(roomId);
  const isBusy = submitting !== null;

  function validateCode() {
    if (!normalizedCode) {
      setError(t("p2p.validation.required"));
      return false;
    }
    if (!ROOM_CODE_PATTERN.test(normalizedCode)) {
      setError(t("p2p.validation.invalid"));
      return false;
    }
    return true;
  }

  async function handleJoin(event?: FormEvent) {
    event?.preventDefault();
    if (isBusy) return;
    setError(null);

    if (!validateCode()) {
      toast({ message: t("p2p.toast.invalid"), variant: "error" });
      return;
    }

    try {
      setSubmitting("join");
      const result = joinRoom(normalizedCode);
      if (!result?.roomId) {
        throw new Error(t("p2p.toast.joinError"));
      }
      toast({ message: t("p2p.toast.joining", { room: result.roomId }), variant: "success" });
      navigate(`/p2p/${result.roomId}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : t("p2p.toast.joinError");
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
        throw new Error(t("p2p.toast.joinError"));
      }
      toast({ message: t("p2p.toast.created", { room: result.roomId }), variant: "success" });
      navigate(`/p2p/${result.roomId}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : t("p2p.toast.joinError");
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
        message: result.copied ? t("p2p.toast.copySuccess") : t("p2p.toast.copyInfo"),
        variant: result.copied ? "success" : "info",
      });
    } else {
      toast({ message: t("p2p.toast.copyError"), variant: "error" });
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      {hasActiveRoom ? (
        <Card className="flex flex-col gap-3 p-5">
          <div className="flex flex-col gap-1">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">
              {t("p2p.activeRoom")}
            </p>
            <p className="font-mono text-lg text-[var(--text)]">{roomId}</p>
            <p className="text-sm text-[var(--muted)]">
              {t("p2p.activeRoomHint")}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button onClick={() => navigate(`/p2p/${roomId}`)} disabled={isBusy} className="min-w-[160px]">
              {t("p2p.goToRoom")}
            </Button>
            <Button variant="ghost" onClick={handleCopy} disabled={!roomId}>
              {t("p2p.copyLink")}
            </Button>
          </div>
        </Card>
      ) : null}

      <Card className="space-y-6 p-6">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold text-[var(--text)]">{t("p2p.title")}</h1>
          <p className="text-sm text-[var(--muted)]">{t("p2p.subtitle")}</p>
        </div>

        <form onSubmit={handleJoin} className="space-y-4">
          <div className="space-y-2">
            <label className="text-xs font-medium uppercase tracking-wide text-[var(--muted)]">
              {t("p2p.roomCode")}
            </label>
            <input
              className="w-full rounded-2xl border border-[var(--border)] bg-[var(--surface)] px-4 py-3 text-sm text-[var(--text)] placeholder:text-[var(--muted)]/80 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ring)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]"
              value={code}
              onChange={(event) => {
                const next = event.target.value.toUpperCase().replace(/[^A-Z0-9-]/g, "");
                setCode(next);
                if (error) setError(null);
              }}
              placeholder={t("p2p.placeholder")}
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
              {submitting === "join" ? t("p2p.joining") : t("p2p.join")}
            </Button>
            <Button type="button" variant="secondary" className="w-full" onClick={handleCreate} disabled={isBusy}>
              {submitting === "create" ? t("p2p.creating") : t("p2p.create")}
            </Button>
          </div>
          <p className="text-xs text-[var(--muted)]">
            {t("p2p.buttonHint")}
          </p>
        </form>
      </Card>
    </div>
  );
}

export default HomePage;
