import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider, createBrowserRouter } from "react-router-dom";
import App from "./App";
import HomePage from "./pages/Home";
import RoomPage from "./pages/Room";
import RoomLandingPage from "./pages/RoomLanding";
import AdminPage from "./pages/Admin";
import SendPage from "./pages/Send";
import ConfigPage from "./pages/Config";
import "./styles/base.css";
import "./styles/theme.css";

const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    children: [
      { index: true, element: <SendPage /> },
      { path: "p2p", element: <HomePage /> },
      { path: "p2p/:code", element: <RoomPage /> },
      { path: "room", element: <RoomLandingPage /> },
      { path: "room/:code", element: <RoomPage /> },
      { path: "config", element: <ConfigPage /> },
      { path: "admin", element: <AdminPage /> },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);
