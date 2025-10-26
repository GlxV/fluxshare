import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider, createBrowserRouter } from "react-router-dom";
import App from "./App";
import HomePage from "./pages/Home";
import RoomPage from "./pages/Room";
import TunnelPage from "./pages/Tunnel";
import AdminPage from "./pages/Admin";
import "./styles/base.css";
import "./styles/theme.css";

const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    children: [
      { index: true, element: <HomePage /> },
      { path: "room/:code", element: <RoomPage /> },
      { path: "tunnel", element: <TunnelPage /> },
      { path: "admin", element: <AdminPage /> },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);
