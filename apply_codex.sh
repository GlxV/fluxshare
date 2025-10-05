#!/usr/bin/env bash
set -euo pipefail
 (cd "$(git rev-parse --show-toplevel)" && git apply --3way <<'EOF' 
diff --git a/README.md b/README.md
index bc9c52d601812aaf8a8d38c09cdeb59576518c90..232938e94c15935119bb2ebe6a31812888272604 100644
--- a/README.md
+++ b/README.md
@@ -8,50 +8,59 @@ FluxShare é um cliente desktop multiplataforma (Windows/Linux/macOS) para trans
 - [Rust](https://www.rust-lang.org/) stable (via rustup)
 - Dependências do Tauri (ver [documentação oficial](https://tauri.app/v1/guides/getting-started/prerequisites))
 - `cloudflared` disponível no `PATH`
 
 ## Instalação
 
 ```bash
 pnpm install
 ```
 
 ## Desenvolvimento
 
 ```bash
 pnpm dev
 ```
 
 Este comando inicia o servidor de sinalização (`apps/signaling-server`) e o cliente Tauri (`apps/client`). O cliente abre a interface React com as páginas:
 
 - Enviar
 - Receber
 - Peers
 - Tunnel
 - Configurações
 - Logs
 
+### Configuração do servidor de sinalização
+
+O servidor de sinalização lê a porta da variável de ambiente `PORT`, usando `4000` como padrão. Para ajustar a configuração localmente:
+
+1. Copie `apps/signaling-server/.env.example` para `apps/signaling-server/.env`.
+2. Edite o valor de `PORT` conforme necessário.
+
+Durante os testes e em desenvolvimento, o servidor continuará funcionando caso o arquivo `.env` não exista.
+
 ## Build de Release
 
 ```bash
 pnpm build
 ```
 
 - Gera o binário Tauri (modo release).
 - Compila o servidor de sinalização (TypeScript → JavaScript) em `apps/signaling-server/dist`.
 
 ## Testes
 
 ```bash
 pnpm test
 ```
 
 Executa:
 
 - Testes de unidade em Rust (chunking, checksums, criptografia).
 - Testes de unidade no servidor de sinalização (validação de mensagens com zod).
 
 ## Estrutura do Repositório
 
 ```
 fluxshare/
   README.md
diff --git a/apps/signaling-server/.env.example b/apps/signaling-server/.env.example
new file mode 100644
index 0000000000000000000000000000000000000000..2f9420be57818e749f2482aeb242c7c75c1c8b13
--- /dev/null
+++ b/apps/signaling-server/.env.example
@@ -0,0 +1,2 @@
+# Porta padrão usada pelo servidor de sinalização
+PORT=4000
diff --git a/apps/signaling-server/package.json b/apps/signaling-server/package.json
index 5955b6176e34ce2784fe7bde344953df7a2ff710..a3bd9145a40084537bd93688b2b45073fa24492f 100644
--- a/apps/signaling-server/package.json
+++ b/apps/signaling-server/package.json
@@ -1,29 +1,31 @@
 {
   "name": "fluxshare-signaling-server",
   "version": "0.1.0",
   "private": true,
   "type": "module",
   "scripts": {
-    "dev": "tsx watch src/index.ts",
+    "dev": "tsx watch src/server.ts",
     "build": "tsc -p tsconfig.json",
-    "start": "node dist/index.js",
+    "typecheck": "tsc --noEmit",
+    "start": "node dist/server.js",
     "test": "vitest run"
   },
   "engines": {
     "node": ">=20",
     "pnpm": ">=8"
   },
   "dependencies": {
+    "dotenv": "^16.4.5",
     "express": "^4.19.2",
     "ws": "^8.15.1",
     "zod": "^3.23.8"
   },
   "devDependencies": {
     "@types/express": "^4.17.21",
     "@types/node": "^20.19.19",
     "@types/ws": "^8.5.9",
     "tsx": "^4.16.2",
     "typescript": "^5.9.3",
     "vitest": "^1.6.1"
   }
 }
diff --git a/apps/signaling-server/src/index.ts b/apps/signaling-server/src/index.ts
index 9f63646ed25f342b575a2b0bb765535ede39b62d..50acb7c61160ab1694311d752425a96cac679d9e 100644
--- a/apps/signaling-server/src/index.ts
+++ b/apps/signaling-server/src/index.ts
@@ -1,35 +1,35 @@
 import express from "express";
 import http from "http";
 import { WebSocketServer, WebSocket } from "ws";
 import { z } from "zod";
 
 const app = express();
 app.use(express.json());
 
-app.post("/health", (_req, res) => {
-  res.status(200).json({ status: "ok" });
+app.get("/health", (_req, res) => {
+  res.status(200).json({ ok: true });
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
@@ -85,33 +85,26 @@ wss.on("connection", (socket) => {
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
 
-if (import.meta.url === `file://${process.argv[1]}`) {
-  const port = Number(process.env.PORT ?? 4000);
-  server.listen(port, () => {
-    console.log(`FluxShare signaling server listening on :${port}`);
-  });
-}
-
-export { messageSchema };
+export { app, server, wss, messageSchema };
diff --git a/apps/signaling-server/src/server.ts b/apps/signaling-server/src/server.ts
new file mode 100644
index 0000000000000000000000000000000000000000..f3a25e79c8abcbb0e30084c0e86cfdc235266b5d
--- /dev/null
+++ b/apps/signaling-server/src/server.ts
@@ -0,0 +1,26 @@
+import "dotenv/config";
+import { server } from "./index";
+
+const DEFAULT_PORT = 4000;
+
+function resolvePort(value: string | undefined, fallback: number): number {
+  if (!value) {
+    return fallback;
+  }
+
+  const parsed = Number.parseInt(value, 10);
+  if (Number.isNaN(parsed) || parsed <= 0) {
+    console.warn(
+      `[signaling] invalid PORT "${value}" received, falling back to ${fallback}`,
+    );
+    return fallback;
+  }
+
+  return parsed;
+}
+
+const PORT = resolvePort(process.env.PORT, DEFAULT_PORT);
+
+server.listen(PORT, () => {
+  console.log(`[signaling] listening on http://localhost:${PORT}`);
+});
diff --git a/pnpm-lock.yaml b/pnpm-lock.yaml
index b6137512556816bc2835190c2d034fe934a20214..cc0508a3a1f9efc603622e17aca505b9e3e06e87 100644
--- a/pnpm-lock.yaml
+++ b/pnpm-lock.yaml
@@ -40,50 +40,53 @@ importers:
         version: 20.19.19
       '@types/react':
         specifier: ^18.2.79
         version: 18.3.25
       '@types/react-dom':
         specifier: ^18.2.25
         version: 18.3.7(@types/react@18.3.25)
       autoprefixer:
         specifier: ^10.4.19
         version: 10.4.21(postcss@8.5.6)
       postcss:
         specifier: ^8.4.38
         version: 8.5.6
       tailwindcss:
         specifier: ^3.4.3
         version: 3.4.18
       typescript:
         specifier: ^5.4.5
         version: 5.9.3
       vite:
         specifier: ^5.2.9
         version: 5.4.20(@types/node@20.19.19)
 
   apps/signaling-server:
     dependencies:
+      dotenv:
+        specifier: ^16.4.5
+        version: 16.6.1
       express:
         specifier: ^4.19.2
         version: 4.21.2
       ws:
         specifier: ^8.15.1
         version: 8.18.3
       zod:
         specifier: ^3.23.8
         version: 3.25.76
     devDependencies:
       '@types/express':
         specifier: ^4.17.21
         version: 4.17.23
       '@types/node':
         specifier: ^20.19.19
         version: 20.19.19
       '@types/ws':
         specifier: ^8.5.9
         version: 8.18.1
       tsx:
         specifier: ^4.16.2
         version: 4.20.6
       typescript:
         specifier: ^5.9.3
         version: 5.9.3
@@ -1374,50 +1377,55 @@ packages:
     dev: true
 
   /depd@2.0.0:
     resolution: {integrity: sha512-g7nH6P6dyDioJogAAGprGpCtVImJhpPk/roCzdb3fIh61/s/nPsfR6onyMwkCAR/OlC3yBC0lESvUoQEAssIrw==}
     engines: {node: '>= 0.8'}
     dev: false
 
   /destroy@1.2.0:
     resolution: {integrity: sha512-2sJGJTaXIIaR1w4iJSNoN0hnMY7Gpc/n8D4qSCJw8QqFWXf7cuAgnEHxBpweaVcPevC2l3KpjYCx3NypQQgaJg==}
     engines: {node: '>= 0.8', npm: 1.2.8000 || >= 1.4.16}
     dev: false
 
   /didyoumean@1.2.2:
     resolution: {integrity: sha512-gxtyfqMg7GKyhQmb056K7M3xszy/myH8w+B4RT+QXBQsvAOdc3XymqDDPHx1BgPgsdAA5SIifona89YtRATDzw==}
     dev: true
 
   /diff-sequences@29.6.3:
     resolution: {integrity: sha512-EjePK1srD3P08o2j4f0ExnylqRs5B9tJjcp9t1krH2qRi8CCdsYfwe9JgSLurFBWwq4uOlipzfk5fHNvwFKr8Q==}
     engines: {node: ^14.15.0 || ^16.10.0 || >=18.0.0}
     dev: true
 
   /dlv@1.1.3:
     resolution: {integrity: sha512-+HlytyjlPKnIG8XuRG8WvmBP8xs8P71y+SKKS6ZXWoEgLuePxtDoUEiH7WkdePWrQ5JBpE6aoVqfZfJUQkjXwA==}
     dev: true
 
+  /dotenv@16.6.1:
+    resolution: {integrity: sha512-uBq4egWHTcTt33a72vpSG0z3HnPuIl6NqYcTrKEg2azoEyl2hpW0zqlxysq2pK9HlDIHyHyakeYaYnSAwd8bow==}
+    engines: {node: '>=12'}
+    dev: false
+
   /dunder-proto@1.0.1:
     resolution: {integrity: sha512-KIN/nDJBQRcXw0MLVhZE9iQHmG68qAVIBg9CqmUYjmQIhgij9U5MFvrqkUL5FbtyyzZuOeOt0zdeRe4UY7ct+A==}
     engines: {node: '>= 0.4'}
     dependencies:
       call-bind-apply-helpers: 1.0.2
       es-errors: 1.3.0
       gopd: 1.2.0
     dev: false
 
   /eastasianwidth@0.2.0:
     resolution: {integrity: sha512-I88TYZWc9XiYHRQ4/3c5rjjfgkjhLyW2luGIheGERbNQ6OY7yTybanSpDXZa8y7VUP9YmDcYa+eyq4ca7iLqWA==}
     dev: true
 
   /ee-first@1.1.1:
     resolution: {integrity: sha512-WMwm9LhRUo+WUaRN+vRuETqG89IgZphVSNkdFgeb6sS/E4OrDIN7t48CAewSHXc6C8lefD8KKfr5vY61brQlow==}
     dev: false
 
   /electron-to-chromium@1.5.230:
     resolution: {integrity: sha512-A6A6Fd3+gMdaed9wX83CvHYJb4UuapPD5X5SLq72VZJzxHSY0/LUweGXRWmQlh2ln7KV7iw7jnwXK7dlPoOnHQ==}
     dev: true
 
   /emoji-regex@8.0.0:
     resolution: {integrity: sha512-MSjYzcWNOA0ewAHpz0MxpYFvwg6yjy1NG3xteoqz644VCo/RPgnr1/GGt+ic3iJTzQ8Eu3TdM14SawnVUmGE6A==}
     dev: true
 
 
EOF
)