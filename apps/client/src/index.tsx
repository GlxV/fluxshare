import React from "react";
import ReactDOM from "react-dom/client";
import { RouterProvider, createBrowserRouter } from "react-router-dom";
import App from "./App";
import Send from "./app/routes/Send";
import Receive from "./app/routes/Receive";
import Peers from "./app/routes/Peers";
import Tunnel from "./app/routes/Tunnel";
import Settings from "./app/routes/Settings";
import Logs from "./app/routes/Logs";
import "./styles.css";

const router = createBrowserRouter([
  {
    path: "/",
    element: <App />,
    children: [
      { index: true, element: <Send /> },
      { path: "receive", element: <Receive /> },
      { path: "peers", element: <Peers /> },
      { path: "tunnel", element: <Tunnel /> },
      { path: "settings", element: <Settings /> },
      { path: "logs", element: <Logs /> },
    ],
  },
]);

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);
