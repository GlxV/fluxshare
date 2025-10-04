import { NavLink, Outlet } from "react-router-dom";

const links = [
  { to: "/", label: "Enviar" },
  { to: "/receive", label: "Receber" },
  { to: "/peers", label: "Peers" },
  { to: "/tunnel", label: "Tunnel" },
  { to: "/settings", label: "Configurações" },
  { to: "/logs", label: "Logs" },
];

export default function App() {
  return (
    <div className="min-h-screen bg-bg text-white flex">
      <aside className="w-52 bg-surface/80 backdrop-blur border-r border-accent/30 p-4 space-y-4">
        <h1 className="text-xl font-semibold">FluxShare</h1>
        <nav className="flex flex-col space-y-2">
          {links.map((link) => (
            <NavLink
              key={link.to}
              to={link.to}
              className={({ isActive }) =>
                `px-3 py-2 rounded-md transition ${isActive ? "bg-accent" : "hover:bg-accent/20"}`
              }
              end
            >
              {link.label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main className="flex-1 p-8 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
