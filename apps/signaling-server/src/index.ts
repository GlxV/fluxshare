import express from "express";
import http from "http";
import { WebSocketServer, WebSocket } from "ws";
import { z } from "zod";

const app = express();
app.use(express.json());

app.post("/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

const server = http.createServer(app);

const messageSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("register"), id: z.string().min(1) }),
  z.object({
    type: z.literal("offer"),
    from: z.string().min(1),
    to: z.string().min(1),
    sdp: z.string().min(1),
  }),
  z.object({
    type: z.literal("answer"),
    from: z.string().min(1),
    to: z.string().min(1),
    sdp: z.string().min(1),
  }),
  z.object({
    type: z.literal("ice"),
    from: z.string().min(1),
    to: z.string().min(1),
    candidate: z.any(),
  }),
  z.object({
    type: z.literal("bye"),
    from: z.string().min(1),
    to: z.string().min(1),
  }),
]);

type Message = z.infer<typeof messageSchema>;

const clients = new Map<string, WebSocket>();

const wss = new WebSocketServer({ server, path: "/ws" });

wss.on("connection", (socket) => {
  let clientId: string | null = null;
  console.log("[ws] new connection");

  socket.on("message", (data) => {
    try {
      const parsed = messageSchema.parse(JSON.parse(data.toString()));
      handleMessage(socket, parsed);
    } catch (err) {
      console.warn("[ws] invalid message", err);
      socket.send(JSON.stringify({ type: "error", message: "invalid payload" }));
    }
  });

  socket.on("close", () => {
    if (clientId && clients.get(clientId) === socket) {
      clients.delete(clientId);
      broadcast({ type: "bye", from: clientId, to: "*" });
    }
    console.log("[ws] connection closed", clientId);
  });

  function handleMessage(ws: WebSocket, msg: Message) {
    switch (msg.type) {
      case "register": {
        clientId = msg.id;
        clients.set(msg.id, ws);
        ws.send(JSON.stringify({ type: "ack", id: msg.id }));
        console.log(`[ws] registered ${msg.id}`);
        break;
      }
      case "offer":
      case "answer":
      case "ice":
      case "bye": {
        forward(msg.to, msg);
        break;
      }
      default:
        console.warn("[ws] unsupported message", msg);
    }
  }
});

function forward(targetId: string, msg: Message) {
  const target = clients.get(targetId);
  if (!target || target.readyState !== WebSocket.OPEN) {
    console.warn(`[ws] target ${targetId} not available`);
    return;
  }
  target.send(JSON.stringify(msg));
}

function broadcast(msg: Message) {
  const payload = JSON.stringify(msg);
  for (const ws of clients.values()) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const port = Number(process.env.PORT ?? 4000);
  server.listen(port, () => {
    console.log(`FluxShare signaling server listening on :${port}`);
  });
}

export { messageSchema };
