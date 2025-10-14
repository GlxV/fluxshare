import { type Dispatch, type SetStateAction, useState } from "react";
import { Outlet } from "react-router-dom";
import AppShell, { type AppHeaderInfo } from "./components/AppShell";
import { ThemeProvider } from "./components/ThemeProvider";

export interface AppOutletContext {
  setHeaderInfo: Dispatch<SetStateAction<AppHeaderInfo>>;
}

export default function App() {
  const [headerInfo, setHeaderInfo] = useState<AppHeaderInfo>({});

  return (
    <ThemeProvider>
      <AppShell headerInfo={headerInfo}>
        <Outlet context={{ setHeaderInfo }} />
      </AppShell>
    </ThemeProvider>
  );
}
