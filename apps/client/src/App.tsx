import { type Dispatch, type SetStateAction, useState } from "react";
import { Outlet } from "react-router-dom";
import AppShell from "./components/AppShell";
import { ThemeProvider } from "./components/ThemeProvider";
import { LanguageProvider } from "./i18n/LanguageProvider";
import { ToastViewport } from "./components/ToastViewport";

export interface AppHeaderInfo {
  roomCode?: string;
  inviteUrl?: string;
}

export interface AppOutletContext {
  setHeaderInfo: Dispatch<SetStateAction<AppHeaderInfo>>;
}

export default function App() {
  const [, setHeaderInfo] = useState<AppHeaderInfo>({});

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
