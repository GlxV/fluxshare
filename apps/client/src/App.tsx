import { type Dispatch, type SetStateAction, useEffect, useMemo, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { invoke } from "@tauri-apps/api/tauri";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import AppShell from "./components/AppShell";
import { ThemeProvider } from "./components/ThemeProvider";
import { LanguageProvider } from "./i18n/LanguageProvider";
import { ToastViewport } from "./components/ToastViewport";
import { isTauri } from "./lib/persist/tauri";
import { useExplorerShareStore, type ExplorerShareRequest } from "./state/useExplorerShareStore";

export interface AppHeaderInfo {
  roomCode?: string;
  inviteUrl?: string;
}

export interface AppOutletContext {
  setHeaderInfo: Dispatch<SetStateAction<AppHeaderInfo>>;
}

export default function App() {
  const [, setHeaderInfo] = useState<AppHeaderInfo>({});
  const navigate = useNavigate();
  const location = useLocation();
  const enqueueRequests = useExplorerShareStore((state) => state.enqueueRequests);
  const pendingCount = useExplorerShareStore(
    (state) => state.requests.filter((request) => !request.claimed).length,
  );

  const shouldRedirectToSend = useMemo(
    () => pendingCount > 0 && location.pathname !== "/",
    [location.pathname, pendingCount],
  );

  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | null = null;

    const setup = async () => {
      unlisten = await listen<ExplorerShareRequest>("fluxshare://explorer-share-request", (event) => {
        const request = event.payload;
        if (!request) return;
        enqueueRequests([request]);
      });

      const requests = (await invoke(
        "consume_pending_explorer_share_requests",
      )) as ExplorerShareRequest[];
      if (requests.length > 0) {
        enqueueRequests(requests);
      }
    };

    void setup();
    return () => {
      if (unlisten) {
        unlisten();
      }
    };
  }, [enqueueRequests]);

  useEffect(() => {
    if (!shouldRedirectToSend) return;
    navigate("/");
  }, [navigate, shouldRedirectToSend]);

  return (
    <LanguageProvider>
      <ThemeProvider>
        <AppShell>
          <Outlet context={{ setHeaderInfo }} />
        </AppShell>
        <ToastViewport />
      </ThemeProvider>
    </LanguageProvider>
  );
}
