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
    <div className="space-y-8">
      <section className="space-y-3">
        <span className="fs-kicker">{t("nav.p2p")}</span>
        <h1 className="fs-page-title">{t("p2p.title")}</h1>
        <p className="fs-page-subtitle">{t("p2p.subtitle")}</p>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.3fr)_22rem]">
        <Card className="space-y-6 p-6 md:p-7">
          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--muted)]">
              {t("p2p.roomCode")}
            </p>
            <p className="text-2xl font-semibold tracking-[-0.04em] text-[var(--text)]">{t("p2p.join")}</p>
            <p className="max-w-2xl text-sm leading-6 text-[var(--muted)]">{t("p2p.buttonHint")}</p>
          </div>

          <form onSubmit={handleJoin} className="space-y-5">
            <div className="space-y-2">
              <label className="fs-label">
                <span>{t("p2p.roomCode")}</span>
                <span>{t("p2p.placeholder")}</span>
              </label>
              <input
                className="fs-input font-mono tracking-[0.14em] uppercase"
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
                <p className="text-xs text-[color-mix(in_srgb,var(--danger)_82%,var(--text)_18%)]">{error}</p>
              ) : null}
            </div>

            <div className="flex flex-col gap-3 sm:flex-row">
              <Button type="submit" size="lg" className="sm:flex-1" disabled={isBusy || normalizedCode.length === 0}>
                {submitting === "join" ? t("p2p.joining") : t("p2p.join")}
              </Button>
              <Button type="button" size="lg" variant="secondary" className="sm:flex-1" onClick={handleCreate} disabled={isBusy}>
                {submitting === "create" ? t("p2p.creating") : t("p2p.create")}
              </Button>
            </div>
          </form>
        </Card>

        <Card tone="muted" className="space-y-5 p-5">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.1em] text-[var(--muted)]">
              {hasActiveRoom ? t("p2p.activeRoom") : t("nav.p2p")}
            </p>
            <p className="text-xl font-semibold tracking-[-0.03em] text-[var(--text)]">
              {hasActiveRoom ? roomId : t("p2p.create")}
            </p>
          </div>

          <div className="rounded-[var(--radius-lg)] border border-[color-mix(in_srgb,var(--panel-muted)_34%,var(--border)_66%)] bg-[color-mix(in_srgb,var(--panel-muted)_88%,transparent)] p-4">
            <p className="text-sm leading-6 text-[var(--muted)]">
              {hasActiveRoom ? t("p2p.activeRoomHint") : t("p2p.subtitle")}
            </p>
          </div>

          {hasActiveRoom ? (
            <div className="space-y-2">
              <Button size="lg" className="w-full" onClick={() => navigate(`/p2p/${roomId}`)} disabled={isBusy}>
                {t("p2p.goToRoom")}
              </Button>
              <Button variant="ghost" className="w-full" onClick={handleCopy} disabled={!roomId}>
                {t("p2p.copyLink")}
              </Button>
            </div>
          ) : (
            <div className="fs-metric-grid">
              <div className="fs-metric">
                <p className="fs-metric__label">{t("p2p.join")}</p>
                <p className="fs-metric__value">{t("p2p.roomCode")}</p>
              </div>
              <div className="fs-metric">
                <p className="fs-metric__label">{t("p2p.create")}</p>
                <p className="fs-metric__value">{t("p2p.title")}</p>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

export default HomePage;
